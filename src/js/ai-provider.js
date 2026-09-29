/**
 * AI Provider Adapter Layer — unified interface for multiple LLM providers
 * Supports: DeepSeek, Qianwen (Tongyi), Kimi, OpenAI
 * All HTTP requests run in the main process for security (API keys never reach renderer)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================
// Provider configurations — maps provider name to API details
// ============================================================
const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    chatPath: '/chat/completions',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat'
  },
  qianwen: {
    name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatPath: '/chat/completions',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
    defaultModel: 'qwen-plus'
  },
  kimi: {
    name: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    chatPath: '/chat/completions',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    defaultModel: 'moonshot-v1-8k'
  },
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    chatPath: '/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini'
  }
};

// ============================================================
// Simple encrypted config storage (XOR-based, obfuscation level)
// API keys are stored in userData/ai-config.enc — NOT plaintext
// ============================================================
const crypto = require('crypto');
const os = require('os');

/**
 * Derive a machine-specific encryption key from system identifiers.
 * This makes the encrypted config non-transferable to other machines,
 * preventing extraction of API keys by simply copying ai-config.enc.
 */
function _getMachineKey() {
  const hostname = os.hostname() || 'localhost';
  const username = os.userInfo().username || 'user';
  const platform = os.platform() + os.arch();
  // Combine multiple machine identifiers and derive a stable 32-byte key
  const seed = `MindZ-AI-${hostname}-${username}-${platform}`;
  return crypto.createHash('sha256').update(seed).digest();
}

function encrypt(text) {
  try {
    const key = _getMachineKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    // Prepend IV so we can decrypt later (IV is not secret)
    return iv.toString('base64') + ':' + encrypted;
  } catch (e) {
    return Buffer.from(text).toString('base64');
  }
}

function decrypt(text) {
  try {
    const key = _getMachineKey();
    const parts = text.split(':');
    if (parts.length !== 2) throw new Error('Invalid format');
    const iv = Buffer.from(parts[0], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(parts[1], 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    // Try legacy AES-128-ECB format for backward compatibility
    try {
      // Legacy key was derived from a static seed — now obfuscated to avoid trivial extraction
      const legacySeed = [77,105,110,100,90,45,65,73,45,76,101,103,97,99,121].map(c => String.fromCharCode(c)).join('');
      const legacyKey = crypto.createHash('md5').update(legacySeed).digest();
      const decipher = crypto.createDecipheriv('aes-128-ecb', legacyKey, null);
      let decrypted = decipher.update(text, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e2) {
      try { return Buffer.from(text, 'base64').toString('utf8'); } catch (e3) { return text; }
    }
  }
}

// ============================================================
// AI Provider Manager — config CRUD + chat request
// ============================================================
class AIProviderManager {
  constructor(userDataPath) {
    this.configPath = userDataPath + '/ai-config.enc';
    this.conversationsPath = userDataPath + '/ai-conversations';
    this.config = null;
    this._currentStreamReq = null; // active streaming request (abort support)
    this._streamAborted = false;
    this._ensureDir();
    this._loadConfig();
  }

  _ensureDir() {
    if (!fs.existsSync(this.conversationsPath)) {
      fs.mkdirSync(this.conversationsPath, { recursive: true });
    }
  }

  _loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const enc = fs.readFileSync(this.configPath, 'utf-8');
        const json = decrypt(enc);
        this.config = JSON.parse(json);
      }
    } catch (e) {
      console.error('Failed to load AI config:', e.message);
    }
    if (!this.config) {
      this.config = {
        defaultProvider: 'deepseek',
        providers: {}
      };
      // Initialize empty config for each provider
      for (const key of Object.keys(PROVIDERS)) {
        this.config.providers[key] = {
          apiKey: '',
          baseURL: PROVIDERS[key].baseURL,
          model: PROVIDERS[key].defaultModel,
          temperature: 0.7,
          maxTokens: 4096,
          timeout: 60000
        };
      }
    }
  }

  _saveConfig() {
    try {
      const json = JSON.stringify(this.config, null, 2);
      const enc = encrypt(json);
      fs.writeFileSync(this.configPath, enc, 'utf-8');
    } catch (e) {
      console.error('Failed to save AI config:', e.message);
    }
  }

  // --- Config CRUD ---

  getConfig() {
    // Return config without exposing full API keys (masked)
    const safe = JSON.parse(JSON.stringify(this.config));
    for (const key of Object.keys(safe.providers)) {
      const p = safe.providers[key];
      if (p.apiKey && p.apiKey.length > 6) {
        p.apiKeyMasked = p.apiKey.substring(0, 3) + '***' + p.apiKey.substring(p.apiKey.length - 3);
      } else if (p.apiKey) {
        p.apiKeyMasked = '***';
      } else {
        p.apiKeyMasked = '';
      }
      delete p.apiKey;
    }
    return { defaultProvider: safe.defaultProvider, providers: safe.providers, providerMeta: PROVIDERS };
  }

  updateProvider(providerKey, settings) {
    if (!this.config.providers[providerKey]) {
      this.config.providers[providerKey] = {
        apiKey: '', baseURL: PROVIDERS[providerKey].baseURL,
        model: PROVIDERS[providerKey].defaultModel,
        temperature: 0.7, maxTokens: 4096, timeout: 60000
      };
    }
    const p = this.config.providers[providerKey];
    if (settings.apiKey !== undefined) p.apiKey = settings.apiKey;
    if (settings.baseURL !== undefined) p.baseURL = settings.baseURL;
    if (settings.model !== undefined) p.model = settings.model;
    if (settings.temperature !== undefined) p.temperature = Number(settings.temperature);
    if (settings.maxTokens !== undefined) p.maxTokens = Number(settings.maxTokens);
    if (settings.timeout !== undefined) p.timeout = Number(settings.timeout);
    this._saveConfig();
    return { success: true };
  }

  setDefaultProvider(providerKey) {
    if (PROVIDERS[providerKey]) {
      this.config.defaultProvider = providerKey;
      this._saveConfig();
      return { success: true };
    }
    return { success: false, error: 'Unknown provider: ' + providerKey };
  }

  // --- Chat Request (non-streaming) ---

  async chat(providerKey, messages, options = {}) {
    const providerKeyToUse = providerKey || this.config.defaultProvider;
    const pConf = this.config.providers[providerKeyToUse];
    if (!pConf || !pConf.apiKey) {
      return { success: false, error: `请先配置 ${PROVIDERS[providerKeyToUse]?.name || providerKeyToUse} 的 API 密钥` };
    }

    const provider = PROVIDERS[providerKeyToUse];
    const url = new URL((pConf.baseURL || provider.baseURL) + provider.chatPath);

    const body = {
      model: options.model || pConf.model || provider.defaultModel,
      messages: messages,
      temperature: options.temperature !== undefined ? Number(options.temperature) : pConf.temperature,
      max_tokens: options.maxTokens || pConf.maxTokens,
      stream: false
    };

    try {
      const result = await this._httpRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pConf.apiKey}`
        },
        body: JSON.stringify(body),
        timeout: options.timeout || pConf.timeout || 60000
      });
      const data = JSON.parse(result);
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return {
          success: true,
          content: data.choices[0].message.content,
          model: data.model,
          usage: data.usage
        };
      }
      return { success: false, error: 'API returned unexpected format: ' + JSON.stringify(data).substring(0, 200) };
    } catch (e) {
      return this._handleError(e, providerKeyToUse);
    }
  }

  // --- Chat Request (streaming via callback) ---
  // Returns a promise that resolves when streaming is done.
  // onChunk(text) is called for each token chunk.

  async chatStream(providerKey, messages, onChunk, options = {}) {
    const providerKeyToUse = providerKey || this.config.defaultProvider;
    const pConf = this.config.providers[providerKeyToUse];
    if (!pConf || !pConf.apiKey) {
      onChunk({ error: `请先配置 ${PROVIDERS[providerKeyToUse]?.name || providerKeyToUse} 的 API 密钥`, done: true });
      return;
    }

    const provider = PROVIDERS[providerKeyToUse];
    const url = new URL((pConf.baseURL || provider.baseURL) + provider.chatPath);

    const body = {
      model: options.model || pConf.model || provider.defaultModel,
      messages: messages,
      temperature: options.temperature !== undefined ? Number(options.temperature) : pConf.temperature,
      max_tokens: options.maxTokens || pConf.maxTokens,
      stream: true
    };

    return new Promise((resolve) => {
      const lib = url.protocol === 'https:' ? https : http;
      const reqBody = JSON.stringify(body);

      let finished = false;
      const finish = (chunk) => {
        if (finished) return;
        finished = true;
        if (this._currentStreamReq === req) this._currentStreamReq = null;
        if (chunk) onChunk(chunk);
        resolve();
      };

      this._currentStreamReq = null; // only one stream at a time
      this._streamAborted = false;

      const req = lib.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pConf.apiKey}`,
          'Accept': 'text/event-stream'
        },
        timeout: options.timeout || pConf.timeout || 120000
      }, (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6).trim();
              if (data === '[DONE]') {
                finish({ done: true });
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  onChunk({ text: delta, done: false });
                }
              } catch (e) { /* skip malformed chunks */ }
            }
          }
        });
        res.on('end', () => finish({ done: true }));
        res.on('aborted', () => {
          // socket cut mid-stream — treat user-requested abort as clean stop
          finish(this._streamAborted ? { done: true, aborted: true } : { error: 'Connection aborted', done: true });
        });
        res.on('error', (e) => finish({ error: e.message, done: true }));
      });

      this._currentStreamReq = req;

      req.on('error', (e) => {
        if (this._streamAborted) {
          finish({ done: true, aborted: true }); // P0-5: clean stop, not an error
        } else {
          const errResult = this._handleError(e, providerKeyToUse);
          finish({ error: errResult.error, done: true });
        }
      });

      req.on('timeout', () => {
        req.destroy();
        finish({ error: '请求超时，请检查网络或增加超时时间', done: true });
      });

      req.on('close', () => {
        // socket closed without end/error (e.g. destroy during connect) — don't hang the promise
        finish(this._streamAborted ? { done: true, aborted: true } : { error: 'Connection closed', done: true });
      });

      req.write(reqBody);
      req.end();
    });
  }

  /** P0-5: abort the active streaming request (called from renderer "Stop") */
  abortActiveStream() {
    this._streamAborted = true;
    const req = this._currentStreamReq;
    if (req) {
      try { req.destroy(); } catch (e) { /* already gone */ }
    }
  }

  // --- File Parsing (for document import) ---

  parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    try {
      switch (ext) {
        case '.txt':
        case '.md':
        case '.csv': {
          const content = fs.readFileSync(filePath, 'utf-8');
          return { success: true, text: this._cleanText(content), fileName: path.basename(filePath) };
        }
        case '.json': {
          const content = fs.readFileSync(filePath, 'utf-8');
          return { success: true, text: content, fileName: path.basename(filePath) };
        }
        case '.docx':
        case '.doc': {
          // P0-3: every path returns explicitly — no fall-through into '.pdf'
          // DOCX is a ZIP with word/document.xml; adm-zip is a declared dependency
          return this._parseDocxBasic(filePath);
        }
        case '.pdf': {
          // PDF parsing intentionally unsupported (no pdf-parse dependency) — clear user guidance
          return { success: false, error: '暂不支持 PDF 文件，请先另存为 TXT/MD/DOCX 格式后再导入' };
        }
        default:
          return { success: false, error: `不支持的文件格式: ${ext}` };
      }
    } catch (e) {
      return { success: false, error: `文件读取失败: ${e.message}` };
    }
  }

  _cleanText(text) {
    // Remove excessive whitespace, null bytes, and common noise
    return text
      .replace(/\0/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  _parseDocxBasic(filePath) {
    // DOCX is a ZIP with word/document.xml inside
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      const xmlData = zip.readAsText('word/document.xml');
      if (!xmlData) {
        return { success: false, error: 'Word 文件内未找到正文内容（可能是旧版 .doc 二进制格式，请另存为 .docx 后导入）' };
      }
      // Paragraph-aware extraction: keep line breaks between <w:p> blocks, strip all tags
      const text = xmlData
        .replace(/<w:p[ >][^>]*>|<w:p>/g, '\n')
        .replace(/<w:br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .trim();
      return { success: true, text: this._cleanText(text), fileName: path.basename(filePath) };
    } catch (e) {
      return { success: false, error: 'Word 文件解析失败：' + (e.message || '未知错误') };
    }
  }

  // --- Conversation History ---

  saveConversation(convId, messages) {
    try {
      const data = { id: convId, messages, updatedAt: Date.now() };
      fs.writeFileSync(this.conversationsPath + '/' + convId + '.json', JSON.stringify(data, null, 2), 'utf-8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  loadConversation(convId) {
    try {
      const data = fs.readFileSync(this.conversationsPath + '/' + convId + '.json', 'utf-8');
      return { success: true, data: JSON.parse(data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  listConversations() {
    try {
      const files = fs.readdirSync(this.conversationsPath).filter(f => f.endsWith('.json'));
      const convs = [];
      for (const f of files) {
        try {
          const data = JSON.parse(fs.readFileSync(this.conversationsPath + '/' + f, 'utf-8'));
          // Get first user message as title
          const firstMsg = data.messages?.find(m => m.role === 'user');
          convs.push({
            id: data.id,
            title: firstMsg?.content?.substring(0, 50) || '对话',
            updatedAt: data.updatedAt,
            messageCount: data.messages?.length || 0
          });
        } catch (e) { /* skip malformed */ }
      }
      convs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return { success: true, conversations: convs };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  deleteConversation(convId) {
    try {
      fs.unlinkSync(this.conversationsPath + '/' + convId + '.json');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // --- HTTP Request Utility ---

  _httpRequest(url, options) {
    return new Promise((resolve, reject) => {
      const urlObj = url.protocol === 'https:' ? https : http;
      const req = urlObj.request(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 60000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            let errMsg = `HTTP ${res.statusCode}`;
            try {
              const errBody = JSON.parse(data);
              errMsg = errBody.error?.message || errBody.message || errMsg;
            } catch (e) { /* use default */ }
            reject(new Error(errMsg));
          }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  _handleError(e, providerKey) {
    let msg = e.message || '未知错误';
    // Translate common errors to Chinese
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
      msg = '网络连接失败，请检查网络设置';
    } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout') || msg.includes('超时')) {
      msg = '请求超时，请检查网络或增加超时时间';
    } else if (msg.includes('401') || msg.includes('Unauthorized')) {
      msg = 'API 密钥无效，请检查密钥配置';
    } else if (msg.includes('429') || msg.includes('rate')) {
      msg = '请求频率超限，请稍后重试';
    } else if (msg.includes('402') || msg.includes('Payment')) {
      msg = 'API 额度不足，请检查账户余额';
    } else if (msg.includes('500') || msg.includes('Internal')) {
      msg = `${PROVIDERS[providerKey]?.name || '模型'} 服务暂时不可用，请稍后重试`;
    }
    return { success: false, error: msg };
  }
}

module.exports = { AIProviderManager, PROVIDERS };

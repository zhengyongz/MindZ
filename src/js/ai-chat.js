/**
 * AI Chat Panel — embedded in side panel as a new tab
 * Handles: config UI, chat UI, file import, mind map generation, conversation history
 */
class AIChatPanel {
  constructor(app) {
    this.app = app;
    this.api = window.electronAPI;
    this.config = null;
    this.currentConvId = null;
    this.messages = [];
    this.isStreaming = false;
    this.streamAbort = false;

    // Pre-built system prompts for mind map generation
    this.systemPrompts = {
      outline: '你是一个专业的内容策划师。根据用户提供的内容或要求，生成结构化的文章大纲。\n\n【重要】你必须且只能输出纯JSON，不要输出任何其他文字、解释或Markdown格式。直接以 { 开头，以 } 结尾。\n\n格式要求：\n{"title":"大纲标题","children":[{"text":"章节1","children":[{"text":"小节1.1"},{"text":"小节1.2"}]},{"text":"章节2","children":[{"text":"小节2.1"}]}]}',
      chapter: '你是一个专业的内容创作者。根据用户提供的大纲和章节要求，撰写详细的内容。请直接输出内容文本，不需要JSON格式。',
      optimize: '你是一个专业的文案优化师。请优化用户提供的文本，使其更流畅、精炼、有吸引力。直接输出优化后的文本。',
      mindmap: '你是一个思维导图生成专家。根据用户提供的内容，生成思维导图的结构。\n\n【重要】你必须且只能输出纯JSON，不要输出任何其他文字、解释或Markdown格式。直接以 { 开头，以 } 结尾。\n\n格式要求：\n{"text":"中心主题","children":[{"text":"分支1","children":[{"text":"子分支1.1"},{"text":"子分支1.2"}]},{"text":"分支2","children":[{"text":"子分支2.1"}]}]}\n\n层级结构要清晰，分支数量适中（3-6个主分支），每个分支2-4个子项。',
      general: '你是一个智能助手，可以帮助用户进行内容创作、整理思路和生成思维导图。请用中文回复。'
    };
  }

  // ============================================================
  // Initialization
  // ============================================================

  async init() {
    await this._loadConfig();
    this._bindPanelEvents();
    this._bindStreamListener();
  }

  async _loadConfig() {
    try {
      this.config = await this.api.aiGetConfig();
    } catch (e) {
      this.config = { defaultProvider: 'deepseek', providers: {}, providerMeta: {} };
    }
  }

  // ============================================================
  // Side Panel Tab Content
  // ============================================================

  getPanelHTML() {
    return `
      <div id="panel-ai-chat" class="panel-content hidden">
        <!-- Chat messages area -->
        <div id="ai-chat-messages" class="ai-chat-messages"></div>
        
        <!-- Chat input area -->
        <div id="ai-chat-input-area" class="ai-chat-input-area">
          <div class="ai-input-tools">
            <button id="ai-btn-import" class="ai-tool-btn" i18n="ai_btn_import" title="导入文件">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </button>
            <button id="ai-btn-outline" class="ai-tool-btn" i18n="ai_btn_outline" title="生成大纲">大纲</button>
            <button id="ai-btn-mindmap" class="ai-tool-btn ai-tool-accent" i18n="ai_btn_mindmap" title="生成思维导图">导图</button>
            <button id="ai-btn-optimize" class="ai-tool-btn" i18n="ai_btn_optimize" title="优化文案">优化</button>
          </div>
          <div class="ai-input-row">
            <textarea id="ai-chat-input" class="ai-chat-textarea" i18n-placeholder="ai_chat_placeholder" placeholder="输入消息..." rows="2"></textarea>
            <button id="ai-btn-send" class="ai-send-btn" title="发送">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
            <button id="ai-btn-stop" class="ai-stop-btn" title="停止生成" style="display:none;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          </div>
        </div>
        
        <!-- Config panel (toggled) -->
        <div id="ai-config-panel" class="ai-config-panel" style="display:none;">
          <div class="ai-config-header">
            <span i18n="ai_config_title">AI 模型配置</span>
            <button id="ai-config-close" class="ai-config-close">&times;</button>
          </div>
          <div id="ai-config-body" class="ai-config-body"></div>
        </div>
        
        <!-- History panel (toggled) -->
        <div id="ai-history-panel" class="ai-history-panel" style="display:none;">
          <div class="ai-config-header">
            <span i18n="ai_history_title">会话记录</span>
            <button id="ai-history-close" class="ai-config-close">&times;</button>
          </div>
          <div id="ai-history-list" class="ai-history-list"></div>
        </div>
        
        <!-- Toolbar for config / history / new -->
        <div class="ai-panel-toolbar">
          <button id="ai-btn-config" class="ai-toolbar-btn" title="模型配置">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button id="ai-btn-history" class="ai-toolbar-btn" title="会话记录">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </button>
          <button id="ai-btn-new-conv" class="ai-toolbar-btn" title="新对话">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <select id="ai-provider-select" class="ai-provider-select"></select>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Event Binding
  // ============================================================

  _bindPanelEvents() {
    // Send message
    const sendBtn = document.getElementById('ai-btn-send');
    const stopBtn = document.getElementById('ai-btn-stop');
    const inputEl = document.getElementById('ai-chat-input');

    sendBtn?.addEventListener('click', () => this._sendMessage());
    stopBtn?.addEventListener('click', () => this._stopGeneration());
    inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
    });

    // Tool buttons
    document.getElementById('ai-btn-outline')?.addEventListener('click', () => this._sendWithPrompt('outline'));
    document.getElementById('ai-btn-mindmap')?.addEventListener('click', () => this._sendWithPrompt('mindmap'));
    document.getElementById('ai-btn-optimize')?.addEventListener('click', () => this._sendWithPrompt('optimize'));
    document.getElementById('ai-btn-import')?.addEventListener('click', () => this._importFile());

    // Config / History / New conversation
    document.getElementById('ai-btn-config')?.addEventListener('click', () => this._toggleConfig());
    document.getElementById('ai-btn-history')?.addEventListener('click', () => this._toggleHistory());
    document.getElementById('ai-btn-new-conv')?.addEventListener('click', () => this._newConversation());
    document.getElementById('ai-config-close')?.addEventListener('click', () => this._hideConfig());
    document.getElementById('ai-history-close')?.addEventListener('click', () => this._hideHistory());

    // Provider select
    document.getElementById('ai-provider-select')?.addEventListener('change', (e) => {
      this.app._showToast(`AI 模型已切换为 ${e.target.options[e.target.selectedIndex].text}`);
    });

    // Populate provider select
    this._updateProviderSelect();
  }

  _bindStreamListener() {
    this.api.onAiChatChunk((chunk) => {
      if (chunk.done) {
        this._onStreamDone(chunk);
      } else if (chunk.error) {
        if (this.streamAbort) { this._onStreamDone(chunk); return; } // aborted — treat as clean stop
        this._onStreamError(chunk.error);
      } else if (chunk.text) {
        this._appendStreamText(chunk.text);
      }
    });
  }

  _updateProviderSelect() {
    const sel = document.getElementById('ai-provider-select');
    if (!sel || !this.config) return;
    sel.innerHTML = '';
    const meta = this.config.providerMeta || {};
    const providers = this.config.providers || {};
    for (const [key, info] of Object.entries(meta)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = info.name;
      if (providers[key]?.apiKeyMasked) {
        opt.textContent += ' ✓';
      }
      if (key === this.config.defaultProvider) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  // ============================================================
  // Chat Logic
  // ============================================================

  async _sendMessage() {
    const inputEl = document.getElementById('ai-chat-input');
    const text = inputEl?.value?.trim();
    if (!text || this.isStreaming) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    // Add user message
    this._addMessage('user', text);
    this.messages.push({ role: 'user', content: text });

    // Get current provider
    const sel = document.getElementById('ai-provider-select');
    const providerKey = sel?.value || this.config?.defaultProvider || 'deepseek';

    // Build messages array with system prompt
    const apiMessages = [
      { role: 'system', content: this.systemPrompts.general },
      ...this.messages
    ];

    // Add assistant placeholder
    this._addMessage('assistant', '');
    this.isStreaming = true;
    this.streamAbort = false;
    this._updateSendButton(true);

    try {
      const result = await this.api.aiChatStream(providerKey, apiMessages, {});

      if (!this.streamAbort) {
        // Streaming chunks are handled by the chunk listener
      }
    } catch (e) {
      this._onStreamError(e.message || '请求失败');
    }
  }

  async _sendWithPrompt(promptType) {
    const inputEl = document.getElementById('ai-chat-input');
    let text = inputEl?.value?.trim();

    // 如果输入框为空，尝试使用选中节点的文本
    if (!text) {
      const selectedNode = this.app.data?.selectedNode;
      if (selectedNode) {
        text = selectedNode.text;
      }
    }

    // 仍然没有内容则提示用户
    if (!text) {
      const hints = {
        outline: this.app._t('ai_hint_outline') || '请先输入或选中节点，再点大纲',
        optimize: this.app._t('ai_hint_optimize') || '请先输入或选中节点，再点优化',
        mindmap: this.app._t('ai_hint_mindmap') || '请先输入主题，再点导图'
      };
      this._addMessage('system', hints[promptType] || '请先输入内容');
      return;
    }

    if (this.isStreaming) return;

    inputEl.value = '';

    this._addMessage('user', `[${promptType}] ${text}`);
    this.messages.push({ role: 'user', content: text });

    const sel = document.getElementById('ai-provider-select');
    const providerKey = sel?.value || this.config?.defaultProvider || 'deepseek';

    const apiMessages = [
      { role: 'system', content: this.systemPrompts[promptType] || this.systemPrompts.general },
      ...this.messages
    ];

    this._addMessage('assistant', '');
    this.isStreaming = true;
    this.streamAbort = false;
    this._updateSendButton(true);

    try {
      await this.api.aiChatStream(providerKey, apiMessages, {});
    } catch (e) {
      this._onStreamError(e.message || '请求失败');
    }
  }

  _stopGeneration() {
    // P0-5: actually cancel the in-flight request in the main process,
    // don't just flip a local flag while tokens keep flowing
    this.streamAbort = true;
    try { this.api?.aiAbortStream?.(); } catch (e) { /* main process may be idle */ }
    this.isStreaming = false;
    this._updateSendButton(false);
  }

  _appendStreamText(text) {
    // P0-5: stop appending once aborted — chunks may still arrive from the socket
    if (this.streamAbort || !this.isStreaming) return;
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;
    const lastMsg = msgs.querySelector('.ai-msg-assistant:last-child .ai-msg-content');
    if (lastMsg) {
      lastMsg.textContent += text;
      msgs.scrollTop = msgs.scrollHeight;
    }
  }

  _onStreamDone(chunk) {
    // Always restore UI state; aborted runs skip history/mind-map detection
    const aborted = this.streamAbort || !!chunk?.aborted;
    if (!aborted) {
      // Save the assistant's response to messages array
      const msgs = document.getElementById('ai-chat-messages');
      const lastMsg = msgs?.querySelector('.ai-msg-assistant:last-child .ai-msg-content');
      const content = lastMsg?.textContent || '';

      if (content) {
        this.messages.push({ role: 'assistant', content });

        // Check if response contains mind map structure — auto-prompt user
        const extractedJSON = this._extractMindMapJSON(content);
        if (extractedJSON) {
          this._showMindMapPrompt(extractedJSON);
        } else {
          // No JSON found — try parsing as Markdown list
          const mdData = this._parseMarkdownToTree(content);
          if (mdData && mdData.children && mdData.children.length > 0) {
            this._showMindMapPrompt(JSON.stringify(mdData));
          }
        }
      }
    }

    this.isStreaming = false;
    this.streamAbort = false;
    this._updateSendButton(false);
    if (!aborted) this._saveConversation();
  }

  _onStreamError(error) {
    if (this.streamAbort) { this._onStreamDone({}); return; } // aborted — treat as clean stop
    const lastMsg = document.querySelector('#ai-chat-messages .ai-msg-assistant:last-child .ai-msg-content');
    if (lastMsg && !lastMsg.textContent) {
      lastMsg.textContent = '❌ ' + error;
      lastMsg.classList.add('ai-msg-error');
    } else {
      this._addMessage('system', '❌ ' + error);
    }
    this.isStreaming = false;
    this._updateSendButton(false);
  }

  _updateSendButton(streaming) {
    const sendBtn = document.getElementById('ai-btn-send');
    const stopBtn = document.getElementById('ai-btn-stop');
    if (sendBtn) sendBtn.style.display = streaming ? 'none' : '';
    if (stopBtn) stopBtn.style.display = streaming ? '' : 'none';
  }

  // ============================================================
  // Message Rendering
  // ============================================================

  _addMessage(role, text) {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;

    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${role}`;

    if (role === 'user') {
      div.innerHTML = `<div class="ai-msg-content">${this._escapeHtml(text)}</div>`;
    } else if (role === 'assistant') {
      div.innerHTML = `<div class="ai-msg-content">${this._formatMarkdown(text)}</div>`;
    } else {
      div.innerHTML = `<div class="ai-msg-content ai-msg-system-text">${this._escapeHtml(text)}</div>`;
    }

    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _formatMarkdown(text) {
    // Simple markdown rendering: code blocks, bold, italic, links
    if (!text) return '';
    let html = this._escapeHtml(text);
    // Code blocks
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="ai-code-block"><code>$2</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  // ============================================================
  // Mind Map Generation from AI Response
  // ============================================================

  _extractMindMapJSON(text) {
    // Strategy 1: Extract from markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        const obj = JSON.parse(codeBlockMatch[1].trim());
        if ((obj.text || obj.title) && obj.children) return codeBlockMatch[1].trim();
      } catch (e) { /* not valid JSON in code block, continue */ }
    }

    // Strategy 2: Find outermost { } that contains "children"
    let depth = 0, start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          const candidate = text.substring(start, i + 1);
          try {
            const obj = JSON.parse(candidate);
            if ((obj.text || obj.title) && (obj.children || obj.child)) {
              return candidate;
            }
          } catch (e) { /* not valid, continue */ }
          start = -1;
        }
      }
    }
    return null;
  }

  _parseMarkdownToTree(text) {
    // Parse Markdown-style lists (heading + bullet/number lists) into a tree
    // Supports: # title, - item, * item, 1. item, nested indentation
    if (!text || text.length < 5) return null;

    const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
    const root = { text: '主题', children: [] };
    const stack = [{ node: root, indent: -1 }]; // indent stack

    // Detect if content looks like a structured list (has bullets, numbers, or headers)
    const hasStructure = lines.some(l => /^\s*[-*•]\s|^\s*\d+[.)]\s|^#{1,4}\s/.test(l));
    if (!hasStructure) return null;

    // Find the first heading/title as root text
    let rootFound = false;
    for (const line of lines) {
      const hMatch = line.match(/^#{1,4}\s+(.+)/);
      if (hMatch && !rootFound) {
        root.text = hMatch[1].trim().replace(/[*_]/g, '');
        rootFound = true;
        break;
      }
    }
    // If no heading, try first non-empty line as title
    if (!rootFound) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !/^[-*•\d]/.test(trimmed)) {
          root.text = trimmed.replace(/[*_#:]/g, '').trim();
          rootFound = true;
          break;
        }
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Skip the root heading line
      if (/^#{1,2}\s/.test(trimmed) && trimmed.replace(/^#+\s*/, '').trim() === root.text) continue;

      // Calculate indent level
      const indent = line.length - line.trimStart().length;

      // Extract text from various formats
      let itemText = trimmed;
      // Heading
      const hMatch = trimmed.match(/^#{1,4}\s+(.+)/);
      if (hMatch) { itemText = hMatch[1]; }
      // Bullet: - * •
      const bMatch = trimmed.match(/^[-*•]\s+(.+)/);
      if (bMatch) { itemText = bMatch[1]; }
      // Numbered: 1. 1) （1）
      const nMatch = trimmed.match(/^\d+[.)]\s+(.+)/) || trimmed.match(/[（(]\d+[）)]\s*(.*)/);
      if (nMatch) { itemText = nMatch[1]; }

      // Clean up: remove bold markers, trailing colon, etc.
      itemText = itemText.replace(/\*\*([^*]+)\*\*/g, '$1')
                         .replace(/\*([^*]+)\*/g, '$1')
                         .replace(/__([^_]+)__/g, '$1')
                         .replace(/`([^`]+)`/g, '$1')
                         .replace(/[：:]\s*$/, '')
                         .trim();

      if (!itemText) continue;

      const newNode = { text: itemText, children: [] };

      // Find parent: pop stack until we find one with indent < current
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].node;
      parent.children.push(newNode);
      stack.push({ node: newNode, indent: indent });
    }

    // Only return if we got meaningful content
    if (root.children.length === 0) return null;
    return root;
  }

  _showMindMapPrompt(jsonStr) {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;

    const promptDiv = document.createElement('div');
    promptDiv.className = 'ai-msg ai-msg-prompt';
    promptDiv.innerHTML = `
      <div class="ai-prompt-text" i18n="ai_detect_mindmap">🧠 检测到思维导图结构，是否应用到画布？</div>
      <div class="ai-prompt-actions">
        <button class="ai-prompt-btn ai-prompt-apply" i18n="ai_apply_mindmap">应用为思维导图</button>
        <button class="ai-prompt-btn ai-prompt-dismiss" i18n="ai_dismiss">忽略</button>
      </div>
    `;

    promptDiv.querySelector('.ai-prompt-apply')?.addEventListener('click', () => {
      this._applyMindMap(jsonStr);
      promptDiv.remove();
    });
    promptDiv.querySelector('.ai-prompt-dismiss')?.addEventListener('click', () => {
      promptDiv.remove();
    });

    msgs.appendChild(promptDiv);
    msgs.scrollTop = msgs.scrollHeight;
  }

  _applyMindMap(jsonStr) {
    try {
      // Try to extract JSON from the string
      let cleanJson = jsonStr.trim();
      // Remove markdown code block wrapping if present
      const codeMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeMatch) cleanJson = codeMatch[1].trim();

      const data = JSON.parse(cleanJson);
      if (!data.text && !data.title) {
        this.app._showToast('JSON 格式无效：缺少 text 或 title 字段', 'error');
        return;
      }

      // Convert to mind map data structure and apply
      const mapData = this._jsonToMindMap(data);
      this.app.data.fromJSON(mapData);
      this.app.data.selectedNode = this.app.data.root;
      this.app.renderer.render();
      this.app._updateOutline();
      this.app._updateStatus();
      this.app.isModified = true;
      this.app._showToast(this.app._t('ai_mindmap_applied') || '思维导图已生成');
    } catch (e) {
      this.app._showToast('JSON 解析失败: ' + e.message, 'error');
    }
  }

  _jsonToMindMap(data) {
    // Convert AI JSON format to MindMapData JSON format
    // fromJSON expects: { root: { text, children: [...] }, relationships, ... }
    const convert = (node) => {
      const text = node.text || node.title || node.name || '未命名';
      const result = { text, collapsed: false, children: [] };
      if (node.children && Array.isArray(node.children)) {
        result.children = node.children.map(c => convert(c));
      }
      return result;
    };

    const root = convert(data);
    return {
      version: '2.0',
      root: root,
      relationships: [],
      annotations: [],
      boundaries: [],
      summaries: [],
      language: this.app.lang || 'zh'
    };
  }

  // ============================================================
  // File Import
  // ============================================================

  async _importFile() {
    const result = await this.api.showOpenDialog({
      title: '导入文件',
      filters: [
        { name: '文本文件', extensions: ['txt', 'md', 'csv'] },
        { name: 'Word 文档', extensions: ['docx', 'doc'] },
        { name: 'PDF 文档', extensions: ['pdf'] },
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths?.length) return;

    const filePath = result.filePaths[0];
    this._addMessage('system', `正在解析文件: ${filePath.split(/[\\/]/).pop()}...`);

    const parseResult = await this.api.aiParseFile(filePath);
    if (parseResult.success && parseResult.text) {
      // Add the file content as a user message context
      const content = parseResult.text.substring(0, 10000); // Limit to 10K chars
      this._addMessage('system', `文件已导入 (${content.length} 字符)，请选择操作：生成大纲、生成思维导图、或直接对话`);
      
      // Store imported content for context
      this.messages.push({ 
        role: 'user', 
        content: `[导入的文件内容]\n${content}` 
      });

      // Auto-suggest generating mind map
      const msgs = document.getElementById('ai-chat-messages');
      const suggestionDiv = document.createElement('div');
      suggestionDiv.className = 'ai-msg ai-msg-prompt';
      suggestionDiv.innerHTML = `
        <div class="ai-prompt-text" i18n="ai_file_imported">📄 文件已导入，推荐操作：</div>
        <div class="ai-prompt-actions">
          <button class="ai-prompt-btn ai-prompt-apply" id="ai-import-mindmap" i18n="ai_import_mindmap">生成思维导图</button>
          <button class="ai-prompt-btn ai-prompt-apply" id="ai-import-outline" i18n="ai_import_outline">生成大纲</button>
          <button class="ai-prompt-btn ai-prompt-dismiss" id="ai-import-dismiss" i18n="ai_dismiss">忽略</button>
        </div>
      `;
      suggestionDiv.querySelector('#ai-import-mindmap')?.addEventListener('click', () => {
        this.messages.push({ role: 'user', content: '请根据以上文件内容，生成思维导图的结构。' });
        this._addMessage('user', '请根据以上文件内容，生成思维导图的结构。');
        this._sendWithSystemPrompt('mindmap');
        suggestionDiv.remove();
      });
      suggestionDiv.querySelector('#ai-import-outline')?.addEventListener('click', () => {
        this.messages.push({ role: 'user', content: '请根据以上文件内容，生成文章大纲。' });
        this._addMessage('user', '请根据以上文件内容，生成文章大纲。');
        this._sendWithSystemPrompt('outline');
        suggestionDiv.remove();
      });
      suggestionDiv.querySelector('#ai-import-dismiss')?.addEventListener('click', () => {
        suggestionDiv.remove();
      });
      msgs.appendChild(suggestionDiv);
      msgs.scrollTop = msgs.scrollHeight;
    } else {
      this._addMessage('system', '❌ ' + (parseResult.error || '文件解析失败'));
    }
  }

  async _sendWithSystemPrompt(promptType) {
    const sel = document.getElementById('ai-provider-select');
    const providerKey = sel?.value || this.config?.defaultProvider || 'deepseek';

    const apiMessages = [
      { role: 'system', content: this.systemPrompts[promptType] || this.systemPrompts.general },
      ...this.messages.slice(-10) // Keep last 10 messages for context window
    ];

    this._addMessage('assistant', '');
    this.isStreaming = true;
    this.streamAbort = false;
    this._updateSendButton(true);

    try {
      await this.api.aiChatStream(providerKey, apiMessages, {});
    } catch (e) {
      this._onStreamError(e.message || '请求失败');
    }
  }

  // ============================================================
  // Conversation Management
  // ============================================================

  async _newConversation() {
    // Save current if any
    if (this.messages.length > 0) {
      await this._saveConversation();
    }
    this.messages = [];
    this.currentConvId = null;
    const msgs = document.getElementById('ai-chat-messages');
    if (msgs) msgs.innerHTML = '';
    this._addMessage('system', this.app._t('ai_welcome') || '欢迎使用 MindZ AI 助手！配置模型后即可开始对话。');
  }

  async _saveConversation() {
    if (this.messages.length === 0) return;
    if (!this.currentConvId) {
      this.currentConvId = 'conv_' + Date.now();
    }
    try {
      await this.api.aiSaveConversation(this.currentConvId, this.messages);
    } catch (e) { /* ignore */ }
  }

  async _toggleHistory() {
    const panel = document.getElementById('ai-history-panel');
    if (!panel) return;

    if (panel.style.display !== 'none') {
      panel.style.display = 'none';
      return;
    }

    // Load conversation list
    const result = await this.api.aiListConversations();
    const list = document.getElementById('ai-history-list');
    if (!list) return;

    list.innerHTML = '';
    if (result.success && result.conversations?.length) {
      for (const conv of result.conversations) {
        const item = document.createElement('div');
        item.className = 'ai-history-item';
        const date = new Date(conv.updatedAt).toLocaleDateString();
        item.innerHTML = `
          <div class="ai-history-info">
            <div class="ai-history-title">${this._escapeHtml(conv.title)}</div>
            <div class="ai-history-meta">${date} · ${conv.messageCount} 条消息</div>
          </div>
          <button class="ai-history-del" title="删除">&times;</button>
        `;
        item.querySelector('.ai-history-info')?.addEventListener('click', () => this._loadConversation(conv.id));
        item.querySelector('.ai-history-del')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.api.aiDeleteConversation(conv.id);
          item.remove();
        });
        list.appendChild(item);
      }
    } else {
      list.innerHTML = '<div class="ai-history-empty">暂无会话记录</div>';
    }

    panel.style.display = '';
  }

  _hideHistory() {
    const panel = document.getElementById('ai-history-panel');
    if (panel) panel.style.display = 'none';
  }

  async _loadConversation(convId) {
    const result = await this.api.aiLoadConversation(convId);
    if (result.success && result.data) {
      this.currentConvId = convId;
      this.messages = result.data.messages || [];
      const msgs = document.getElementById('ai-chat-messages');
      if (msgs) {
        msgs.innerHTML = '';
        for (const msg of this.messages) {
          this._addMessage(msg.role, msg.content);
        }
      }
      this._hideHistory();
    }
  }

  // ============================================================
  // Configuration Panel
  // ============================================================

  _toggleConfig() {
    const panel = document.getElementById('ai-config-panel');
    if (!panel) return;

    if (panel.style.display !== 'none') {
      panel.style.display = 'none';
      return;
    }

    this._renderConfig();
    panel.style.display = '';
  }

  _hideConfig() {
    const panel = document.getElementById('ai-config-panel');
    if (panel) panel.style.display = 'none';
  }

  _renderConfig() {
    const body = document.getElementById('ai-config-body');
    if (!body) return;

    const meta = this.config?.providerMeta || {};
    const providers = this.config?.providers || {};

    let html = '';
    for (const [key, info] of Object.entries(meta)) {
      const p = providers[key] || {};
      const isDefault = key === this.config?.defaultProvider;
      html += `
        <div class="ai-provider-card ${isDefault ? 'ai-provider-active' : ''}">
          <div class="ai-provider-header">
            <span class="ai-provider-name">${info.name}</span>
            ${isDefault ? '<span class="ai-provider-badge">默认</span>' : ''}
            <button class="ai-provider-set-default" data-provider="${key}" i18n="ai_set_default">设为默认</button>
          </div>
          <div class="ai-provider-fields">
            <div class="ai-field">
              <label>API Key</label>
              <div class="ai-key-row">
                <input type="password" class="ai-input" data-provider="${key}" data-field="apiKey" 
                  placeholder="输入 API 密钥..." value="${p.apiKeyMasked || ''}">
                <button class="ai-key-toggle" data-provider="${key}" title="显示/隐藏">👁</button>
              </div>
            </div>
            <div class="ai-field">
              <label i18n="ai_model">模型</label>
              <select class="ai-select" data-provider="${key}" data-field="model">
                ${info.models.map(m => `<option value="${m}" ${m === p.model ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
            <div class="ai-field-row">
              <div class="ai-field">
                <label i18n="ai_base_url">接口地址</label>
                <input type="text" class="ai-input" data-provider="${key}" data-field="baseURL" 
                  value="${p.baseURL || info.baseURL}" placeholder="${info.baseURL}">
              </div>
            </div>
            <div class="ai-field-row">
              <div class="ai-field ai-field-sm">
                <label i18n="ai_temperature" title="控制输出随机性：0最精确，2最创意">温度</label>
                <input type="number" class="ai-input" data-provider="${key}" data-field="temperature" 
                  value="${p.temperature ?? 0.7}" min="0" max="2" step="0.1">
              </div>
              <div class="ai-field ai-field-sm">
                <label i18n="ai_max_tokens">最大长度</label>
                <input type="number" class="ai-input" data-provider="${key}" data-field="maxTokens" 
                  value="${p.maxTokens ?? 4096}" min="100" max="128000" step="100">
              </div>
              <div class="ai-field ai-field-sm">
                <label i18n="ai_timeout">超时(ms)</label>
                <input type="number" class="ai-input" data-provider="${key}" data-field="timeout" 
                  value="${p.timeout ?? 60000}" min="5000" max="300000" step="5000">
              </div>
            </div>
            <button class="ai-save-provider-btn" data-provider="${key}" i18n="ai_save">保存配置</button>
          </div>
        </div>
      `;
    }

    body.innerHTML = html;

    // Bind save buttons
    body.querySelectorAll('.ai-save-provider-btn').forEach(btn => {
      btn.addEventListener('click', () => this._saveProviderConfig(btn.dataset.provider));
    });

    // Bind set default buttons
    body.querySelectorAll('.ai-provider-set-default').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.api.aiSetDefaultProvider(btn.dataset.provider);
        await this._loadConfig();
        this._renderConfig();
        this._updateProviderSelect();
      });
    });

    // Bind key toggle
    body.querySelectorAll('.ai-key-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = body.querySelector(`input[data-provider="${btn.dataset.provider}"][data-field="apiKey"]`);
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
      });
    });
  }

  async _saveProviderConfig(providerKey) {
    const body = document.getElementById('ai-config-body');
    if (!body) return;

    const settings = {};
    body.querySelectorAll(`[data-provider="${providerKey}"]`).forEach(el => {
      if (el.dataset.field) {
        settings[el.dataset.field] = el.value;
      }
    });

    // Don't save masked keys — only save if user actually typed a new key
    if (settings.apiKey && settings.apiKey.includes('***')) {
      delete settings.apiKey; // Keep existing key
    }

    const result = await this.api.aiUpdateProvider(providerKey, settings);
    if (result.success) {
      await this._loadConfig();
      this._renderConfig();
      this._updateProviderSelect();
      this.app._showToast(this.app._t('ai_config_saved') || 'AI 配置已保存');
    } else {
      this.app._showToast(result.error || '保存失败', 'error');
    }
  }
}

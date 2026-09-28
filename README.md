---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'c11c69bf-d8b5-4f7b-8677-38bf2249d4c7'
  PropagateID: 'c11c69bf-d8b5-4f7b-8677-38bf2249d4c7'
  ReservedCode1: '1cec3df8-cc5e-4a7b-bdbe-77c8726c5a9b'
  ReservedCode2: '1cec3df8-cc5e-4a7b-bdbe-77c8726c5a9b'
---

# MindZ

**AI-Powered Mind Mapping Desktop Application**

MindZ is a free, open-source mind mapping desktop application built with Electron. It combines a fast, pure HTML/CSS/JS rendering engine with built-in AI assistance to help you capture, organize, and visualize your thoughts — all in one lightweight app.

**中文说明请见 [README.zh-CN.md](README.zh-CN.md)**

---

## ✨ Features

### 🧠 AI-Powered
- **Built-in AI chat panel** — turn conversations into mind maps with one click
- **AI mind map generation** — describe a topic, get a structured mind map instantly
- **Outline / optimization / file import** with AI assistance
- **Multiple LLM providers**: DeepSeek, Qwen (通义千问), Kimi (Moonshot), OpenAI
- **Streaming responses** with stop-generation control
- **Secure key storage** — API keys are encrypted and never touch the renderer process

### 📐 Multiple Layouts
- Mind Map (center-out radial layout)
- Tree Right / Tree Down (hierarchical)
- Fishbone (Ishikawa) diagram
- Org Chart

### 🎨 Rich Styling
- **6 built-in themes**: Classic Blue, Dark Purple, Fresh Green, Vibrant Orange, Minimal, China Red
- Node shapes: rounded-rect, rect, ellipse, diamond, underline
- Custom colors, font sizes, text colors, emoji icons, priority markers
- **FreeMind .mm import & export** — fully compatible with FreeMind / XMind files
- **Annotations, boundaries, summaries, relationship lines** between nodes
- Collapse/expand, mini-map navigation, pan & zoom

### 💾 File & Export
- Native project format (`.mindz`) with **auto-save**
- Export to **PNG, SVG, PDF, JSON, FreeMind (.mm)**
- **Multi-tab** editing with drag & drop
- **Outline view** for fast text-based navigation
- Undo / redo, find & replace, keyboard shortcuts

### 🌍 Bilingual
- **Simplified Chinese & English** interface, switchable anytime, auto-detect on startup

---

## 🚀 Installation

### Windows
Download the latest installer from the [Releases](https://github.com/zhengyongz/MindZ/releases) page:

```
MindZ-Setup-1.0.0-Win.exe
```

Run the installer — NSIS multi-language installer (Chinese/English). If Windows SmartScreen appears, click **More info → Run anyway** (the app is not code-signed).

### From Source

```bash
# Clone the repository
git clone https://github.com/zhengyongz/MindZ.git
cd MindZ

# Install dependencies
npm install

# Run in development mode
npm start
```

> ⚠️ Requires **Node.js 16+** and npm.

---

## 🛠️ Build

```bash
# Build Windows NSIS installer
npm run build:win

# Build macOS DMG
npm run build:mac

# Build both platforms
npm run build:all
```

The installer is output to the `dist/` directory.

---

## 🤖 AI Configuration

1. Click the **AI** tab in the right side panel
2. Open the **AI Model Config** (gear icon)
3. Select a provider (DeepSeek / Qwen / Kimi / OpenAI)
4. Enter your **API Key** (stored encrypted on your machine — never uploaded)
5. Optionally set base URL, model, temperature, max tokens, timeout
6. Save, then start chatting or generate mind maps directly

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Tab` | Insert child node |
| `Enter` | Insert sibling node |
| `Shift+Tab` | Insert parent node |
| `F2` | Edit node |
| `Delete` / `Del` | Delete node |
| `Ctrl+N` | New file |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste |
| `Ctrl+A` | Select all |
| `Ctrl+F` | Find & Replace |
| `Ctrl+=` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Reset zoom |
| `Ctrl+1` | Fit canvas |
| `Ctrl+Shift+O` | Toggle outline view |
| `Ctrl+/` | Collapse / expand node |
| `F11` | Fullscreen |
| `Tab` / `Enter` | Quick node insertion (repeated) |

---

## 📁 Project Structure

```
MindZ/
├── main.js              # Electron main process (window, menu, IPC, file ops)
├── preload.js           # Preload script (secure context bridge)
├── package.json         # Project config & electron-builder settings
├── build/
│   └── installer.nsh    # NSIS multi-language installer script
├── assets/
│   ├── icon.ico         # Windows app icon
│   ├── icon_256.png
│   └── icon_512.png
└── src/
    ├── index.html       # Main renderer page
    ├── css/style.css    # Styles
    └── js/
        ├── app.js       # Main controller (UI, menus, i18n, dialogs)
        ├── mindmap.js   # Data model (JSON, FreeMind import/export)
        ├── layout.js    # Layout engine (5 layouts)
        ├── renderer.js  # SVG rendering engine
        ├── theme.js     # Theme manager
        ├── ai-chat.js   # AI chat panel UI
        └── ai-provider.js # AI provider adapter (main process)
```

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 📮 Contact & Support

- **GitHub**: [zhengyongz/MindZ](https://github.com/zhengyongz/MindZ)
- Found a bug or have an idea? Open an [Issue](https://github.com/zhengyongz/MindZ/issues) or submit a Pull Request.

---

*Made with ❤️ for thinkers everywhere.*

> AI生成
---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'af17faa2-7260-4959-bd26-6501cdbed059'
  PropagateID: 'af17faa2-7260-4959-bd26-6501cdbed059'
  ReservedCode1: '46263944-3e8f-461c-b363-672d63dcfe2d'
  ReservedCode2: '46263944-3e8f-461c-b363-672d63dcfe2d'
---

# MindZ 思维导图

**AI 驱动的桌面思维导图应用**

MindZ 是一款免费开源的桌面思维导图软件，基于 [Electron](https://www.electronjs.org/) 构建。它采用纯 HTML/CSS/JS 轻量渲染引擎，并内置 AI 助手，帮助你快速捕捉灵感、梳理思路、可视化表达——一个应用搞定从想法到成图的全过程。

**English version:** [README.md](README.md)

---

## ✨ 功能特性

### 🧠 AI 智能助手
- **内置 AI 聊天面板**，对话内容可一键生成思维导图
- **AI 生成导图** — 输入主题，即刻生成结构化思维导图
- **AI 大纲生成 / 内容优化 / 文件导入** 三大能力
- **支持多模型服务商**：DeepSeek 深度求索、通义千问、Kimi（月之暗面）、OpenAI
- **流式输出**，支持随时停止生成
- **密钥安全存储** — API Key 加密保存在本地，不经过渲染进程，绝不上传

### 📐 多种布局
- 思维导图（中心发散式）
- 向右树状 / 向下树状（层级式）
- 鱼骨图（因果分析）
- 组织架构图

### 🎨 丰富的视觉样式
- **6 套内置主题**：经典蓝、暗夜紫、清新绿、活力橙、极简白、中国红
- 节点形状：圆角矩形、矩形、椭圆、菱形、下划线
- 自定义颜色、字号、文字颜色、Emoji 图标、优先级标记
- **FreeMind (.mm) 文件导入与导出**，与 FreeMind / XMind 无缝兼容
- **联系线、标注、外框、概要** 等高级结构元素
- 节点折叠/展开、小地图导航、平移缩放

### 💾 效率与导出
- 原生项目格式（`.mindz`），**自动保存**
- 导出 **PNG 图片、SVG 矢量、PDF 文档、JSON 数据、FreeMind (.mm)**
- **多标签页**编辑
- **大纲视图**，快速文本化导航
- 撤销 / 重做、查找替换、复制剪切粘贴

### 🌍 中英双语
- 简体中文 & English 界面，可随时切换，启动时自动检测

---

## 🚀 安装

### 方式一：安装包
从 [Releases](https://github.com/zhengyongz/MindZ/releases) 页面下载：

```
MindZ-Setup-1.0.0-Win.exe
```

双击运行即可。安装器为 NSIS 多语言安装向导（支持中文/英文）。若 Windows SmartScreen 出现安全提示，点击 **更多信息 → 仍要运行** 即可（程序暂未进行代码签名）。

### 方式二：源码运行

```bash
# 克隆仓库
git clone https://github.com/zhengyongz/MindZ.git
cd MindZ

# 安装依赖
npm install

# 开发模式运行
npm start
```

> ⚠️ 需要 **Node.js 16+** 与 npm。

---

## 🛠️ 构建

```bash
# 构建 Windows 安装包 (NSIS)
npm run build:win

# 构建 macOS 安装包 (DMG)
npm run build:mac

# 同时构建双平台
npm run build:all
```

安装包将输出到 `dist/` 目录。

---

## 🤖 AI 配置

1. 点击右侧面板 **AI** 标签
2. 打开 **AI 模型配置**（齿轮图标）
3. 选择模型服务商（DeepSeek / 通义千问 / Kimi / OpenAI）
4. 输入你的 **API Key**（加密保存在本机，绝不外传）
5. 可选设置：接口地址、模型、温度、最大长度、超时时间
6. 保存配置，即可开始对话并生成思维导图

---

## ⌨️ 快捷键一览

| 快捷键 | 功能 |
|--------|------|
| `Tab` | 插入子节点 |
| `Enter` | 插入同级节点 |
| `Shift+Tab` | 插入父节点 |
| `F2` | 编辑节点 |
| `Del` | 删除节点 |
| `Ctrl+N` | 新建 |
| `Ctrl+O` | 打开 |
| `Ctrl+S` | 保存 |
| `Ctrl+Shift+S` | 另存为 |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做 |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | 复制 / 剪切 / 粘贴 |
| `Ctrl+A` | 全选 |
| `Ctrl+F` | 查找替换 |
| `Ctrl+=` / `Ctrl+-` | 放大 / 缩小 |
| `Ctrl+0` | 重置缩放 |
| `Ctrl+1` | 适应画布 |
| `Ctrl+Shift+O` | 切换大纲视图 |
| `Ctrl+/` | 折叠 / 展开节点 |
| `F11` | 全屏 |

---

## 📁 项目结构

```
MindZ/
├── main.js               # Electron 主进程（窗口、IPC、文件操作）
├── preload.js            # 预加载脚本（安全上下文桥接）
├── package.json          # 项目配置与 electron-builder 配置
├── build/
│   └── installer.nsh     # NSIS 多语言安装器脚本
├── assets/
│   ├── icon.ico          # Windows 应用图标
│   ├── icon_256.png
│   └── icon_512.png
└── src/
    ├── index.html        # 渲染进程主页面
    ├── css/style.css     # 样式表
    └── js/
        ├── app.js        # 主控制器（操作、菜单、i18n、对话框）
        ├── mindmap.js    # 数据模型（JSON、FreeMind 导入导出）
        ├── layout.js     # 布局引擎（五种布局）
        ├── renderer.js   # SVG 渲染引擎
        ├── theme.js      # 主题管理
        ├── ai-chat.js    # AI 聊天面板 UI
        └── ai-provider.js # AI 服务商适配层（主进程）
```

---

## 📄 开源协议

本项目采用 **MIT License** 开源，详情见 [LICENSE](LICENSE) 文件。

---

## 📮 联系与反馈

- **GitHub**：[zhengyongz/MindZ](https://github.com/zhengyongz/MindZ)
- 遇到 Bug 或有好的想法？欢迎提交 [Issue](https://github.com/zhengyongz/MindZ/issues) 或 Pull Request。

---

*为每一个热爱思考的人而做。*

> AI生成
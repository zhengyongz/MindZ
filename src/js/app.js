/**
 * MindMap App - Main controller with full feature support
 * i18n: zh/en complete coverage | Relationship lines | Annotations | Boundaries | Summaries | Free drag
 */
class MindMapApp {
  constructor() {
    // Multi-document support: array of document states
    this.documents = [];
    this.activeDocIndex = 0;
    this.maxTabs = 3;

    this.layout = new LayoutEngine();
    this.theme = new ThemeManager();
    this.renderer = null;
    this.findResults = [];
    this.findIndex = -1;

    // i18n
    this.lang = 'zh';
    this.i18n = null;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => this._setup());
    else this._setup();
  }

  // Convenience accessors for active document
  get data() { return this.documents[this.activeDocIndex]?.data; }
  get currentFile() { return this.documents[this.activeDocIndex]?.filePath; }
  set currentFile(v) { if (this.documents[this.activeDocIndex]) this.documents[this.activeDocIndex].filePath = v; }
  get isModified() { return this.documents[this.activeDocIndex]?.isModified || false; }
  set isModified(v) { if (this.documents[this.activeDocIndex]) this.documents[this.activeDocIndex].isModified = v; }

  _setup() {
    const svg = document.getElementById('mindmap-svg');

    // Create first document
    this._createNewDocument();

    this.renderer = new MindMapRenderer(svg, this.data, this.layout, this.theme);
    this.renderer.app = this;

    // Renderer callbacks
    this.renderer.onNodeSelected = (node) => this._onNodeSelected(node);
    this.renderer.onNodeDblClick = (node) => this._startEditNode(node);
    this.renderer.onRelationshipCreated = (from, to) => this._onRelationCreated(from, to);
    this.renderer.onAnnotationClick = (ann) => this._editAnnotation(ann);
    this.renderer.onRelationClick = (rel) => this._editRelation(rel);
    this.renderer.onSummaryClick = (sum) => this._editSummary(sum);
    this.renderer.onBoundaryClick = (bound) => this._editBoundary(bound);
    this.renderer.onNodeDropTo = (dragNode, targetNode) => {
      if (dragNode && targetNode && dragNode !== targetNode && !dragNode.isRoot) {
        if (this.data.moveNode(dragNode, targetNode)) {
          this.data.selectedNode = dragNode;
          this.renderer.render();
          this._showToast(this._t('toast_node_moved'));
        }
      }
    };

    this._initI18n();
    this._detectLanguage();
    this._applyLanguage();
    // Sync menu language with main process
    if (window.electronAPI?.updateMenuLanguage) {
      window.electronAPI.updateMenuLanguage(this.lang);
    }
    this._bindToolbar();
    this._bindSidePanel();
    this._bindContextMenu();
    this._bindKeyboard();
    this._bindElectronMenu();
    this._bindTabBar();

    // Initialize AI Chat module
    this._initAIChat();

    // Single document click listener: close all dropdowns + context menu
    document.addEventListener('click', (e) => {
      // Close all dropdowns unless click is inside a dropdown
      if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
      }
      // Close context menu unless click is inside it
      const ctxMenu = $('#context-menu');
      if (ctxMenu && !ctxMenu.contains(e.target)) ctxMenu.classList.add('hidden');
    });

    // Try to load last saved file, otherwise apply default template
    this._loadLastFileOrTemplate();

    this.renderer.render();
    // Delay fitCanvas to ensure SVG has proper dimensions
    setTimeout(() => { this.renderer.fitCanvas(); this._updateZoomLabel(); }, 100);

    this._updateStatus();
    this._updateOutline();
    this._applyThemeBackground();
    this._renderTabBar();

    this._showToast(this._t('welcome'), 'success');
  }

  // ============================================================
  // MULTI-TAB DOCUMENT MANAGEMENT
  // ============================================================
  _createNewDocument(name, filePath) {
    const data = new MindMapData();
    const doc = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      data: data,
      filePath: filePath || null,
      isModified: false,
      name: name || (this.lang === 'zh' ? '未命名' : 'Untitled'),
      viewState: { viewX: 0, viewY: 0, scale: 1 }
    };
    // Bind data events ONCE per document (P2-13: never re-bind on tab switch)
    data.on('*', () => this._onDataChanged(doc));
    this.documents.push(doc);
    return doc;
  }

  /** Central data-change handler — one listener per document, forever */
  _onDataChanged(doc) {
    doc.isModified = true;
    // Background document: just mark modified, no rendering
    if (doc !== this.documents[this.activeDocIndex]) return;
    this.renderer.render();
    this._updateStatus();
    this._updateOutlineDebounced();
    this._renderTabBar();
  }

  /** Debounced outline rebuild — avoids heavy DOM work on rapid changes (P2-11) */
  _updateOutlineDebounced() {
    clearTimeout(this._outlineTimer);
    this._outlineTimer = setTimeout(() => this._updateOutline(), 150);
  }

  _saveCurrentViewState() {
    const doc = this.documents[this.activeDocIndex];
    if (doc && this.renderer) {
      doc.viewState = { viewX: this.renderer.viewX, viewY: this.renderer.viewY, scale: this.renderer.scale };
    }
  }

  _switchToDocument(index) {
    if (index < 0 || index >= this.documents.length || index === this.activeDocIndex) return;

    // Save current view state
    this._saveCurrentViewState();

    // Switch active document
    this.activeDocIndex = index;

    // Update renderer data reference
    this.renderer.data = this.data;

    // Restore view state
    const doc = this.documents[index];
    this.renderer.viewX = doc.viewState.viewX;
    this.renderer.viewY = doc.viewState.viewY;
    this.renderer.scale = doc.viewState.scale;

    // Re-render (data events are already bound once per document)
    this.renderer.render();
    this.renderer._updateViewport();
    this._updateZoomLabel();
    this._updateStatus();
    this._updateOutline();
    this._renderTabBar();

    // Update title
    if (doc.filePath) {
      document.title = `MindZ - ${doc.name}`;
    } else {
      document.title = 'MindZ';
    }
  }

  _addNewTab() {
    if (this.documents.length >= this.maxTabs) {
      this._showToast(this.lang === 'zh' ? '最多同时打开3个思维导图' : 'Max 3 tabs', 'warning');
      return;
    }

    // Auto-save current document
    this._autoSaveCurrentDoc();

    // Create new document
    const doc = this._createNewDocument();
    const newIndex = this.documents.length - 1;

    // Apply default template to new document
    const root = doc.data.root;
    doc.data.updateNodeText(root, this.lang === 'zh' ? '中心主题' : 'Central Topic');
    const branches = this.lang === 'zh'
      ? [{ text: '分支一' }, { text: '分支二' }, { text: '分支三' }]
      : [{ text: 'Branch 1' }, { text: 'Branch 2' }, { text: 'Branch 3' }];
    branches.forEach(b => doc.data.addChild(root, b.text));

    // Switch to new document
    this._switchToDocument(newIndex);

    // Fit canvas for new document
    setTimeout(() => { this.renderer.fitCanvas(); this._updateZoomLabel(); }, 50);
  }

  async _closeTab(index) {
    if (this.documents.length <= 1) {
      // Don't close the last tab — just clear it
      this._newFile();
      return;
    }

    const doc = this.documents[index];

    // P0-6: never silently discard unsaved work
    if (doc.isModified) {
      if (doc.filePath) {
        // Previously saved file — auto-save quietly
        this._autoSaveDoc(doc);
      } else {
        // Never-saved document with modifications — ask the user
        const doSave = confirm(
          this.lang === 'zh'
            ? `“${doc.name}”` + this._t('close_save_confirm')
            : `"${doc.name}" ` + this._t('close_save_confirm')
        );
        if (doSave) {
          const r = await window.electronAPI.showSaveDialog({
            title: this._t('save_before_new'),
            filters: [
              { name: 'MindZ', extensions: ['mindz'] },
              { name: 'JSON', extensions: ['json'] },
              { name: 'FreeMind', extensions: ['mm'] }
            ],
            defaultPath: 'untitled.mindz'
          });
          if (r.canceled) return; // user backed out — keep the tab open
          const sr = await window.electronAPI.saveFile(r.filePath, JSON.stringify(doc.data.toJSON(), null, 2));
          if (!sr.success) {
            this._showToast('Failed: ' + sr.error, 'error');
            return; // save failed — keep the tab open
          }
        } else {
          const doDiscard = confirm(this._t('close_discard_confirm'));
          if (!doDiscard) return; // keep the tab open
        }
      }
    }

    this.documents.splice(index, 1);

    // Adjust active index
    if (this.activeDocIndex >= this.documents.length) {
      this.activeDocIndex = this.documents.length - 1;
    } else if (index < this.activeDocIndex) {
      this.activeDocIndex--;
    } else if (index === this.activeDocIndex) {
      this.activeDocIndex = Math.min(index, this.documents.length - 1);
    }

    // Update renderer
    this.renderer.data = this.data;
    const activeDoc = this.documents[this.activeDocIndex];
    this.renderer.viewX = activeDoc.viewState.viewX;
    this.renderer.viewY = activeDoc.viewState.viewY;
    this.renderer.scale = activeDoc.viewState.scale;

    this.renderer.render();
    this.renderer._updateViewport();
    this._updateZoomLabel();
    this._updateStatus();
    this._updateOutline();
    this._renderTabBar();
  }

  _autoSaveCurrentDoc() {
    const doc = this.documents[this.activeDocIndex];
    this._autoSaveDoc(doc);
  }

  _autoSaveDoc(doc) {
    if (!doc || !doc.filePath || !window.electronAPI) return;
    try {
      const content = JSON.stringify(doc.data.toJSON());
      window.electronAPI.saveFile(doc.filePath, content);
      doc.isModified = false;
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }

  _bindTabBar() {
    const newBtn = document.getElementById('btn-tab-new');
    if (newBtn) {
      newBtn.onclick = () => this._addNewTab();
    }

    // Event delegation on tab list
    const tabList = document.getElementById('tab-list');
    if (tabList) {
      tabList.addEventListener('click', (e) => {
        const tabItem = e.target.closest('.tab-item');
        if (tabItem) {
          const idx = parseInt(tabItem.dataset.index);
          if (!isNaN(idx)) this._switchToDocument(idx);
        }
        const closeBtn = e.target.closest('.tab-close');
        if (closeBtn) {
          e.stopPropagation();
          const idx = parseInt(closeBtn.dataset.index);
          if (!isNaN(idx)) this._closeTab(idx);
        }
      });
    }
  }

  _renderTabBar() {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;

    tabList.innerHTML = '';
    this.documents.forEach((doc, i) => {
      const tab = document.createElement('div');
      tab.className = 'tab-item' + (i === this.activeDocIndex ? ' active' : '') + (doc.isModified ? ' modified' : '');
      tab.dataset.index = i;
      // P1-7: use textContent for untrusted doc names (from file names) — never innerHTML
      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = doc.name;
      tab.appendChild(label);
      if (this.documents.length > 1) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close';
        closeBtn.dataset.index = i;
        closeBtn.title = 'Close';
        closeBtn.textContent = '\u00d7';
        tab.appendChild(closeBtn);
      }
      tabList.appendChild(tab);
    });
  }

  async _loadLastFileOrTemplate() {
    if (window.electronAPI) {
      try {
        // P0-1: renderer process has no require('path') — join manually (same as _saveLastFilePath)
        const appPath = await window.electronAPI.getAppPath();
        const lastFilePath = await window.electronAPI.readFile(appPath + '/last-file.txt');
        if (lastFilePath.success && lastFilePath.content) {
          const fp = lastFilePath.content.trim();
          if (fp) {
            const rr = await window.electronAPI.readFile(fp);
            if (rr.success) {
              const j = JSON.parse(rr.content);
              if (this.data.fromJSON(j)) {
                this.currentFile = fp;
                this.isModified = false;
                // Update first document name to match filename
                const doc = this.documents[0];
                if (doc) doc.name = fp.split(/[\\/]/).pop().replace(/\.(mindz|json)$/i, '');
                this._renderTabBar();
                return; // Successfully loaded last file
              }
            }
          }
        }
      } catch (e) {
        // Distinguish real failures from "no last file yet" instead of swallowing silently
        console.warn('Load last file skipped:', e.message);
      }
    }
    // No last file or failed to load — use default template
    this._applyDefaultTemplate();
  }

  // ============================================================
  // I18N - Complete Internationalization
  // ============================================================
  _initI18n() {
    this.i18n = {
      zh: {
        welcome: '欢迎使用 MindZ 思维导图！',
        toast_node_moved: '节点已移动',
        toast_rel_created: '关系线已创建',
        toast_ann_added: '标注已添加',
        toast_bound_added: '外框已添加',
        toast_sum_added: '概要已添加',
        toast_deleted: '已删除',
        toast_saved: '保存成功',
        toast_auto_saved: '已自动保存',
        save_before_new: '保存当前文件',
        close_save_confirm: ' 有未保存的修改，关闭前保存吗？（取消将询问是否放弃）',
        close_discard_confirm: '确定放弃修改并直接关闭？',
        toast_export_ok: '导出成功',
        toast_export_fail: '导出失败',
        toast_undo: '已撤销',
        toast_redo: '已重做',
        toast_layout_changed: '布局已切换',
        toast_theme_changed: '主题已切换',
        toast_template_applied: '模板已应用',
        toast_not_found: '未找到匹配项',
        toast_pos_reset: '位置已重置',
        // Toolbar buttons
        new_file: '新建',
        open: '打开',
        save: '保存',
        undo: '',
        redo: '',
        child_node: '子节点',
        sibling: '同级',
        delete: '删除',
        relation: '联系线',
        annotation: '标注',
        boundary: '外框',
        summary: '概要',
        layout: '布局',
        theme: '主题',
        template: '模板',
        export: '导出',
        outline: '大纲',
        reset_pos: '重置',
        language: '语言',
        zoom_in: '',
        zoom_out: '',
        fit: '',
        // Layout options
        layout_mindmap: '思维导图',
        layout_tree_right: '向右树状',
        layout_tree_down: '向下树状',
        layout_fishbone: '鱼骨图',
        layout_org: '组织结构图',
        // Theme names
        theme_classic_blue: '经典蓝',
        theme_dark_purple: '暗夜紫',
        theme_fresh_green: '清新绿',
        theme_vibrant_orange: '活力橙',
        theme_minimal: '极简白',
        theme_china_red: '中国红',
        // Template names
        tpl_weekly: '周计划',
        tpl_project: '项目管理',
        tpl_reading: '读书笔记',
        tpl_swot: 'SWOT 分析',
        tpl_brainstorm: '头脑风暴',
        // Export formats
        exp_png: 'PNG 图片',
        exp_svg: 'SVG 矢量',
        exp_pdf: 'PDF 文档',
        exp_json: 'JSON 数据',
        exp_mm: 'FreeMind 文件',
        freemind_file: 'FreeMind 文件',
        // Language options
        lang_auto: '自动检测',
        lang_zh: '中文',
        lang_en: 'English',
        // Panel tabs
        tab_outline: '大纲',
        tab_style: '样式',
        tab_note: '备注',
        // Style panel labels
        lbl_shape: '形状',
        lbl_color: '颜色',
        lbl_font_size: '字号',
        lbl_text_color: '文字颜色',
        lbl_icon: '图标',
        lbl_priority: '优先级',
        // Context menu
        ctx_add_child: '添加子节点 (Tab)',
        ctx_add_sibling: '添加同级 (Enter)',
        ctx_add_parent: '添加父节点',
        ctx_edit: '编辑 (F2)',
        ctx_change_color: '修改颜色',
        ctx_copy: '复制 (Ctrl+C)',
        ctx_cut: '剪切 (Ctrl+X)',
        ctx_paste: '粘贴 (Ctrl+V)',
        ctx_collapse: '折叠/展开 (Ctrl+/)',
        ctx_collapse_all: '全部折叠',
        ctx_expand_all: '全部展开',
        ctx_relation: '联系线',
        ctx_edit_relations: '编辑联系线',
        ctx_annotation: '标注',
        ctx_boundary: '外框',
        ctx_summary: '概要',
        ctx_show_style: '样式面板',
        ctx_tpl_weekly: '周计划模板',
        ctx_tpl_project: '项目管理模板',
        ctx_delete: '删除 (Del)',
        // Status bar
        ready: '就绪',
        modified: '已修改',
        node_count: '节点',
        // Dialogs
        rel_label_placeholder: '输入标签文字...',
        ann_text_placeholder: '输入标注内容...',
        bound_label_placeholder: '外框标签...',
        sum_text_placeholder: '概要内容...',
        sum_range_start: '起始项',
        sum_range_end: '结束项',
        rel_dialog_title: '编辑联系线',
        ann_dialog_title: '编辑标注',
        bound_dialog_title: '编辑外框',
        sum_dialog_title: '编辑概要',
        arrow_none: '无箭头',
        arrow_end: '箭头在终点',
        arrow_start: '箭头在起点',
        arrow_both: '双向箭头',
        style_curve: '曲线',
        style_straight: '直线',
        style_dashed: '虚线',
        pos_right_top: '右上',
        pos_right_bottom: '右下',
        pos_left_top: '左上',
        pos_left_bottom: '左下',
        solid_line: '实线',
        dashed_line: '虚线',
        dotted_line: '点线',
        confirm: '确定',
        cancel: '取消',
        delete_confirm: '确定删除此联系线？',
        toast_select_node: '请先选择一个节点',
        toast_click_target: '点击另一个节点创建联系线，按 ESC 取消',
        toast_no_rel: '该节点没有联系线',
        toast_need_children: '需要至少 2 个子节点才能添加概要',
        ph_notes: '输入备注...',
        ph_find: '查找...',
        // AI Chat
        tab_ai_chat: 'AI',
        ai_welcome: '欢迎使用 MindZ AI 助手！配置模型后即可开始对话。',
        ai_config_title: 'AI 模型配置',
        ai_config_saved: 'AI 配置已保存',
        ai_history_title: '会话记录',
        ai_apply_mindmap: '应用为思维导图',
        ai_dismiss: '忽略',
        ai_mindmap_applied: '思维导图已生成',
        ai_set_default: '设为默认',
        ai_model: '模型',
        ai_base_url: '接口地址',
        ai_temperature: '温度',
        ai_temperature_hint: '（越低越精确，越高越创意）',
        ai_max_tokens: '最大长度',
        ai_timeout: '超时(ms)',
        ai_save: '保存配置',
        ai_import_title: '导入文件',
        ai_no_api_key: '请先配置 AI 模型的 API 密钥',
        ai_btn_outline: '大纲',
        ai_btn_mindmap: '导图',
        ai_btn_optimize: '优化',
        ai_btn_import: '导入',
        ai_hint_outline: '请先输入或选中节点，再点大纲',
        ai_hint_optimize: '请先输入或选中节点，再点优化',
        ai_hint_mindmap: '请先输入主题，再点导图',
        ai_chat_placeholder: '输入消息...',
        ai_btn_send: '发送',
        ai_btn_stop: '停止生成',
        ai_import_mindmap: '生成思维导图',
        ai_import_outline: '生成大纲',
        ai_detect_mindmap: '🧠 检测到思维导图结构，是否应用到画布？',
        ai_file_imported: '📄 文件已导入，推荐操作：',
        ai_dismiss: '忽略',
      },
      en: {
        welcome: 'Welcome to MindZ Mind Map!',
        toast_node_moved: 'Node moved',
        toast_rel_created: 'Relationship created',
        toast_ann_added: 'Annotation added',
        toast_bound_added: 'Boundary added',
        toast_sum_added: 'Summary added',
        toast_deleted: 'Deleted',
        toast_saved: 'Saved successfully',
        toast_auto_saved: 'Auto saved',
        save_before_new: 'Save current file',
        close_save_confirm: ' has unsaved changes. Save before closing? (Cancel will ask to discard)',
        close_discard_confirm: 'Discard changes and close anyway?',
        toast_export_ok: 'Exported successfully',
        toast_export_fail: 'Export failed',
        toast_undo: 'Undone',
        toast_redo: 'Redone',
        toast_layout_changed: 'Layout changed',
        toast_theme_changed: 'Theme changed',
        toast_template_applied: 'Template applied',
        toast_not_found: 'No matches found',
        toast_pos_reset: 'Positions reset',
        // Toolbar buttons
        new_file: 'New',
        open: 'Open',
        save: 'Save',
        undo: '',
        redo: '',
        child_node: 'Child',
        sibling: 'Sibling',
        delete: 'Del',
        relation: 'Relation',
        annotation: 'Annotation',
        boundary: 'Boundary',
        summary: 'Summary',
        layout: 'Layout',
        theme: 'Theme',
        template: 'Template',
        export: 'Export',
        outline: 'Outline',
        reset_pos: 'Reset',
        language: 'Lang',
        zoom_in: '',
        zoom_out: '',
        fit: '',
        // Layout options
        layout_mindmap: 'Mind Map',
        layout_tree_right: 'Tree Right',
        layout_tree_down: 'Tree Down',
        layout_fishbone: 'Fishbone',
        layout_org: 'Org Chart',
        // Theme names
        theme_classic_blue: 'Classic Blue',
        theme_dark_purple: 'Dark Purple',
        theme_fresh_green: 'Fresh Green',
        theme_vibrant_orange: 'Vibrant Orange',
        theme_minimal: 'Minimal',
        theme_china_red: 'China Red',
        // Template names
        tpl_weekly: 'Weekly Plan',
        tpl_project: 'Project Mgmt',
        tpl_reading: 'Reading Notes',
        tpl_swot: 'SWOT Analysis',
        tpl_brainstorm: 'Brainstorm',
        // Export formats
        exp_png: 'PNG Image',
        exp_svg: 'SVG Vector',
        exp_pdf: 'PDF Document',
        exp_json: 'JSON Data',
        exp_mm: 'FreeMind File',
        freemind_file: 'FreeMind File',
        // Language options
        lang_auto: 'Auto Detect',
        lang_zh: 'Chinese',
        lang_en: 'English',
        // Panel tabs
        tab_outline: 'Outline',
        tab_style: 'Style',
        tab_note: 'Note',
        // Style panel labels
        lbl_shape: 'Shape',
        lbl_color: 'Color',
        lbl_font_size: 'Font Size',
        lbl_text_color: 'Text Color',
        lbl_icon: 'Icon',
        lbl_priority: 'Priority',
        // Context menu
        ctx_add_child: 'Add Child (Tab)',
        ctx_add_sibling: 'Add Sibling (Enter)',
        ctx_add_parent: 'Add Parent',
        ctx_edit: 'Edit (F2)',
        ctx_change_color: 'Change Color',
        ctx_copy: 'Copy (Ctrl+C)',
        ctx_cut: 'Cut (Ctrl+X)',
        ctx_paste: 'Paste (Ctrl+V)',
        ctx_collapse: 'Collapse/Expand (Ctrl+/)',
        ctx_collapse_all: 'Collapse All',
        ctx_expand_all: 'Expand All',
        ctx_relation: 'Relation Line',
        ctx_edit_relations: 'Edit Relations',
        ctx_annotation: 'Annotation',
        ctx_boundary: 'Boundary Frame',
        ctx_summary: 'Summary',
        ctx_show_style: 'Style Panel',
        ctx_tpl_weekly: 'Weekly Plan Template',
        ctx_tpl_project: 'Project Template',
        ctx_delete: 'Delete (Del)',
        // Status bar
        ready: 'Ready',
        modified: 'Modified',
        node_count: 'Nodes',
        // Dialogs
        rel_label_placeholder: 'Enter label...',
        ann_text_placeholder: 'Enter annotation...',
        bound_label_placeholder: 'Boundary label...',
        sum_text_placeholder: 'Summary text...',
        sum_range_start: 'Start Item',
        sum_range_end: 'End Item',
        rel_dialog_title: 'Edit Relationship',
        ann_dialog_title: 'Edit Annotation',
        bound_dialog_title: 'Edit Boundary',
        sum_dialog_title: 'Edit Summary',
        arrow_none: 'No Arrow',
        arrow_end: 'Arrow at End',
        arrow_start: 'Arrow at Start',
        arrow_both: 'Both Arrows',
        style_curve: 'Curve',
        style_straight: 'Straight',
        style_dashed: 'Dashed',
        pos_right_top: 'Right-Top',
        pos_right_bottom: 'Right-Bottom',
        pos_left_top: 'Left-Top',
        pos_left_bottom: 'Left-Bottom',
        solid_line: 'Solid',
        dashed_line: 'Dashed',
        dotted_line: 'Dotted',
        confirm: 'OK',
        cancel: 'Cancel',
        delete_confirm: 'Delete this relationship?',
        toast_select_node: 'Please select a node first',
        toast_click_target: 'Click another node to create relation, ESC to cancel',
        toast_no_rel: 'No relationships for this node',
        toast_need_children: 'Need at least 2 child nodes for summary',
        ph_notes: 'Enter notes...',
        ph_find: 'Find...',
        // AI Chat
        tab_ai_chat: 'AI',
        ai_welcome: 'Welcome to MindZ AI Assistant! Configure a model to start chatting.',
        ai_config_title: 'AI Model Config',
        ai_config_saved: 'AI config saved',
        ai_history_title: 'Chat History',
        ai_apply_mindmap: 'Apply as Mind Map',
        ai_dismiss: 'Dismiss',
        ai_mindmap_applied: 'Mind map generated',
        ai_set_default: 'Set Default',
        ai_model: 'Model',
        ai_base_url: 'Base URL',
        ai_temperature: 'Temperature',
        ai_temperature_hint: '(Lower=Precise, Higher=Creative)',
        ai_max_tokens: 'Max Tokens',
        ai_timeout: 'Timeout(ms)',
        ai_save: 'Save Config',
        ai_import_title: 'Import File',
        ai_no_api_key: 'Please configure an API key first',
        ai_btn_outline: 'Outline',
        ai_btn_mindmap: 'MindMap',
        ai_btn_optimize: 'Optimize',
        ai_btn_import: 'Import',
        ai_hint_outline: 'Select a node or type text first, then click Outline',
        ai_hint_optimize: 'Select a node or type text first, then click Optimize',
        ai_hint_mindmap: 'Enter a topic first, then click MindMap',
        ai_chat_placeholder: 'Type a message...',
        ai_btn_send: 'Send',
        ai_btn_stop: 'Stop',
        ai_import_mindmap: 'Generate Mind Map',
        ai_import_outline: 'Generate Outline',
        ai_detect_mindmap: '🧠 Mind map structure detected. Apply to canvas?',
        ai_file_imported: '📄 File imported. Suggested actions:',
        ai_dismiss: 'Dismiss',
      }
    };
  }

  _detectLanguage() {
    const sysLang = navigator.language || navigator.userLanguage || 'zh';
    this.lang = sysLang.startsWith('zh') ? 'zh' : 'en';
    this.data.language = this.lang;
  }

  _t(key) {
    const dict = this.i18n[this.lang] || this.i18n.zh;
    return dict[key] || key;
  }

  setLanguage(l) {
    this.lang = l;
    this.data.language = l;
    this._applyLanguage();
    this.renderer.render();
    // Update Electron native menu
    if (window.electronAPI?.updateMenuLanguage) {
      window.electronAPI.updateMenuLanguage(l);
    }
  }

  /** Apply current language to all UI elements - only targets span/text elements, never destroys SVG */
  _applyLanguage() {
    const t = this._t.bind(this);

    // --- Toolbar button labels (span elements by ID) ---
    const btnTextIds = [
      ['btn-new-text','new_file'], ['btn-open-text','open'], ['btn-save-text','save'],
      ['btn-child-text','child_node'], ['btn-sibling-text','sibling'], ['btn-delete-text','delete'],
      ['btn-layout-text','layout'], ['btn-theme-text','theme'], ['btn-template-text','template'],
      ['btn-export-text','export'], ['btn-outline-text','outline'],
      ['btn-relation-text','relation'], ['btn-annotation-text','annotation'],
      ['btn-boundary-text','boundary'], ['btn-summary-text','summary'],
      ['btn-reset-pos-text','reset_pos'],
    ];
    btnTextIds.forEach(([id, key]) => {
      const el = $(id);
      if (el) el.textContent = t(key);
    });

    // Language button shows current lang code
    const langBtn = $('btn-lang-text');
    if (langBtn) langBtn.textContent = this.lang.toUpperCase();

    // --- Dropdown menus & context menu via [i18n="key"] attribute ---
    document.querySelectorAll('[i18n]').forEach(el => {
      const key = el.getAttribute('i18n');
      el.textContent = t(key);
    });

    // --- Placeholders via [i18n-placeholder="key"] attribute ---
    document.querySelectorAll('[i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('i18n-placeholder');
      el.placeholder = t(key);
    });

    // --- Status bar ---
    this._updateStatus();

    // --- AI chat welcome message refresh ---
    // If the AI chat panel has a welcome message (first system message), update it
    var aiMsgs = document.getElementById('ai-chat-messages');
    if (aiMsgs && aiMsgs.children.length > 0) {
      var firstMsg = aiMsgs.children[0];
      if (firstMsg.classList.contains('ai-msg-system')) {
        firstMsg.textContent = t('ai_welcome');
      }
    }
  }

  // ============================================================
  // DEFAULT TEMPLATE ON STARTUP
  // ============================================================
  _applyDefaultTemplate() {
    // Create a nice default mind map so the app doesn't look empty
    const root = this.data.root;
    this.data.updateNodeText(root, this.lang === 'zh' ? '中心主题' : 'Central Topic');

    const branches = this.lang === 'zh'
      ? [
          { text: '分支一', children: [{ text: '子项 1-1' }, { text: '子项 1-2' }] },
          { text: '分支二', children: [{ text: '子项 2-1' }, { text: '子项 2-2' }, { text: '子项 2-3' }] },
          { text: '分支三', children: [{ text: '子项 3-1' }] },
        ]
      : [
          { text: 'Branch 1', children: [{ text: 'Item 1-1' }, { text: 'Item 1-2' }] },
          { text: 'Branch 2', children: [{ text: 'Item 2-1' }, { text: 'Item 2-2' }, { text: 'Item 2-3' }] },
          { text: 'Branch 3', children: [{ text: 'Item 3-1' }] },
        ];

    branches.forEach(b => {
      const parent = this.data.addChild(root, b.text);
      if (b.children) b.children.forEach(c => this.data.addChild(parent, c.text));
    });
  }

  // ============================================================
  // TOOLBAR BINDING
  // ============================================================
  _bindToolbar() {
    // File operations
    $('btn-new').onclick     = () => this._newFile();
    $('btn-open').onclick     = () => this._openFile();
    $('btn-save').onclick     = () => this._saveFile();
    $('btn-undo').onclick     = () => this._undo();
    $('btn-redo').onclick     = () => this._redo();

    // Node operations
    $('btn-add-child').onclick   = () => this._addChild();
    $('btn-add-sibling').onclick = () => this._addSibling();
    $('btn-delete').onclick      = () => this._deleteNode();

    // Advanced features
    $('btn-relation').onclick    = () => this._startCreateRelation();
    $('btn-annotation').onclick  = () => this._addAnnotationForSelected();
    $('btn-boundary').onclick    = () => this._addBoundaryForSelected();
    $('btn-summary').onclick     = () => this._addSummaryForSelected();

    // Dropdowns
    this._bindDropdown('layout-dropdown', (btn) => {
      this.layout.setLayout(btn.dataset.layout);
      this.renderer.render();
      this.renderer.fitCanvas();
      this._showToast(this._t('toast_layout_changed'));
    });

    this._bindDropdown('theme-dropdown', (btn) => {
      if (this.theme.setTheme(btn.dataset.theme)) {
        this._applyThemeBackground();
        this.renderer.render();
        this._showToast(this._t('toast_theme_changed'));
      }
    });

    this._bindDropdown('export-dropdown', (btn) => this._export(btn.dataset.export));
    this._bindDropdown('template-dropdown', (btn) => this._insertTemplate(btn.dataset.template));

    // Language dropdown
    this._bindDropdown('lang-dropdown', (btn) => {
      const lang = btn.dataset.lang;
      if (lang === 'auto') {
        this._detectLanguage();
        // Sync Electron menu after auto-detect
        if (window.electronAPI?.updateMenuLanguage) {
          window.electronAPI.updateMenuLanguage(this.lang);
        }
      } else {
        this.setLanguage(lang);
      }
    });

    // Zoom
    $('btn-zoom-in').onclick  = () => { this.renderer.zoomIn();  this._updateZoomLabel(); };
    $('btn-zoom-out').onclick = () => { this.renderer.zoomOut(); this._updateZoomLabel(); };
    $('btn-fit').onclick      = () => { this.renderer.fitCanvas(); this._updateZoomLabel(); };
    $('btn-outline').onclick  = () => this._togglePanel();

    // Find
    const fi = $('find-input');
    if (fi) {
      fi.onkeydown = (e) => {
        if (e.key === 'Enter')      { e.preventDefault(); this._doFind(); }
        if (e.key === 'Escape')     this._closeFind();
      };
    }
    const fn = $('find-next'); if (fn) fn.onclick = () => this._doFind();
    const fc = $('find-close'); if (fc) fc.onclick = () => this._closeFind();
  }

  _bindDropdown(id, callback) {
    const dd = $(id);
    if (!dd) return;
    const trigger = dd.querySelector('.dropdown-trigger');
    const menu = dd.querySelector('.dropdown-menu');
    if (!trigger || !menu) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      // Close all other dropdowns
      document.querySelectorAll('.dropdown.open').forEach(d => { if (d !== dd) d.classList.remove('open'); });
      dd.classList.toggle('open');
      // Position the fixed dropdown menu relative to the trigger button
      if (dd.classList.contains('open')) {
        const rect = trigger.getBoundingClientRect();
        const menuHeight = menu.offsetHeight || 120; // estimate if not rendered yet
        const isNearBottom = rect.bottom + menuHeight > window.innerHeight;
        if (isNearBottom) {
          // Open upward (for buttons near the bottom, e.g. status bar)
          menu.style.top = 'auto';
          menu.style.bottom = (window.innerHeight - rect.top) + 'px';
        } else {
          // Open downward
          menu.style.top = rect.bottom + 'px';
          menu.style.bottom = 'auto';
        }
        // For lang-dropdown and export-dropdown, align to the right edge of trigger
        if (id === 'lang-dropdown') {
          menu.style.left = 'auto';
          menu.style.right = (window.innerWidth - rect.right) + 'px';
        } else {
          menu.style.left = rect.left + 'px';
          menu.style.right = 'auto';
        }
      }
    });

    // Event delegation on menu — handles clicks on button or any child (span, etc.)
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('button');
      if (!btn) return;
      dd.classList.remove('open');
      try {
        callback(btn);
      } catch (err) {
        console.error('Dropdown callback error:', err);
      }
    });
  }

  // ============================================================
  // SIDE PANEL
  // ============================================================
  _bindSidePanel() {
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel-content').forEach(c => c.classList.add('hidden'));
        tab.classList.add('active');
        const p = $('panel-' + tab.dataset.panel);
        if (p) p.classList.remove('hidden');
      };
    });

    // Shape
    document.querySelectorAll('#node-shape-options .shape-btn').forEach(btn => {
      btn.onclick = () => {
        const n = this.data.selectedNode; if (!n) return;
        document.querySelectorAll('#node-shape-options .shape-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.data.updateNodeStyle(n, 'shape', btn.dataset.shape);
      };
    });
    // Color
    document.querySelectorAll('#node-color-options .color-btn').forEach(btn => {
      btn.onclick = () => {
        const n = this.data.selectedNode; if (!n) return;
        document.querySelectorAll('#node-color-options .color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.data.updateNodeStyle(n, 'fillColor', btn.dataset.color);
      };
    });
    // Font size
    document.querySelectorAll('.font-size-options .size-btn').forEach(btn => {
      btn.onclick = () => {
        const n = this.data.selectedNode; if (!n) return;
        document.querySelectorAll('.font-size-options .size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.data.updateNodeStyle(n, 'fontSize', parseInt(btn.dataset.size));
      };
    });
    // Text color — P2-12: continuous input defers history commit until change (blur)
    $('text-color-picker').oninput = (e) => {
      const n = this.data.selectedNode; if (n) this.data.updateNodeStyle(n, 'textColor', e.target.value, true);
    };
    $('text-color-picker').onchange = (e) => {
      const n = this.data.selectedNode; if (n) this.data.updateNodeStyle(n, 'textColor', e.target.value);
    };
    // Icons
    document.querySelectorAll('#icon-grid .icon-btn').forEach(btn => {
      btn.onclick = () => {
        const n = this.data.selectedNode; if (!n) return;
        this.data.updateNodeStyle(n, 'icon', n.style.icon === btn.dataset.icon ? null : btn.dataset.icon);
      };
    });
    // Priority
    document.querySelectorAll('#priority-options .priority-btn').forEach(btn => {
      btn.onclick = () => {
        const n = this.data.selectedNode; if (!n) return;
        document.querySelectorAll('#priority-options .priority-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.data.updateNodeStyle(n, 'priority', parseInt(btn.dataset.priority));
      };
    });
    // Note — P2-12: live-preview without spamming history; commit one history entry on change
    $('note-editor').oninput = () => {
      const n = this.data.selectedNode;
      if (n) { n.note = $('note-editor').value; this.isModified = true; }
    };
    $('note-editor').onchange = () => {
      const n = this.data.selectedNode;
      if (n) this.data.updateNodeNote(n, $('note-editor').value);
    };
  }

  // ============================================================
  // CONTEXT MENU
  // ============================================================
  _bindContextMenu() {
    const menu = $('#context-menu');
    const svg = document.getElementById('mindmap-svg');

    svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const world = this.renderer._screenToWorld(e.clientX, e.clientY);
      const node = this.renderer._hitTestNode(world.x, world.y);
      const ann = this.renderer._hitTestAnnotation(world.x, world.y);
      const relLineId = this.renderer._hitTestRelLine(world.x, world.y);
      const sumHit = this.renderer._hitTestSummary(world.x, world.y);
      const boundHit = this.renderer._hitTestBoundary(world.x, world.y);

      // Build context-sensitive menu
      let html = '';
      if (node) {
        // Node context: only node-relevant actions
        this.data.selectedNode = node;
        this.renderer.render();
        this._onNodeSelected(node);
        html += `<button data-action="add-child"><span i18n="ctx_add_child">${this._t('ctx_add_child')}</span></button>`;
        html += `<button data-action="add-sibling"><span i18n="ctx_add_sibling">${this._t('ctx_add_sibling')}</span></button>`;
        html += `<button data-action="add-parent"><span i18n="ctx_add_parent">${this._t('ctx_add_parent')}</span></button>`;
        html += `<div class="menu-sep"></div>`;
        html += `<button data-action="edit"><span i18n="ctx_edit">${this._t('ctx_edit')}</span></button>`;
        html += `<button data-action="change-color"><span i18n="ctx_change_color">${this._t('ctx_change_color')}</span></button>`;
        html += `<button data-action="show-style"><span i18n="ctx_show_style">${this._t('ctx_show_style')}</span></button>`;
        html += `<div class="menu-sep"></div>`;
        html += `<button data-action="copy"><span i18n="ctx_copy">${this._t('ctx_copy')}</span></button>`;
        html += `<button data-action="cut"><span i18n="ctx_cut">${this._t('ctx_cut')}</span></button>`;
        html += `<button data-action="paste"><span i18n="ctx_paste">${this._t('ctx_paste')}</span></button>`;
        html += `<div class="menu-sep"></div>`;
        html += `<button data-action="collapse"><span i18n="ctx_collapse">${this._t('ctx_collapse')}</span></button>`;
        html += `<button data-action="add-relation"><span i18n="ctx_relation">${this._t('ctx_relation')}</span></button>`;
        html += `<button data-action="add-annotation"><span i18n="ctx_annotation">${this._t('ctx_annotation')}</span></button>`;
        html += `<button data-action="add-boundary"><span i18n="ctx_boundary">${this._t('ctx_boundary')}</span></button>`;
        if (node.children.length >= 2) html += `<button data-action="add-summary"><span i18n="ctx_summary">${this._t('ctx_summary')}</span></button>`;
        html += `<div class="menu-sep"></div>`;
        if (!node.isRoot) html += `<button data-action="delete" class="danger"><span i18n="ctx_delete">${this._t('ctx_delete')}</span></button>`;
      } else if (ann) {
        // Annotation context
        this._contextAnnotation = ann;
        html += `<button data-action="edit-annotation"><span i18n="ctx_edit">${this._t('ctx_edit')}</span></button>`;
        html += `<button data-action="delete-annotation" class="danger"><span i18n="ctx_delete">${this._t('ctx_delete')}</span></button>`;
      } else if (boundHit) {
        // Boundary context — check before relationship so boundary clicks take priority
        this._contextBoundary = boundHit;
        html += `<button data-action="edit-boundary"><span i18n="ctx_edit">${this._t('ctx_edit')}</span></button>`;
        html += `<button data-action="delete-boundary" class="danger"><span i18n="ctx_delete">${this._t('ctx_delete')}</span></button>`;
      } else if (sumHit) {
        // Summary context
        this._contextSummary = sumHit;
        html += `<button data-action="edit-summary"><span i18n="ctx_edit">${this._t('ctx_edit')}</span></button>`;
        html += `<button data-action="delete-summary" class="danger"><span i18n="ctx_delete">${this._t('ctx_delete')}</span></button>`;
      } else if (relLineId) {
        // Relationship line context
        this._contextRelId = relLineId;
        html += `<button data-action="edit-rel"><span i18n="ctx_edit">${this._t('ctx_edit')}</span></button>`;
        html += `<button data-action="delete-rel" class="danger"><span i18n="ctx_delete">${this._t('ctx_delete')}</span></button>`;
      } else {
        // Canvas background context: general actions
        html += `<button data-action="collapse-all"><span i18n="ctx_collapse_all">${this._t('ctx_collapse_all')}</span></button>`;
        html += `<button data-action="expand-all"><span i18n="ctx_expand_all">${this._t('ctx_expand_all')}</span></button>`;
      }

      menu.innerHTML = html;
      // Ensure menu stays within viewport
      const mx = Math.min(e.clientX, window.innerWidth - 220);
      const my = Math.min(e.clientY, window.innerHeight - 400);
      menu.style.left = mx + 'px';
      menu.style.top = my + 'px';
      menu.classList.remove('hidden');
    });

    // Event delegation for context menu buttons
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('button');
      if (!btn) return;
      const a = btn.dataset.action;
      if (!a) return;
      menu.classList.add('hidden');
      try {
        switch (a) {
          case 'add-child':       this._addChild(); break;
          case 'add-sibling':     this._addSibling(); break;
          case 'add-parent':      this._addParent(); break;
          case 'edit':            if (this.data.selectedNode) this._startEditNode(this.data.selectedNode); break;
          case 'change-color':    this._changeNodeColor(); break;
          case 'show-style':      this._showPanel('style'); break;
          case 'copy':            if (this.data.selectedNode) this.data.copy(this.data.selectedNode); break;
          case 'cut':             if (this.data.selectedNode) this.data.cut(this.data.selectedNode); break;
          case 'paste':           if (this.data.selectedNode) this.data.paste(this.data.selectedNode); break;
          case 'collapse':        if (this.data.selectedNode) this.data.toggleCollapse(this.data.selectedNode); break;
          case 'collapse-all':    this.data.collapseAll(); this.renderer.render(); break;
          case 'expand-all':      this.data.expandAll(); this.renderer.render(); break;
          case 'add-relation':    this._startCreateRelation(); break;
          case 'add-annotation':  this._addAnnotationForSelected(); break;
          case 'add-boundary':    this._addBoundaryForSelected(); break;
          case 'add-summary':     this._addSummaryForSelected(); break;
          case 'edit-relations':  this.editRelationForSelected(); break;
          case 'edit-rel': {
            const rel = this.data.relationships.find(r => r.id === this._contextRelId);
            if (rel) this._editRelation(rel);
            break;
          }
          case 'delete-rel': {
            this.data.removeRelationship(this._contextRelId);
            this.renderer.render();
            this._showToast(this._t('toast_deleted'));
            break;
          }
          case 'edit-annotation': {
            if (this._contextAnnotation) this._editAnnotation(this._contextAnnotation);
            break;
          }
          case 'delete-annotation': {
            if (this._contextAnnotation) {
              this.data.removeAnnotation(this._contextAnnotation.id);
              this.renderer.render();
              this._showToast(this._t('toast_deleted'));
            }
            break;
          }
          case 'edit-summary': {
            if (this._contextSummary) this._editSummary(this._contextSummary);
            break;
          }
          case 'delete-summary': {
            if (this._contextSummary) {
              this.data.removeSummary(this._contextSummary.id);
              this.renderer.render();
              this._showToast(this._t('toast_deleted'));
            }
            break;
          }
          case 'edit-boundary': {
            if (this._contextBoundary) this._editBoundary(this._contextBoundary);
            break;
          }
          case 'delete-boundary': {
            if (this._contextBoundary) {
              this.data.removeBoundary(this._contextBoundary.id);
              this.renderer.render();
              this._showToast(this._t('toast_deleted'));
            }
            break;
          }
          case 'insert-template-weekly':  this._insertTemplate('weekly-plan'); break;
          case 'insert-template-project': this._insertTemplate('project'); break;
          case 'delete':          this._deleteNode(); break;
        }
      } catch (err) {
        console.error('Context menu action error:', err);
      }
    });
  }

  // ============================================================
  // KEYBOARD SHORTCUTS
  // ============================================================
  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // 跳过输入框内的按键：允许用户在 input/textarea/select 中正常输入和粘贴
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (this._isEditing) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (e.key === 'Tab')         { e.preventDefault(); shift ? this._addParent() : this._addChild(); return; }
      if (e.key === 'Enter' && !ctrl) { e.preventDefault(); this._addSibling(); return; }
      if (e.key === 'Delete' || (e.key === 'Backspace' && !this._isEditing)) { e.preventDefault(); this._deleteNode(); return; }
      if (e.key === 'F2')          { e.preventDefault(); if (this.data.selectedNode) this._startEditNode(this.data.selectedNode); return; }
      if (ctrl && e.key === 'z' && !shift) { e.preventDefault(); this._undo(); return; }
      if ((ctrl && e.key === 'y') || (ctrl && shift && e.key === 'z')) { e.preventDefault(); this._redo(); return; }
      if (ctrl && e.key === 'c')   { e.preventDefault(); if (this.data.selectedNode) this.data.copy(this.data.selectedNode); return; }
      if (ctrl && e.key === 'x')   { e.preventDefault(); if (this.data.selectedNode) this.data.cut(this.data.selectedNode); return; }
      if (ctrl && e.key === 'v')   { e.preventDefault(); if (this.data.selectedNode) this.data.paste(this.data.selectedNode); return; }
      if (ctrl && e.key === 'f')   { e.preventDefault(); this._toggleFind(); return; }
      if (ctrl && e.key === '/')    { e.preventDefault(); if (this.data.selectedNode) this.data.toggleCollapse(this.data.selectedNode); return; }
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); this._navigateByKey(e.key); return; }
      if (e.key === 'Escape') {
        if (this._isEditing)           { this._endEditNode(true); }
        else if (this.renderer.isCreatingRel) { this.renderer.cancelCreatingRelation(); }
        else                            { this._closeFind(); }
        return;
      }
      if (ctrl && e.key === 's')   { e.preventDefault(); this._saveFile(); return; }
      if (ctrl && e.key === 'n')   { e.preventDefault(); this._newFile(); return; }
      if (ctrl && e.key === 'o' && !shift) { e.preventDefault(); this._openFile(); return; }
      if (ctrl && e.key === '1')   { e.preventDefault(); this.renderer.fitCanvas(); this._updateZoomLabel(); return; }
      if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); this.renderer.zoomIn(); this._updateZoomLabel(); return; }
      if (ctrl && e.key === '-')   { e.preventDefault(); this.renderer.zoomOut(); this._updateZoomLabel(); return; }
      if (ctrl && e.key === '0')   { e.preventDefault(); this.renderer.zoomReset(); this._updateZoomLabel(); return; }
      if (ctrl && shift && e.key === 'O') { e.preventDefault(); this._togglePanel(); return; }
    });
  }

  // ============================================================
  // ELECTRON MENU
  // ============================================================
  _bindElectronMenu() {
    if (!window.electronAPI) return;
    window.electronAPI.onMenuAction((action, data) => {
      switch (action) {
        // P0-4: File menu actions go through the renderer so paths follow the
        // active tab (multi-tab safe), .mm is supported, and unsaved work is honored
        case 'open':     this._openFile(); break;
        case 'save':     this._saveFile(); break;
        case 'save-as':  this._saveFile(null, true); break;
        case 'new': this._newFile(); break;
        case 'undo': this._undo(); break;
        case 'redo': this._redo(); break;
        case 'cut': if (this.data.selectedNode) this.data.cut(this.data.selectedNode); break;
        case 'copy': if (this.data.selectedNode) this.data.copy(this.data.selectedNode); break;
        case 'paste': if (this.data.selectedNode) this.data.paste(this.data.selectedNode); break;
        case 'select-all': this.data.selectedNode = this.data.root; this.renderer.render(); break;
        case 'find': this._toggleFind(); break;
        case 'zoom-in': this.renderer.zoomIn(); this._updateZoomLabel(); break;
        case 'zoom-out': this.renderer.zoomOut(); this._updateZoomLabel(); break;
        case 'zoom-reset': this.renderer.zoomReset(); this._updateZoomLabel(); break;
        case 'fit-canvas': this.renderer.fitCanvas(); this._updateZoomLabel(); break;
        case 'toggle-outline': this._togglePanel(); break;
        case 'insert-child': this._addChild(); break;
        case 'insert-sibling': this._addSibling(); break;
        case 'insert-parent': this._addParent(); break;
        case 'insert-note': this._showPanel('note'); break;
        case 'insert-icon': this._showPanel('style'); break;
        case 'insert-link': this._startCreateRelation(); break;
        case 'layout-mindmap': this.layout.setLayout('mindmap'); this.renderer.render(); this.renderer.fitCanvas(); break;
        case 'layout-tree-right': this.layout.setLayout('tree-right'); this.renderer.render(); this.renderer.fitCanvas(); break;
        case 'layout-tree-down': this.layout.setLayout('tree-down'); this.renderer.render(); this.renderer.fitCanvas(); break;
        case 'layout-fishbone': this.layout.setLayout('fishbone'); this.renderer.render(); this.renderer.fitCanvas(); break;
        case 'layout-org': this.layout.setLayout('org'); this.renderer.render(); this.renderer.fitCanvas(); break;
        case 'theme-classic-blue': this.theme.setTheme('classic-blue'); this._applyThemeBackground(); this.renderer.render(); break;
        case 'theme-dark-purple': this.theme.setTheme('dark-purple'); this._applyThemeBackground(); this.renderer.render(); break;
        case 'theme-fresh-green': this.theme.setTheme('fresh-green'); this._applyThemeBackground(); this.renderer.render(); break;
        case 'theme-vibrant-orange': this.theme.setTheme('vibrant-orange'); this._applyThemeBackground(); this.renderer.render(); break;
        case 'theme-minimal': this.theme.setTheme('minimal'); this._applyThemeBackground(); this.renderer.render(); break;
        case 'theme-china-red': this.theme.setTheme('china-red'); this._applyThemeBackground(); this.renderer.render(); break;
        case 'export-png': this._export('png'); break;
        case 'export-svg': this._export('svg'); break;
        case 'export-pdf': this._export('pdf'); break;
        case 'export-json': this._export('json'); break;
        case 'export-mm': this._export('mm'); break;
      }
    });
  }

  // ============================================================
  // NODE OPERATIONS
  // ============================================================
  _addChild() {
    const p = this.data.selectedNode; if (!p) return;
    const c = this.data.addChild(p, this.lang === 'zh' ? '新节点' : 'New Node');
    if (c) { this.data.selectedNode = c; this.renderer.render(); setTimeout(() => this._startEditNode(c), 50); }
  }

  _addSibling() {
    const n = this.data.selectedNode; if (!n || n.isRoot) return;
    const s = this.data.addSibling(n, this.lang === 'zh' ? '新节点' : 'New Node');
    if (s) { this.data.selectedNode = s; this.renderer.render(); setTimeout(() => this._startEditNode(s), 50); }
  }

  _addParent() {
    const n = this.data.selectedNode; if (!n || n.isRoot) return;
    const p = this.data.insertParent(n, this.lang === 'zh' ? '新分组' : 'New Group');
    if (p) { this.data.selectedNode = p; this.renderer.render(); setTimeout(() => this._startEditNode(p), 50); }
  }

  _deleteNode() {
    const n = this.data.selectedNode; if (!n || n.isRoot) return;
    this.data.deleteNode(n);
    this.renderer.render();
  }

  _changeNodeColor() {
    const n = this.data.selectedNode; if (!n) return;
    // Create a simple color picker dialog
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    const colors = ['#5b7bd5','#e74c3c','#2ecc71','#f39c12','#9b59b6','#1abc9c','#34495e','#e91e63','#ffffff','#f0f0f0','#3498db','#d35400'];
    let html = '<div class="dialog-box" style="width:280px">' +
      '<div class="dialog-title">' + this._t('lbl_color') + '</div>' +
      '<div class="dialog-body" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:12px">';
    colors.forEach(c => {
      html += '<button class="color-btn" data-color="' + c + '" style="width:36px;height:36px;background:' + c + ';border:2px solid #ccc;border-radius:6px;cursor:pointer"></button>';
    });
    html += '</div><div class="dialog-footer"><button class="dialog-btn" id="color-cancel">' + this._t('cancel') + '</button></div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.color-btn[data-color]').forEach(btn => {
      btn.onclick = () => {
        this.data.updateNodeStyle(n, 'fillColor', btn.dataset.color);
        this.renderer.render();
        overlay.remove();
      };
    });
    $('color-cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  _undo()   { if (this.data.undo())   { this.renderer.render(); this._onNodeSelected(this.data.selectedNode); this._showToast(this._t('toast_undo')); } }
  _redo()   { if (this.data.redo())   { this.renderer.render(); this._onNodeSelected(this.data.selectedNode); this._showToast(this._t('toast_redo')); } }

  _startEditNode(node) {
    if (!node) return;
    this._isEditing = true;
    const editor = $('node-editor');
    const input = $('node-editor-input');
    editor.classList.remove('hidden');

    const svgRect = this.renderer.svg.getBoundingClientRect();
    const containerRect = document.getElementById('canvas-container').getBoundingClientRect();
    const sx = node._x * this.renderer.scale + this.renderer.viewX + svgRect.left;
    const sy = node._y * this.renderer.scale + this.renderer.viewY + svgRect.top;

    editor.style.left = (sx - containerRect.left - node._width * this.renderer.scale / 2) + 'px';
    editor.style.top = (sy - containerRect.top - node._height * this.renderer.scale / 2) + 'px';
    input.style.width = (node._width * this.renderer.scale) + 'px';
    input.style.height = (node._height * this.renderer.scale) + 'px';
    input.style.fontSize = (this.theme.getNodeFontSize(node) * this.renderer.scale) + 'px';
    input.value = node.text;
    input.focus();
    input.select();

    const finish = (save) => {
      this._isEditing = false;
      editor.classList.add('hidden');
      if (save && input.value.trim()) this.data.updateNodeText(node, input.value.trim());
      this.renderer.render();
    };
    input.onblur = () => finish(true);
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') finish(false);
    };
  }

  _endEditNode(save) {
    this._isEditing = false;
    $('node-editor').classList.add('hidden');
  }

  _navigateByKey(key) {
    const n = this.data.selectedNode; if (!n) return;
    const isV = this.layout.currentLayout === 'tree-down' || this.layout.currentLayout === 'org';
    let next = null;
    switch (key) {
      case 'ArrowRight': next = isV ? this._getNextSibling(n) : (n.collapsed ? null : n.children[0] || null); break;
      case 'ArrowLeft':  next = isV ? this._getPrevSibling(n) : n.parent || null; break;
      case 'ArrowDown':  next = isV ? (n.collapsed ? null : n.children[0] || null) : this._getNextSibling(n); break;
      case 'ArrowUp':    next = isV ? n.parent || null : this._getPrevSibling(n); break;
    }
    if (next) { this.data.selectedNode = next; this.renderer.render(); this._onNodeSelected(next); }
  }

  _getNextSibling(n) { if (!n.parent) return null; const idx = n.parent.children.indexOf(n); return n.parent.children[idx + 1] || null; }
  _getPrevSibling(n) { if (!n.parent) return null; const idx = n.parent.children.indexOf(n); return n.parent.children[idx - 1] || null; }

  _onNodeSelected(node) {
    if (!node) return;
    document.querySelectorAll('#node-shape-options .shape-btn')
      .forEach(b => b.classList.toggle('active', b.dataset.shape === (node.style.shape || 'rounded-rect')));
    document.querySelectorAll('#node-color-options .color-btn')
      .forEach(b => b.classList.toggle('active', b.dataset.color === node.style.fillColor));
    document.querySelectorAll('.font-size-options .size-btn')
      .forEach(b => b.classList.toggle('active', parseInt(b.dataset.size) === (node.style.fontSize || 14)));
    $('note-editor').value = node.note || '';
    document.querySelectorAll('#priority-options .priority-btn')
      .forEach(b => b.classList.toggle('active', parseInt(b.dataset.priority) === (node.style.priority || 0)));
  }

  // ============================================================
  // RELATIONSHIP LINE (联系线)
  // ============================================================
  _startCreateRelation() {
    const node = this.data.selectedNode;
    if (!node) { this._showToast(this._t('toast_select_node'), 'warning'); return; }
    this.renderer.startCreatingRelation(node);
    this._showToast(this._t('toast_click_target'), 'info');
  }

  _onRelationCreated(fromNode, toNode) {
    this._showRelationDialog(fromNode.id, toNode.id, null);
  }

  _showRelationDialog(fromId, toId, existingRel) {
    const isNew = !existingRel;
    const rel = existingRel || {
      fromId, toId, label: '', color: '#e74c3c', style: 'curve',
      arrowStart: false, arrowEnd: true, lineWidth: 2, controlPoints: []
    };

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML =
      '<div class="dialog-box" style="width:380px">' +
        '<div class="dialog-title">' + this._t('rel_dialog_title') + '</div>' +
        '<div class="dialog-body">' +
          '<label>' + this._t('rel_label_placeholder') + '</label>' +
           '<input type="text" id="rel-label" value="' + _escHtml(rel.label) + '" placeholder="' + this._t('rel_label_placeholder') + '">' +
          '<div class="dialog-row"><div class="dialog-col"><label>Color</label><input type="color" id="rel-color" value="' + rel.color + '"></div>' +
          '<div class="dialog-col"><label>Width</label><select id="rel-width">' +
            '<option value="1"' + (rel.lineWidth===1?' selected':'') + '>1px</option>' +
            '<option value="2"' + (rel.lineWidth===2?' selected':'') + '>2px</option>' +
            '<option value="3"' + (rel.lineWidth===3?' selected':'') + '>3px</option>' +
            '<option value="4"' + (rel.lineWidth===4?' selected':'') + '>4px</option>' +
          '</select></div></div>' +
          '<label>' + this._t('style_curve') + '/' + this._t('style_straight') + '/' + this._t('style_dashed') + '</label>' +
          '<div class="btn-group">' +
            '<button class="opt-btn' + (rel.style==='curve'?' active':'') + '" data-val="curve">' + this._t('style_curve') + '</button>' +
            '<button class="opt-btn' + (rel.style==='straight'?' active':'') + '" data-val="straight">' + this._t('style_straight') + '</button>' +
            '<button class="opt-btn' + (rel.style==='dashed'?' active':'') + '" data-val="dashed">' + this._t('style_dashed') + '</button>' +
          '</div>' +
          '<label>' + this._t('arrow_none') + '/' + this._t('arrow_end') + '/' + this._t('arrow_start') + '/' + this._t('arrow_both') + '</label>' +
          '<div class="btn-group">' +
            '<button class="opt-btn' + (!rel.arrowStart&&!rel.arrowEnd?' active':'') + '" data-arrow="none">' + this._t('arrow_none') + '</button>' +
            '<button class="opt-btn' + (rel.arrowEnd&&!rel.arrowStart?' active':'') + '" data-arrow="end">' + this._t('arrow_end') + '</button>' +
            '<button class="opt-btn' + (rel.arrowStart&&!rel.arrowEnd?' active':'') + '" data-arrow="start">' + this._t('arrow_start') + '</button>' +
            '<button class="opt-btn' + (rel.arrowStart&&rel.arrowEnd?' active':'') + '" data-arrow="both">' + this._t('arrow_both') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="dialog-footer">' +
          '<button class="dialog-btn primary" id="rel-ok">' + this._t('confirm') + '</button>' +
          '<button class="dialog-btn" id="rel-cancel">' + (isNew ? this._t('cancel') : this._t('delete')) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    let selectedStyle = rel.style;
    let arrowMode = rel.arrowStart ? (rel.arrowEnd ? 'both' : 'start') : (rel.arrowEnd ? 'end' : 'none');

    overlay.querySelectorAll('[data-val]').forEach(btn => {
      btn.onclick = () => {
        overlay.querySelectorAll('[data-val]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedStyle = btn.dataset.val;
      };
    });
    overlay.querySelectorAll('[data-arrow]').forEach(btn => {
      btn.onclick = () => {
        overlay.querySelectorAll('[data-arrow]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        arrowMode = btn.dataset.arrow;
      };
    });

    overlay.querySelector('#rel-ok').onclick = () => {
      try {
        const updates = {
          label: overlay.querySelector('#rel-label').value,
          color: overlay.querySelector('#rel-color').value,
          style: selectedStyle,
          lineWidth: parseInt(overlay.querySelector('#rel-width').value),
          arrowStart: arrowMode === 'start' || arrowMode === 'both',
          arrowEnd: arrowMode === 'end' || arrowMode === 'both',
        };
        if (isNew) {
          this.data.addRelationship(fromId, toId, updates);
          this._showToast(this._t('toast_rel_created'), 'success');
        } else {
          this.data.updateRelationship(rel.id, updates);
        }
        this.renderer.render();
      } catch (err) { console.error('Relation dialog OK error:', err); }
      finally { overlay.remove(); }
    };

    overlay.querySelector('#rel-cancel').onclick = () => {
      if (!isNew) {
        if (confirm(this._t('delete_confirm'))) {
          this.data.removeRelationship(rel.id);
          this.renderer.render();
          this._showToast(this._t('toast_deleted'));
        }
      }
      overlay.remove();
    };

    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  editRelationForSelected() {
    const node = this.data.selectedNode;
    if (!node) return;
    const rels = this.data.getRelationshipForNode(node.id);
    if (rels.length === 0) { this._showToast(this._t('toast_no_rel'), 'warning'); return; }
    if (rels.length === 1) { this._editRelation(rels[0]); return; }
    this._showRelationListDialog(rels);
  }

  _editRelation(rel) {
    this._showRelationDialog(rel.fromId, rel.toId, rel);
  }

  _showRelationListDialog(rels) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    let html = '<div class="dialog-box"><div class="dialog-title">Relations (' + rels.length + ')</div><div class="dialog-body">';
    rels.forEach(r => {
      const fromN = this.data.getNode(r.fromId);
      const toN = this.data.getNode(r.toId);
      // P1-7: escape untrusted node/label text in HTML
      html += '<div class="rel-list-item" data-rel-id="' + _escHtml(r.id) + '">' +
        '<span class="rel-info">' + (fromN ? _escHtml(fromN.text) : '?') + ' → ' + (toN ? _escHtml(toN.text) : '?') + '</span>' +
        (r.label ? '<span class="rel-tag">' + _escHtml(r.label) + '</span>' : '') +
        '<button class="rel-edit-btn" data-id="' + _escHtml(r.id) + '">Edit</button>' +
        '<button class="rel-del-btn" data-id="' + _escHtml(r.id) + '">X</button></div>';
    });
    html += '</div><div class="dialog-footer"><button class="dialog-btn" id="rels-close">Close</button></div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.rel-edit-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const r = rels.find(x => x.id === btn.dataset.id);
        if (r) this._showRelationDialog(r.fromId, r.toId, r);
        overlay.remove();
      };
    });
    overlay.querySelectorAll('.rel-del-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.data.removeRelationship(btn.dataset.id);
        this.renderer.render();
        overlay.remove();
        this._showToast(this._t('toast_deleted'));
      };
    });
    $('rels-close').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  // ============================================================
  // ANNOTATION (标注)
  // ============================================================
  _addAnnotationForSelected() {
    const node = this.data.selectedNode;
    if (!node) return;
    this._showAnnotationDialog(node.id, null);
  }

  _editAnnotation(ann) {
    this._showAnnotationDialog(ann.targetNodeId, ann);
  }

  _editSummary(sum) {
    this._showSummaryDialog(sum.targetNodeId, sum);
  }

  _editBoundary(bound) {
    this._showBoundaryDialog(bound.targetNodeId, bound);
  }

  _showAnnotationDialog(targetNodeId, existingAnn) {
    const isNew = !existingAnn;
    const ann = existingAnn || { text: '', position: 'right-top', color: '#f39c12', fontSize: 12 };

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML =
      '<div class="dialog-box" style="width:360px">' +
        '<div class="dialog-title">' + this._t('ann_dialog_title') + '</div>' +
        '<div class="dialog-body">' +
          '<label>' + this._t('ann_text_placeholder') + '</label>' +
           '<textarea id="ann-text" rows="2" placeholder="' + this._t('ann_text_placeholder') + '">' + _escHtml(ann.text) + '</textarea>' +
          '<div class="dialog-row"><div class="dialog-col"><label>Position</label><select id="ann-pos">' +
            '<option value="right-top"' + (ann.position==='right-top'?' selected':'') + '>' + this._t('pos_right_top') + '</option>' +
            '<option value="right-bottom"' + (ann.position==='right-bottom'?' selected':'') + '>' + this._t('pos_right_bottom') + '</option>' +
            '<option value="left-top"' + (ann.position==='left-top'?' selected':'') + '>' + this._t('pos_left_top') + '</option>' +
            '<option value="left-bottom"' + (ann.position==='left-bottom'?' selected':'') + '>' + this._t('pos_left_bottom') + '</option>' +
          '</select></div>' +
          '<div class="dialog-col"><label>Color</label><input type="color" id="ann-color" value="' + ann.color + '"></div></div>' +
        '</div>' +
        '<div class="dialog-footer">' +
          '<button class="dialog-btn primary" id="ann-ok">' + this._t('confirm') + '</button>' +
          '<button class="dialog-btn" id="ann-cancel">' + (isNew ? this._t('cancel') : this._t('delete')) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#ann-ok').onclick = () => {
      try {
        const updates = { text: overlay.querySelector('#ann-text').value, position: overlay.querySelector('#ann-pos').value, color: overlay.querySelector('#ann-color').value };
        if (isNew) {
          this.data.addAnnotation(targetNodeId, updates.text, updates);
          this._showToast(this._t('toast_ann_added'), 'success');
        } else {
          this.data.updateAnnotation(ann.id, updates);
        }
        this.renderer.render();
      } catch (err) { console.error('Annotation dialog OK error:', err); }
      finally { overlay.remove(); }
    };
    overlay.querySelector('#ann-cancel').onclick = () => {
      if (!isNew) { this.data.removeAnnotation(ann.id); this.renderer.render(); this._showToast(this._t('toast_deleted')); }
      overlay.remove();
    };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  // ============================================================
  // BOUNDARY (外框)
  // ============================================================
  _addBoundaryForSelected() {
    const node = this.data.selectedNode;
    if (!node) return;
    this._showBoundaryDialog(node.id, null);
  }

  _showBoundaryDialog(targetNodeId, existingBound) {
    const isNew = !existingBound;
    const bound = existingBound || { label: '', color: '#3498db', style: 'solid', radius: 8, padding: 10, fillColor: '' };

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML =
      '<div class="dialog-box" style="width:360px">' +
        '<div class="dialog-title">' + this._t('bound_dialog_title') + '</div>' +
        '<div class="dialog-body">' +
          '<label>' + this._t('bound_label_placeholder') + '</label>' +
           '<input type="text" id="bound-label" value="' + _escHtml(bound.label) + '" placeholder="' + this._t('bound_label_placeholder') + '">' +
          '<div class="dialog-row"><div class="dialog-col"><label>Color</label><input type="color" id="bound-color" value="' + bound.color + '"></div>' +
          '<div class="dialog-col"><label>Fill</label><input type="color" id="bound-fill" value="' + (bound.fillColor||'#ffffff') + '"></div></div>' +
          '<label>' + this._t('solid_line') + '/' + this._t('dashed_line') + '/' + this._t('dotted_line') + '</label>' +
          '<div class="btn-group">' +
            '<button class="opt-btn' + (bound.style==='solid'?' active':'') + '" data-bs="solid">' + this._t('solid_line') + '</button>' +
            '<button class="opt-btn' + (bound.style==='dashed'?' active':'') + '" data-bs="dashed">' + this._t('dashed_line') + '</button>' +
            '<button class="opt-btn' + (bound.style==='dotted'?' active':'') + '" data-bs="dotted">' + this._t('dotted_line') + '</button>' +
          '</div>' +
          '<div class="dialog-row"><div class="dialog-col"><label>Padding</label><input type="number" id="bound-pad" value="' + bound.padding + '" min="4" max="40"></div>' +
          '<div class="dialog-col"><label>Radius</label><input type="number" id="bound-rad" value="' + bound.radius + '" min="0" max="24"></div></div>' +
        '</div>' +
        '<div class="dialog-footer">' +
          '<button class="dialog-btn primary" id="bound-ok">' + this._t('confirm') + '</button>' +
          '<button class="dialog-btn" id="bound-cancel">' + (isNew?this._t('cancel'):this._t('delete')) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    let bs = bound.style;
    overlay.querySelectorAll('[data-bs]').forEach(b => {
      b.onclick = () => { overlay.querySelectorAll('[data-bs]').forEach(x => x.classList.remove('active')); b.classList.add('active'); bs = b.dataset.bs; };
    });

    overlay.querySelector('#bound-ok').onclick = () => {
      try {
        const opts = {
          label: overlay.querySelector('#bound-label').value, color: overlay.querySelector('#bound-color').value, style: bs,
          fillColor: overlay.querySelector('#bound-fill').value,
          padding: parseInt(overlay.querySelector('#bound-pad').value) || 10,
          radius: parseInt(overlay.querySelector('#bound-rad').value) || 8
        };
        if (isNew) { this.data.addBoundary(targetNodeId, opts); this._showToast(this._t('toast_bound_added'), 'success'); }
        else { this.data.updateBoundary(bound.id, opts); }
        this.renderer.render();
      } catch (err) { console.error('Boundary dialog OK error:', err); }
      finally { overlay.remove(); }
    };
    overlay.querySelector('#bound-cancel').onclick = () => {
      if (!isNew) { this.data.removeBoundary(bound.id); this.renderer.render(); this._showToast(this._t('toast_deleted')); }
      overlay.remove();
    };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  // ============================================================
  // SUMMARY (概要)
  // ============================================================
  _addSummaryForSelected() {
    const node = this.data.selectedNode;
    if (!node || node.children.length < 2) { this._showToast(this._t('toast_need_children'), 'warning'); return; }
    this._showSummaryDialog(node.id, null);
  }

  _showSummaryDialog(targetNodeId, existingSum) {
    const isNew = !existingSum;
    const parentNode = this.data.getNode(targetNodeId);
    const childCount = parentNode?.children?.length || 0;
    const sum = existingSum || {
      startChildIndex: 0,
      endChildIndex: childCount - 1,
      text: '', color: '#9b59b6', fontSize: 11
    };

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    let childOpts = '';
    if (parentNode) {
      parentNode.children.forEach((c, i) => {
        // P1-7: escape untrusted node text in option labels
        childOpts += '<option value="' + i + '">' + (i+1) + '. ' + _escHtml(c.text.substring(0,20)) + '</option>';
      });
    }

    overlay.innerHTML =
      '<div class="dialog-box" style="width:360px">' +
        '<div class="dialog-title">' + this._t('sum_dialog_title') + '</div>' +
        '<div class="dialog-body">' +
          '<label>' + (this._t('sum_range_start') || '起始项') + '</label>' +
          '<select id="sum-start" style="width:100%">' + childOpts + '</select>' +
          '<label>' + (this._t('sum_range_end') || '结束项') + '</label>' +
          '<select id="sum-end" style="width:100%">' + childOpts + '</select>' +
          '<label>' + (this._t('sum_text_placeholder') || '概要内容') + '</label>' +
           '<input type="text" id="sum-text" value="' + _escHtml(sum.text) + '" placeholder="' + this._t('sum_text_placeholder') + '">' +
          '<div class="dialog-row"><div class="dialog-col"><label>Color</label><input type="color" id="sum-color" value="' + sum.color + '"></div></div>' +
        '</div>' +
        '<div class="dialog-footer">' +
          '<button class="dialog-btn primary" id="sum-ok">' + this._t('confirm') + '</button>' +
          '<button class="dialog-btn" id="sum-cancel">' + (isNew?this._t('cancel'):this._t('delete')) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // Set selected values
    const startSel = overlay.querySelector('#sum-start');
    const endSel = overlay.querySelector('#sum-end');
    startSel.value = String(sum.startChildIndex);
    endSel.value = String(sum.endChildIndex);

    overlay.querySelector('#sum-ok').onclick = () => {
      try {
        const si = parseInt(startSel.value);
        const ei = parseInt(endSel.value);
        const opts = {
          startChildIndex: Math.min(si, ei),
          endChildIndex: Math.max(si, ei),
          text: overlay.querySelector('#sum-text').value, color: overlay.querySelector('#sum-color').value, fontSize: sum.fontSize
        };
        if (isNew) {
          this.data.addSummary(targetNodeId, opts.startChildIndex, opts.endChildIndex, opts.text, opts);
          this._showToast(this._t('toast_sum_added'), 'success');
        } else {
          this.data.updateSummary(sum.id, opts);
        }
        this.renderer.render();
      } catch (err) { console.error('Summary dialog OK error:', err); }
      finally { overlay.remove(); }
    };
    overlay.querySelector('#sum-cancel').onclick = () => {
      if (!isNew) { this.data.removeSummary(sum.id); this.renderer.render(); this._showToast(this._t('toast_deleted')); }
      overlay.remove();
    };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  // ============================================================
  // TEMPLATES
  // ============================================================
  _insertTemplate(name) {
    const templates = {
      'weekly-plan': { text: this.lang==='zh'?'周计划':'Weekly Plan', children: [
        { text: this.lang==='zh'?'周一':'Mon', children: [{ text: this.lang==='zh'?'任务1':'Task1' }, { text: this.lang==='zh'?'任务2':'Task2' }] },
        { text: this.lang==='zh'?'周二':'Tue', children: [{ text: this.lang==='zh'?'任务1':'Task1' }, { text: this.lang==='zh'?'任务2':'Task2' }] },
        { text: this.lang==='zh'?'周三':'Wed', children: [{ text: this.lang==='zh'?'任务1':'Task1' }] },
        { text: this.lang==='zh'?'周四':'Thu', children: [{ text: this.lang==='zh'?'任务1':'Task1' }] },
        { text: this.lang==='zh'?'周五':'Fri', children: [{ text: this.lang==='zh'?'任务1':'Task1' }] },
        { text: this.lang==='zh'?'周末':'Weekend', children: [{ text: this.lang==='zh'?'休息与总结':'Rest & Review' }] },
      ]},
      'project': { text: this.lang==='zh'?'项目管理':'Project Mgmt', children: [
        { text: this.lang==='zh'?'需求分析':'Requirements', children: [{ text: this.lang==='zh'?'用户调研':'User Research' }, { text: this.lang==='zh'?'需求文档':'Spec Doc' }, { text: this.lang==='zh'?'评审':'Review' }] },
        { text: this.lang==='zh'?'设计':'Design', children: [{ text: this.lang==='zh'?'架构设计':'Architecture' }, { text: this.lang==='zh'?'UI设计':'UI Design' }, { text: this.lang==='zh'?'评审':'Review' }] },
        { text: this.lang==='zh'?'开发':'Development', children: [{ text: this.lang==='zh'?'前端':'Frontend' }, { text: this.lang==='zh'?'后端':'Backend' }, { text: this.lang==='zh'?'联调':'Integration' }] },
        { text: this.lang==='zh'?'测试':'Testing', children: [{ text: this.lang==='zh'?'单元测试':'Unit Test' }, { text: this.lang==='zh'?'集成测试':'Integration' }, { text: this.lang==='zh'?'UAT':'UAT' }] },
        { text: this.lang==='zh'?'上线':'Launch', children: [{ text: this.lang==='zh'?'部署':'Deploy' }, { text: this.lang==='zh'?'监控':'Monitor' }, { text: this.lang==='zh'?'复盘':'Review' }] },
      ]},
      'reading-notes': { text: this.lang==='zh'?'读书笔记':'Reading Notes', children: [
        { text: this.lang==='zh'?'核心观点':'Key Points', children: [{ text: this.lang==='zh'?'观点1':'Point 1' }, { text: this.lang==='zh'?'观点2':'Point 2' }] },
        { text: this.lang==='zh'?'重要论据':'Evidence', children: [{ text: this.lang==='zh'?'论据1':'Evidence 1' }, { text: this.lang==='zh'?'论据2':'Evidence 2' }] },
        { text: this.lang==='zh'?'个人思考':'Reflections', children: [{ text: this.lang==='zh'?'思考1':'Thought 1' }] },
        { text: this.lang==='zh'?'行动项':'Actions', children: [{ text: this.lang==='zh'?'行动1':'Action 1' }] },
      ]},
      'swot': { text: 'SWOT Analysis', children: [
        { text: 'S ' + (this.lang==='zh'?'优势':'Strengths'), style: { fillColor: '#2ecc71' }, children: [{ text: this.lang==='zh'?'优势1':'S1' }, { text: this.lang==='zh'?'优势2':'S2' }] },
        { text: 'W ' + (this.lang==='zh'?'劣势':'Weaknesses'), style: { fillColor: '#e74c3c' }, children: [{ text: this.lang==='zh'?'劣势1':'W1' }, { text: this.lang==='zh'?'劣势2':'W2' }] },
        { text: 'O ' + (this.lang==='zh'?'机会':'Opportunities'), style: { fillColor: '#3498db' }, children: [{ text: this.lang==='zh'?'机会1':'O1' }, { text: this.lang==='zh'?'机会2':'O2' }] },
        { text: 'T ' + (this.lang==='zh'?'威胁':'Threats'), style: { fillColor: '#f39c12' }, children: [{ text: this.lang==='zh'?'威胁1':'T1' }, { text: this.lang==='zh'?'威胁2':'T2' }] },
      ]},
      'brainstorm': { text: this.lang==='zh'?'头脑风暴':'Brainstorm', children: [
        { text: this.lang==='zh'?'方向A':'Direction A', children: [{ text: this.lang==='zh'?'想法1':'Idea 1' }, { text: this.lang==='zh'?'想法2':'Idea 2' }, { text: this.lang==='zh'?'想法3':'Idea 3' }] },
        { text: this.lang==='zh'?'方向B':'Direction B', children: [{ text: this.lang==='zh'?'想法1':'Idea 1' }, { text: this.lang==='zh'?'想法2':'Idea 2' }] },
        { text: this.lang==='zh'?'方向C':'Direction C', children: [{ text: this.lang==='zh'?'想法1':'Idea 1' }] },
      ]},
    };
    const tpl = templates[name];
    if (!tpl) return;
    this.data.init();
    this.data.updateNodeText(this.data.root, tpl.text);
    if (tpl.style) Object.entries(tpl.style).forEach(([k,v]) => this.data.updateNodeStyle(this.data.root, k, v));
    this._addTemplateChildren(this.data.root, tpl.children);
    this.renderer.render();
    this.renderer.fitCanvas();
    this._showToast(this._t('toast_template_applied'), 'success');
  }

  _addTemplateChildren(parent, children) {
    if (!children) return;
    children.forEach(cd => {
      const c = this.data.addChild(parent, cd.text);
      if (cd.style) Object.entries(cd.style).forEach(([k,v]) => this.data.updateNodeStyle(c, k, v));
      this._addTemplateChildren(c, cd.children);
    });
  }

  // ============================================================
  // OUTLINE VIEW
  // ============================================================
  _updateOutline() {
    const container = $('#outline-tree');
    if (!container) return;
    container.innerHTML = '';
    this._renderOutlineNode(this.data.root, container, 0);
  }

  _renderOutlineNode(node, container, depth) {
    const item = document.createElement('div');
    item.className = 'outline-item' + (this.data.selectedNode === node ? ' selected' : '');
    item.style.paddingLeft = (depth * 12 + 4) + 'px';

    const toggle = document.createElement('span');
    toggle.className = 'outline-toggle';
    if (node.children.length > 0) {
      toggle.textContent = node.collapsed ? '\u25B6' : '\u25BC';
      toggle.onclick = (e) => { e.stopPropagation(); this.data.toggleCollapse(node); };
    }

    const text = document.createElement('span');
    text.className = 'outline-text';
    text.textContent = (node.style.icon ? node.style.icon + ' ' : '') + node.text;

    item.appendChild(toggle);
    item.appendChild(text);
    item.onclick = () => {
      this.data.selectedNode = node;
      this.renderer.render();
      this._onNodeSelected(node);
      this._scrollToNode(node);
    };
    container.appendChild(item);

    if (!node.collapsed && node.children.length > 0) {
      const ch = document.createElement('div');
      ch.className = 'outline-children';
      node.children.forEach(c => this._renderOutlineNode(c, ch, depth + 1));
      container.appendChild(ch);
    }
  }

  _scrollToNode(node) {
    const r = this.renderer.svg.getBoundingClientRect();
    this.renderer.viewX = r.width / 2 - (node._x + (node._offsetX || 0)) * this.renderer.scale;
    this.renderer.viewY = r.height / 2 - (node._y + (node._offsetY || 0)) * this.renderer.scale;
    this.renderer._updateViewport();
  }

  _togglePanel(tab) {
    const panel = $('#side-panel');
    panel.classList.toggle('hidden');
    if (tab && !panel.classList.contains('hidden')) {
      this._activatePanelTab(tab);
    }
  }

  _showPanel(tab) {
    const panel = $('#side-panel');
    panel.classList.remove('hidden');
    if (tab) this._activatePanelTab(tab);
  }

  _activatePanelTab(tab) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === tab));
    document.querySelectorAll('.panel-content').forEach(c => c.classList.add('hidden'));
    const content = $('#panel-' + tab);
    if (content) content.classList.remove('hidden');
  }

  // ============================================================
  // FIND
  // ============================================================
  _toggleFind() {
    const d = $('#find-dialog');
    d.classList.toggle('hidden');
    if (!d.classList.contains('hidden')) $('find-input').focus();
  }
  _closeFind() {
    $('#find-dialog').classList.add('hidden');
    this.findResults = [];
    this.findIndex = -1;
  }
  _doFind() {
    const q = $('find-input').value;
    if (!q) return;
    this.findResults = this.data.find(q);
    if (this.findResults.length === 0) { this._showToast(this._t('toast_not_found'), 'warning'); return; }
    this.findIndex = (this.findIndex + 1) % this.findResults.length;
    const n = this.findResults[this.findIndex];
    this.data.selectedNode = n;
    this.renderer.render();
    this._scrollToNode(n);
    this._showToast(this.findResults.length + ' found (' + (this.findIndex+1) + '/' + this.findResults.length + ')');
  }

  // ============================================================
  // FILE OPERATIONS
  // ============================================================
  async _newFile() {
    // Auto-save current file if modified before creating new
    if (this.isModified) {
      if (this.currentFile && window.electronAPI) {
        const r = await window.electronAPI.saveFile(this.currentFile, JSON.stringify(this.data.toJSON(), null, 2));
        if (r.success) {
          this._showToast(this._t('toast_auto_saved') || '已自动保存', 'success');
        }
      } else {
        // No file path yet — prompt user to save
        if (window.electronAPI) {
          const r = await window.electronAPI.showSaveDialog({
            title: this._t('save_before_new') || '保存当前文件',
            filters: [{ name: 'MindZ', extensions: ['mindz'] }, { name: 'JSON', extensions: ['json'] }, { name: 'FreeMind', extensions: ['mm'] }],
            defaultPath: 'untitled.mindz'
          });
          if (!r.canceled) {
            await window.electronAPI.saveFile(r.filePath, JSON.stringify(this.data.toJSON(), null, 2));
          }
        }
      }
    }

    // If we have room for a new tab, create one; otherwise reset current tab
    if (this.documents.length < this.maxTabs) {
      this._addNewTab();
    } else {
      // Reset current document
      const doc = this.documents[this.activeDocIndex];
      doc.data.init();
      doc.filePath = null;
      doc.isModified = false;
      doc.name = this.lang === 'zh' ? '未命名' : 'Untitled';
      this._applyDefaultTemplate();
      this.renderer.data = this.data;
      this.renderer.render();
      this.renderer.fitCanvas();
      this._renderTabBar();
    }
  }

  async _openFile() {
    if (!window.electronAPI) { this._showToast('Use Electron to open files', 'warning'); return; }
    const result = await window.electronAPI.showOpenDialog({
      title: 'Open MindZ File',
      filters: [
        { name: 'MindZ', extensions: ['mindz'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'FreeMind', extensions: ['mm'] },
        { name: 'All', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return;
    const rr = await window.electronAPI.readFile(result.filePaths[0]);
    if (!rr.success) { this._showToast('Failed: ' + rr.error, 'error'); return; }
    const filePath = result.filePaths[0];
    const isMm = filePath.toLowerCase().endsWith('.mm');
    const fileName = filePath.split(/[\\/]/).pop().replace(/\.(mindz|json|mm)$/i, '');

    try {
      this._autoSaveCurrentDoc();

      const loadIntoDoc = (doc) => {
        if (isMm) {
          // Parse FreeMind XML
          if (!doc.data.fromFreeMindXML(rr.content)) {
            throw new Error('Invalid FreeMind .mm format');
          }
          // .mm files are read-only in MindZ native format — clear filePath so save prompts for .mindz
          doc.filePath = null;
          doc.isModified = true;
        } else {
          const j = JSON.parse(rr.content);
          doc.data.fromJSON(j);
          doc.filePath = filePath;
          doc.isModified = false;
        }
        doc.name = fileName;
      };

      if (this.documents.length < this.maxTabs) {
        const doc = this._createNewDocument(fileName, isMm ? null : filePath);
        loadIntoDoc(doc);
        this._switchToDocument(this.documents.length - 1);
      } else {
        const doc = this.documents[this.activeDocIndex];
        doc.data.init();
        loadIntoDoc(doc);
        this.renderer.data = this.data;
        this.renderer.render();
        this.renderer.fitCanvas();
        this._renderTabBar();
      }

      this._saveLastFilePath(filePath);
    } catch (err) { this._showToast('Format error: ' + err.message, 'error'); }
  }

  async _saveFile(fp, forceSaveAs) {
    if (!window.electronAPI) return;
    // forceSaveAs (menu Save As) always shows the dialog
    if (!fp && (forceSaveAs || !this.currentFile)) {
      const r = await window.electronAPI.showSaveDialog({
        title: 'Save',
        filters: [{ name: 'MindZ', extensions: ['mindz'] }, { name: 'JSON', extensions: ['json'] }, { name: 'FreeMind', extensions: ['mm'] }],
        defaultPath: 'untitled.mindz'
      });
      if (r.canceled) return;
      fp = r.filePath;
    }
    fp = fp || this.currentFile;
    const r = await window.electronAPI.saveFile(fp, JSON.stringify(this.data.toJSON(), null, 2));
    if (r.success) {
      this.currentFile = fp;
      this.isModified = false;
      const doc = this.documents[this.activeDocIndex];
      if (doc && !doc.filePath) {
        doc.name = fp.split(/[\\/]/).pop().replace(/\.(mindz|json)$/i, '');
        this._renderTabBar();
      } else {
        this._renderTabBar();
      }
      this._saveLastFilePath(fp);
      this._showToast(this._t('toast_saved') + ': ' + fp, 'success');
    } else {
      this._showToast('Failed: ' + r.error, 'error');
    }
  }

  // ============================================================
  // EXPORT
  // ============================================================
  async _export(fmt) {
    if (!window.electronAPI) return;
    switch (fmt) {
      case 'png': await this._exportPNG(); break;
      case 'svg': await this._exportSVG(); break;
      case 'pdf': await this._exportPDF(); break;
      case 'json': await this._exportJSON(); break;
      case 'mm': await this._exportFreeMind(); break;
    }
  }

  async _exportPNG() {
    const r = await window.electronAPI.showSaveDialog({ title: 'Export PNG', filters: [{ name: 'PNG', extensions: ['png'] }], defaultPath: 'mindmap.png' });
    if (r.canceled) return;
    const ss = this.renderer.getSVGString();
    const blob = new Blob([ss], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = async () => {
      // Use viewBox dimensions if img natural size is 0 or too small
      const w = img.naturalWidth > 10 ? img.naturalWidth : 800;
      const h = img.naturalHeight > 10 ? img.naturalHeight : 600;
      const scale = 2; // 2x for retina quality
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const du = canvas.toDataURL('image/png');
      const sr = await window.electronAPI.exportImage(r.filePath, du);
      sr.success ? this._showToast(this._t('toast_export_ok'), 'success') : this._showToast(this._t('toast_export_fail') + ': ' + sr.error, 'error');
    };
    img.onerror = () => { URL.revokeObjectURL(url); this._showToast(this._t('toast_export_fail'), 'error'); };
    img.src = url;
  }

  async _exportSVG() {
    const r = await window.electronAPI.showSaveDialog({ title: 'Export SVG', filters: [{ name: 'SVG', extensions: ['svg'] }], defaultPath: 'mindmap.svg' });
    if (r.canceled) return;
    const sr = await window.electronAPI.exportSvg(r.filePath, this.renderer.getSVGString());
    sr.success ? this._showToast(this._t('toast_export_ok'), 'success') : this._showToast(this._t('toast_export_fail'), 'error');
  }

  async _exportPDF() {
    const r = await window.electronAPI.showSaveDialog({ title: this._t('export_pdf') || 'Export PDF', filters: [{ name: 'PDF', extensions: ['pdf'] }], defaultPath: 'mindmap.pdf' });
    if (r.canceled) return;
    const ss = this.renderer.getSVGString();
    const sr = await window.electronAPI.exportPdf(r.filePath, ss);
    sr.success ? this._showToast(this._t('toast_export_ok'), 'success') : this._showToast(this._t('toast_export_fail') + ': ' + sr.error, 'error');
  }

  async _exportJSON() {
    const r = await window.electronAPI.showSaveDialog({ title: 'Export JSON', filters: [{ name: 'JSON', extensions: ['json'] }], defaultPath: 'mindmap.json' });
    if (r.canceled) return;
    const sr = await window.electronAPI.saveFile(r.filePath, JSON.stringify(this.data.toJSON(), null, 2));
    sr.success ? this._showToast(this._t('toast_export_ok'), 'success') : this._showToast(this._t('toast_export_fail'), 'error');
  }

  async _exportFreeMind() {
    const r = await window.electronAPI.showSaveDialog({ title: this._t('exp_mm') || 'Export FreeMind', filters: [{ name: this._t('freemind_file') || 'FreeMind', extensions: ['mm'] }], defaultPath: 'mindmap.mm' });
    if (r.canceled) return;
    const xml = this.data.toFreeMindXML();
    const sr = await window.electronAPI.saveFile(r.filePath, xml);
    sr.success ? this._showToast(this._t('toast_export_ok'), 'success') : this._showToast(this._t('toast_export_fail') + ': ' + sr.error, 'error');
  }

  // ============================================================
  // THEME BACKGROUND
  // ============================================================
  _applyThemeBackground() {
    document.getElementById('canvas-container').style.background = this.theme.getTheme().background;
  }

  // ============================================================
  // STATUS & ZOOM
  // ============================================================
  _updateStatus() {
    const info = $('status-info');
    const count = $('node-count');
    if (info) info.textContent = this.isModified ? this._t('modified') : this._t('ready');
    if (count) count.textContent = this._t('node_count') + ': ' + this.data.getNodeCount();
  }

  _updateZoomLabel() {
    const l = $('zoom-label');
    if (l) l.textContent = Math.round(this.renderer.scale * 100) + '%';
  }

  // ============================================================
  // TOAST
  // ============================================================
  _showToast(msg, type = '') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ============================================================
  // LAST FILE PERSISTENCE
  // ============================================================
  async _saveLastFilePath(fp) {
    if (!window.electronAPI || !fp) return;
    try {
      const appPath = await window.electronAPI.getAppPath();
      await window.electronAPI.saveFile(
        appPath + '/last-file.txt', fp
      );
    } catch (e) { /* ignore */ }
  }

  // ============================================================
  // AI CHAT MODULE INTEGRATION
  // ============================================================

  _initAIChat() {
    if (typeof AIChatPanel === 'undefined') return;
    this.aiChat = new AIChatPanel(this);

    // Inject AI panel HTML into the slot
    const slot = document.getElementById('ai-chat-panel-slot');
    if (slot) {
      slot.outerHTML = this.aiChat.getPanelHTML();
    }

    // Initialize the AI panel (async)
    this.aiChat.init().catch(e => console.error('AI init error:', e));

    // Show welcome message
    setTimeout(() => {
      this.aiChat._addMessage('system', this._t('ai_welcome'));
    }, 100);
  }

  /** Expose AI chat panel activation for toolbar/context menu */
  _showAIChat() {
    if (!this.aiChat) return;
    this._activatePanelTab('ai-chat');
  }
}

function $(id) { return document.getElementById(id.replace(/^#/, '')); }

/** Escape untrusted text for safe interpolation into HTML attributes/content (P1-7) */
function _escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const app = new MindMapApp();

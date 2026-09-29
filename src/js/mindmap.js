/**
 * MindMap Data Model - manages tree data and all operations
 * Supports: nodes, relationship lines, annotations, boundaries, summaries, free positioning
 */
class MindMapData {
  constructor() {
    this.root = null;
    this.selectedNode = null;
    this.clipboard = null;
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;
    this.nodeMap = new Map();
    this._idCounter = 0;

    // ===== New: Relationship Lines (关系线/联系线) =====
    this.relationships = []; // { id, fromId, toId, label, color, style, arrowStart, arrowEnd, controlPoints }

    // ===== New: Annotations (标注) =====
    this.annotations = [];   // { id, targetNodeId, text, position, color }

    // ===== New: Boundaries (外框) =====
    this.boundaries = [];    // { id, targetNodeId, label, color, style, padding }

    // ===== New: Summaries (概要) =====
    this.summaries = [];     // { id, targetNodeId, startChildIndex, endChildIndex, text, color }

    // ===== Language =====
    this.language = 'zh'; // 'zh' | 'en' | 'auto'

    this._listeners = [];
    this.init();
  }

  // ===== Init =====
  init() {
    this.root = this._createNode('中心主题', { isRoot: true });
    this.selectedNode = this.root;
    this.relationships = [];
    this.annotations = [];
    this.boundaries = [];
    this.summaries = [];
    this.nodeMap.clear();
    this._buildNodeMap();
    this._saveHistory();
  }

  // ===== Node Creation =====
  _createNode(text, options = {}) {
    const node = {
      id: 'node_' + (++this._idCounter),
      text: text || '新节点',
      children: [],
      parent: null,
      collapsed: false,
      style: {
        shape: options.shape || 'rounded-rect',
        fillColor: options.fillColor || null,
        textColor: options.textColor || null,
        fontSize: options.fontSize || null,
        fontWeight: options.fontWeight || null,
        icon: options.icon || null,
        priority: options.priority || 0,
      },
      note: '',
      isRoot: options.isRoot || false,
      // Layout coordinates (computed by layout engine)
      _x: 0,
      _y: 0,
      _width: 0,
      _height: 0,
      _depth: 0,
      // Free positioning offset (for manual drag)
      _offsetX: 0,
      _offsetY: 0,
      // Is freely positioned?
      _isFreePositioned: false,
    };
    return node;
  }

  // ===== Node Lookup =====
  _buildNodeMap() {
    this.nodeMap.clear();
    const traverse = (node) => {
      this.nodeMap.set(node.id, node);
      node.children.forEach(traverse);
    };
    if (this.root) traverse(this.root);
  }

  getNode(id) { return this.nodeMap.get(id); }
  getNodeCount() { return this.nodeMap.size; }
  getDepth(node) { let d = 0, c = node; while (c.parent) { d++; c = c.parent; } return d; }
  getSiblings(node) { if (!node.parent) return [node]; return node.parent.children; }
  getIndex(node) { if (!node.parent) return 0; return node.parent.children.indexOf(node); }

  // ===== Node Operations =====
  addChild(parentNode, text, options = {}) {
    if (!parentNode) return null;
    const child = this._createNode(text, options);
    child.parent = parentNode;
    child._depth = parentNode._depth + 1;
    parentNode.children.push(child);
    this.nodeMap.set(child.id, child);
    this._saveHistory();
    this._emit('node-added', { node: child, parent: parentNode });
    return child;
  }

  addSibling(node, text, options = {}) {
    if (!node || !node.parent) return null;
    const sibling = this._createNode(text, options);
    const parent = node.parent;
    sibling.parent = parent;
    sibling._depth = node._depth;
    const index = parent.children.indexOf(node);
    parent.children.splice(index + 1, 0, sibling);
    this.nodeMap.set(sibling.id, sibling);
    this._saveHistory();
    this._emit('node-added', { node: sibling, parent });
    return sibling;
  }

  insertParent(node, text, options = {}) {
    if (!node || !node.parent) return null;
    const parent = node.parent;
    const index = parent.children.indexOf(node);
    const newParent = this._createNode(text, options);
    newParent.parent = parent;
    newParent._depth = node._depth;
    newParent.children = [node];
    node.parent = newParent;
    parent.children[index] = newParent;
    this._updateDepths(newParent);
    this.nodeMap.set(newParent.id, newParent);
    this._saveHistory();
    this._emit('node-added', { node: newParent, parent });
    return newParent;
  }

  deleteNode(node) {
    if (!node || node.isRoot) return false;
    const parent = node.parent;
    const index = parent.children.indexOf(node);
    if (index === -1) return false;

    const removedIds = [];
    const traverse = (n) => { removedIds.push(n.id); n.children.forEach(traverse); };
    traverse(node);

    parent.children.splice(index, 1);
    node.parent = null;
    removedIds.forEach(id => this.nodeMap.delete(id));

    // Clean up related data referencing this node
    this.relationships = this.relationships.filter(r => r.fromId !== node.id && r.toId !== node.id);
    this.annotations = this.annotations.filter(a => a.targetNodeId !== node.id);
    this.boundaries = this.boundaries.filter(b => b.targetNodeId !== node.id);
    this.summaries = this.summaries.filter(s => s.targetNodeId !== node.id);

    if (this.selectedNode === node || removedIds.includes(this.selectedNode?.id)) {
      this.selectedNode = parent.children.length > 0
        ? parent.children[Math.min(index, parent.children.length - 1)]
        : parent;
    }

    this._saveHistory();
    this._emit('node-deleted', { node, parent, removedIds });
    return true;
  }

  updateNodeText(node, text) {
    if (!node) return;
    const oldText = node.text;
    node.text = text;
    this._saveHistory();
    this._emit('node-updated', { node, field: 'text', oldValue: oldText, newValue: text });
  }

  updateNodeStyle(node, styleKey, styleValue, deferHistory) {
    if (!node) return;
    const oldValue = node.style[styleKey];
    node.style[styleKey] = styleValue;
    // deferHistory=true: live preview (e.g. color picker drag) — caller commits history once on change
    if (!deferHistory) this._saveHistory();
    this._emit('node-updated', { node, field: 'style.' + styleKey, oldValue, newValue: styleValue });
  }

  updateNodeNote(node, note) {
    if (!node) return;
    node.note = note;
    this._saveHistory();
    this._emit('node-updated', { node, field: 'note' });
  }

  toggleCollapse(node) {
    if (!node || node.children.length === 0) return;
    node.collapsed = !node.collapsed;
    this._saveHistory();
    this._emit('node-collapse', { node, collapsed: node.collapsed });
  }

  collapseAll() {
    const t = (n) => { if (n.children.length > 0 && !n.isRoot) n.collapsed = true; n.children.forEach(t); };
    t(this.root);
    this._saveHistory();
    this._emit('data-changed');
  }

  expandAll() {
    const t = (n) => { n.collapsed = false; n.children.forEach(t); };
    t(this.root);
    this._saveHistory();
    this._emit('data-changed');
  }

  // ===== Free Position / Drag Node =====
  setNodeOffset(node, offsetX, offsetY) {
    if (!node) return;
    node._offsetX = offsetX;
    node._offsetY = offsetY;
    node._isFreePositioned = true;
  }

  clearNodeOffset(node) {
    if (!node) return;
    node._offsetX = 0;
    node._offsetY = 0;
    node._isFreePositioned = false;
  }

  resetAllPositions() {
    const t = (n) => { n._offsetX = 0; n._offsetY = 0; n._isFreePositioned = false; n.children.forEach(t); };
    t(this.root);
    this._saveHistory();
    this._emit('data-changed');
  }

  // ===== Move Node =====
  moveNode(node, newParent, index = -1) {
    if (!node || !newParent || node.isRoot) return false;
    if (newParent === node) return false;
    let check = newParent;
    while (check) { if (check === node) return false; check = check.parent; }
    const oldParent = node.parent;
    const oldIndex = oldParent.children.indexOf(node);
    oldParent.children.splice(oldIndex, 1);
    node.parent = newParent;
    if (index === -1) { newParent.children.push(node); }
    else { newParent.children.splice(index, 0, node); }
    this._updateDepths(node);
    this._saveHistory();
    this._emit('node-moved', { node, oldParent, newParent });
    return true;
  }

  // ===== Clipboard =====
  copy(node) {
    if (!node) return;
    this.clipboard = this._serializeNode(node);
    this._emit('clipboard-updated');
  }

  cut(node) {
    if (!node || node.isRoot) return;
    this.copy(node);
    this.deleteNode(node);
  }

  paste(targetNode) {
    if (!targetNode || !this.clipboard) return null;
    // regenerateIds=true: pasted subtree must get fresh ids (serialize now stores ids — P0-2)
    const newNode = this._deserializeNode(this.clipboard, targetNode, true);
    targetNode.children.push(newNode);
    this._updateDepths(newNode);
    this._registerNodes(newNode);
    this._saveHistory();
    this._emit('node-added', { node: newNode, parent: targetNode });
    return newNode;
  }

  _registerNodes(node) {
    this.nodeMap.set(node.id, node);
    node.children.forEach(c => this._registerNodes(c));
  }

  // ===== Find =====
  find(query) {
    const results = [];
    const q = query.toLowerCase();
    const t = (n) => { if (n.text.toLowerCase().includes(q)) results.push(n); n.children.forEach(t); };
    t(this.root);
    return results;
  }

  // ============================================================
  // NEW: Relationship Line Operations (关系线/联系线)
  // ============================================================
  addRelationship(fromId, toId, options = {}) {
    // Check duplicate
    const exists = this.relationships.some(r =>
      (r.fromId === fromId && r.toId === toId) ||
      (r.fromId === toId && r.toId === fromId)
    );
    if (exists) return null;

    const rel = {
      id: 'rel_' + (++this._idCounter),
      fromId,
      toId,
      label: options.label || '',
      color: options.color || '#e74c3c',
      style: options.style || 'curve', // curve | straight | dashed
      arrowStart: options.arrowStart || false,
      arrowEnd: options.arrowEnd || true,
      lineWidth: options.lineWidth || 2,
      controlPoints: options.controlPoints || [], // for curved lines, user-draggable midpoints
    };
    this.relationships.push(rel);
    this._saveHistory();
    this._emit('relationship-added', rel);
    return rel;
  }

  removeRelationship(relId) {
    const idx = this.relationships.findIndex(r => r.id === relId);
    if (idx === -1) return false;
    const removed = this.relationships.splice(idx, 1)[0];
    this._saveHistory();
    this._emit('relationship-removed', removed);
    return true;
  }

  updateRelationship(relId, updates) {
    const rel = this.relationships.find(r => r.id === relId);
    if (!rel) return;
    Object.assign(rel, updates);
    this._saveHistory();
    this._emit('relationship-updated', rel);
  }

  getRelationshipForNode(nodeId) {
    return this.relationships.filter(r => r.fromId === nodeId || r.toId === nodeId);
  }

  // ============================================================
  // NEW: Annotation Operations (标注)
  // ============================================================
  addAnnotation(targetNodeId, text, options = {}) {
    const ann = {
      id: 'ann_' + (++this._idCounter),
      targetNodeId,
      text: text || '',
      position: options.position || 'right-top', // right-top, right-bottom, left-top, left-bottom
      color: options.color || '#f39c12',
      fontSize: options.fontSize || 12,
    };
    this.annotations.push(ann);
    this._saveHistory();
    this._emit('annotation-added', ann);
    return ann;
  }

  removeAnnotation(annId) {
    const idx = this.annotations.findIndex(a => a.id === annId);
    if (idx === -1) return false;
    const removed = this.annotations.splice(idx, 1)[0];
    this._saveHistory();
    this._emit('annotation-removed', removed);
    return true;
  }

  updateAnnotation(annId, updates) {
    const ann = this.annotations.find(a => a.id === annId);
    if (!ann) return;
    Object.assign(ann, updates);
    this._saveHistory();
    this._emit('annotation-updated', ann);
  }

  getAnnotationsForNode(nodeId) {
    return this.annotations.filter(a => a.targetNodeId === nodeId);
  }

  // ============================================================
  // NEW: Boundary/Frame Operations (外框)
  // ============================================================
  addBoundary(targetNodeId, options = {}) {
    const bound = {
      id: 'bound_' + (++this._idCounter),
      targetNodeId,
      label: options.label || '',
      color: options.color || '#3498db',
      style: options.style || 'solid', // solid | dashed | dotted
      radius: options.radius || 8,
      padding: options.padding || 10,
      fillColor: options.fillColor || '',
    };
    this.boundaries.push(bound);
    this._saveHistory();
    this._emit('boundary-added', bound);
    return bound;
  }

  removeBoundary(boundId) {
    const idx = this.boundaries.findIndex(b => b.id === boundId);
    if (idx === -1) return false;
    const removed = this.boundaries.splice(idx, 1)[0];
    this._saveHistory();
    this._emit('boundary-removed', removed);
    return true;
  }

  updateBoundary(boundId, updates) {
    const bound = this.boundaries.find(b => b.id === boundId);
    if (!bound) return;
    Object.assign(bound, updates);
    this._saveHistory();
    this._emit('boundary-updated', bound);
  }

  getBoundaryForNode(nodeId) {
    return this.boundaries.find(b => b.targetNodeId === nodeId);
  }

  // ============================================================
  // NEW: Summary Operations (概要)
  // ============================================================
  addSummary(targetNodeId, startIdx, endIdx, text, options = {}) {
    const sum = {
      id: 'sum_' + (++this._idCounter),
      targetNodeId,
      startChildIndex: startIdx,
      endChildIndex: endIdx,
      text: text || '',
      color: options.color || '#9b59b6',
      fillColor: options.fillColor || '',
      fontSize: options.fontSize || 11,
    };
    this.summaries.push(sum);
    this._saveHistory();
    this._emit('summary-added', sum);
    return sum;
  }

  removeSummary(sumId) {
    const idx = this.summaries.findIndex(s => s.id === sumId);
    if (idx === -1) return false;
    const removed = this.summaries.splice(idx, 1)[0];
    this._saveHistory();
    this._emit('summary-removed', removed);
    return true;
  }

  updateSummary(sumId, updates) {
    const sum = this.summaries.find(s => s.id === sumId);
    if (!sum) return;
    Object.assign(sum, updates);
    this._saveHistory();
    this._emit('summary-updated', sum);
  }

  getSummariesForNode(nodeId) {
    return this.summaries.filter(s => s.targetNodeId === nodeId);
  }

  // ============================================================
  // Serialization (includes all new data types)
  // ============================================================
  _serializeNode(node) {
    return {
      id: node.id, // P0-2: persist node ids so relationship/annotation/boundary/summary targets survive reload
      text: node.text,
      style: { ...node.style },
      note: node.note,
      collapsed: node.collapsed,
      offsetX: node._offsetX || 0,
      offsetY: node._offsetY || 0,
      isFreePositioned: node._isFreePositioned || false,
      children: node.children.map(c => this._serializeNode(c)),
    };
  }

  _deserializeNode(data, parent, regenerateIds) {
    const node = this._createNode(data.text, {
      shape: data.style?.shape,
      fillColor: data.style?.fillColor,
      textColor: data.style?.textColor,
      fontSize: data.style?.fontSize,
      fontWeight: data.style?.fontWeight,
      icon: data.style?.icon,
      priority: data.style?.priority,
      isRoot: false,
    });
    // P0-2: restore the original id when present (older files without ids fall back to traversal order);
    // regenerateIds (paste) keeps the fresh id from _createNode to avoid duplicates
    if (data.id && !regenerateIds) node.id = data.id;
    node.parent = parent;
    node.note = data.note || '';
    node.collapsed = data.collapsed || false;
    node._offsetX = data.offsetX || 0;
    node._offsetY = data.offsetY || 0;
    node._isFreePositioned = data.isFreePositioned || false;
    node.children = (data.children || []).map(c => this._deserializeNode(c, node));
    return node;
  }

  toJSON() {
    return {
      version: '2.0',
      language: this.language,
      root: this._serializeNode(this.root),
      relationships: [...this.relationships],
      annotations: [...this.annotations],
      boundaries: [...this.boundaries],
      summaries: [...this.summaries],
    };
  }

  fromJSON(json) {
    if (!json || !json.root) return false;
    this._idCounter = 0;
    this.root = this._deserializeNode(json.root, null);
    this.root.isRoot = true;
    this._buildNodeMap();
    this._updateDepths(this.root);

    // Restore new data types
    this.relationships = json.relationships || [];
    this.annotations = json.annotations || [];
    this.boundaries = json.boundaries || [];
    this.summaries = json.summaries || [];
    this.language = json.language || 'zh';

    this._resyncIdCounter();

    this.selectedNode = this.root;
    this.history = [];
    this.historyIndex = -1;
    this._saveHistory();
    this._emit('data-loaded');
    return true;
  }

  // ============================================================
  // FreeMind .mm Format (XML-based, widely compatible)
  // ============================================================

  /**
   * Export current mind map to FreeMind .mm XML string.
   * Supports: node text, notes, collapsed state, basic styling (color).
   * FreeMind features not in MindZ (icons, edges, links) are omitted.
   */
  toFreeMindXML() {
    const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const nodeToXml = (node, indent) => {
      const pad = '  '.repeat(indent);
      let attrs = `TEXT="${escapeXml(node.text)}"`;
      if (node.collapsed) attrs += ' FOLDED="true"';
      // Map fill color to FreeMind background
      if (node.style.fillColor) attrs += ` BACKGROUND_COLOR="${escapeXml(node.style.fillColor)}"`;
      // Map text color to FreeMind color
      if (node.style.textColor) attrs += ` COLOR="${escapeXml(node.style.textColor)}"`;

      // Note → richcontent hook
      const noteXml = node.note
        ? `\n${pad}    <hook NAME="accessories/plugins/NodeNote.properties">\n${pad}      <text>${escapeXml(node.note)}</text>\n${pad}    </hook>`
        : '';

      if (node.children.length === 0 && !node.note) {
        return `${pad}<node ${attrs}/>`;
      }
      const childXml = node.children.map(c => nodeToXml(c, indent + 1)).join('\n');
      return `${pad}<node ${attrs}>${noteXml}\n${childXml}\n${pad}</node>`;
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.0.1">
${nodeToXml(this.root, 1)}
</map>`;
  }

  /**
   * Import a FreeMind .mm XML string and populate this data model.
   * Returns true on success, false on parse error.
   * Only imports structure (text, notes, folded, colors); MindZ-specific
   * features (relationships, annotations, boundaries, summaries) are cleared.
   */
  fromFreeMindXML(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) return false;

    const mapEl = doc.querySelector('map');
    if (!mapEl) return false;

    const rootEl = mapEl.querySelector(':scope > node');
    if (!rootEl) return false;

    this._idCounter = 0;
    this.relationships = [];
    this.annotations = [];
    this.boundaries = [];
    this.summaries = [];

    this.root = this._parseFreeMindNode(rootEl, null);
    this.root.isRoot = true;
    this._buildNodeMap();
    this._updateDepths(this.root);
    this.selectedNode = this.root;
    this.history = [];
    this.historyIndex = -1;
    this._saveHistory();
    this._emit('data-loaded');
    return true;
  }

  /** Parse a single FreeMind <node> element into a MindMap node */
  _parseFreeMindNode(el, parent) {
    const text = el.getAttribute('TEXT') || 'New Node';
    const collapsed = el.getAttribute('FOLDED') === 'true';
    const fillColor = el.getAttribute('BACKGROUND_COLOR') || null;
    const textColor = el.getAttribute('COLOR') || null;

    // Extract note from hook
    let note = '';
    const noteHook = el.querySelector(':scope > hook[NAME="accessories/plugins/NodeNote.properties"]');
    if (noteHook) {
      const noteText = noteHook.querySelector('text');
      if (noteText) note = noteText.textContent || '';
    }

    const node = this._createNode(text, {
      fillColor: fillColor,
      textColor: textColor,
      isRoot: false,
    });
    node.parent = parent;
    node.collapsed = collapsed;
    node.note = note;

    // Parse child nodes
    const childEls = el.querySelectorAll(':scope > node');
    node.children = [];
    for (const childEl of childEls) {
      const child = this._parseFreeMindNode(childEl, node);
      node.children.push(child);
    }

    return node;
  }

  // ===== Undo/Redo =====
  _saveHistory() {
    const state = JSON.stringify(this.toJSON());
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(state);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex <= 0) return false;
    this.historyIndex--;
    const state = JSON.parse(this.history[this.historyIndex]);
    this._applyState(state);
    this._emit('undo');
    return true;
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return false;
    this.historyIndex++;
    const state = JSON.parse(this.history[this.historyIndex]);
    this._applyState(state);
    this._emit('redo');
    return true;
  }

  canUndo() { return this.historyIndex > 0; }
  canRedo() { return this.historyIndex < this.history.length - 1; }

  _applyState(state) {
    this._idCounter = 0;
    this.root = this._deserializeNode(state.root, null);
    this.root.isRoot = true;
    this._buildNodeMap();
    this._updateDepths(this.root);
    this.relationships = state.relationships || [];
    this.annotations = state.annotations || [];
    this.boundaries = state.boundaries || [];
    this.summaries = state.summaries || [];
    this.language = state.language || 'zh';
    this._resyncIdCounter();
    if (this.selectedNode && !this.nodeMap.has(this.selectedNode.id)) {
      this.selectedNode = this.root;
    }
    this._emit('data-changed');
  }

  // ===== Helpers =====
  _updateDepths(node) {
    if (node.parent) { node._depth = node.parent._depth + 1; } else { node._depth = 0; }
    node.children.forEach(c => this._updateDepths(c));
  }

  /**
   * P0-2: after loading persisted ids, bump _idCounter above every existing id
   * so newly created nodes never collide with restored ones.
   */
  _resyncIdCounter() {
    let max = 0;
    const scan = (id) => {
      const m = /^(?:node|rel|ann|bound|sum)_(\d+)$/.exec(id || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    };
    this.nodeMap.forEach(n => scan(n.id));
    this.relationships.forEach(r => scan(r.id));
    this.annotations.forEach(a => scan(a.id));
    this.boundaries.forEach(b => scan(b.id));
    this.summaries.forEach(s => scan(s.id));
    if (max > this._idCounter) this._idCounter = max;
  }

  // ===== Event System =====
  on(event, callback) { this._listeners.push({ event, callback }); }
  off(event, callback) { this._listeners = this._listeners.filter(l => l.event !== event || l.callback !== callback); }

  _emit(event, data) {
    // single pass over listeners (P3 micro-opt: was two filter passes)
    for (let i = 0; i < this._listeners.length; i++) {
      const l = this._listeners[i];
      if (l.event === event) l.callback(data);
      else if (l.event === '*') l.callback({ event, data });
    }
  }
}

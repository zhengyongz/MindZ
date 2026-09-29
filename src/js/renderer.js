/**
 * MindMap Renderer - SVG rendering engine with full feature support
 * Renders: nodes, connections, relationships, annotations, boundaries, summaries
 */
class MindMapRenderer {
  constructor(svgElement, data, layoutEngine, themeManager) {
    this.svg = svgElement;
    this.viewport = svgElement.querySelector('#svg-viewport');
    this.boundariesLayer = svgElement.querySelector('#boundaries-layer');
    this.relationshipsLayer = svgElement.querySelector('#relationships-layer');
    this.connectionsLayer = svgElement.querySelector('#connections-layer');
    this.nodesLayer = svgElement.querySelector('#nodes-layer');
    this.annotationsLayer = svgElement.querySelector('#annotations-layer');
    this.summariesLayer = svgElement.querySelector('#summaries-layer');
    this.data = data;
    this.layout = layoutEngine;
    this.themeMgr = themeManager;

    // Viewport transform
    this.viewX = 0;
    this.viewY = 0;
    this.scale = 1;

    // Interaction state
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    // Node free-drag state
    this.isDraggingNode = false;
    this.dragNode = null;
    this.dragStartWorldX = 0;
    this.dragStartWorldY = 0;
    this.dragStartOffsetX = 0;
    this.dragStartOffsetY = 0;

    // Relationship line creation state
    this.isCreatingRel = false;
    this.relFromNode = null;
    this.relTempLine = null;

    // Relationship control point drag
    this.isDraggingRelPoint = false;
    this.draggingRelId = null;
    this.draggingPointIdx = -1;

    // Relationship line whole drag
    this.isDraggingRelLine = false;
    this.dragRelLineId = null;
    this.dragRelLineStartX = 0;
    this.dragRelLineStartY = 0;
    this.dragRelLineOrigCP = null;

    // Annotation drag state
    this.isDraggingAnnotation = false;
    this.dragAnnId = null;
    this.dragAnnStartWorldX = 0;
    this.dragAnnStartWorldY = 0;
    this.dragAnnStartOX = 0;
    this.dragAnnStartOY = 0;
    this._annClickPending = null;

    // Summary click state
    this._sumClickPending = null;

    // Boundary click state
    this._boundClickPending = null;

    // Callbacks
    this.onNodeSelected = null;
    this.onNodeDblClick = null;
    this.onNodeDropTo = null;
    this.onRelationshipCreated = null;
    this.onAnnotationClick = null;
    this.onSummaryClick = null;
    this.onBoundaryClick = null;

    this._initEvents();
  }

  _initEvents() {
    const container = this.svg.parentElement;
    this.svg.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.svg.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.svg.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.svg.addEventListener('mouseleave', (e) => this._onMouseUp(e));
    this.svg.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.svg.addEventListener('dblclick', (e) => this._onDblClick(e));

    this.svg.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    this.svg.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    this.svg.addEventListener('touchend', (e) => this._onTouchEnd(e));
  }

  // ===== Main Render =====
  render() {
    const theme = this.themeMgr.getTheme();
    this.layout.layout(this.data.root, theme);
    // Clear all layers
    this.boundariesLayer.innerHTML = '';
    this.relationshipsLayer.innerHTML = '';
    this.connectionsLayer.innerHTML = '';
    this.nodesLayer.innerHTML = '';
    this.annotationsLayer.innerHTML = '';
    this.summariesLayer.innerHTML = '';

    // Layer order: boundaries -> relationships -> connections -> nodes -> annotations -> summaries
    this._renderBoundaries(theme);
    this._renderRelationships(theme);
    this._renderConnections(this.data.root, theme);
    this._renderNodes(this.data.root, theme);
    this._renderAnnotations(theme);
    this._renderSummaries(theme);

    this._updateViewport();
    this._updateMinimap();
  }

  /** P2-11: coalesce high-frequency renders (drag mousemove) into one per animation frame */
  _scheduleRender() {
    if (this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(() => {
      this._renderQueued = false;
      this.render();
    });
  }

  refresh() { this.render(); }

  // ============================================================
  // NODE RENDERING
  // ============================================================
  _renderNodes(node, theme, depth = 0, branchIndex = 0) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'mind-node' + (this.data.selectedNode === node ? ' selected' : ''));
    g.setAttribute('data-id', node.id);

    let x = node._x + (node._offsetX || 0);
    let y = node._y + (node._offsetY || 0);
    const w = node._width, h = node._height;

    const fillColor = this.themeMgr.getNodeFillColor(node, depth, branchIndex);
    const textColor = this.themeMgr.getNodeTextColor(node);
    const fontSize = this.themeMgr.getNodeFontSize(node);
    const fontWeight = node.style.fontWeight || (node.isRoot ? 'bold' : 'normal');
    const shape = node.style.shape || (node.isRoot ? 'rounded-rect' : 'rounded-rect');

    const bg = this._createShape(shape, x, y, w, h, fillColor, theme);
    bg.setAttribute('class', 'node-bg');
    if (shape !== 'underline') {
      if (!node.isRoot) bg.setAttribute('filter', 'url(#shadow)');
      else bg.setAttribute('filter', 'url(#shadow-lg)');
    }
    g.appendChild(bg);

    let textOffsetX = 0;
    if (node.style.icon) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('class', 'node-icon');
      icon.setAttribute('x', x - w / 2 + 12); icon.setAttribute('y', y + fontSize * 0.35);
      icon.setAttribute('font-size', fontSize); icon.setAttribute('text-anchor', 'start');
      icon.textContent = node.style.icon; g.appendChild(icon);
      textOffsetX = fontSize + 4;
    }

    if (node.style.priority > 0) {
      const pColors = ['', '#2ecc71', '#f39c12', '#e74c3c'];
      const pLabels = ['', 'P3', 'P2', 'P1'];
      const px = x + w / 2 - 8, py = y - h / 2 + 8;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', px); circle.setAttribute('cy', py); circle.setAttribute('r', 8);
      circle.setAttribute('fill', pColors[node.style.priority]); g.appendChild(circle);
      const pt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      pt.setAttribute('x', px); pt.setAttribute('y', py + 3.5); pt.setAttribute('text-anchor', 'middle');
      pt.setAttribute('font-size', 9); pt.setAttribute('font-weight', 'bold'); pt.setAttribute('fill', '#fff');
      pt.textContent = pLabels[node.style.priority]; g.appendChild(pt);
    }

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'node-text');
    text.setAttribute('x', x - w / 2 + (node.isRoot ? w / 2 : 12) + textOffsetX);
    text.setAttribute('font-size', fontSize); text.setAttribute('font-weight', fontWeight);
    text.setAttribute('fill', textColor); text.setAttribute('text-anchor', node.isRoot ? 'middle' : 'start');
    text.setAttribute('font-family', 'Segoe UI, Microsoft YaHei, sans-serif');

    const lines = this._wrapText(node.text, w - 24 - textOffsetX, fontSize);
    const lineHeight = fontSize * 1.3;
    const totalTextH = lines.length * lineHeight;
    // 多行文本垂直居中：计算起始 y
    const startY = y - totalTextH / 2 + fontSize * 0.85;

    if (lines.length === 1) {
      text.setAttribute('y', y + fontSize * 0.35);
      text.textContent = node.text;
    } else {
      lines.forEach((line, i) => {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        tspan.setAttribute('x', text.getAttribute('x'));
        tspan.setAttribute('y', startY + i * lineHeight);
        tspan.textContent = line;
        text.appendChild(tspan);
      });
    }
    g.appendChild(text);

    if (node.children.length > 0) g.appendChild(this._createCollapseButton(node, x, y, w, h, theme));

    if (this.data.selectedNode === node) {
      const ring = this._createShape(shape, x, y, w + 6, h + 6, 'none', theme);
      ring.setAttribute('class', 'node-selection-ring'); g.appendChild(ring);
    }

    this.nodesLayer.appendChild(g);
    if (!node.collapsed) {
      node.children.forEach((child, i) => {
        const bIdx = depth === 0 ? i : branchIndex;
        this._renderNodes(child, theme, depth + 1, bIdx);
      });
    }
  }

  // ============================================================
  // CONNECTION LINES
  // ============================================================
  _renderConnections(node, theme, depth = 0, branchIndex = 0) {
    if (node.collapsed) return;
    node.children.forEach((child, i) => {
      const bIdx = depth === 0 ? i : branchIndex;
      const color = depth === 0 ? this.themeMgr.getBranchColor(1, bIdx) : this.themeMgr.getBranchColor(depth, bIdx);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('class', 'connection-line');
      line.setAttribute('stroke', color);
      // inline fill so exported SVG (no CSS) doesn't render black-filled paths
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke-width', Math.max(1, theme.connectionWidth - depth * 0.3));
      line.setAttribute('data-from', node.id); line.setAttribute('data-to', child.id);
      line.setAttribute('d', this._getConnectionPath(node, child));
      this.connectionsLayer.appendChild(line);
      this._renderConnections(child, theme, depth + 1, bIdx);
    });
  }

  _getConnectionPath(from, to) {
    const layout = this.layout.currentLayout;
    if (layout === 'tree-down' || layout === 'org') return this._verticalConnection(from, to);
    return this._horizontalConnection(from, to);
  }

  _horizontalConnection(from, to) {
    const fx = from._x + (from._offsetX || 0), fy = from._y + (from._offsetY || 0);
    const tx = to._x + (to._offsetX || 0), ty = to._y + (to._offsetY || 0);
    const isRight = tx > fx;
    const sx = isRight ? fx + from._width / 2 : fx - from._width / 2;
    const ex = isRight ? tx - to._width / 2 : tx + to._width / 2;
    const cpOff = Math.abs(ex - sx) * 0.4;
    return `M ${sx} ${fy} C ${sx + (isRight ? cpOff : -cpOff)} ${fy}, ${ex - (isRight ? cpOff : -cpOff)} ${ty}, ${ex} ${ty}`;
  }

  _verticalConnection(from, to) {
    const fx = from._x + (from._offsetX || 0), fy = from._y + (from._offsetY || 0);
    const tx = to._x + (to._offsetX || 0), ty = to._y + (to._offsetY || 0);
    const cpOff = Math.abs(ty - fy) * 0.4;
    return `M ${fx} ${fy + from._height / 2} C ${fx} ${fy + from._height / 2 + cpOff}, ${tx} ${ty - to._height / 2 - cpOff}, ${tx} ${ty - to._height / 2}`;
  }

  // ============================================================
  // RELATIONSHIP LINES (关系线)
  // ============================================================
  _renderRelationships(theme) {
    const relGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    relGroup.setAttribute('id', 'relationships-group');

    this.data.relationships.forEach(rel => {
      const fn = this.data.getNode(rel.fromId), tn = this.data.getNode(rel.toId);
      if (!fn || !tn) return;

      // Hide relationship if either endpoint node is hidden due to ancestor collapse
      if (this._isNodeHidden(fn) || this._isNodeHidden(tn)) return;

      const fx = fn._x + (fn._offsetX || 0), fy = fn._y + (fn._offsetY || 0);
      const tx = tn._x + (tn._offsetX || 0), ty = tn._y + (tn._offsetY || 0);

      const sp = this._getEdgePoint(fx, fy, fn._width, fn._height, tx, ty);
      const ep = this._getEdgePoint(tx, ty, tn._width, tn._height, fx, fy);

      let pathD;
      if (rel.controlPoints && rel.controlPoints.length >= 2) {
        pathD = `M ${sp.x} ${sp.y} `;
        rel.controlPoints.forEach(cp => pathD += `L ${cp.x} ${cp.y} `);
        pathD += `L ${ep.x} ${ep.y}`;
      } else if (rel.style === 'straight') {
        pathD = `M ${sp.x} ${sp.y} L ${ep.x} ${ep.y}`;
      } else {
        const mx = (sp.x + ep.x) / 2, my = (sp.y + ep.y) / 2;
        const dx = ep.x - sp.x, dy = ep.y - sp.y;
        const px = -dy * 0.25, py = dx * 0.25;
        pathD = `M ${sp.x} ${sp.y} Q ${mx + px} ${my + py} ${ep.x} ${ep.y}`;
      }

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', pathD);
      line.setAttribute('stroke', rel.color);
      line.setAttribute('stroke-width', rel.lineWidth || 2);
      line.setAttribute('fill', 'none');
      line.setAttribute('data-rel-id', rel.id);
      if (rel.style === 'dashed') line.setAttribute('stroke-dasharray', '6,4');

      if (rel.arrowEnd) { this._ensureArrowMarker(rel.color, 'ae_' + rel.id); line.setAttribute('marker-end', `url(#ae_${rel.id})`); }
      if (rel.arrowStart) { this._ensureArrowMarker(rel.color, 'as_' + rel.id, true); line.setAttribute('marker-start', `url(#as_${rel.id})`); }

      line.classList.add('relationship-line');
      relGroup.appendChild(line);

      // Control point handles
      if (rel.controlPoints) {
        rel.controlPoints.forEach((cp, idx) => {
          const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          handle.setAttribute('cx', cp.x); handle.setAttribute('cy', cp.y);
          handle.setAttribute('r', 5); handle.setAttribute('fill', rel.color);
          handle.setAttribute('stroke', '#fff'); handle.setAttribute('stroke-width', 1.5);
          handle.setAttribute('class', 'rel-control-point');
          handle.setAttribute('data-rel-id', rel.id); handle.setAttribute('data-point-idx', idx);
          handle.style.cursor = 'move';
          relGroup.appendChild(handle);
        });
      }

      // Label
      if (rel.label) {
        const lp = this._getMidpoint(sp, ep, rel.controlPoints);
        const lw = rel.label.length * 7 + 12, lh = 20;
        const lbg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        lbg.setAttribute('x', lp.x - lw / 2); lbg.setAttribute('y', lp.y - lh / 2);
        lbg.setAttribute('width', lw); lbg.setAttribute('height', lh); lbg.setAttribute('rx', 4);
        lbg.setAttribute('fill', '#fff'); lbg.setAttribute('stroke', rel.color); lbg.setAttribute('stroke-width', 1);
        lbg.setAttribute('opacity', '0.9'); relGroup.appendChild(lbg);

        const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lt.setAttribute('x', lp.x); lt.setAttribute('y', lp.y + 4); lt.setAttribute('text-anchor', 'middle');
        lt.setAttribute('font-size', 11); lt.setAttribute('fill', rel.color); lt.setAttribute('font-weight', '500');
        lt.textContent = rel.label; relGroup.appendChild(lt);
      }
    });

    this.relationshipsLayer.appendChild(relGroup);
  }

  _getEdgePoint(x, y, w, h, tx, ty) {
    const angle = Math.atan2(ty - y, tx - x);
    const hw = w / 2, hh = h / 2;
    const cosA = Math.abs(Math.cos(angle)), sinA = Math.abs(Math.sin(angle));
    const tw = hw / cosA, th = hh / sinA;
    const dist = Math.min(tw, th);
    return { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist };
  }

  _getMidpoint(p1, p2, controlPoints) {
    if (controlPoints && controlPoints.length >= 1)
      return { x: (p1.x + controlPoints[0].x) / 2, y: (p1.y + controlPoints[0].y) / 2 };
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  _ensureArrowMarker(color, id, reversed) {
    if (document.getElementById(id)) return;
    const defs = this.svg.querySelector('defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id); marker.setAttribute('markerWidth', 10); marker.setAttribute('markerHeight', 10);
    // refX=9 places the arrow tip (at x=10) just 1 unit past the path endpoint,
    // so the arrow sits right at the node border instead of being hidden behind the node.
    marker.setAttribute('refX', 9); marker.setAttribute('refY', 5);
    marker.setAttribute('orient', reversed ? 'auto-start-reverse' : 'auto');
    marker.setAttribute('markerUnits', 'strokeWidth');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    // Same polygon for both — auto-start-reverse handles the direction flip for marker-start
    poly.setAttribute('points', '0,0 10,5 0,10');
    poly.setAttribute('fill', color); marker.appendChild(poly); defs.appendChild(marker);
  }

  _showTempRelationLine(fromNode, wx, wy) {
    if (this.relTempLine) this.relTempLine.remove();
    const fx = fromNode._x + (fromNode._offsetX || 0), fy = fromNode._y + (fromNode._offsetY || 0);
    const sp = this._getEdgePoint(fx, fy, fromNode._width, fromNode._height, wx, wy);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', `M ${sp.x} ${sp.y} L ${wx} ${wy}`);
    line.setAttribute('stroke', '#e74c3c'); line.setAttribute('stroke-width', 2);
    line.setAttribute('stroke-dasharray', '6,4'); line.setAttribute('fill', 'none');
    line.setAttribute('id', 'temp-relation-line');
    this.relationshipsLayer.appendChild(line); this.relTempLine = line;
  }

  _hideTempRelationLine() { if (this.relTempLine) { this.relTempLine.remove(); this.relTempLine = null; } }

  // ============================================================
  // ANNOTATIONS (标注)
  // ============================================================
  _renderAnnotations(theme) {
    const ag = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    ag.setAttribute('id', 'annotations-group');

    this.data.annotations.forEach(ann => {
      const node = this.data.getNode(ann.targetNodeId);
      if (!node) return;
      // Hide annotation if target node is hidden due to ancestor collapse
      if (this._isNodeHidden(node)) return;
      const nx = node._x + (node._offsetX || 0), ny = node._y + (node._offsetY || 0);
      const nw = node._width, nh = node._height;

      let ax, ay;
      const annOX = ann._offsetX || 0, annOY = ann._offsetY || 0;
      switch (ann.position) {
        case 'right-top': ax = nx + nw / 2 + 30 + annOX; ay = ny - nh / 2 - 8 + annOY; break;
        case 'right-bottom': ax = nx + nw / 2 + 30 + annOX; ay = ny + nh / 2 + 20 + annOY; break;
        case 'left-top': ax = nx - nw / 2 - 30 + annOX; ay = ny - nh / 2 - 8 + annOY; break;
        case 'left-bottom': ax = nx - nw / 2 - 30 + annOX; ay = ny + nh / 2 + 20 + annOY; break;
        default: ax = nx + nw / 2 + 30 + annOX; ay = ny - nh / 2 - 8 + annOY;
      }

      const psx = ann.position.startsWith('right') ? nx + nw / 2 : nx - nw / 2;
      const psy = ann.position.endsWith('top') ? ny - nh / 2 : ny + nh / 2;

      const pin = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      pin.setAttribute('x1', psx); pin.setAttribute('y1', psy); pin.setAttribute('x2', ax); pin.setAttribute('y2', ay);
      pin.setAttribute('stroke', ann.color); pin.setAttribute('stroke-width', 1.5); ag.appendChild(pin);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', psx); dot.setAttribute('cy', psy); dot.setAttribute('r', 3);
      dot.setAttribute('fill', ann.color); ag.appendChild(dot);

      const tsz = (ann.fontSize || 11) * 0.65, tw = ann.text.length * tsz + 16, th = 22;
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', ax - 4); bg.setAttribute('y', ay - th / 2);
      bg.setAttribute('width', tw); bg.setAttribute('height', th); bg.setAttribute('rx', 4);
      bg.setAttribute('fill', ann.color); bg.setAttribute('fill-opacity', '0.15');
      bg.setAttribute('stroke', ann.color); bg.setAttribute('stroke-width', 1);
      bg.setAttribute('class', 'annotation-bubble'); bg.setAttribute('data-ann-id', ann.id); ag.appendChild(bg);

      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', ax + tw / 2 - 4); txt.setAttribute('y', ay + 4);
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', ann.fontSize || 11);
      txt.setAttribute('fill', ann.color); txt.setAttribute('font-weight', '500');
      txt.textContent = ann.text; txt.setAttribute('class', 'annotation-text');
      txt.setAttribute('data-ann-id', ann.id); ag.appendChild(txt);
    });

    this.annotationsLayer.appendChild(ag);
  }

  // ============================================================
  // BOUNDARIES (外框)
  // ============================================================
  _renderBoundaries(theme) {
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    bg.setAttribute('id', 'boundaries-group');

    this.data.boundaries.forEach(bound => {
      const node = this.data.getNode(bound.targetNodeId);
      if (!node) return;
      // Hide boundary if target node is hidden due to ancestor collapse
      if (this._isNodeHidden(node)) return;
      const pad = bound.padding || 10;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      const calcBounds = (n) => {
        const cx = n._x + (n._offsetX || 0), cy = n._y + (n._offsetY || 0);
        minX = Math.min(minX, cx - n._width / 2 - pad);
        minY = Math.min(minY, cy - n._height / 2 - pad);
        maxX = Math.max(maxX, cx + n._width / 2 + pad);
        maxY = Math.max(maxY, cy + n._height / 2 + pad);
        if (!n.collapsed) n.children.forEach(calcBounds);
      };
      calcBounds(node);

      const bw = maxX - minX, bh = maxY - minY, r = bound.radius || 8;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', minX); rect.setAttribute('y', minY);
      rect.setAttribute('width', bw); rect.setAttribute('height', bh); rect.setAttribute('rx', r); rect.setAttribute('ry', r);
      rect.setAttribute('fill', bound.fillColor || (bound.color + '15'));
      rect.setAttribute('stroke', bound.color); rect.setAttribute('stroke-width', 2);
      if (bound.style === 'dashed') rect.setAttribute('stroke-dasharray', '8,4');
      else if (bound.style === 'dotted') rect.setAttribute('stroke-dasharray', '3,3');
      rect.setAttribute('class', 'boundary-rect'); rect.setAttribute('data-bound-id', bound.id);
      bg.appendChild(rect);

      if (bound.label) {
        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', minX + 8); lbl.setAttribute('y', minY - 6);
        lbl.setAttribute('font-size', 12); lbl.setAttribute('fill', bound.color);
        lbl.setAttribute('font-weight', '600'); lbl.textContent = bound.label; bg.appendChild(lbl);
      }
    });

    this.boundariesLayer.appendChild(bg);
  }

  // ============================================================
  // SUMMARIES (概要)
  // ============================================================
  _renderSummaries(theme) {
    const sg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    sg.setAttribute('id', 'summaries-group');

    this.data.summaries.forEach(sum => {
      const pn = this.data.getNode(sum.targetNodeId);
      if (!pn || !pn.children.length) return;
      // Hide summary if parent node is collapsed or hidden due to ancestor collapse
      if (pn.collapsed || this._isNodeHidden(pn)) return;
      const px = pn._x + (pn._offsetX || 0), py = pn._y + (pn._offsetY || 0);

      const sumGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      sumGroup.setAttribute('data-summary-id', sum.id);
      sumGroup.setAttribute('class', 'summary-item');
      const si = Math.min(sum.startChildIndex, pn.children.length - 1);
      const ei = Math.min(sum.endChildIndex, pn.children.length - 1);

      let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
      for (let i = si; i <= ei; i++) {
        const c = pn.children[i];
        const cx = c._x + (c._offsetX || 0), cy = c._y + (c._offsetY || 0);
        mnX = Math.min(mnX, cx - c._width / 2); mnY = Math.min(mnY, cy - c._height / 2);
        mxX = Math.max(mxX, cx + c._width / 2); mxY = Math.max(mxY, cy + c._height / 2);
      }

      const isVertical = this.layout.currentLayout === 'tree-down' || this.layout.currentLayout === 'org';
      // Determine if children are on the LEFT side of parent
      const isLeftSide = !isVertical && (mxX + mnX) / 2 < px;

      if (isVertical) {
        // Vertical layout: curly brace below children — ⌣ shape
        const midX = (mnX + mxX) / 2;
        const topY = mxY + 4;
        const tipY = topY + 16;
        const bracket = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bracket.setAttribute('d',
          `M ${mnX} ${topY} ` +
          `C ${mnX} ${topY + 10}, ${mnX} ${tipY}, ${midX - (mxX-mnX)*0.08} ${tipY} ` +
          `L ${midX} ${tipY + 4} ` +
          `L ${midX + (mxX-mnX)*0.08} ${tipY} ` +
          `C ${mxX} ${tipY}, ${mxX} ${topY + 10}, ${mxX} ${topY}`
        );
        bracket.setAttribute('fill', 'none'); bracket.setAttribute('stroke', sum.color); bracket.setAttribute('stroke-width', 2);
        sumGroup.appendChild(bracket);
        if (sum.text) {
          const st = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          st.setAttribute('x', midX); st.setAttribute('y', tipY + 18);
          st.setAttribute('text-anchor', 'middle'); st.setAttribute('font-size', sum.fontSize || 11);
          st.setAttribute('fill', sum.color); st.setAttribute('font-weight', '500');
          st.textContent = sum.text; sumGroup.appendChild(st);
        }
      } else if (isLeftSide) {
        // Horizontal layout, children on LEFT: curly brace { on the left side
        const midY = (mnY + mxY) / 2;
        const rightX = mnX - 4;
        const tipX = rightX - 16;
        const bracket = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bracket.setAttribute('d',
          `M ${rightX} ${mnY} ` +
          `C ${rightX - 10} ${mnY}, ${tipX} ${mnY}, ${tipX} ${midY - (mxY-mnY)*0.08} ` +
          `L ${tipX - 4} ${midY} ` +
          `L ${tipX} ${midY + (mxY-mnY)*0.08} ` +
          `C ${tipX} ${mxY}, ${rightX - 10} ${mxY}, ${rightX} ${mxY}`
        );
        bracket.setAttribute('fill', 'none'); bracket.setAttribute('stroke', sum.color); bracket.setAttribute('stroke-width', 2);
        sumGroup.appendChild(bracket);
        if (sum.text) {
          const st = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          st.setAttribute('x', tipX - 8); st.setAttribute('y', midY + 4);
          st.setAttribute('text-anchor', 'end'); st.setAttribute('font-size', sum.fontSize || 11);
          st.setAttribute('fill', sum.color); st.setAttribute('font-weight', '500');
          st.textContent = sum.text; sumGroup.appendChild(st);
        }
      } else {
        // Horizontal layout, children on RIGHT: curly brace } on the right side
        const midY = (mnY + mxY) / 2;
        const leftX = mxX + 4;
        const tipX = leftX + 16;
        const bracket = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bracket.setAttribute('d',
          `M ${leftX} ${mnY} ` +
          `C ${leftX + 10} ${mnY}, ${tipX} ${mnY}, ${tipX} ${midY - (mxY-mnY)*0.08} ` +
          `L ${tipX + 4} ${midY} ` +
          `L ${tipX} ${midY + (mxY-mnY)*0.08} ` +
          `C ${tipX} ${mxY}, ${leftX + 10} ${mxY}, ${leftX} ${mxY}`
        );
        bracket.setAttribute('fill', 'none'); bracket.setAttribute('stroke', sum.color); bracket.setAttribute('stroke-width', 2);
        sumGroup.appendChild(bracket);
        if (sum.text) {
          const st = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          st.setAttribute('x', tipX + 8); st.setAttribute('y', midY + 4);
          st.setAttribute('text-anchor', 'start'); st.setAttribute('font-size', sum.fontSize || 11);
          st.setAttribute('fill', sum.color); st.setAttribute('font-weight', '500');
          st.textContent = sum.text; sumGroup.appendChild(st);
        }
      }
      sg.appendChild(sumGroup);
    });

    this.summariesLayer.appendChild(sg);
  }

  // ============================================================
  // SHAPE HELPERS
  // ============================================================
  _createShape(shape, x, y, w, h, fillColor, theme) {
    let el; const rx = 8;
    switch (shape) {
      case 'rect':
        el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        el.setAttribute('x', x-w/2); el.setAttribute('y', y-h/2); el.setAttribute('width', w); el.setAttribute('height', h); break;
      case 'ellipse':
        el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        el.setAttribute('cx', x); el.setAttribute('cy', y); el.setAttribute('rx', w/2); el.setAttribute('ry', h/2); break;
      case 'diamond':
        el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        el.setAttribute('points', `${x},${y-h/2} ${x+w/2},${y} ${x},${y+h/2} ${x-w/2},${y}`); break;
      case 'underline':
        el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        el.setAttribute('x1', x - w/2); el.setAttribute('y1', y + h/2);
        el.setAttribute('x2', x + w/2); el.setAttribute('y2', y + h/2);
        el.setAttribute('stroke-width', 2); return el;
      default:
        el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        el.setAttribute('x', x-w/2); el.setAttribute('y', y-h/2); el.setAttribute('width', w); el.setAttribute('height', h);
        el.setAttribute('rx', rx); el.setAttribute('ry', rx); break;
    }
    el.setAttribute('fill', fillColor); el.setAttribute('stroke', theme.nodeStrokeColor); el.setAttribute('stroke-width', theme.nodeStrokeWidth);
    return el;
  }

  _createCollapseButton(node, x, y, w, h, theme) {
    const isVertical = this.layout.currentLayout === 'tree-down' || this.layout.currentLayout === 'org';
    let bx, by;
    if (isVertical) { bx = x; by = y + h / 2 + 10; }
    else {
      const hasRight = node.children.some(c => (c._x + (c._offsetX || 0)) > x);
      bx = hasRight ? x + w / 2 + 10 : x - w / 2 - 10; by = y;
    }
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'collapse-btn'); g.setAttribute('data-id', node.id);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', bx); circle.setAttribute('cy', by); circle.setAttribute('r', 8);
    circle.setAttribute('fill', theme.collapseBtnColor); circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', 1.5);
    g.appendChild(circle);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', bx); text.setAttribute('y', by + 3.5); text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', 10); text.setAttribute('fill', '#fff'); text.setAttribute('font-weight', 'bold');
    text.textContent = node.collapsed ? `${node.children.length}` : '\u2212'; g.appendChild(text);
    return g;
  }

  _wrapText(text, maxWidth, fontSize) {
    if (!text) return [''];
    const lines = [];
    let current = '';
    let currentW = 0;
    for (const ch of text) {
      const chW = ch.charCodeAt(0) > 127 ? fontSize : fontSize * 0.6;
      if (currentW + chW > maxWidth && current) {
        lines.push(current);
        current = ch;
        currentW = chW;
      } else {
        current += ch;
        currentW += chW;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [text];
  }

  // ============================================================
  // VIEWPORT CONTROL
  // ============================================================
  _updateViewport() { this.viewport.setAttribute('transform', `translate(${this.viewX}, ${this.viewY}) scale(${this.scale})`); }

  setScale(scale, cx, cy) {
    const oldS = this.scale;
    this.scale = Math.max(0.1, Math.min(3, scale));
    if (cx !== undefined) { this.viewX = cx - (cx - this.viewX) * (this.scale / oldS); this.viewY = cy - (cy - this.viewY) * (this.scale / oldS); }
    this._updateViewport(); return this.scale;
  }
  zoomIn() { const r = this.svg.getBoundingClientRect(); return this.setScale(this.scale * 1.2, r.width / 2, r.height / 2); }
  zoomOut() { const r = this.svg.getBoundingClientRect(); return this.setScale(this.scale / 1.2, r.width / 2, r.height / 2); }
  zoomReset() { this.scale = 1; this._centerView(); return this.scale; }

  fitCanvas() {
    this._centerView();
    const b = this._getNodesBounds(); if (!b) return;
    const r = this.svg.getBoundingClientRect(), p = 60;
    const sx = (r.width - p*2)/(b.maxX-b.minX), sy = (r.height-p*2)/(b.maxY-b.minY);
    this.scale = Math.min(sx, sy, 1.5); this.scale = Math.max(0.2, this.scale);
    this._centerView(); return this.scale;
  }

  _centerView() {
    const r = this.svg.getBoundingClientRect(), b = this._getNodesBounds();
    if (!b) { this.viewX = 0; this.viewY = 0; }
    else { const cx = (b.minX+b.maxX)/2, cy = (b.minY+b.maxY)/2; this.viewX = r.width/2-cx*this.scale; this.viewY = r.height/2-cy*this.scale; }
    this._updateViewport();
  }

  _getNodesBounds() {
    let mn=Infinity,mny=Infinity,mx=-Infinity,my=-Infinity;
    this.data.nodeMap.forEach(n => {
      const ox=n._offsetX||0,oy=n._offsetY||0,w=n._width||100,h=n._height||40;
      mn=Math.min(mn,n._x+ox-w/2);mny=Math.min(mny,n._y+oy-h/2);mx=Math.max(mx,n._x+ox+w/2);my=Math.max(my,n._y+oy+h/2);
    });
    if (mn===Infinity) return null; return {minX:mn,minY:mny,maxX:mx,maxY:my};
  }

  // ============================================================
  // MOUSE INTERACTION
  // ============================================================
  _screenToWorld(sx, sy) { const r=this.svg.getBoundingClientRect(); return {x:(sx-r.left-this.viewX)/this.scale,y:(sy-r.top-this.viewY)/this.scale}; }

  _hitTestNode(wx, wy) {
    const nodes = this.nodesLayer.querySelectorAll('.mind-node');
    for (let i = nodes.length-1; i >= 0; i--) {
      const id = nodes[i].getAttribute('data-id'), n = this.data.getNode(id);
      if (!n) continue;
      const ox=n._offsetX||0,oy=n._offsetY||0,hw=n._width/2+6,hh=n._height/2+6;
      if (wx>=n._x+ox-hw && wx<=n._x+ox+hw && wy>=n._y+oy-hh && wy<=n._y+oy+hh) return n;
    }
    return null;
  }

  _hitTestCollapseBtn(wx, wy) {
    const btns = this.nodesLayer.querySelectorAll('.collapse-btn');
    for (const btn of btns) {
      const c = btn.querySelector('circle'), cx=parseFloat(c.getAttribute('cx')),cy=parseFloat(c.getAttribute('cy'));
      if (Math.abs(wx-cx)<=10&&Math.abs(wy-cy)<=10) return this.data.getNode(btn.getAttribute('data-id'));
    }
    return null;
  }

  _hitTestRelControlPoint(wx, wy) {
    const pts = this.svg.querySelectorAll('.rel-control-point');
    for (const pt of pts) {
      const cx=parseFloat(pt.getAttribute('cx')),cy=parseFloat(pt.getAttribute('cy'));
      if (Math.abs(wx-cx)<=7&&Math.abs(wy-cy)<=7) return {relId:pt.getAttribute('data-rel-id'),pointIdx:parseInt(pt.getAttribute('data-point-idx'))};
    }
    return null;
  }

  _hitTestRelLine(wx, wy) {
    // Check proximity to relationship line paths (not control points)
    const lines = this.svg.querySelectorAll('.relationship-line');
    const threshold = 8; // hit distance in world coords
    for (const line of lines) {
      const relId = line.getAttribute('data-rel-id');
      if (!relId) continue;
      // Sample points along the path and check distance
      try {
        const totalLen = line.getTotalLength();
        const steps = Math.max(10, Math.floor(totalLen / 10));
        for (let i = 0; i <= steps; i++) {
          const pt = line.getPointAtLength((i / steps) * totalLen);
          if (Math.hypot(wx - pt.x, wy - pt.y) <= threshold) return relId;
        }
      } catch (e) { /* getTotalLength may fail for some paths */ }
    }
    return null;
  }

  _hitTestAnnotation(wx, wy) {
    const bubbles = this.svg.querySelectorAll('.annotation-bubble');
    for (const b of bubbles) {
      const x=parseFloat(b.getAttribute('x')),y=parseFloat(b.getAttribute('y')),w=parseFloat(b.getAttribute('width')),h=parseFloat(b.getAttribute('height'));
      if (wx>=x&&wx<=x+w&&wy>=y&&wy<=y+h) return this.data.annotations.find(a=>a.id===b.getAttribute('data-ann-id'))||null;
    }
    return null;
  }

  _hitTestSummary(wx, wy) {
    // Hit test summary groups by checking proximity to their bracket paths and text
    const sumGroups = this.svg.querySelectorAll('[data-summary-id]');
    for (const sg of sumGroups) {
      const sumId = sg.getAttribute('data-summary-id');
      // Check bracket paths within the summary group
      const paths = sg.querySelectorAll('path');
      for (const path of paths) {
        try {
          const totalLen = path.getTotalLength();
          const steps = Math.max(10, Math.floor(totalLen / 8));
          for (let i = 0; i <= steps; i++) {
            const pt = path.getPointAtLength((i / steps) * totalLen);
            if (Math.hypot(wx - pt.x, wy - pt.y) <= 16) {
              return this.data.summaries.find(s => s.id === sumId) || null;
            }
          }
        } catch (e) { /* path methods may fail */ }
      }
      // Check text elements with larger hit area
      const texts = sg.querySelectorAll('text');
      for (const t of texts) {
        const x = parseFloat(t.getAttribute('x') || 0);
        const y = parseFloat(t.getAttribute('y') || 0);
        const fs = parseFloat(t.getAttribute('font-size') || 11);
        const tw = t.textContent.length * fs * 0.6;
        const anchor = t.getAttribute('text-anchor');
        let left = x;
        if (anchor === 'middle') left = x - tw / 2;
        else if (anchor === 'end') left = x - tw;
        if (wx >= left - 8 && wx <= left + tw + 8 && wy >= y - fs - 4 && wy <= y + 6) {
          return this.data.summaries.find(s => s.id === sumId) || null;
        }
      }
    }
    return null;
  }

  _hitTestBoundary(wx, wy) {
    const rects = this.svg.querySelectorAll('.boundary-rect');
    for (const r of rects) {
      const x = parseFloat(r.getAttribute('x'));
      const y = parseFloat(r.getAttribute('y'));
      const w = parseFloat(r.getAttribute('width'));
      const h = parseFloat(r.getAttribute('height'));
      const boundId = r.getAttribute('data-bound-id');
      // Hit test: inside the boundary rect or near the border
      if (wx >= x - 4 && wx <= x + w + 4 && wy >= y - 4 && wy <= y + h + 4) {
        const bound = this.data.boundaries.find(b => b.id === boundId);
        if (bound) return bound;
      }
    }
    return null;
  }

  _onMouseDown(e) {
    if (e.button === 2) return;
    const world = this._screenToWorld(e.clientX, e.clientY);

    // Relationship control point drag
    const rp = this._hitTestRelControlPoint(world.x, world.y);
    if (rp) { this.isDraggingRelPoint=true; this.draggingRelId=rp.relId; this.draggingPointIdx=rp.pointIdx; return; }

    // Relationship line whole drag or click
    const relLineId = this._hitTestRelLine(world.x, world.y);
    if (relLineId) {
      const rel = this.data.relationships.find(r => r.id === relLineId);
      if (rel) {
        this.isDraggingRelLine = true;
        this.dragRelLineId = relLineId;
        this.dragRelLineStartX = world.x;
        this.dragRelLineStartY = world.y;
        // Store deep copy of original control points
        this.dragRelLineOrigCP = rel.controlPoints ? rel.controlPoints.map(cp => ({...cp})) : [];
        this._relLineClickPending = rel; // remember for potential click
        return;
      }
    }

    // Collapse button
    const cn = this._hitTestCollapseBtn(world.x, world.y);
    if (cn) { this.data.toggleCollapse(cn); this.render(); return; }

    // Annotation click or drag start
    const ann = this._hitTestAnnotation(world.x, world.y);
    if (ann) {
      // Don't immediately open edit dialog — defer to mouseup to distinguish click vs drag
      this.isDraggingAnnotation = true;
      this.dragAnnId = ann.id;
      this.dragAnnStartWorldX = world.x;
      this.dragAnnStartWorldY = world.y;
      this.dragAnnStartOX = ann._offsetX || 0;
      this.dragAnnStartOY = ann._offsetY || 0;
      this._annClickPending = ann; // remember for potential click
      return;
    }

    // Creating relationship
    if (this.isCreatingRel) {
      const tn = this._hitTestNode(world.x, world.y);
      if (tn && tn !== this.relFromNode) { if (this.onRelationshipCreated) this.onRelationshipCreated(this.relFromNode, tn); this.cancelCreatingRelation(); }
      else if (!tn) this.cancelCreatingRelation();
      return;
    }

    // Node hit — priority over summary/boundary so clicking inside them selects the node
    const node = this._hitTestNode(world.x, world.y);
    if (node) {
      this.data.selectedNode = node; this.render();
      if (this.onNodeSelected) this.onNodeSelected(node);
      // Free position drag
      this.isDraggingNode = true; this.dragNode = node;
      this.dragStartWorldX = world.x; this.dragStartWorldY = world.y;
      this.dragStartOffsetX = node._offsetX||0; this.dragStartOffsetY = node._offsetY||0;
      return;
    }

    // Summary click — only if no node was hit (clicking on the bracket/label area outside nodes)
    const sumHit = this._hitTestSummary(world.x, world.y);
    if (sumHit) {
      this._sumClickPending = sumHit;
      this._sumClickStartX = world.x;
      this._sumClickStartY = world.y;
      return;
    }

    // Boundary click — only if no node was hit (clicking on the border area of the boundary)
    const boundHit = this._hitTestBoundary(world.x, world.y);
    if (boundHit) {
      this._boundClickPending = boundHit;
      this._boundClickStartX = world.x;
      this._boundClickStartY = world.y;
      return;
    }

    // Pan canvas
    this.isPanning = true;
    this.panStartX = e.clientX - this.viewX; this.panStartY = e.clientY - this.viewY;
    this.svg.style.cursor = 'grabbing';
  }

  _onMouseMove(e) {
    const world = this._screenToWorld(e.clientX, e.clientY);
    if (this.isPanning) { this.viewX=e.clientX-this.panStartX; this.viewY=e.clientY-this.panStartY; this._updateViewport(); this._updateMinimap(); return; }

    if (this.isDraggingRelPoint && this.draggingRelId) {
      const rel = this.data.relationships.find(r=>r.id===this.draggingRelId);
      if (rel && rel.controlPoints[this.draggingPointIdx]) { rel.controlPoints[this.draggingPointIdx]={x:world.x,y:world.y}; this._scheduleRender(); } return;
    }

    // Relationship line whole drag
    if (this.isDraggingRelLine && this.dragRelLineId) {
      const rel = this.data.relationships.find(r => r.id === this.dragRelLineId);
      if (rel) {
        const dx = world.x - this.dragRelLineStartX;
        const dy = world.y - this.dragRelLineStartY;
        // Move all control points by the delta from original
        if (this.dragRelLineOrigCP.length > 0) {
          rel.controlPoints = this.dragRelLineOrigCP.map(cp => ({ x: cp.x + dx, y: cp.y + dy }));
        } else {
          // No control points yet — add two at offset positions along the line
          if (!rel.controlPoints) rel.controlPoints = [];
          const fn = this.data.getNode(rel.fromId), tn = this.data.getNode(rel.toId);
          if (fn && tn) {
            const fx = fn._x + (fn._offsetX||0), fy = fn._y + (fn._offsetY||0);
            const tx = tn._x + (tn._offsetX||0), ty = tn._y + (tn._offsetY||0);
            rel.controlPoints = [
              { x: (fx + tx) / 3 + dx, y: (fy + ty) / 3 + dy },
              { x: 2*(fx + tx) / 3 + dx, y: 2*(fy + ty) / 3 + dy }
            ];
          }
        }
        this._scheduleRender();
      }
      return;
    }

    // Annotation drag
    if (this.isDraggingAnnotation && this.dragAnnId) {
      const ann = this.data.annotations.find(a => a.id === this.dragAnnId);
      if (ann) {
        ann._offsetX = this.dragAnnStartOX + (world.x - this.dragAnnStartWorldX);
        ann._offsetY = this.dragAnnStartOY + (world.y - this.dragAnnStartWorldY);
        this._scheduleRender();
      }
      return;
    }

    if (this.isDraggingNode && this.dragNode) {
      const dx=world.x-this.dragStartWorldX, dy=world.y-this.dragStartWorldY;
      const offsetX=this.dragStartOffsetX+dx, offsetY=this.dragStartOffsetY+dy;
      // Move the entire subtree together
      const origOX = this.dragNode._offsetX||0, origOY = this.dragNode._offsetY||0;
      const deltaOX = offsetX - origOX, deltaOY = offsetY - origOY;
      const moveSubtree = (n) => {
        n._offsetX = (n._offsetX||0) + deltaOX;
        n._offsetY = (n._offsetY||0) + deltaOY;
        n._isFreePositioned = true;
        n.children.forEach(moveSubtree);
      };
      moveSubtree(this.dragNode);
      this._scheduleRender(); return;
    }

    if (this.isCreatingRel && this.relFromNode) { this._showTempRelationLine(this.relFromNode, world.x, world.y); return; }
  }

  _onMouseUp(e) {
    if (this.isDraggingNode && this.dragNode) { this.data._saveHistory(); this.isDraggingNode=false; this.dragNode=null; }
    if (this.isDraggingRelPoint) { this.data._saveHistory(); this.isDraggingRelPoint=false; this.draggingRelId=null; this.draggingPointIdx=-1; }
    if (this.isDraggingRelLine) {
      // Determine if this was a click (minimal movement) or a drag
      const rel = this._relLineClickPending;
      if (rel) {
        const world = this._screenToWorld(e.clientX, e.clientY);
        const dist = Math.hypot(world.x - this.dragRelLineStartX, world.y - this.dragRelLineStartY);
        if (dist < 5 && this.onRelationClick) {
          this.onRelationClick(rel);
        } else {
          this.data._saveHistory();
        }
      }
      this.isDraggingRelLine = false;
      this.dragRelLineId = null;
      this._relLineClickPending = null;
    }
    if (this.isDraggingAnnotation) {
      // Determine if this was a click (minimal movement) or a drag
      const ann = this._annClickPending;
      if (ann) {
        const world = this._screenToWorld(e.clientX, e.clientY);
        const dist = Math.hypot(world.x - this.dragAnnStartWorldX, world.y - this.dragAnnStartWorldY);
        if (dist < 5 && this.onAnnotationClick) {
          this.onAnnotationClick(ann);
        } else {
          this.data._saveHistory();
        }
      }
      this.isDraggingAnnotation = false;
      this.dragAnnId = null;
      this._annClickPending = null;
    }
    // Summary click
    if (this._sumClickPending) {
      const world = this._screenToWorld(e.clientX, e.clientY);
      const dist = Math.hypot(world.x - this._sumClickStartX, world.y - this._sumClickStartY);
      if (dist < 5 && this.onSummaryClick) {
        this.onSummaryClick(this._sumClickPending);
      }
      this._sumClickPending = null;
    }
    // Boundary click
    if (this._boundClickPending) {
      const world = this._screenToWorld(e.clientX, e.clientY);
      const dist = Math.hypot(world.x - this._boundClickStartX, world.y - this._boundClickStartY);
      if (dist < 5 && this.onBoundaryClick) {
        this.onBoundaryClick(this._boundClickPending);
      }
      this._boundClickPending = null;
    }
    this.isPanning=false; this.svg.style.cursor='grab';
  }

  _onWheel(e) { e.preventDefault(); const d=e.deltaY>0?0.92:1.08; this.setScale(this.scale*d,e.clientX-this.svg.getBoundingClientRect().left,e.clientY-this.svg.getBoundingClientRect().top); this._updateMinimap(); }
  _onDblClick(e) { const w=this._screenToWorld(e.clientX,e.clientY); const n=this._hitTestNode(w.x,w.y); if (n&&this.onNodeDblClick) this.onNodeDblClick(n); }

  _onTouchStart(e) { if(e.touches.length===1){const t=e.touches[0];this.isPanning=true;this.panStartX=t.clientX-this.viewX;this.panStartY=t.clientY-this.viewY;}e.preventDefault();}
  _onTouchMove(e) { if(e.touches.length===1&&this.isPanning){const t=e.touches[0];this.viewX=t.clientX-this.panStartX;this.viewY=t.clientY-this.panStartY;this._updateViewport();}e.preventDefault();}
  _onTouchEnd(e) { this.isPanning=false; }

  startCreatingRelation(fromNode) { this.isCreatingRel=true; this.relFromNode=fromNode; this.svg.style.cursor='crosshair'; }
  cancelCreatingRelation() { this.isCreatingRel=false; this.relFromNode=null; this._hideTempRelationLine(); this.svg.style.cursor='grab'; }

  // ===== Minimap =====
  _updateMinimap() {
    const canvas=document.getElementById('minimap-canvas');if(!canvas)return;
    const ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1;
    // P2-14: avoid resetting the canvas (full clear + resize) on every high-frequency
    // call — only when the DPR actually changes; a tiny clear is enough otherwise
    if (canvas._dpr !== dpr) { canvas._dpr = dpr; canvas.width=160*dpr;canvas.height=100*dpr; }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,160,100);
    const bounds=this._getNodesBounds();if(!bounds)return;
    const p=10,cw=bounds.maxX-bounds.minX,ch=bounds.maxY-bounds.minY;
    const ms=Math.min((160-p*2)/cw,(100-p*2)/ch)*0.8;
    const ox=80-(bounds.minX+cw/2)*ms,oy=50-(bounds.minY+ch/2)*ms;
    const theme=this.themeMgr.getTheme();ctx.fillStyle=theme.collapseBtnColor;
    this.data.nodeMap.forEach(n=>{const x=(n._x+(n._offsetX||0))*ms+ox,y=(n._y+(n._offsetY||0))*ms+oy;ctx.beginPath();ctx.arc(x,y,n.isRoot?3:1.5,0,Math.PI*2);ctx.fill();});
    const sr=this.svg.getBoundingClientRect(),vx1=(-this.viewX/this.scale)*ms+ox,vy1=(-this.viewY/this.scale)*ms+oy,vw=(sr.width/this.scale)*ms,vh=(sr.height/this.scale)*ms;
    ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1;ctx.strokeRect(vx1,vy1,vw,vh);
  }

  getSVGString() {
    const clone=this.svg.cloneNode(true);
    clone.querySelectorAll('.node-selection-ring').forEach(el=>el.remove());
    clone.querySelectorAll('.selected').forEach(el=>el.classList.remove('selected'));
    clone.querySelectorAll('.rel-control-point').forEach(el=>el.remove());
    clone.querySelectorAll('.collapse-btn').forEach(el=>el.remove());
    // P3: removed the old inlineStyles pass — it called getComputedStyle on elements of a
    // detached clone (always empty) and could not work. All critical styles (fill/stroke/
    // font) are now set as real attributes at render time, so exports are self-contained.

    // Calculate bounds including ALL elements (nodes + summaries + boundaries + relationships + annotations)
    const b = this._getAllBounds();
    const p=40, w=(b.maxX-b.minX)+p*2, h=(b.maxY-b.minY)+p*2;

    // Add background rect
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', 0); bgRect.setAttribute('y', 0);
    bgRect.setAttribute('width', w); bgRect.setAttribute('height', h);
    bgRect.setAttribute('fill', this.themeMgr.getTheme().background || '#ffffff');
    clone.insertBefore(bgRect, clone.firstChild);

    clone.setAttribute('width',w);clone.setAttribute('height',h);
    clone.setAttribute('viewBox',`0 0 ${w} ${h}`);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    // Remove any existing pan/zoom transform, then translate content to fit 0-based viewBox
    const vp=clone.querySelector('#svg-viewport');
    if(vp) vp.setAttribute('transform',`translate(${-b.minX+p},${-b.minY+p})`);
    return new XMLSerializer().serializeToString(clone);
  }

  /** Calculate bounds of ALL rendered elements (not just nodes) */
  _getAllBounds() {
    let mnX=Infinity, mnY=Infinity, mxX=-Infinity, mxY=-Infinity;

    // Nodes
    this.data.nodeMap.forEach(n => {
      const ox=n._offsetX||0, oy=n._offsetY||0;
      const w=n._width||100, h=n._height||40;
      mnX=Math.min(mnX, n._x+ox-w/2);
      mnY=Math.min(mnY, n._y+oy-h/2);
      mxX=Math.max(mxX, n._x+ox+w/2);
      mxY=Math.max(mxY, n._y+oy+h/2);
    });

    // Boundaries
    this.data.boundaries.forEach(bound => {
      const node = this.data.getNode(bound.targetNodeId);
      if (!node) return;
      const pad = bound.padding || 10;
      const calcBounds = (n) => {
        const cx=n._x+(n._offsetX||0), cy=n._y+(n._offsetY||0);
        mnX=Math.min(mnX, cx-n._width/2-pad);
        mnY=Math.min(mnY, cy-n._height/2-pad);
        mxX=Math.max(mxX, cx+n._width/2+pad);
        mxY=Math.max(mxY, cy+n._height/2+pad);
        if (!n.collapsed) n.children.forEach(calcBounds);
      };
      calcBounds(node);
      // Label above boundary
      if (bound.label) mnY = Math.min(mnY, (node._y+(node._offsetY||0)) - node._height/2 - pad - 22);
    });

    // Summaries — compute bracket bounds
    this.data.summaries.forEach(sum => {
      const pn = this.data.getNode(sum.targetNodeId);
      if (!pn || !pn.children.length || pn.collapsed) return;
      const px = pn._x+(pn._offsetX||0), py = pn._y+(pn._offsetY||0);
      const si = Math.min(sum.startChildIndex, pn.children.length-1);
      const ei = Math.min(sum.endChildIndex, pn.children.length-1);
      let sMnX=Infinity, sMnY=Infinity, sMxX=-Infinity, sMxY=-Infinity;
      for (let i=si; i<=ei; i++) {
        const c=pn.children[i], cx=c._x+(c._offsetX||0), cy=c._y+(c._offsetY||0);
        sMnX=Math.min(sMnX, cx-c._width/2); sMnY=Math.min(sMnY, cy-c._height/2);
        sMxX=Math.max(sMxX, cx+c._width/2); sMxY=Math.max(sMxY, cy+c._height/2);
      }
      const isVertical = this.layout.currentLayout==='tree-down'||this.layout.currentLayout==='org';
      if (isVertical) {
        mxY = Math.max(mxY, sMxY + 24);
        if (sum.text) mxY = Math.max(mxY, sMxY + 42);
      } else {
        const isLeftSide = (sMxX+sMnX)/2 < px;
        if (isLeftSide) {
          mnX = Math.min(mnX, sMnX - 24);
          if (sum.text) mnX = Math.min(mnX, sMnX - 60);
        } else {
          mxX = Math.max(mxX, sMxX + 24);
          if (sum.text) mxX = Math.max(mxX, sMxX + 60);
        }
      }
    });

    // Relationships — compute endpoints and control points
    this.data.relationships.forEach(rel => {
      const fn=this.data.getNode(rel.fromId), tn=this.data.getNode(rel.toId);
      if (!fn||!tn) return;
      const fx=fn._x+(fn._offsetX||0), fy=fn._y+(fn._offsetY||0);
      const tx=tn._x+(tn._offsetX||0), ty=tn._y+(tn._offsetY||0);
      mnX=Math.min(mnX, fx, tx); mnY=Math.min(mnY, fy, ty);
      mxX=Math.max(mxX, fx, tx); mxY=Math.max(mxY, fy, ty);
      if (rel.controlPoints) {
        rel.controlPoints.forEach(cp => {
          mnX=Math.min(mnX, cp.x); mnY=Math.min(mnY, cp.y);
          mxX=Math.max(mxX, cp.x); mxY=Math.max(mxY, cp.y);
        });
      }
      if (rel.label) {
        const lp = rel.controlPoints&&rel.controlPoints.length>=1 ?
          {x:(fx+rel.controlPoints[0].x)/2, y:(fy+rel.controlPoints[0].y)/2} :
          {x:(fx+tx)/2, y:(fy+ty)/2};
        mnX=Math.min(mnX, lp.x-rel.label.length*4-10);
        mnY=Math.min(mnY, lp.y-14);
        mxX=Math.max(mxX, lp.x+rel.label.length*4+10);
        mxY=Math.max(mxY, lp.y+14);
      }
    });

    // Annotations — compute position bounds
    this.data.annotations.forEach(ann => {
      const node = this.data.getNode(ann.targetNodeId);
      if (!node) return;
      const nx=node._x+(node._offsetX||0), ny=node._y+(node._offsetY||0);
      const nw=node._width, nh=node._height;
      const annOX=ann._offsetX||0, annOY=ann._offsetY||0;
      let ax, ay;
      switch(ann.position) {
        case 'right-top':    ax=nx+nw/2+30+annOX; ay=ny-nh/2-8+annOY; break;
        case 'right-bottom': ax=nx+nw/2+30+annOX; ay=ny+nh/2+20+annOY; break;
        case 'left-top':     ax=nx-nw/2-30+annOX; ay=ny-nh/2-8+annOY; break;
        case 'left-bottom':  ax=nx-nw/2-30+annOX; ay=ny+nh/2+20+annOY; break;
        default:             ax=nx+nw/2+30+annOX; ay=ny-nh/2-8+annOY;
      }
      const tsz=(ann.fontSize||11)*0.65, tw=ann.text.length*tsz+16, th=22;
      mnX=Math.min(mnX, ax-4, nx-nw/2);
      mnY=Math.min(mnY, ay-th/2, ny-nh/2);
      mxX=Math.max(mxX, ax+tw-4, nx+nw/2);
      mxY=Math.max(mxY, ay+th/2, ny+nh/2);
    });

    if (mnX===Infinity) return this._getNodesBounds() || {minX:0,minY:0,maxX:800,maxY:600};
    return {minX:mnX,minY:mnY,maxX:mxX,maxY:mxY};
  }

  /**
   * Check if a node is hidden due to an ancestor being collapsed.
   * Walks up the parent chain; if any ancestor has .collapsed === true,
   * the node is not visible and should not be rendered.
   */
  _isNodeHidden(node) {
    let p = node.parent;
    while (p) {
      if (p.collapsed) return true;
      p = p.parent;
    }
    return false;
  }
}

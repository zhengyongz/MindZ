/**
 * Layout 布局引擎 - 计算思维导图各种布局模式下节点的坐标
 */

// 布局配置
const LayoutConfig = {
  mindmap: {
    hGap: 60,       // 水平间距
    vGap: 16,       // 垂直间距
    direction: 'both', // left/right/both
  },
  'tree-right': {
    hGap: 50,
    vGap: 20,
    direction: 'right',
  },
  'tree-down': {
    hGap: 24,
    vGap: 50,
    direction: 'down',
  },
  fishbone: {
    hGap: 40,
    vGap: 30,
    direction: 'both',
  },
  org: {
    hGap: 24,
    vGap: 60,
    direction: 'down',
  }
};

class LayoutEngine {
  constructor() {
    this.currentLayout = 'mindmap';
    this.config = LayoutConfig.mindmap;
  }

  setLayout(type) {
    this.currentLayout = type;
    this.config = LayoutConfig[type] || LayoutConfig.mindmap;
  }

  /**
   * 计算整个树的布局
   * @param {Object} root - 根节点
   * @param {Object} theme - 当前主题
   * @returns {Object} 包含所有节点位置和画布尺寸
   */
  layout(root, theme) {
    if (!root) return { width: 0, height: 0 };

    // 先测量节点尺寸
    this._measureNodes(root, theme);

    switch (this.currentLayout) {
      case 'mindmap':
        return this._layoutMindmap(root);
      case 'tree-right':
        return this._layoutTreeRight(root);
      case 'tree-down':
        return this._layoutTreeDown(root);
      case 'fishbone':
        return this._layoutFishbone(root);
      case 'org':
        return this._layoutOrg(root);
      default:
        return this._layoutMindmap(root);
    }
  }

  // ===== 节点尺寸测量 =====
  _measureNodes(node, theme) {
    // 测量节点文本宽度，支持自动折行
    const fontSize = node.style.fontSize || (node.isRoot ? theme.rootFontSize : theme.nodeFontSize);
    const fontWeight = node.style.fontWeight || (node.isRoot ? 'bold' : 'normal');
    const text = node.text;

    const paddingX = node.isRoot ? 28 : 18;
    const paddingY = node.isRoot ? 14 : 10;
    const iconWidth = node.style.icon ? 24 : 0;
    const priorityWidth = node.style.priority > 0 ? 28 : 0;

    // 最大文本区宽度（节点最大宽度扣掉 padding/icon）
    const maxNodeWidth = node.isRoot ? 300 : 200;
    const maxTextWidth = maxNodeWidth - paddingX * 2 - iconWidth - priorityWidth;

    // 估算单行文本宽度
    let singleLineWidth = 0;
    for (const ch of text) {
      singleLineWidth += ch.charCodeAt(0) > 127 ? fontSize : fontSize * 0.6;
    }

    // 如果单行放得下，直接用单行
    if (singleLineWidth <= maxTextWidth) {
      node._width = singleLineWidth + paddingX * 2 + iconWidth + priorityWidth;
      node._height = fontSize + paddingY * 2;
    } else {
      // 需要折行：按 maxTextWidth 计算行数
      const lines = this._wrapTextForMeasure(text, maxTextWidth, fontSize);
      const lineCount = lines.length;
      // 节点宽度用最大宽度
      node._width = maxNodeWidth;
      // 高度 = 行数 × 行高 + padding
      const lineHeight = fontSize * 1.3;
      node._height = lineHeight * lineCount + paddingY * 2;
    }

    // 限制最小尺寸
    node._width = Math.max(node.isRoot ? 120 : 60, Math.min(node._width, maxNodeWidth));
    node._height = Math.max(node.isRoot ? 44 : 32, node._height);

    // 递归测量子节点
    if (!node.collapsed) {
      node.children.forEach(c => this._measureNodes(c, theme));
    }
  }

  _wrapTextForMeasure(text, maxWidth, fontSize) {
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

  // ===== 思维导图布局（中心发散，左右分布）=====
  _layoutMindmap(root) {
    const cfg = this.config;
    const leftChildren = [];
    const rightChildren = [];

    root.children.forEach((child, i) => {
      if (cfg.direction === 'left' || (cfg.direction === 'both' && i % 2 === 1)) {
        leftChildren.push(child);
      } else {
        rightChildren.push(child);
      }
    });

    // 根节点在中心
    root._x = 0;
    root._y = 0;

    // 右侧布局
    let rightHeight = 0;
    if (rightChildren.length > 0) {
      rightHeight = this._layoutSubtreeRight(rightChildren, root._x + root._width / 2 + cfg.hGap, 0);
    }

    // 左侧布局
    let leftHeight = 0;
    if (leftChildren.length > 0) {
      leftHeight = this._layoutSubtreeLeft(leftChildren, root._x - root._width / 2 - cfg.hGap, 0);
    }

    const totalHeight = Math.max(rightHeight, leftHeight, root._height);
    return { width: 2000, height: Math.max(totalHeight * 2 + 100, 1200) };
  }

  _layoutSubtreeRight(nodes, startX, centerY) {
    const cfg = this.config;
    // 计算每个子树的高度
    const heights = nodes.map(n => this._getSubtreeHeight(n, cfg.vGap));
    const totalHeight = heights.reduce((s, h) => s + h, 0) + (nodes.length - 1) * cfg.vGap;

    let y = centerY - totalHeight / 2;
    nodes.forEach((node, i) => {
      const nodeY = y + heights[i] / 2;
      node._x = startX + node._width / 2;
      node._y = nodeY;
      // 递归布局子节点
      if (!node.collapsed && node.children.length > 0) {
        this._layoutSubtreeRight(node.children, node._x + node._width / 2 + cfg.hGap, nodeY);
      }
      y += heights[i] + cfg.vGap;
    });

    return totalHeight;
  }

  _layoutSubtreeLeft(nodes, startX, centerY) {
    const cfg = this.config;
    const heights = nodes.map(n => this._getSubtreeHeight(n, cfg.vGap));
    const totalHeight = heights.reduce((s, h) => s + h, 0) + (nodes.length - 1) * cfg.vGap;

    let y = centerY - totalHeight / 2;
    nodes.forEach((node, i) => {
      const nodeY = y + heights[i] / 2;
      node._x = startX - node._width / 2;
      node._y = nodeY;
      if (!node.collapsed && node.children.length > 0) {
        this._layoutSubtreeLeft(node.children, node._x - node._width / 2 - cfg.hGap, nodeY);
      }
      y += heights[i] + cfg.vGap;
    });

    return totalHeight;
  }

  // ===== 向右树状布局 =====
  _layoutTreeRight(root) {
    const cfg = this.config;
    root._x = 0;
    root._y = 0;
    
    if (root.children.length > 0) {
      const startX = root._x + root._width / 2 + cfg.hGap;
      this._layoutSubtreeRight(root.children, startX, 0);
    }
    
    return { width: 2000, height: 1200 };
  }

  // ===== 向下树状布局 =====
  _layoutTreeDown(root) {
    const cfg = this.config;
    root._x = 0;
    root._y = 0;

    if (root.children.length > 0) {
      this._layoutSubtreeDown(root.children, root._y + root._height / 2 + cfg.vGap, 0);
    }

    return { width: 2000, height: 1200 };
  }

  _layoutSubtreeDown(nodes, startY, centerX) {
    const cfg = this.config;
    const widths = nodes.map(n => this._getSubtreeWidth(n, cfg.hGap));
    const totalWidth = widths.reduce((s, w) => s + w, 0) + (nodes.length - 1) * cfg.hGap;

    let x = centerX - totalWidth / 2;
    nodes.forEach((node, i) => {
      const nodeX = x + widths[i] / 2;
      node._x = nodeX;
      node._y = startY + node._height / 2;
      if (!node.collapsed && node.children.length > 0) {
        this._layoutSubtreeDown(node.children, node._y + node._height / 2 + cfg.vGap, nodeX);
      }
      x += widths[i] + cfg.hGap;
    });
  }

  // ===== 鱼骨图布局 =====
  _layoutFishbone(root) {
    const cfg = this.config;
    root._x = 0;
    root._y = 0;

    const topChildren = [];
    const bottomChildren = [];
    root.children.forEach((child, i) => {
      if (i % 2 === 0) topChildren.push(child);
      else bottomChildren.push(child);
    });

    // 上方
    this._layoutFishboneBranch(topChildren, root._x + root._width / 2, root._y, -1, cfg);
    // 下方
    this._layoutFishboneBranch(bottomChildren, root._x + root._width / 2, root._y, 1, cfg);

    return { width: 2000, height: 1200 };
  }

  _layoutFishboneBranch(nodes, startX, centerY, direction, cfg) {
    let x = startX + cfg.hGap;
    nodes.forEach((node, i) => {
      const angle = 30 * Math.PI / 180;
      node._x = x + node._width / 2;
      node._y = centerY + direction * (i + 1) * cfg.vGap;
      if (!node.collapsed && node.children.length > 0) {
        this._layoutSubtreeRight(node.children, node._x + node._width / 2 + cfg.hGap, node._y);
      }
      x += node._width + cfg.hGap;
    });
  }

  // ===== 组织架构图布局 =====
  _layoutOrg(root) {
    const cfg = this.config;
    root._x = 0;
    root._y = 0;

    if (root.children.length > 0) {
      this._layoutSubtreeDown(root.children, root._y + root._height / 2 + cfg.vGap, 0);
    }

    return { width: 2000, height: 1200 };
  }

  // ===== 辅助方法 =====
  _getSubtreeHeight(node, vGap) {
    if (node.collapsed || node.children.length === 0) {
      return node._height;
    }
    const childrenHeight = node.children
      .map(c => this._getSubtreeHeight(c, vGap))
      .reduce((s, h) => s + h, 0) + (node.children.length - 1) * vGap;
    return Math.max(node._height, childrenHeight);
  }

  _getSubtreeWidth(node, hGap) {
    if (node.collapsed || node.children.length === 0) {
      return node._width;
    }
    const childrenWidth = node.children
      .map(c => this._getSubtreeWidth(c, hGap))
      .reduce((s, w) => s + w, 0) + (node.children.length - 1) * hGap;
    return Math.max(node._width, childrenWidth);
  }
}

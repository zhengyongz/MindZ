/**
 * Theme 主题管理 - 定义和管理思维导图的视觉主题
 */

const Themes = {
  'classic-blue': {
    name: '经典蓝',
    background: '#f5f7fa',
    rootFillColor: '#3a5ba0',
    rootTextColor: '#ffffff',
    rootFontSize: 18,
    rootFontWeight: 'bold',
    nodeFillColor: '#e8eef6',
    nodeTextColor: '#333333',
    nodeFontSize: 14,
    nodeFontWeight: 'normal',
    nodeStrokeColor: '#3a5ba0',
    nodeStrokeWidth: 1.5,
    connectionColor: '#3a5ba0',
    connectionWidth: 2,
    branchColors: ['#3a5ba0', '#e74c3c', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400', '#2c3e50'],
    collapseBtnColor: '#3a5ba0',
    selectedStroke: '#ff6b6b',
    canvasGrid: '#e0e4ea',
  },
  'dark-purple': {
    name: '暗夜紫',
    background: '#1a1a2e',
    rootFillColor: '#6c3ec4',
    rootTextColor: '#ffffff',
    rootFontSize: 18,
    rootFontWeight: 'bold',
    nodeFillColor: '#2d2d4a',
    nodeTextColor: '#e0e0f0',
    nodeFontSize: 14,
    nodeFontWeight: 'normal',
    nodeStrokeColor: '#6c3ec4',
    nodeStrokeWidth: 1.5,
    connectionColor: '#9b7be5',
    connectionWidth: 2,
    branchColors: ['#6c3ec4', '#e74c3c', '#2ecc71', '#f39c12', '#3498db', '#e91e63', '#1abc9c', '#ff6b6b'],
    collapseBtnColor: '#9b7be5',
    selectedStroke: '#ff6b6b',
    canvasGrid: '#252540',
  },
  'fresh-green': {
    name: '清新绿',
    background: '#f0faf0',
    rootFillColor: '#2ecc71',
    rootTextColor: '#ffffff',
    rootFontSize: 18,
    rootFontWeight: 'bold',
    nodeFillColor: '#e8f8e8',
    nodeTextColor: '#2c3e2c',
    nodeFontSize: 14,
    nodeFontWeight: 'normal',
    nodeStrokeColor: '#2ecc71',
    nodeStrokeWidth: 1.5,
    connectionColor: '#27ae60',
    connectionWidth: 2,
    branchColors: ['#27ae60', '#3498db', '#e74c3c', '#f39c12', '#8e44ad', '#1abc9c', '#d35400', '#2c3e50'],
    collapseBtnColor: '#27ae60',
    selectedStroke: '#e74c3c',
    canvasGrid: '#d8eed8',
  },
  'vibrant-orange': {
    name: '活力橙',
    background: '#fff8f0',
    rootFillColor: '#e67e22',
    rootTextColor: '#ffffff',
    rootFontSize: 18,
    rootFontWeight: 'bold',
    nodeFillColor: '#fef0e0',
    nodeTextColor: '#5d3a1a',
    nodeFontSize: 14,
    nodeFontWeight: 'normal',
    nodeStrokeColor: '#e67e22',
    nodeStrokeWidth: 1.5,
    connectionColor: '#d35400',
    connectionWidth: 2,
    branchColors: ['#e67e22', '#e74c3c', '#3498db', '#27ae60', '#8e44ad', '#f39c12', '#1abc9c', '#2c3e50'],
    collapseBtnColor: '#d35400',
    selectedStroke: '#e74c3c',
    canvasGrid: '#f0e0d0',
  },
  'minimal': {
    name: '极简白',
    background: '#ffffff',
    rootFillColor: '#2c3e50',
    rootTextColor: '#ffffff',
    rootFontSize: 18,
    rootFontWeight: 'bold',
    nodeFillColor: '#f8f9fa',
    nodeTextColor: '#333333',
    nodeFontSize: 14,
    nodeFontWeight: 'normal',
    nodeStrokeColor: '#dee2e6',
    nodeStrokeWidth: 1,
    connectionColor: '#adb5bd',
    connectionWidth: 1.5,
    branchColors: ['#2c3e50', '#495057', '#6c757d', '#adb5bd', '#3498db', '#e74c3c', '#27ae60', '#f39c12'],
    collapseBtnColor: '#6c757d',
    selectedStroke: '#3498db',
    canvasGrid: '#f1f3f5',
  },
  'china-red': {
    name: '中国红',
    background: '#fdf6f0',
    rootFillColor: '#c0392b',
    rootTextColor: '#ffffff',
    rootFontSize: 18,
    rootFontWeight: 'bold',
    nodeFillColor: '#fef0ec',
    nodeTextColor: '#4a1a1a',
    nodeFontSize: 14,
    nodeFontWeight: 'normal',
    nodeStrokeColor: '#c0392b',
    nodeStrokeWidth: 1.5,
    connectionColor: '#e74c3c',
    connectionWidth: 2,
    branchColors: ['#c0392b', '#d4a017', '#2c5f2d', '#1a3a5c', '#5b2c6f', '#c0392b', '#e67e22', '#16a085'],
    collapseBtnColor: '#c0392b',
    selectedStroke: '#d4a017',
    canvasGrid: '#f5e6dc',
  },
};

class ThemeManager {
  constructor() {
    this.currentTheme = 'classic-blue';
    this.theme = Themes['classic-blue'];
  }

  setTheme(name) {
    if (Themes[name]) {
      this.currentTheme = name;
      this.theme = Themes[name];
      return true;
    }
    return false;
  }

  getTheme() {
    return this.theme;
  }

  getThemeNames() {
    return Object.keys(Themes);
  }

  // 获取分支颜色（根据节点深度和索引）
  getBranchColor(depth, index) {
    const colors = this.theme.branchColors;
    if (depth <= 1) {
      return colors[index % colors.length];
    }
    // 深层节点使用父节点的颜色
    return colors[index % colors.length];
  }

  // 获取节点填充色
  getNodeFillColor(node, depth, index) {
    if (node.isRoot) return this.theme.rootFillColor;
    if (node.style.fillColor) return node.style.fillColor;
    if (depth === 1) return this.getBranchColor(depth, index);
    // 更深层级使用浅色
    const branchColor = this.getBranchColor(1, index);
    return this._lightenColor(branchColor, 0.7);
  }

  // 获取节点文字色
  getNodeTextColor(node) {
    if (node.isRoot) return this.theme.rootTextColor;
    if (node.style.textColor) return node.style.textColor;
    return this.theme.nodeTextColor;
  }

  // 获取节点字体大小
  getNodeFontSize(node) {
    if (node.style.fontSize) return node.style.fontSize;
    if (node.isRoot) return this.theme.rootFontSize;
    return this.theme.nodeFontSize;
  }

  // 颜色变浅
  _lightenColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.round(r + (255 - r) * factor);
    const ng = Math.round(g + (255 - g) * factor);
    const nb = Math.round(b + (255 - b) * factor);
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  }
}

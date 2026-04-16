// Configuration du maillage interne intelligent
const internalLinkingConfig = {
  keywords: {
    'qr code funéraire': {
      url: '/qr-code-memorial.html',
      title: 'QR Code Mémorial - Guide Complet',
      maxLinks: 2
    },
    'plaque funéraire': {
      url: '/qr-code-memorial-prix.html',
      title: 'Prix des plaques QR - Détails',
      maxLinks: 2
    },
    'page commémorative': {
      url: '/pages-commemoratives.html',
      title: 'Créer des pages commémoratives',
      maxLinks: 1
    },
    'cimetière': {
      url: '/qr-code-cimetiere.html',
      title: 'QR Code au cimetière',
      maxLinks: 1
    },
    'créer': {
      url: '/create.html',
      title: 'Créer mon QR Code mémorial',
      maxLinks: 1
    }
  },
  excludePages: [
    '/legal.html',
    '/privacy.html',
    '/terms.html',
    '/cookies.html',
    '/en/legal.html',
    '/en/privacy.html',
    '/en/terms.html'
  ],
  contentSelectors: ['article', '.content', 'main', '.post-content', '.container']
};

class InternalLinkingManager {
  constructor(config) {
    this.config = config;
    this.currentPage = window.location.pathname;
    this.linkCounts = {};
    Object.keys(this.config.keywords).forEach(k => (this.linkCounts[k] = 0));
  }
  init() {
    if (this.isExcludedPage()) return;
    const container = this.findContentContainer();
    if (!container) return;
    this.applyInternalLinks(container);
  }
  isExcludedPage() {
    return this.config.excludePages.some(page => this.currentPage.includes(page));
  }
  findContentContainer() {
    for (let selector of this.config.contentSelectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }
  applyInternalLinks(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === 'A' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        if (p.closest('a')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    const sorted = Object.keys(this.config.keywords).sort((a, b) => b.length - a.length);
    nodes.forEach(textNode => {
      let text = textNode.textContent;
      sorted.forEach(keyword => {
        const conf = this.config.keywords[keyword];
        if (this.linkCounts[keyword] >= conf.maxLinks) return;
        if (this.currentPage === conf.url) return;
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const match = text.match(regex);
        if (match) {
          const idx = match.index;
          const before = document.createTextNode(text.slice(0, idx));
          const link = document.createElement('a');
          link.href = conf.url;
          link.title = conf.title;
          link.textContent = match[0];
          link.className = 'auto-internal-link';
          const after = document.createTextNode(text.slice(idx + match[0].length));
          const parent = textNode.parentNode;
          parent.insertBefore(before, textNode);
          parent.insertBefore(link, textNode);
          parent.insertBefore(after, textNode);
          parent.removeChild(textNode);
          this.linkCounts[keyword]++;
          textNode = after; // continue après
          text = after.textContent;
        }
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    new InternalLinkingManager(internalLinkingConfig).init();
  } catch (e) {
    // silencieux
  }
});

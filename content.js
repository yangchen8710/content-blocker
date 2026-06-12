// content.js - Content Blocker
// 根据域名匹配规则，隐藏页面元素
// 支持 popup 发送的 preview/restore/highlight 消息

let rules = [];
let styleEl = null;
let previewStyleEl = null;
let previewSelectors = new Set();
let highlightStyleEl = null;
let highlightedSelectors = new Set();
let highlightCounter = 0;
const currentDomain = location.hostname;

async function loadRules() {
  const result = await chrome.storage.local.get('rules');
  const allRules = result.rules || [];
  rules = allRules.filter(r => r.domain === currentDomain);
  applyRules();
}

function buildStyleText(selectors) {
  if (selectors.length === 0) return '';
  return selectors
    .map(s => `${s}{display:none!important;visibility:hidden!important;}`)
    .join('\n');
}

function applyRules() {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'content-blocker-style';
    document.head.appendChild(styleEl);
  }
  const activeRules = rules.filter(r => r.enabled !== false).map(r => r.selector);
  styleEl.textContent = buildStyleText(activeRules);
}

function previewSelector(selector) {
  if (!previewStyleEl) {
    previewStyleEl = document.createElement('style');
    previewStyleEl.id = 'content-blocker-preview-style';
    document.head.appendChild(previewStyleEl);
  }
  previewSelectors.add(selector);
  previewStyleEl.textContent = buildStyleText([...previewSelectors]);
}

function restoreSelector(selector) {
  previewSelectors.delete(selector);
  if (previewStyleEl) {
    previewStyleEl.textContent = buildStyleText([...previewSelectors]);
    if (previewSelectors.size === 0) {
      previewStyleEl.remove();
      previewStyleEl = null;
    }
  }
}

function restoreAllPreviews() {
  previewSelectors.clear();
  if (previewStyleEl) {
    previewStyleEl.remove();
    previewStyleEl = null;
  }
}

// ========== 高亮功能 ==========
function highlightSelector(selector) {
  highlightedSelectors.add(selector);
  applyHighlights();
  // 滚动到第一个匹配元素
  try {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {}
}

function unhighlightSelector(selector) {
  highlightedSelectors.delete(selector);
  applyHighlights();
}

function unhighlightAll() {
  highlightedSelectors.clear();
  applyHighlights();
}

function applyHighlights() {
  if (!highlightStyleEl) {
    highlightStyleEl = document.createElement('style');
    highlightStyleEl.id = 'content-blocker-highlight-style';
    document.head.appendChild(highlightStyleEl);
  }

  if (highlightedSelectors.size === 0) {
    highlightStyleEl.textContent = '';
    // 清除所有已有的高亮属性
    document.querySelectorAll('[data-cb-highlight]').forEach(el => {
      el.removeAttribute('data-cb-highlight');
    });
    return;
  }

  // 为每个需要高亮的选择器生成唯一标记类
  highlightCounter++;
  const cssParts = [];
  const allSelectors = [...highlightedSelectors];

  allSelectors.forEach((sel, i) => {
    const colorIndex = i % 6;
    const colors = ['#e74c3c', '#e67e22', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c'];
    const color = colors[colorIndex];
    cssParts.push(`
      ${sel} {
        outline: 3px dashed ${color} !important;
        outline-offset: 2px !important;
        background-color: ${color}18 !important;
      }
    `);
  });

  highlightStyleEl.textContent = cssParts.join('\n');
}

// ========== 消息监听 ==========
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'preview':
      previewSelector(msg.selector);
      sendResponse({ ok: true });
      break;
    case 'restore':
      restoreSelector(msg.selector);
      sendResponse({ ok: true });
      break;
    case 'restoreAll':
      restoreAllPreviews();
      sendResponse({ ok: true });
      break;
    case 'highlight':
      highlightSelector(msg.selector);
      sendResponse({ ok: true });
      break;
    case 'unhighlight':
      unhighlightSelector(msg.selector);
      sendResponse({ ok: true });
      break;
    case 'unhighlightAll':
      unhighlightAll();
      sendResponse({ ok: true });
      break;
    case 'getTree':
      sendResponse(buildDomTree());
      break;
  }
  return true;
});

// 获取元素可见文本（前 maxLen 个字符）
function getVisibleText(el, maxLen) {
  let text = '';
  for (const child of el.childNodes) {
    if (child.nodeType === 3) {
      const t = child.textContent.replace(/\s+/g, ' ').trim();
      if (t) text += t;
    }
    if (text.length >= maxLen) break;
  }
  return text.slice(0, maxLen);
}

function getActiveSelectors() {
  return rules.filter(r => r.enabled !== false).map(r => r.selector);
}

function buildDomTree() {
  const nodes = [];
  const MAX_DEPTH = 8;
  const MAX_NODES = 200;
  const activeSelectors = getActiveSelectors();

  function isBlocked(el) {
    for (const sel of activeSelectors) {
      try { if (el.matches(sel) || el.closest(sel)) return true; } catch (e) {}
    }
    return false;
  }

  function walk(el, depth) {
    if (depth > MAX_DEPTH || nodes.length >= MAX_NODES) return;
    if (el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    const id = el.id || null;
    const classes = el.classList.length > 0 ? [...el.classList] : [];
    const text = getVisibleText(el, 4);
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'meta' || tag === 'link') return;
    nodes.push({ tag, id, classes, text, depth, blocked: isBlocked(el) });
    for (const child of el.children) walk(child, depth + 1);
  }

  walk(document.body, 0);
  return nodes;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.rules) {
    const allRules = changes.rules.newValue || [];
    rules = allRules.filter(r => r.domain === currentDomain);
    applyRules();
  }
});

loadRules();

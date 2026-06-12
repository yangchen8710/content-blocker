// popup.js - Content Blocker Popup
// 悬停即高亮页面元素，直观定位选择器

let rules = [];
let currentDomain = '';
let currentTabId = null;
let treeNodes = [];
let previewedSelectors = new Set();
let highlightedSelectors = new Set();
let collapsedGroups = new Set();
let manualPreviewedSelector = null;

// ========== 获取当前标签页信息 ==========
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
    if (tab.url) {
      try { currentDomain = new URL(tab.url).hostname; } catch (e) { currentDomain = ''; }
    }
  }
  document.getElementById('domainLabel').textContent = currentDomain || '(无法获取域名)';
}

// ========== 数据加载 ==========
async function loadRules() {
  const result = await chrome.storage.local.get('rules');
  const allRules = result.rules || [];
  rules = allRules.filter(r => r.domain === currentDomain);
  renderRules();
  updateBadge(allRules);
}

async function saveRules() {
  const result = await chrome.storage.local.get('rules');
  const allRules = (result.rules || []).filter(r => r.domain !== currentDomain);
  const merged = [...allRules, ...rules];
  await chrome.storage.local.set({ rules: merged });
  updateBadge(merged);
}

// ========== 获取手动输入的完整选择器 ==========
function getManualSelector() {
  const type = document.getElementById('typeSelect').value;
  const input = document.getElementById('selectorInput').value.trim();
  if (!input) return null;
  let selector;
  if (type === '') { selector = input; }
  else { const clean = input.replace(/^[.#]/, ''); selector = type + clean; }
  return selector;
}

// ========== 添加规则 ==========
document.getElementById('addBtn').addEventListener('click', async () => {
  const selector = getManualSelector();
  if (!selector) return;
  if (rules.some(r => r.selector === selector)) { alert('该规则已存在'); return; }
  rules.push({ id: Date.now().toString(), domain: currentDomain, selector, enabled: true });
  document.getElementById('selectorInput').value = '';
  await saveRules();
  renderRules();
  updateManualStatus();
});

// ========== 手动测试/恢复 ==========
document.getElementById('manualTestBtn').addEventListener('click', async () => {
  const selector = getManualSelector();
  if (!selector) return;
  if (manualPreviewedSelector && manualPreviewedSelector !== selector) {
    await restorePreview(manualPreviewedSelector);
  }
  if (previewedSelectors.has(selector)) {
    await restorePreview(selector);
    manualPreviewedSelector = null;
  } else {
    await testPreview(selector);
    manualPreviewedSelector = selector;
  }
  updateManualStatus();
});

document.getElementById('manualRestoreBtn').addEventListener('click', async () => {
  if (manualPreviewedSelector) { await restorePreview(manualPreviewedSelector); manualPreviewedSelector = null; }
  await restoreAllPreviews();
  updateManualStatus();
  if (treeNodes.length > 0) renderTree();
});

function updateManualStatus() {
  const status = document.getElementById('manualPreviewStatus');
  const btn = document.getElementById('manualTestBtn');
  if (manualPreviewedSelector && previewedSelectors.has(manualPreviewedSelector)) {
    status.textContent = '⏳ 正在测试: ' + manualPreviewedSelector;
    btn.textContent = '🔄 恢复';
  } else {
    status.textContent = '';
    btn.textContent = '👁 测试';
    manualPreviewedSelector = null;
  }
}

document.getElementById('selectorInput').addEventListener('input', () => {
  if (manualPreviewedSelector && getManualSelector() !== manualPreviewedSelector) {
    restorePreview(manualPreviewedSelector);
    manualPreviewedSelector = null;
    updateManualStatus();
  }
});

// ========== 扫描页面 DOM 树 ==========
document.getElementById('scanBtn').addEventListener('click', async () => {
  if (!currentTabId) return;
  await restoreAllPreviews();
  manualPreviewedSelector = null;
  updateManualStatus();
  await unhighlightAll();
  document.getElementById('scanBtn').textContent = '⏳ 扫描中...';
  document.getElementById('scanBtn').disabled = true;

  try {
    const results = await chrome.tabs.sendMessage(currentTabId, { action: 'getTree' });
    treeNodes = results || [];
    renderTree();
  } catch (e) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: buildDomTreeFallback
      });
      treeNodes = results[0].result || [];
      renderTree();
    } catch (e2) {
      document.getElementById('treeContainer').innerHTML = '<div class="empty">此页面无法扫描（可能是系统页面）</div>';
    }
  }

  document.getElementById('scanBtn').textContent = '🔍 扫描页面元素';
  document.getElementById('scanBtn').disabled = false;
});

function buildDomTreeFallback() {
  var MAX_DEPTH = 8, MAX_NODES = 200;
  function getVisibleText(el, maxLen) {
    var text = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child.nodeType === 3) {
        var t = child.textContent.replace(/\s+/g, ' ').trim();
        if (t) text += t;
      }
      if (text.length >= maxLen) break;
    }
    return text.slice(0, maxLen);
  }
  var nodes = [];
  function walk(el, depth) {
    if (depth > MAX_DEPTH || nodes.length >= MAX_NODES) return;
    if (el.nodeType !== 1) return;
    var tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'meta' || tag === 'link') return;
    var id = el.id || null;
    var classes = el.classList.length > 0 ? Array.from(el.classList) : [];
    var text = getVisibleText(el, 20);
    nodes.push({ tag: tag, id: id, classes: classes, text: text, depth: depth, blocked: false });
    for (var j = 0; j < el.children.length; j++) walk(el.children[j], depth + 1);
  }
  walk(document.body, 0);
  return nodes;
}

// ========== 渲染层级树 ==========
function renderTree() {
  const container = document.getElementById('treeContainer');
  const groupToggle = document.getElementById('groupToggle');
  if (!treeNodes || treeNodes.length === 0) {
    container.innerHTML = '<div class="empty">未找到元素</div>';
    return;
  }
  const blockedCount = treeNodes.filter(n => n.blocked).length;
  const badge = document.getElementById('blockedBadge');
  if (blockedCount > 0) { badge.textContent = '🚫 ' + blockedCount; badge.style.display = 'inline'; }
  else { badge.style.display = 'none'; }
  if (groupToggle.checked) renderGroupedTree(container);
  else renderFlatTree(container);
}

function renderGroupedTree(container) {
  const depthMap = {}, depthTags = {};
  treeNodes.forEach(node => {
    const d = node.depth;
    if (!depthMap[d]) { depthMap[d] = { selectors: new Map(), tags: new Set() }; }
    if (!depthTags[d]) depthTags[d] = new Set();
    node.classes.forEach(c => {
      if (c.length <= 30) {
        const sel = '.' + c;
        if (!depthMap[d].selectors.has(sel)) depthMap[d].selectors.set(sel, { texts: [], blocked: false });
        const entry = depthMap[d].selectors.get(sel);
        if (node.text) entry.texts.push(node.text);
        if (node.blocked) entry.blocked = true;
      }
    });
    if (node.id && node.id.length <= 30) {
      const sel = '#' + node.id;
      if (!depthMap[d].selectors.has(sel)) depthMap[d].selectors.set(sel, { texts: [], blocked: false });
      const entry = depthMap[d].selectors.get(sel);
      if (node.text) entry.texts.push(node.text);
      if (node.blocked) entry.blocked = true;
    }
    depthTags[d].add(node.tag);
  });

  const depths = Object.keys(depthMap).map(Number).sort((a, b) => a - b);
  let html = '';
  depths.forEach(depth => {
    const tags = [...(depthTags[depth] || [])].sort();
    const selectors = depthMap[depth].selectors;
    const isCollapsed = collapsedGroups.has('depth-' + depth);
    const blockedInGroup = [...selectors.values()].filter(v => v.blocked).length;
    html += `<div class="tree-group">
      <div class="tree-group-header" data-depth="${depth}">
        <span class="tree-arrow">${isCollapsed ? '▸' : '▾'}</span>
        <span class="tree-depth-badge">L${depth}</span>
        <span class="tree-group-info">${tags.slice(0, 5).join(', ')}</span>
        ${blockedInGroup > 0 ? `<span class="tree-blocked-badge">🚫${blockedInGroup}</span>` : ''}
        <span class="tree-group-count">${selectors.size} 选择器</span>
      </div>
      <div class="tree-group-body ${isCollapsed ? 'collapsed' : ''}">`;
    if (!isCollapsed) {
      selectors.forEach((entry, sel) => {
        const isAdded = rules.some(r => r.selector === sel);
        const isPreviewed = previewedSelectors.has(sel);
        const isHighlighted = highlightedSelectors.has(sel);
        const sampleText = [...new Set(entry.texts)].slice(0, 3).join(' · ');
        html += buildSelectorRow(sel, isAdded, isPreviewed, sampleText, entry.blocked, isHighlighted);
      });
    }
    html += `</div></div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.tree-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const depthKey = 'depth-' + header.dataset.depth;
      collapsedGroups.has(depthKey) ? collapsedGroups.delete(depthKey) : collapsedGroups.add(depthKey);
      renderTree();
    });
  });
  bindSelectorActions(container);
}

function renderFlatTree(container) {
  let html = '';
  treeNodes.forEach(node => {
    const indent = node.depth * 16;
    const selectors = [];
    if (node.id) selectors.push('#' + node.id);
    node.classes.forEach(c => selectors.push('.' + c));

    html += `<div class="tree-node ${node.blocked ? 'tree-node-blocked' : ''}" style="padding-left:${indent + 8}px"
      data-hover="${escapeAttr(selectors.join(','))}">
      <div class="tree-node-label">
        ${node.blocked ? '<span class="blocked-marker" title="已被屏蔽">🚫</span>' : ''}
        <span class="tree-node-tag">&lt;${node.tag}&gt;</span>
        ${node.id ? `<span class="tree-node-id">#${node.id}</span>` : ''}
        ${node.classes.slice(0, 3).map(c => `<span class="tree-node-class">.${c}</span>`).join(' ')}
        ${node.text ? `<span class="tree-node-text">"${escapeHtml(node.text)}"</span>` : ''}
      </div>`;
    if (selectors.length > 0) {
      html += `<div class="tree-node-actions">`;
      selectors.forEach(sel => {
        const isAdded = rules.some(r => r.selector === sel);
        const isPreviewed = previewedSelectors.has(sel);
        const isHighlighted = highlightedSelectors.has(sel);
        html += buildSelectorRow(sel, isAdded, isPreviewed, node.text || '', node.blocked, isHighlighted);
      });
      html += `</div>`;
    }
    html += `</div>`;
  });
  container.innerHTML = html;
  bindSelectorActions(container);
}

function buildSelectorRow(sel, isAdded, isPreviewed, textSample, isBlocked, isHighlighted) {
  let actionHtml = '';
  if (isAdded) {
    actionHtml = '<span class="badge-added">✓</span>';
  } else {
    actionHtml = `
      <button class="tree-btn highlight-btn" data-highlight="${escapeAttr(sel)}" title="点击固定在页面上高亮">
        ${isHighlighted ? '🔦' : '🔍'}
      </button>
      <button class="tree-btn test-btn" data-test="${escapeAttr(sel)}">
        ${isPreviewed ? '🔄' : '👁'}
      </button>
      <button class="tree-btn add-btn" data-add="${escapeAttr(sel)}">＋</button>`;
  }
  const textPart = textSample
    ? `<span class="sel-text" title="${escapeAttr(textSample)}">${escapeHtml(textSample)}</span>`
    : '';
  const rowClass = [];
  if (isPreviewed) rowClass.push('previewed');
  if (isBlocked) rowClass.push('blocked-row');
  if (isHighlighted) rowClass.push('highlighted-row');

  return `
    <div class="selector-row ${rowClass.join(' ')}" data-hover="${escapeAttr(sel)}">
      ${isBlocked ? '<span class="blocked-marker" title="该元素正被屏蔽">🚫</span>' : ''}
      <code class="sel ${isBlocked ? 'sel-blocked' : ''}">${escapeHtml(sel)}</code>
      ${textPart}
      <div class="sel-actions">${actionHtml}</div>
    </div>`;
}

function bindSelectorActions(container) {
  // ===== 悬停高亮 =====
  container.querySelectorAll('[data-hover]').forEach(el => {
    el.addEventListener('mouseenter', async () => {
      const sel = el.dataset.hover;
      if (!sel || highlightedSelectors.has(sel)) return;
      try { await chrome.tabs.sendMessage(currentTabId, { action: 'hoverOn', selector: sel }); } catch (e) {}
    });
    el.addEventListener('mouseleave', async () => {
      const sel = el.dataset.hover;
      if (!sel || highlightedSelectors.has(sel)) return;
      try { await chrome.tabs.sendMessage(currentTabId, { action: 'hoverOff' }); } catch (e) {}
    });
  });

  container.querySelectorAll('.highlight-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sel = btn.dataset.highlight;
      if (highlightedSelectors.has(sel)) { await unhighlight(sel); }
      else { await highlight(sel); }
      renderTree();
    });
  });
  container.querySelectorAll('.test-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sel = btn.dataset.test;
      if (previewedSelectors.has(sel)) { await restorePreview(sel); }
      else { await testPreview(sel); }
      renderTree();
    });
  });
  container.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sel = btn.dataset.add;
      if (rules.some(r => r.selector === sel)) return;
      rules.push({ id: Date.now().toString(), domain: currentDomain, selector: sel, enabled: true });
      await saveRules();
      renderRules();
      renderTree();
    });
  });
}

// ========== 高亮 ==========
async function highlight(selector) {
  if (!currentTabId) return;
  try { await chrome.tabs.sendMessage(currentTabId, { action: 'highlight', selector }); highlightedSelectors.add(selector); } catch (e) {}
}

async function unhighlight(selector) {
  if (!currentTabId) return;
  try { await chrome.tabs.sendMessage(currentTabId, { action: 'unhighlight', selector }); } catch (e) {}
  highlightedSelectors.delete(selector);
}

async function unhighlightAll() {
  if (!currentTabId || highlightedSelectors.size === 0) return;
  try { await chrome.tabs.sendMessage(currentTabId, { action: 'unhighlightAll' }); } catch (e) {}
  highlightedSelectors.clear();
}

// ========== 测试/恢复 ==========
async function testPreview(selector) {
  if (!currentTabId) return;
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'preview', selector });
    previewedSelectors.add(selector);
  } catch (e) {
    try { await chrome.scripting.insertCSS({ target: { tabId: currentTabId }, css: `${selector}{display:none!important;visibility:hidden!important;}` }); previewedSelectors.add(selector); } catch (e2) {}
  }
}

async function restorePreview(selector) {
  if (!currentTabId) return;
  try { await chrome.tabs.sendMessage(currentTabId, { action: 'restore', selector }); } catch (e) {}
  previewedSelectors.delete(selector);
}

async function restoreAllPreviews() {
  if (!currentTabId || previewedSelectors.size === 0) return;
  try { await chrome.tabs.sendMessage(currentTabId, { action: 'restoreAll' }); } catch (e) {}
  previewedSelectors.clear();
}

// ========== 恢复全部 ==========
document.getElementById('groupToggle').addEventListener('change', () => renderTree());
document.getElementById('restoreAllBtn').addEventListener('click', async () => {
  await restoreAllPreviews();
  manualPreviewedSelector = null;
  updateManualStatus();
  await unhighlightAll();
  renderTree();
});

// popup 关闭时清理悬停高亮
window.addEventListener('unload', async () => {
  try { await chrome.tabs.sendMessage(currentTabId, { action: 'hoverOff' }); } catch (e) {}
});

// ========== 渲染规则列表 ==========
function renderRules() {
  const list = document.getElementById('ruleList');
  document.getElementById('ruleCount').textContent = rules.length;
  if (rules.length === 0) { list.innerHTML = '<div class="empty">暂无规则</div>'; return; }
  list.innerHTML = rules.map(r => `
    <div class="rule-item">
      <span class="sel" style="${r.enabled === false ? 'text-decoration:line-through;color:#ccc' : ''}">${r.selector}</span>
      <div class="actions">
        <button class="toggle-btn ${r.enabled === false ? 'off' : ''}" data-id="${r.id}">${r.enabled === false ? '关' : '开'}</button>
        <button class="del-btn" data-id="${r.id}">✕</button>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rule = rules.find(r => r.id === btn.dataset.id);
      if (rule) { rule.enabled = !(rule.enabled !== false); await saveRules(); renderRules(); }
    });
  });
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      rules = rules.filter(r => r.id !== btn.dataset.id);
      await saveRules(); renderRules();
    });
  });
}

function updateBadge(allRules) {
  const activeCount = allRules.filter(r => r.enabled !== false).length;
  chrome.action.setBadgeText({ text: activeCount > 0 ? String(activeCount) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#4a6cf7' });
}

document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str) { return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

(async () => { await getCurrentTab(); await loadRules(); })();

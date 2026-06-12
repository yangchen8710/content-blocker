// options.js - Content Blocker 管理页面（按站点）

let rules = [];
let editingId = null;
let filterDomain = 'all'; // 'all' 或具体域名

// ========== 数据加载 ==========
async function loadRules() {
  const result = await chrome.storage.local.get('rules');
  rules = result.rules || [];
  buildDomainFilter();
  renderAll();
}

async function saveRules() {
  await chrome.storage.local.set({ rules });
  buildDomainFilter();
  renderAll();
  showToast('已保存');
}

// ========== 构建域名过滤下拉 ==========
function buildDomainFilter() {
  const domains = [...new Set(rules.map(r => r.domain).filter(Boolean))].sort();
  const sel = document.getElementById('domainFilter');
  const prev = sel.value;
  sel.innerHTML = '<option value="all">全部站点</option>';
  domains.forEach(d => {
    sel.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)} (${rules.filter(r => r.domain === d).length})</option>`;
  });
  sel.value = prev || 'all';
}

// ========== 获取过滤后的规则 ==========
function filteredRules() {
  if (filterDomain === 'all') return rules;
  return rules.filter(r => r.domain === filterDomain);
}

// ========== 渲染全部 ==========
function renderAll() {
  renderTable();
  updateStats();
}

// ========== 渲染表格（按域名分组） ==========
function renderTable() {
  const tbody = document.getElementById('ruleTableBody');
  const empty = document.getElementById('emptyState');
  const filtered = filteredRules();

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // 按域名分组
  const groups = {};
  filtered.forEach(r => {
    const domain = r.domain || '(无域名)';
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(r);
  });

  let html = '';
  for (const [domain, domainRules] of Object.entries(groups)) {
    html += `<tr><td colspan="3" style="background:#f0f3ff;font-weight:600;font-size:12px;color:#4a6cf7;padding:8px 14px;">🌐 ${escapeHtml(domain)} (${domainRules.length})</td></tr>`;
    domainRules.forEach(r => {
      html += `
        <tr>
          <td class="sel-cell ${r.enabled === false ? 'disabled-text' : ''}" style="padding-left:24px;">${escapeHtml(r.selector)}</td>
          <td>
            <label class="toggle">
              <input type="checkbox" ${r.enabled !== false ? 'checked' : ''} data-id="${r.id}">
              <span class="slider"></span>
            </label>
          </td>
          <td class="actions">
            <button class="btn btn-sm btn-outline edit-btn" data-id="${r.id}">编辑</button>
            <button class="btn btn-sm del-btn" data-id="${r.id}" style="background:none;color:#e74c3c;border:none;cursor:pointer">✕</button>
          </td>
        </tr>`;
    });
  }

  tbody.innerHTML = html;

  // 开关事件
  tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const rule = rules.find(r => r.id === cb.dataset.id);
      if (rule) {
        rule.enabled = cb.checked;
        await saveRules();
      }
    });
  });

  // 编辑事件
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });

  // 删除事件
  tbody.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('确定删除这条规则？')) return;
      rules = rules.filter(r => r.id !== btn.dataset.id);
      await saveRules();
    });
  });
}

// ========== 更新统计 ==========
function updateStats() {
  document.getElementById('totalCount').textContent = rules.length;
  document.getElementById('activeCount').textContent = rules.filter(r => r.enabled !== false).length;
}

// ========== 域名过滤 ==========
document.getElementById('domainFilter').addEventListener('change', (e) => {
  filterDomain = e.target.value;
  renderAll();
});

// ========== 添加规则 ==========
document.getElementById('addBtn').addEventListener('click', async () => {
  const domain = document.getElementById('newDomain').value.trim();
  const raw = document.getElementById('newSelector').value.trim();
  if (!domain || !raw) {
    showToast('请输入域名和选择器');
    return;
  }

  const selectors = raw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
  let added = 0;

  for (const sel of selectors) {
    let selector = sel;
    if (!selector.startsWith('.') && !selector.startsWith('#')) {
      selector = '.' + selector;
    }
    if (!rules.some(r => r.domain === domain && r.selector === selector)) {
      rules.push({ id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6), domain, selector, enabled: true });
      added++;
    }
  }

  if (added > 0) {
    document.getElementById('newSelector').value = '';
    await saveRules();
    showToast(`已添加 ${added} 条规则到 ${domain}`);
  } else {
    showToast('规则已存在或输入无效');
  }
});

// 回车添加
document.getElementById('newSelector').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('addBtn').click();
});

// ========== 编辑模态框 ==========
function openEditModal(id) {
  const rule = rules.find(r => r.id === id);
  if (!rule) return;
  editingId = id;
  document.getElementById('editDomain').value = rule.domain;
  document.getElementById('editSelector').value = rule.selector;
  document.getElementById('editModal').classList.add('show');
}

document.getElementById('cancelEdit').addEventListener('click', () => {
  document.getElementById('editModal').classList.remove('show');
  editingId = null;
});

document.getElementById('saveEdit').addEventListener('click', async () => {
  const newDomain = document.getElementById('editDomain').value.trim();
  const newSelector = document.getElementById('editSelector').value.trim();
  if (!newDomain || !newSelector) return;

  const rule = rules.find(r => r.id === editingId);
  if (rule) {
    rule.domain = newDomain;
    rule.selector = newSelector;
    await saveRules();
  }
  document.getElementById('editModal').classList.remove('show');
  editingId = null;
  showToast('规则已更新');
});

// ========== 批量操作 ==========
document.getElementById('enableAllBtn').addEventListener('click', async () => {
  const target = filterDomain === 'all' ? rules : rules.filter(r => r.domain === filterDomain);
  target.forEach(r => r.enabled = true);
  await saveRules();
  showToast('已全部启用');
});

document.getElementById('disableAllBtn').addEventListener('click', async () => {
  const target = filterDomain === 'all' ? rules : rules.filter(r => r.domain === filterDomain);
  target.forEach(r => r.enabled = false);
  await saveRules();
  showToast('已全部禁用');
});

document.getElementById('deleteDomainBtn').addEventListener('click', async () => {
  if (filterDomain === 'all') {
    if (!confirm('确定删除全部站点的所有规则？此操作不可撤销。')) return;
    rules = [];
  } else {
    if (!confirm(`确定删除 ${filterDomain} 下的全部规则？此操作不可撤销。`)) return;
    rules = rules.filter(r => r.domain !== filterDomain);
  }
  await saveRules();
  showToast('已删除');
});

// ========== 导入/导出 ==========
document.getElementById('exportBtn').addEventListener('click', () => {
  const data = filterDomain === 'all' ? rules : rules.filter(r => r.domain === filterDomain);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const label = filterDomain === 'all' ? 'all' : filterDomain.replace(/[^a-z0-9]/gi, '_');
  a.download = `content-blocker-${label}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error('格式错误');

    let added = 0, skipped = 0;
    for (const item of imported) {
      if (!item.selector || !item.domain) continue;
      if (rules.some(r => r.domain === item.domain && r.selector === item.selector)) {
        skipped++;
        continue;
      }
      rules.push({
        id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6),
        domain: item.domain,
        selector: item.selector,
        enabled: item.enabled !== false
      });
      added++;
    }
    await saveRules();
    showToast(`导入完成：新增 ${added} 条，跳过 ${skipped} 条`);
  } catch (err) {
    alert('导入失败：JSON 格式不正确');
  }
  e.target.value = '';
});

// ========== 工具函数 ==========
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ========== 初始化 ==========
loadRules();

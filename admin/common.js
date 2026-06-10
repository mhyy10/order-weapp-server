const API = '';  // 同域，相对路径
let adminToken = localStorage.getItem('adminToken') || '';

async function api(method, path, data) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (adminToken) opts.headers['Authorization'] = adminToken;
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(API + path, opts);
  const json = await res.json();
  if (json.code === -1) throw new Error(json.msg);
  return json.data;
}

// 通用表格渲染
function renderTable(containerId, headers, rows, rowFn) {
  const c = document.getElementById(containerId);
  if (!rows || rows.length === 0) { c.innerHTML = '<div class="empty"><p>暂无数据</p></div>'; return; }
  let html = '<table><thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(row => { html += '<tr>' + rowFn(row) + '</tr>'; });
  html += '</tbody></table>';
  c.innerHTML = html;
}

// 日期格式化
function fmtDate(d) { return d ? new Date(d).toLocaleString('zh-CN') : '-'; }
function fmtPrice(p) { return '¥' + (p || 0).toFixed(2); }

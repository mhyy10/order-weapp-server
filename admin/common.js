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

// 分页导航渲染
function renderPagination(containerId, total, page, pageSize, onChange) {
  const c = document.getElementById(containerId);
  const totalPages = Math.ceil(total / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  let html = '<div class="pagination">';
  html += `<span class="page-info">共 ${total} 条，第 ${currentPage}/${totalPages} 页</span>`;
  html += `<button class="btn btn-sm btn-outline" ${currentPage <= 1 ? 'disabled' : ''} onclick="${onChange}(${currentPage - 1})">上一页</button>`;

  // 页码按钮
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
  if (startPage > 1) {
    html += `<button class="btn btn-sm btn-outline" onclick="${onChange}(1)">1</button>`;
    if (startPage > 2) html += '<span class="page-ellipsis">...</span>';
  }
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline'}" onclick="${onChange}(${i})">${i}</button>`;
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += '<span class="page-ellipsis">...</span>';
    html += `<button class="btn btn-sm btn-outline" onclick="${onChange}(${totalPages})">${totalPages}</button>`;
  }

  html += `<button class="btn btn-sm btn-outline" ${currentPage >= totalPages ? 'disabled' : ''} onclick="${onChange}(${currentPage + 1})">下一页</button>`;
  html += '</div>';
  c.innerHTML += html;
}

// 日期格式化
function fmtDate(d) { return d ? new Date(d).toLocaleString('zh-CN') : '-'; }
function fmtPrice(p) { return '¥' + (p || 0).toFixed(2); }

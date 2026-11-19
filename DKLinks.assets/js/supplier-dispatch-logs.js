(function () {
  'use strict';
  const form = document.getElementById('supplierDispatchLogsForm');
  const body = document.getElementById('supplierDispatchLogsRows');
  let returnPage = 'leads';
  let returnDetail = null;
  let returnFocus = null;
  let returnScroll = 0;
  let initialLead = '';
  let page = 1;
  let scope = null;
  let applied = {schedule:'', supplier:'', lead:'', result:''};
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function readFilters() {
    const filters = Object.fromEntries(new FormData(form));
    return scope ? Object.assign(filters, scope) : filters;
  }
  function render() {
    const filters = applied;
    const includes = (value, query) => String(value).toLowerCase().includes(String(query).trim().toLowerCase());
    const rows = getSupplierDispatchLogs().filter(row =>
      (scope ? row.schedule === scope.schedule && row.supplier === scope.supplier :
        includes(row.schedule, filters.schedule) && includes(row.supplier, filters.supplier)) &&
      (initialLead && filters.lead.trim() === initialLead
        ? row.originalId === initialLead || row.leadId === initialLead
        : includes(row.originalId, filters.lead) || includes(row.leadId, filters.lead)) &&
      (!filters.result || row.result === filters.result));
    document.getElementById('supplierDispatchLogsCount').textContent = '共 ' + rows.length + ' 条';
    const size = Number(document.getElementById('supplierDispatchLogsSize').value);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    page = Math.min(page, pages);
    const offset = (page - 1) * size;
    document.getElementById('supplierDispatchLogsPageInfo').textContent = '共 ' + rows.length + ' 条数据';
    document.getElementById('supplierDispatchLogsPrevious').disabled = page === 1;
    document.getElementById('supplierDispatchLogsNext').disabled = page === pages;
    const visiblePages = new Set([1, pages]);
    for (let n = Math.max(1, page - 1); n <= Math.min(pages, page + 1); n++) visiblePages.add(n);
    if (page <= 3) [1, 2, 3].filter(n => n <= pages).forEach(n => visiblePages.add(n));
    if (pages - page <= 2) [pages - 2, pages - 1].filter(n => n > 0).forEach(n => visiblePages.add(n));
    let previous = 0;
    const buttons = [];
    Array.from(visiblePages).sort((a, b) => a - b).forEach(n => {
      if (previous && n - previous > 1) buttons.push('<span class="pagination-btn dispatch-page-ellipsis" aria-hidden="true">…</span>');
      buttons.push('<button type="button" class="pagination-btn' + (n === page ? ' active' : '') +
        '" data-log-page="' + n + '" aria-label="第 ' + n + ' 页"' +
        (n === page ? ' aria-current="page"' : '') + '>' + n + '</button>');
      previous = n;
    });
    document.getElementById('supplierDispatchLogsPages').innerHTML = buttons.join('');
    body.innerHTML = rows.length ? rows.slice(offset, offset + size).map(row => '<tr><td>' + esc(row.at) +
      '</td><td>' + esc(row.schedule) + '<div class="form-hint">' + esc(row.supplier) +
      '</div></td><td>' + esc(row.originalId) + '</td><td>' + esc(row.leadId) +
      '</td><td>' + esc(row.origin) + '<div class="form-hint">' + esc(row.store) +
      '</div></td><td>' + esc(row.result) + '</td><td>已锁 ' + esc(row.count) + '／分配 ' + esc(row.target) +
      ' 台<div class="form-hint">' + esc(row.rule) + (row.slot === '—' ? '' : ' · ' + esc(row.slot)) + '</div><div class="form-hint">' +
      (row.reason === row.result ? '' : esc(row.reason)) + '</div></td><td>' +
      (row.leadId === '—' ? '—' : '<button class="btn btn-secondary btn-sm" type="button" data-log-lead="' +
        esc(row.leadId) + '">查看线索</button>') + '</td></tr>').join('') :
      '<tr><td colspan="8" style="padding:32px;text-align:center;">没有匹配的下发记录</td></tr>';
  }
  window.openSupplierDispatchLogs = function (leadId, context) {
    const current = document.querySelector('.page.active');
    if (current?.id === 'page-lead-detail' && typeof getLeadDetailReturnContext === 'function' && getLeadDetailReturnContext().page === 'supplier-dispatch-logs') {
      returnFromLeadDetail();
      return;
    }
    if (current && current.id !== 'page-supplier-dispatch-logs') {
      returnPage = current.id.replace('page-', '');
      returnFocus = current.contains?.(document.activeElement) ? document.activeElement : null;
      returnScroll = window.scrollY || 0;
      returnDetail = returnPage === 'lead-detail' && typeof getLeadDetailReturnContext === 'function'
        ? {id:document.getElementById('leadDetailSummaryCode').textContent, context:getLeadDetailReturnContext()}
        : null;
    }
    initialLead = leadId || '';
    document.getElementById('supplierDispatchLogsBack').textContent = returnPage === 'lead-detail' ? '返回线索详情' : returnPage === 'schedule-supplier-goals' ? '返回达标情况' : '返回列表';
    scope = context && context.schedule && context.supplier ?
      {schedule: context.schedule, supplier: context.supplier} : null;
    ['schedule', 'supplier'].forEach(function (key) {
      form.elements[key].closest('label').hidden = !!scope;
      form.elements[key].disabled = !!scope;
    });
    form.classList.toggle('has-fixed-scope', !!scope);
    form.reset();
    form.elements.lead.value = leadId || '';
    if (context) {
      form.elements.schedule.value = context.schedule || '';
      form.elements.supplier.value = context.supplier || '';
    }
    applied = readFilters();
    page = 1;
    render();
    navigateTo('supplier-dispatch-logs');
  };
  window.returnFromSupplierDispatchLogs = function () {
    if (!returnDetail || !openLeadDetailById(returnDetail.id, returnDetail.context)) navigateTo(returnPage);
    window.scrollTo?.(0, returnScroll);
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  };
  form.addEventListener('submit', function (event) { event.preventDefault(); applied = readFilters(); page = 1; render(); });
  form.addEventListener('reset', function () { queueMicrotask(function () { applied = readFilters(); page = 1; render(); }); });
  document.getElementById('supplierDispatchLogsSize').addEventListener('change', function () { page = 1; render(); });
  document.getElementById('supplierDispatchLogsPages').addEventListener('click', function (event) {
    const button = event.target.closest('[data-log-page]');
    if (!button) return;
    page = Number(button.dataset.logPage);
    render();
  });
  document.getElementById('supplierDispatchLogsPrevious').addEventListener('click', function () { page = Math.max(1, page - 1); render(); });
  document.getElementById('supplierDispatchLogsNext').addEventListener('click', function () { page++; render(); });
  body.addEventListener('click', function (event) {
    const button = event.target.closest('[data-log-lead]');
    if (button && !openLeadDetailById(button.dataset.logLead)) showToast('该线索详情暂不可用', 'warning');
  });
})();

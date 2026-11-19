/* Read-only lock entry trace. Fraud review and its mutable conclusions remain independent. */
(function () {
  'use strict';
  const form = document.getElementById('lockEntriesForm');
  const rows = [];
  const sample = scheduleData.find(item => item.id === 'supplier-goal-review');
  if (sample) {
    sample.suppliers.forEach((supplier, index) => {
      const count = index === 0 ? 3 : 4;
      for (let n = 1; n <= count; n++) {
        const code = 'GOAL-LOCK-' + (index === 0 ? 'A' : 'B') + '-00' + n;
        rows.push({lockId:'LOCK-' + code, leadId:code, originalId:code, scheduleId:sample.id,
          scheduleName:sample.name, supplierId:supplier.accountId, supplierName:supplier.accountName || supplier.accountId,
          origin:'original', store:'X 店', receivedAt:'2026-11-17 08:' + String(10 + index * 10 + n).padStart(2,'0'), recordedAt:'2026-11-18 09:' + String(10 + index * 10 + n).padStart(2,'0'), phone:'138****0000'});
      }
    });
    const supplier = sample.suppliers[0];
    rows.push({lockId:'LOCK-GOAL-DERIVED-001', leadId:'GOAL-LOCK-A-001-1', originalId:'GOAL-LOCK-A-001',
      scheduleId:sample.id, scheduleName:sample.name, supplierId:supplier.accountId, supplierName:supplier.accountName || supplier.accountId,
      origin:'derived', store:'B 店', receivedAt:'2026-11-17 08:11', recordedAt:'2026-11-18 09:45', phone:'138****0000'});
  }
  let scope = null, page = 1, filtered = {schedule:'',supplier:'',origin:'',keyword:''};
  function esc(value) { return escapeHTML(String(value == null ? '—' : value)); }
  function fields() {
    return {schedule:form.elements.schedule.value, supplier:form.elements.supplier.value,
      origin:form.elements.origin.value, keyword:form.elements.keyword.value.trim().toLowerCase()};
  }
  function matching() {
    const seen = new Set();
    return rows.filter(row => {
      if (seen.has(row.lockId)) return false;
      seen.add(row.lockId);
      return (!scope || row.scheduleId === scope.scheduleId && row.supplierId === scope.supplierId && row.origin === 'original') &&
        (scope || !filtered.schedule || row.scheduleId === filtered.schedule) &&
        (scope || !filtered.supplier || row.supplierId === filtered.supplier) &&
        (scope || !filtered.origin || row.origin === filtered.origin) &&
        (!filtered.keyword || [row.lockId,row.leadId,row.originalId].some(value => value.toLowerCase().includes(filtered.keyword)));
    }).sort((a,b) => b.recordedAt.localeCompare(a.recordedAt));
  }
  function render() {
    const result = matching(), size = Number(document.getElementById('lockEntriesPageSize').value);
    const pages = Math.max(1,Math.ceil(result.length / size)); page = Math.max(1,Math.min(page,pages));
    document.getElementById('lockEntriesRows').innerHTML = result.length ? result.slice((page-1)*size,page*size).map(row =>
      '<tr><td class="lock-entry-code">' + esc(row.lockId) + '</td><td>' + esc(row.scheduleName) + '<div class="form-hint">' + esc(row.supplierName) +
      '</div></td><td><button type="button" class="lock-entry-count-link" data-lock-entry-lead="' + esc(row.leadId) + '">' + esc(row.leadId) +
      '</button>' + (row.origin === 'derived' ? '<div class="form-hint">原线索 ' + esc(row.originalId) + '</div>' : '') +
      '</td><td>' + esc(row.store) + '</td><td><span class="lock-entry-origin' + (row.origin === 'derived' ? ' is-derived' : '') + '">' +
      (row.origin === 'derived' ? '平台派生' : '供应商原传') + '</span></td><td>' +
      (row.origin === 'derived' ? '平台派生统计<div class="form-hint">不计入供应商达标量</div>' : '供应商达标量<div class="form-hint">计入 ' + esc(row.supplierName) + '</div>') +
      '</td><td class="lock-entry-time">' + esc(row.recordedAt) + '</td><td><button class="btn btn-secondary btn-sm" type="button" data-lock-entry-lead="' +
      esc(row.leadId) + '">线索详情</button></td></tr>').join('') :
      '<tr><td colspan="8" class="lock-entry-empty">暂无对应锁单记录' + (scope && scope.expected > 0 && !rows.some(row => row.scheduleId === scope.scheduleId && row.supplierId === scope.supplierId && row.origin === 'original') ? '<p class="form-hint">该供应商的锁单明细尚未接入。</p>' : '') + '</td></tr>';
    document.getElementById('lockEntriesPageInfo').textContent = '共 ' + result.length + ' 条数据';
    document.getElementById('lockEntriesPrevious').disabled = page === 1;
    document.getElementById('lockEntriesNext').disabled = page === pages;
    const visible = new Set([1,pages]);
    for (let n=Math.max(1,page-1);n<=Math.min(pages,page+1);n++) visible.add(n);
    let prior=0;
    document.getElementById('lockEntriesPages').innerHTML = Array.from(visible).sort((a,b)=>a-b).map(n => {
      const gap=prior && n-prior>1 ? '<span class="pagination-btn" aria-hidden="true">…</span>' : ''; prior=n;
      return gap + '<button type="button" class="pagination-btn' + (n===page?' active':'') + '" data-lock-entry-page="' + n + '"' +
        (n===page?' aria-current="page"':'') + '>' + n + '</button>';
    }).join('');
  }
  function context() {
    document.getElementById('lockEntriesBack').hidden = !scope;
    document.getElementById('lockAuditReviewTab').hidden = !!scope;
    ['schedule','supplier','origin'].forEach(key => {
      const field=form.elements[key];field.closest('label').hidden=!!scope;field.disabled=!!scope;
    });
    form.classList.toggle('has-fixed-scope',!!scope);
    document.getElementById('lockAuditPageSubtitle').textContent = scope ?
      scope.scheduleName + ' · ' + scope.supplierName + ' · 计入供应商达标量的原传有效锁单' :
      '查询锁单入库记录与统计归属，或按规则排查疑似异常锁单';
  }
  window.switchLockAuditPanel = function (panel) {
    if (scope && panel !== 'entries') return;
    const entries=panel==='entries';
    document.getElementById('lockAuditEntriesPanel').hidden=!entries;
    document.getElementById('lockAuditReviewPanel').hidden=entries;
    ['Entries','Review'].forEach(name => {
      const active=entries === (name==='Entries'),tab=document.getElementById('lockAudit'+name+'Tab');
      tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));
    });
    if(entries) render();
  };
  window.openLockAuditHome = function () {
    scope=null;context();switchLockAuditPanel('review');navigateTo('lock-audit');
  };
  window.openSupplierLockEntries = function (scheduleId,index) {
    const s=scheduleData.find(item=>item.id===scheduleId),supplier=s?.suppliers?.[index];
    if(!supplier) return;
    scope={scheduleId:s.id,scheduleName:s.name,supplierId:supplier.accountId,supplierName:supplier.accountName || supplier.accountId,expected:supplier.lockSnapshot?.count};
    ['schedule','supplier','origin','keyword'].forEach(key=>form.elements[key].value='');
    filtered=fields();page=1;context();switchLockAuditPanel('entries');navigateTo('lock-audit');
  };
  window.returnFromLockEntries = function () { if(scope) openScheduleSupplierGoals(scope.scheduleId); };
  const scheduleSelect=form.elements.schedule,supplierSelect=form.elements.supplier;
  const schedules=new Map(),suppliers=new Map();rows.forEach(row=>{schedules.set(row.scheduleId,row.scheduleName);suppliers.set(row.supplierId,row.supplierName);});
  scheduleSelect.innerHTML='<option value="">全部排期</option>'+Array.from(schedules,([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
  supplierSelect.innerHTML='<option value="">全部供应商</option>'+Array.from(suppliers,([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
  form.addEventListener('submit',event=>{event.preventDefault();filtered=fields();page=1;render();});
  form.addEventListener('reset',()=>queueMicrotask(()=>{filtered=fields();page=1;render();}));
  document.getElementById('lockEntriesPageSize').addEventListener('change',()=>{page=1;render();});
  document.getElementById('lockEntriesPrevious').addEventListener('click',()=>{page--;render();});
  document.getElementById('lockEntriesNext').addEventListener('click',()=>{page++;render();});
  document.getElementById('lockEntriesPages').addEventListener('click',event=>{
    const button=event.target.closest('[data-lock-entry-page]');if(button){page=Number(button.dataset.lockEntryPage);render();}
  });
  document.getElementById('lockEntriesRows').addEventListener('click',event=>{
    const button=event.target.closest('[data-lock-entry-lead]');
    if(button && !openLeadDetailById(button.dataset.lockEntryLead))showToast('该线索详情尚未接入','warning');
  });
  rows.forEach(row=>{
    leadDetailExamples[row.leadId]={code:row.leadId,customerName:'锁单样例客户',phone:row.phone,gender:'未记录',area:'未记录',
      apiKey:row.supplierName,sourceId:row.leadId,levelHtml:'—',receiveTime:row.receivedAt,scheduleName:row.scheduleName,scheduleId:row.scheduleId,brand:'东风日产',vehicle:'未记录',budget:'未记录',buyTime:'未记录',
      store:row.store,statusHtml:'<span class="status-badge status-active">已锁单</span>',receiveResult:'历史接收依据未记录',dispatchDecision:'历史下发回执未记录',
      blacklistCheck:'历史结果未记录',interceptCheck:'历史结果未记录',phoneStatusResult:'历史结果未记录',phoneStatusAction:'历史处理未记录',
      note:'数据组锁单入库样例；'+(row.origin==='derived'?'平台派生锁单单独统计，不计入供应商达标量。':'本条有效锁单计入'+row.supplierName+'在当前排期的达标量。'),lockEntry:row};
  });
  // Historical lock samples are also searchable in the lead list; receipt status is not inferred.
  rows.forEach(row=>{
    const element=document.createElement('tr');
    element.dataset.leadCode=row.leadId;element.dataset.scheduleName=row.scheduleName;element.dataset.scheduleId=row.scheduleId;
    element.dataset.dispatchOrigin=row.origin;element.dataset.dispatchBlocked='false';
    element.innerHTML='<td>'+esc(row.leadId)+'<div class="form-hint">'+(row.origin==='derived'?'平台派生 · 原线索 '+esc(row.originalId):'供应商原传')+'</div></td>'+ 
      '<td>锁单样例客户<div>'+esc(row.phone)+'</div></td><td>东风日产</td><td>未记录</td><td>—</td><td>'+esc(row.supplierName)+'</td><td>'+esc(row.store)+'</td>'+ 
      '<td><span class="status-badge">已锁单</span><div class="form-hint">历史下发回执未记录</div></td><td><span class="phone-status-marker" data-phone-status="NOT_RECORDED">未记录</span></td>'+ 
      '<td>'+esc(row.receivedAt)+'</td><td><button type="button" class="btn btn-secondary btn-sm">详情</button></td>';
    element.querySelector('button').addEventListener('click',()=>openLeadDetailById(row.leadId));
    document.getElementById('clue-tbody').prepend(element);
  });
  window.renderLockEntryEvidence = function (data) {
    let card=document.getElementById('lockEntryLeadEvidence');
    if(!card){card=document.createElement('section');card.id='lockEntryLeadEvidence';card.className='card lock-entry-evidence';document.querySelector('#page-lead-detail .lead-detail-page-head').after(card);}
    card.hidden=!data.lockEntry;if(!data.lockEntry)return;
    const row=data.lockEntry;
    card.innerHTML='<h2 class="card-title">锁单入库与统计归属</h2><div class="lock-entry-evidence-grid">'+
      [['锁单标识',row.lockId],['所属排期',row.scheduleName],['来源供应商',row.supplierName],['记录来源',row.origin==='derived'?'平台派生':'供应商原传'],
       ['统计归属',row.origin==='derived'?'平台派生统计，不计入供应商达标量':row.supplierName+'达标量'],['入库时间',row.recordedAt]].map(([label,value])=>'<div><span>'+label+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</div>'+ 
      (row.origin==='derived'?'<button type="button" class="btn btn-secondary btn-sm" id="lockEntryOriginalLead">查看原线索 '+esc(row.originalId)+'</button>':'');
    const original=document.getElementById('lockEntryOriginalLead');if(original)original.onclick=()=>openLeadDetailById(row.originalId);
  };
  window.LockEntryRecords=Object.freeze({matching,render,rows:()=>rows.map(row=>Object.assign({},row))});
  render();
})();

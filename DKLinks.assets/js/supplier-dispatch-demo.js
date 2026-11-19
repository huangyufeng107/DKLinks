(function () {
  'use strict';
  const dialog = document.getElementById('supplierDispatchDemo');
  if (!dialog) return;
  const field = id => document.getElementById('supplierDispatchDemo' + id);
  const stores = [
    {name: 'B 店', group: '高'}, {name: 'C 店', group: '低'},
    {name: 'D 店', group: '低'}, {name: 'E 店', group: '高'},
    {name: 'F 店', group: '—'}
  ];
  const scope = stores.filter(store => store.name !== 'E 店');
  let records = [], serial = 0, position = 5;
  const rotation = {高: 0, 低: 0};
  const status = '供应商锁单目标已达成';
  function context(lead) {
    return {schedule: lead.scheduleName || 'A 排期', supplier: lead.supplierName || 'A1供应商',
      target: lead.target ?? 3};
  }

  function planGroup() { return position % 10 < 6 ? '高' : '低'; }
  function chooseRatio(candidates, rows) {
    const eligible = candidates.filter(store => store.group !== '—');
    while (rows.length < 3) {
      const planned = planGroup();
      const available = eligible.filter(store => !rows.some(row => row.store === store.name));
      if (!available.length && rows.length) break;
      const actual = available.some(store => store.group === planned) ? planned : planned === '高' ? '低' : '高';
      const grouped = eligible.filter(store => store.group === actual);
      let chosen;
      for (let offset = 0; offset < grouped.length; offset++) {
        const index = (rotation[actual] + offset) % grouped.length;
        if (available.includes(grouped[index])) {
          chosen = grouped[index];
          rotation[actual] = index + 1;
          break;
        }
      }
      const slot = '第 ' + (Math.floor(position / 10) + 1) + ' 轮 · 第 ' + (position % 10 + 1) + ' 个';
      position++;
      rows.push({store: chosen ? chosen.name : '—', outcome: chosen ? '等待下发' : '未派生', slot,
        note: '计划 ' + planned + '转化组 · ' + (chosen ? '实际 ' + actual + '转化组' : '所有组无可用门店')});
      if (!chosen) break;
    }
  }
  function sample(candidates) {
    const remaining = candidates.slice(), selected = [];
    while (remaining.length && selected.length < 3) {
      const index = Math.floor(Math.random() * remaining.length);
      selected.push(remaining.splice(index, 1)[0]);
    }
    return selected;
  }
  function simulate() {
    const id = 'DEMO-' + String(++serial).padStart(3, '0');
    const count = Number(field('Count').value);
    const mode = field('Mode').value;
    const modeLabel = field('Mode').selectedOptions[0].textContent;
    const processing = field('Processing').value || 'ready';
    const blocked = processing !== 'stopped' && count >= 3;
    const created = new Date().toLocaleString('zh-CN');
    const ready = !blocked && processing === 'ready';
    const rows = [];
    if (ready && mode === 'ratio') chooseRatio(scope, rows);
    if (ready && ['random', 'specified'].includes(mode)) {
      sample(mode === 'specified' ? stores : scope).forEach(store => rows.push({store: store.name, outcome: '等待下发', slot: '—', note: modeLabel}));
    }
    const logs = rows.map((row, i) => Object.assign(row, {id: row.store === '—' ? '—' : id + '-' + (i + 1)}));
    records.unshift({id, count, blocked, created, modeLabel, logs, processing});
    publish( records[0] );
    render();
  }
  function outcome(lead) {
    if (lead.blocked) return status;
    if (lead.processing === 'waiting') return '等待原线索完成外呼';
    if (lead.processing === 'stopped') return '原线索命中黑名单，停止处理';
    return '等待下发';
  }
  function stages(lead, entry) {
    const names = ['鉴权与接收字段校验', '来源线索 ID 检查', '黑名单', '接收去重规则', '号码状态检测', '外呼处理', '厂商下发'];
    return names.map((name, index) => {
      let state = 'passed', reason = entry.derived ? '引用原线索 ' + lead.id + ' 的处理结果' : '样例校验通过';
      if (lead.blocked && index >= 3) { state = 'not_run'; reason = '供应商已达标，本条未进入后续处理'; }
      else if (lead.processing === 'stopped' && index >= 2) {
        state = index === 2 ? 'stopped' : 'not_run'; reason = index === 2 ? '命中黑名单' : '前置环节拦截';
      } else if (lead.processing === 'waiting' && index >= 5) {
        state = index === 5 ? 'processing' : 'waiting'; reason = '外呼尚未完成，等待原线索处理结果';
      } else if (index === 6) {
        state = 'waiting';
        reason = entry.derived ? '目标门店范围、可用性及同客同店重复下发校验通过，等待发送' : '原传门店校验通过，等待发送';
      } else if (entry.derived && index === 1) reason = '平台派生记录关联原线索，按派生标识校验';
      const current = lead.blocked ? false :
        lead.processing === 'stopped' ? index === 2 : lead.processing === 'waiting' ? index === 5 : index === 6;
      return {name, state, current, reason, evidence: '会话样例 · ' + lead.created, events: []};
    });
  }
  function render() {
    const filter = field('Filter').value;
    const visible = records.filter(row => filter !== 'blocked' || row.blocked);
    field('Cursor').textContent = '比例分配下一名额：第 ' + (Math.floor(position / 10) + 1) + ' 轮，第 ' + (position % 10 + 1) + ' 个';
    field('Rows').innerHTML = visible.length ? visible.map(row => {
      const children = row.logs.filter(log => log.id !== '—');
      return '<tr><td>' + row.id + '</td><td>供应商原传</td><td>X 店</td><td>' + outcome(row) + '</td><td><button type="button" class="btn btn-secondary btn-sm" data-dispatch-demo-detail="' + row.id + '">查看日志</button></td></tr>' +
        children.map(log => '<tr><td>' + log.id + '</td><td>平台派生</td><td>' + log.store + '</td><td>' + log.outcome + '</td><td><button type="button" class="btn btn-secondary btn-sm" data-dispatch-demo-detail="' + row.id + '">查看来源</button></td></tr>').join('');
    }).join('') : '<tr><td colspan="5">暂无符合条件的演示线索</td></tr>';
  }
  function showLog(id) {
    const lead = records.find(row => row.id === id);
    if (!lead) return;
    field('Log').hidden = false;
    field('LogTitle').textContent = lead.id + ' · 下发日志';
    field('LogContext').textContent = context(lead).schedule + ' · ' + context(lead).supplier + ' · 已锁 ' + lead.count + ' 台 / 分配 ' + context(lead).target + ' 台 · ' + lead.modeLabel + ' · ' + lead.created;
    field('LogRows').innerHTML = '<tr><td>' + lead.id + '</td><td>X 店</td><td>—</td><td>' + outcome(lead) + '</td></tr>' +
      lead.logs.map(row => '<tr><td>' + row.id + '</td><td>' + row.store + '</td><td>' + row.slot + '</td><td>' + row.outcome + ' · ' + row.note + '</td></tr>').join('');
    field('LogTitle').focus();
  }
  function detailData(lead, entry) {
    const state = lead.blocked || lead.processing === 'stopped' ? '仅接收' : '处理中';
    return Object.assign({}, leadDetailExamples.normal, {
      code: entry.id, customerName: '示例客户', phone: '138****0000', brand: '东风日产', vehicle: '新楼兰',
      apiKey: context(lead).supplier, sourceId: lead.id, store: entry.store, receiveTime: lead.created,
      scheduleName:context(lead).schedule, scheduleId:lead.scheduleId || null,
      statusHtml: '<span class="status-badge status-pending">' + state + '</span>',
      dispatchDecision: outcome(lead), policyEvidenceSnapshot: null,
      supplierDispatchStages: stages(lead, entry),
      linkedTask:null,preScore:null,outboundConfigSnapshot:null,phoneStatusConfigSnapshot:null,
      receiveResult:'样例接收记录已保存',
      blacklistCheck:lead.processing==='stopped'&&!lead.blocked?'命中黑名单':entry.derived?'沿用原线索结果':'样例校验通过',
      interceptCheck:lead.blocked || lead.processing==='stopped'?'未执行（前置条件终止）':entry.derived?'沿用原线索结果':'样例校验通过',
      phoneStatusAction:lead.blocked || lead.processing==='stopped'?'未执行':entry.derived?'沿用原线索结果':'样例处理通过',

      phoneStatusResult: lead.blocked || lead.processing === 'stopped' ? '未检测' : '正常',
      supplierDispatchEvidence: {lead, entry},
      note: entry.derived ? '平台派生，来源线索 ' + lead.id : '供应商原传'
    });
  }
  function publish(lead) {
    const body = document.getElementById('clue-tbody');
    const children = lead.logs.filter(log => log.id !== '—');
    const entries = [{id: lead.id, store: 'X 店', derived: false}].concat(
      children.map(log => ({id: log.id, store: log.store, derived: true})));
    entries.forEach(entry => {
      const row = document.createElement('tr');
      row.dataset.leadCode = entry.id;
      row.dataset.scheduleName = context(lead).schedule;
      if (lead.scheduleId) row.dataset.scheduleId = lead.scheduleId;
      row.dataset.dispatchOrigin = entry.derived ? 'derived' : 'original';
      row.dataset.dispatchBlocked = lead.blocked ? 'true' : 'false';
      row.dataset.processingReason = lead.processing === 'waiting' ? 'outbound' : lead.processing === 'stopped' ? 'blacklist' : '';
      const state = lead.blocked || lead.processing === 'stopped' ? '仅接收' : '处理中';
      row.innerHTML = '<td>' + entry.id + '<div class="form-hint">' + (entry.derived ? '平台派生 · 原线索 ' + lead.id : '供应商原传') +
        '</div></td><td>示例客户<div>138****0000</div></td><td>东风日产</td><td>新楼兰</td><td>—</td><td>' + context(lead).supplier + '</td><td>' +
        entry.store + '</td><td><span class="status-badge status-pending">' + state + '</span><div class="form-hint">' +
        outcome(lead) + '</div></td><td><span class="phone-status-marker" data-phone-status="' +
        (lead.blocked || lead.processing === 'stopped' ? 'NOT_DETECTED' : 'NORMAL') + '">' +
        (lead.blocked || lead.processing === 'stopped' ? '未检测' : entry.derived ? '正常 · 沿用原线索' : '正常') + '</span></td><td>' +
        lead.created + '</td><td><div class="lead-row-actions"><button class="btn btn-secondary btn-sm" type="button">详情</button>' +
        '<button class="btn btn-secondary btn-sm" type="button" data-lead-dispatch-log>日志</button></div></td>';
      leadDetailExamples[entry.id] = detailData(lead, entry);
      row.querySelector('button').addEventListener('click', function () { openLeadDetail(entry.id); });
      row.querySelector('[data-lead-dispatch-log]').addEventListener('click', function () { openSupplierDispatchLogs(entry.id); });
      body.prepend(row);
    });
    if (typeof leadViewApplyList === 'function') leadViewApplyList(true);
    else filterClueList();
  }
  window.renderSupplierDispatchEvidence = function (data) {
    const panel = document.getElementById('supplierDispatchEvidence');
    panel.hidden = !data.supplierDispatchEvidence;
    panel.open = false;
    const logEntry = document.getElementById('leadDetailDispatchLogEntry');
    if (logEntry) logEntry.hidden = panel.hidden;
    if (panel.hidden) return;
    const {lead, entry} = data.supplierDispatchEvidence;
    document.getElementById('supplierDispatchEvidenceSummary').textContent =
      context(lead).schedule + ' · ' + context(lead).supplier + ' · 已锁 ' + lead.count + ' / 分配 ' + context(lead).target + ' 台 · ' + lead.modeLabel;
    document.getElementById('supplierDispatchRecordType').textContent = entry.derived ? '平台派生' : '供应商原传';
    document.getElementById('supplierDispatchStatistics').textContent = entry.derived ?
      '产生有效锁单时，归入平台派生统计' : lead.blocked || lead.processing === 'stopped' ?
      '本条未下发，未计入达标量' : '产生有效锁单时，计入 ' + context(lead).supplier + ' 在 ' + context(lead).schedule + ' 的达标量';
    document.getElementById('supplierDispatchProcessing').textContent = entry.derived ?
      '过滤、号码检测及外呼结果引用原线索 ' + lead.id + '。目标门店范围、可用性及同客同店重复下发已独立校验（样例）。' :
      lead.blocked ? status + '，本条未安排门店下发。' : outcome(lead) + '。原线索满足下发条件后才生成派生记录。';
    const root = document.getElementById('supplierDispatchEvidenceSource');
    root.hidden = !entry.derived;
    root.textContent = '原线索 ' + lead.id;
    root.onclick = function () { openLeadDetailById(lead.id); };
    document.getElementById('supplierDispatchEvidenceRows').innerHTML =
      '<tr><td>' + lead.id + '</td><td>供应商原传</td><td>X 店</td><td>' +
      outcome(lead) + '</td><td>—</td><td><button type="button" class="btn btn-secondary btn-sm" data-dispatch-lead="' + lead.id + '">查看详情</button></td></tr>' +
      lead.logs.map(log => '<tr><td>' + log.id + '</td><td>平台派生</td><td>' + log.store +
        '</td><td>' + log.outcome + '</td><td>' + log.slot + ' · ' + log.note + '</td><td>' +
        (log.id === '—' ? '—' : '<button type="button" class="btn btn-secondary btn-sm" data-dispatch-lead="' + log.id + '">查看详情</button>') + '</td></tr>').join('');
  };
  window.getSupplierDispatchLeadRecords = function () { return records.map(lead => Object.assign({},lead,{logs:lead.logs.map(log=>Object.assign({},log))})); };
  window.getSupplierDispatchLogs = function () {
    return records.flatMap(lead => {
      const common = {schedule: context(lead).schedule, supplier: context(lead).supplier, originalId: lead.id,
        at: lead.created, count: lead.count, target: context(lead).target, rule: lead.modeLabel};
      return [Object.assign({}, common, {leadId: lead.id, origin: '供应商原传', store: 'X 店',
        result: outcome(lead), slot: '—', reason: outcome(lead)})].concat(
        lead.logs.map(log => Object.assign({}, common, {leadId: log.id, origin: '平台派生',
          store: log.store, result: log.outcome, slot: log.slot, reason: log.note})));
    });
  };
  document.getElementById('supplierDispatchEvidenceRows').addEventListener('click', function (event) {
    const button = event.target.closest('[data-dispatch-lead]');
    if (button) openLeadDetailById(button.dataset.dispatchLead);
  });
  document.getElementById('openSupplierDispatchDemo').addEventListener('click', function () { document.getElementById('openSupplierDispatchDemo').closest('details').open = false; render(); dialog.showModal(); });
  document.getElementById('supplierDispatchDemoReturn').addEventListener('click', function () {
    dialog.close();
    filterClueList(true);
  });
  field('Run').addEventListener('click', simulate);
  field('Filter').addEventListener('change', render);
  field('Rows').addEventListener('click', function (event) {
    const button = event.target.closest('[data-dispatch-demo-detail]');
    if (button) showLog(button.dataset.dispatchDemoDetail);
  });
  document.addEventListener('DOMContentLoaded', function () {
    if (records.length) return;
    field('Mode').value = 'ratio'; field('Count').value = '2'; simulate();
    field('Count').value = '3'; simulate();
    const schedule = scheduleData.find(item => item.id === 'supplier-goal-review');
    if (schedule) schedule.suppliers.forEach((supplier, index) => {
      const count = supplier.lockSnapshot.count;
      const target = supplier.targetLockedOrders;
      const blocked = count >= target;
      const id = 'GOAL-REVIEW-' + (index + 1);
      const lead = {
        id, count, target, blocked, processing: 'ready',
        created: supplier.lockSnapshot.recordedAt.replace('（样例）',''), scheduleName: schedule.name, scheduleId:schedule.id, supplierId:supplier.accountId,
        supplierName: supplier.accountName || supplier.accountId,
        modeLabel: '一发多 · 随机', logs: blocked ? [] : [
          {id:id + '-1', store:'B 店', outcome:'等待下发', slot:'—', note:'供应商关联范围随机选择，排除 X 店'},
          {id:id + '-2', store:'C 店', outcome:'等待下发', slot:'—', note:'供应商关联范围随机选择，排除 X 店'},
          {id:id + '-3', store:'D 店', outcome:'等待下发', slot:'—', note:'供应商关联范围随机选择，排除 X 店'}
        ]
      };
      records.unshift(lead);
      publish(lead);
    });
    render();
  });
})();

/* 排期级停发指标与线索依据的会话内关联，不计算未接入的账务或宽表结果。 */
(function () {
  'use strict';
  var reportId = null, leadListId = null, reportRows = {}, leadFilterBySchedule = {};
  function schedule(id) { return scheduleData.find(function (s) { return s.id === id; }); }
  function ensureStoreDemos(s) {
    // Door-store validation failures are rejected at submission and never become lead records.
    return;
  }
  function storeRejectionDemo(s) {
    if (!s.isLockGoalDemo) return '';
    var rows = [
      ['未传门店', '未传', '请填写一家意向门店后重新提交'],
      ['传入多家', '门店A、门店B', '请明确一家意向门店后重新提交'],
      ['编码无法识别', 'STORE-UNKNOWN', '请更正为平台可识别的门店编码后重新提交'],
      ['门店已停用', 'DFN-STOP-001', '请核对并更正为已启用门店后重新提交'],
      ['不在关联门店中', 'DFN-VALID-001', '本期不校验关联门店；继续其他接收与下发校验']
    ];
    return '<section class="schedule-store-rejection-demo" style="margin-top:20px;padding:18px;border:1px solid #dbe5f2;border-radius:8px;background:#f8fbff"><strong>门店提交校验示例（不生成线索）</strong><p class="form-hint">前四种由接收接口返回错误，供应商修改后重新提交；第五种不因关联门店配置而拒绝。这里仅演示返回文案，不调用真实接口。</p><div class="table-wrapper"><table><thead><tr><th>提交情况</th><th>传入门店</th><th>接口反馈／后续动作</th></tr></thead><tbody>' + rows.map(function (row) { return '<tr><td>' + esc(row[0]) + '</td><td>' + esc(row[1]) + '</td><td>' + esc(row[2]) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
  }
  function esc(value) { return escapeHTML(String(value == null ? '—' : value)); }
  function time(value) { return value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未记录'; }
  function attainment(count, target) { return Number.isSafeInteger(count) && Number.isFinite(target) && target > 0 ? (count / target * 100).toFixed(2) + '%' : '—'; }
  function rowFor(s) {
    var item = window.getScheduleLockGoalSummary(s), row = reportRows[s.id] || {};
    Object.assign(row, { id: 'schedule-goal-' + s.id, parent: '', level: 0, name: esc(s.name), scheduleId: s.id, accountName: '整个排期', accountShort: (s.suppliers || []).length + '个供应商合计', area: '—', subArea: '—', store: '—', allocatedBudget: (s.suppliers || []).reduce(function (sum, sup) { return sum + (Number(sup.budget) || 0); }, 0), budgetConsumed: null, remainingBudget: null, progress: null, leadCost: null, leadSale: null, deliveryCost: null, deliverySale: null, profit: null, originalLeads: null, duplicateLeads: null, emptyLeads: null, dedupedLeads: null, validLeads: null, arrivals: null, deliveries: null, lockedOrders: null, validLockedOrders: item.state.count, retentionRate: null, validRate: null, arrivalRate: null, conversionRate: null, goalTarget: item.config.enabled && !item.result.error ? item.result.target : null, goalStatus: item.label });
    row.goalRate = attainment(row.validLockedOrders, row.goalTarget); reportRows[s.id] = row; return row;
  }
  window.getScheduleScopedReportData = function () { return reportId === null ? null : schedule(reportId) ? [rowFor(schedule(reportId))] : []; };
  window.renderScheduleGoalReportCells = function (row) {
    var current = row.scheduleId && schedule(row.scheduleId);
    return '<td>' + esc(current ? row.goalTarget : null) + '</td><td>' + esc(row.validLockedOrders) + '</td><td>' + esc(current ? row.goalRate : null) + '</td><td>' + (current ? esc(row.goalStatus) + '<div><button class="btn btn-secondary btn-sm" type="button" onclick="openScheduleLockGoal(\'' + esc(current.id) + '\')">下发状态详情</button></div>' : '—') + '</td>';
  };
  function renderReportContext() {
    var el = document.getElementById('scheduleGoalReportContext'); if (!el) return;
    el.hidden = reportId === null; if (reportId === null) return;
    var s = schedule(reportId);
    if (!s) { el.innerHTML = '所选排期不存在，请返回排期列表重新选择。'; return; }
    el.innerHTML = '<div class="card-body"><strong>当前排期：' + esc(s.name) + '</strong><p class="form-hint">锁单目标、当前数量及下发状态按整个排期展示，不随报表日期筛选缩小累计范围；目标达成率与交车转化率分开。' + (s.isLockGoalDemo ? '有效锁单来自同一份会话演示计数。' : '真实有效锁单数据尚未接入。') + '未接入的预算消耗、交车等指标显示“—”，不套用其他排期样例。</p><button class="btn btn-secondary btn-sm" type="button" onclick="openScheduleGoalLeadList(\'' + esc(s.id) + '\')">查看关联线索</button> <button class="btn btn-secondary btn-sm" type="button" onclick="openScheduleLockGoal(\'' + esc(s.id) + '\')">下发状态详情</button></div>';
  }
  window.initScheduleGoalReportContext = renderReportContext;
  window.openScheduleGoalReport = function (id) {
    var s = schedule(id); if (!s) { showToast('排期不存在，请重新选择', 'warning'); return; }
    reportId = id;
    document.getElementById('reportDateFrom').value = s.startTime;
    document.getElementById('reportDateTo').value = s.endTime;
    navigateTo('dk-report');
  };
  window.resetScheduleGoalReportDates = function () {
    var s = schedule(reportId); if (!s) return false;
    document.getElementById('reportDateFrom').value = s.startTime; document.getElementById('reportDateTo').value = s.endTime; return true;
  };
  window.hasScheduleGoalReportContext = function () { return reportId !== null; };
  function leadState(lead) {
    if (lead.historyHeld) return { title: '历史暂停，继续保留', reason: '排期已确认恢复，但本条接收在恢复前，不自动补发。', stage: 'stopped', next: '保留本条历史记录；恢复只影响之后新接收的线索。' };
    if (lead.goalPaused) return { title: '达标暂停', reason: '排期有效锁单目标已达成，本条尚未发出请求，保留并暂停下发。', stage: 'stopped', next: '运营核对排期停发状态；即使之后恢复，本条也不自动补发。' };
    if (lead.status === 'data-paused') return { title: '数据异常暂缓', reason: '有效锁单数据暂不可用，本条保留等待核查。', stage: 'waiting', next: '数据恢复后自动重新校验；通过其他条件才继续。' };
    if (lead.status === 'success') return { title: '模拟下发成功', reason: '本条通过当时的演示闸口；未发出真实厂商请求。', stage: 'passed', next: '本条演示已完成，不重复发送；真实接口尚未接入。' };
    if (lead.status === 'sending' || lead.status === 'unknown') return { title: lead.status === 'unknown' ? '下发结果待核查' : '下发中', reason: '已有请求示例，跟踪原请求结果，不由本次停发恢复路径重发。', stage: 'processing', next: '核查原请求；结果明确前不重发或换店。' };
    return { title: '待下发校验', reason: lead.reason || '尚未执行本条下发前检查，不将当前排期数量反推为历史结果。', stage: 'waiting', next: '按当前约束完成下发前检查。' };
  }
  function evidenceText(snapshot) {
    if (!snapshot) return '当时停发目标与计数未记录；不读取当前数量补造。';
    return '当时目标：' + (snapshot.enabled && snapshot.target !== null ? snapshot.target + '台' : '未开启') + '；当时有效锁单：' + (snapshot.count === null ? '数据不可用' : snapshot.count + '台') + '；记录时间：' + time(snapshot.capturedAt) + '；依据：' + snapshot.reason;
  }
  function filterCode(lead) {
    if (lead.historyHeld) return 'retained';
    if (lead.goalPaused) return 'paused';
    if (lead.status === 'data-paused') return 'data-paused';
    if (lead.status === 'sending' || lead.status === 'unknown') return 'inflight';
    if (lead.status === 'success') return 'success';
    if (lead.status === 'pending') return 'pending';
    return 'blocked';
  }
  var leadFilterOptions = [['', '全部处理结果'], ['paused', '达标暂停'], ['retained', '恢复前历史保留'], ['data-paused', '数据异常暂缓'], ['inflight', '发送中／结果待核查'], ['success', '模拟下发成功'], ['pending', '待校验'], ['blocked', '其他条件阻断']];
  window.filterScheduleGoalLeads = function (value) {
    if (!schedule(leadListId)) return;
    leadFilterBySchedule[leadListId] = leadFilterOptions.some(function (option) { return option[0] === value; }) ? value : '';
    window.renderScheduleGoalLeadList();
    var select = document.getElementById('scheduleGoalLeadStateFilter'); if (select) select.focus();
  };
  function listMarkup(s) {
    ensureStoreDemos(s);
    var allLeads = window.ScheduleLockGoalModel.runtime(s).leads, selected = leadFilterBySchedule[s.id] || '';
    var leads = allLeads.filter(function (lead) { return !selected || filterCode(lead) === selected; });
    var filter = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px;"><label for="scheduleGoalLeadStateFilter">处理结果</label><select class="filter-select" id="scheduleGoalLeadStateFilter" onchange="filterScheduleGoalLeads(this.value)">' + leadFilterOptions.map(function (option) { return '<option value="' + option[0] + '"' + (option[0] === selected ? ' selected' : '') + '>' + option[1] + '</option>'; }).join('') + '</select><span class="form-hint">当前' + leads.length + '条／本排期共' + allLeads.length + '条</span></div>';
    return '<div class="card-body"><strong>当前排期：' + esc(s.name) + '</strong><p class="form-hint">以下仅为本排期关联的会话演示线索。接收阶段门店校验失败的提交不会生成线索，示例见下方。</p><button class="btn btn-secondary btn-sm" type="button" onclick="openScheduleGoalReport(\'' + esc(s.id) + '\')">查看本排期报表</button> <button class="btn btn-secondary btn-sm" type="button" onclick="openScheduleLockGoal(\'' + esc(s.id) + '\')">下发状态详情</button>' + filter + '<div class="table-wrapper" style="margin-top:12px;"><table><thead><tr><th>线索编号</th><th>处理结果</th><th>当时停发依据</th><th>操作</th></tr></thead><tbody>' + (leads.length ? leads.map(function (lead) { return '<tr><td>' + esc(lead.id) + '</td><td>' + esc(leadState(lead).title) + '</td><td>' + esc(evidenceText(lead.goalStopEvidence || lead.latestGateEvidence)) + '</td><td><button class="btn btn-secondary btn-sm" type="button" onclick="openScheduleGoalLeadDetail(\'' + esc(s.id) + '\',\'' + esc(lead.id) + '\')">查看线索</button></td></tr>'; }).join('') : '<tr><td colspan="4">' + (allLeads.length ? '当前处理结果筛选没有匹配线索，可切换为全部。' : '暂无关联演示线索，真实明细接口尚未接入。') + '</td></tr>') + '</tbody></table></div>' + storeRejectionDemo(s) + '</div>';
  }
  window.renderScheduleGoalLeadList = function () {
    var page = document.getElementById('page-dk-leaddetail'), panel = document.getElementById('scheduleGoalLeadList');
    if (!page || !panel) return;
    var hasContext = leadListId !== null;
    Array.from(page.children).forEach(function (child) {
      if (child === panel || child.classList.contains('detail-page-summary')) return;
      if (hasContext) { if (!child.hasAttribute('data-goal-original-hidden')) { child.setAttribute('data-goal-original-hidden', child.hidden ? '1' : '0'); child.setAttribute('data-goal-original-display', child.style.display || ''); } child.hidden = true; child.style.display = 'none'; }
      else if (child.hasAttribute('data-goal-original-hidden')) { child.hidden = child.getAttribute('data-goal-original-hidden') === '1'; child.style.display = child.getAttribute('data-goal-original-display') || ''; child.removeAttribute('data-goal-original-hidden'); child.removeAttribute('data-goal-original-display'); }
    });
    panel.hidden = !hasContext;
    if (!hasContext) return;
    var s = schedule(leadListId);
    var subtitle = page.querySelector('.page-subtitle'); if (subtitle) subtitle.textContent = s ? '来源排期：' + s.name + '（会话演示）' : '来源排期不存在';
    panel.innerHTML = s ? listMarkup(s) : '<div class="card-body">所选排期不存在，请返回重新选择。</div>';
  };
  window.openScheduleGoalLeadList = function (id) { if (!schedule(id)) { showToast('排期不存在', 'warning'); return; } leadListId = id; navigateTo('dk-leaddetail'); };
  function detailData(s, lead) {
    var view = leadState(lead), saved = lead.goalStopEvidence || lead.latestGateEvidence;
    var captured = saved ? time(saved.capturedAt) : time(lead.receivedAt);
    var checks = lead.preSendChecks || [], stageNames = ['鉴权与接收字段校验', '来源线索 ID 检查', '黑名单', '接收去重规则', '号码状态检测', '外呼处理', '厂商下发'];
    var stages = stageNames.map(function (name, index) {
      if (index === 6) return { name: name, state: view.stage, current: view.stage !== 'passed', reason: view.reason, evidence: evidenceText(saved), events: [] };
      return { name: name, state: !checks[index] ? 'unrecorded' : index === 3 || index === 5 ? 'skipped' : 'passed', current: false, reason: checks[index] || '该环节结果未记录', evidence: checks[index] ? '独立会话演示前置校验，不代表真实接口或历史恢复' : '不根据排期归属推断已经校验', events: [] };
    });
    var data = Object.assign({}, leadDetailExamples.normal, {
      code: lead.id, customerName: '演示客户', phone: '138****0000', gender: '未记录', area: '演示资料', apiKey: '演示供应商', sourceId: lead.id, brand: '东风日产', vehicle: '演示车系', receiveTime: time(lead.receivedAt), store: '演示意向门店', budget: '未记录', buyTime: '未记录', linkedTask: null, preScore: null,
      statusHtml: '<span class="status-badge status-pending">' + esc(view.title) + '</span>', receiveResult: '已保存会话演示记录', dispatchDecision: view.reason, blacklistCheck: checks[2] || '未记录', interceptCheck: checks[3] || '未记录', phoneStatusResult: checks[4] ? '演示正常' : '未记录', phoneStatusAction: checks[4] || '未记录', phoneStatusConfigSnapshot: { enabled: !!checks[4], snapshotId: 'GOAL-DEMO-' + lead.id, capturedAt: captured }, outboundConfigSnapshot: { enabled: false, snapshotId: 'GOAL-DEMO-AI-' + lead.id, capturedAt: captured }, note: view.reason, scheduleGoalTraceStages: stages,
      policyEvidenceSnapshot: { scheduleName: saved ? saved.scheduleName : s.name, source: '排期停发闸口（演示）', version: null, capturedAt: captured, outcome: view.title, reason: view.reason, configEvidence: [['号码状态检测', checks[4] ? '演示开启' : '未记录', '独立演示前置配置'], ['接收去重', checks[3] ? '演示不执行' : '未记录', '独立演示项目差异'], ['AI培育', checks[5] ? '演示关闭' : '未记录', '独立演示项目差异']], steps: [view.reason], commonChecks: stages.slice(0,3), stageEvidence: [['号码检测', checks[4] || '未记录', '演示处理策略'], ['接收去重', checks[3] || '未记录', '演示处理策略'], ['AI培育', checks[5] || '未记录', '演示处理策略'], ['厂商下发', view.title, evidenceText(saved)]] },
      scheduleGoalNextAction: view.next
    });
    return data;
  }
  window.openScheduleGoalLeadDetail = function (scheduleId, leadId) {
    var s = schedule(scheduleId); ensureStoreDemos(s);
    var lead = s && window.ScheduleLockGoalModel.runtime(s).leads.find(function (item) { return item.id === leadId; });
    if (!lead) { showToast('未找到该排期下的线索，请重新选择', 'warning'); return; }
    closeModal('scheduleLockGoalModal'); closeModal('scheduleModal');
    leadDetailExamples.scheduleGoalRuntime = detailData(s, lead);
    openLeadDetail('scheduleGoalRuntime');
  };
  window.refreshScheduleGoalReporting = function () {
    if (reportId !== null) { renderReportContext(); renderReportTable(window.getScheduleScopedReportData()); }
    if (leadListId !== null) window.renderScheduleGoalLeadList();
  };
  window.ScheduleGoalReporting = Object.freeze({ attainment: attainment, leadState: leadState, filterCode: filterCode, detailData: detailData, evidenceText: evidenceText });
})();

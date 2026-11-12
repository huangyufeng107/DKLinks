/* 排期有效锁单停发：浏览器会话演示模型，不调用厂商接口。 */
(function () {
  'use strict';
  function runtime(schedule) {
    if (!schedule.lockGoalRuntime) schedule.lockGoalRuntime = { stopLatched: !!(schedule.lockGoalConfig && schedule.lockGoalConfig.stopLatched), count: null, sequence: 0, stopSerial: 0, leads: [], events: [] };
    return schedule.lockGoalRuntime;
  }
  function tick(state) { state.sequence += 1; return state.sequence; }
  function record(state, action, reason) {
    state.events.push({ sequence: tick(state), at: new Date().toISOString(), actor: '原型演示操作员', action: action, reason: reason });
  }
  function goal(schedule) {
    var config = schedule.lockGoalConfig || {};
    return config.enabled ? window.ScheduleLockGoalConfig.calculate(config.expectedSupply, config.expectedConversionRate) : { target: null };
  }
  function availability(schedule, now) {
    if (schedule.status !== 1) return '排期已禁用';
    function time(value) { return Date.parse(value && (value.length === 16 ? value + ':00+08:00' : value)); }
    var start = time(schedule.startTime), end = time(schedule.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return '排期时间不可用';
    if (now < start) return '排期尚未开始';
    if (now > end) return '排期已结束';
    return '';
  }
  function alreadyRequested(lead) { return ['sending', 'success', 'unknown'].includes(lead.status); }
  function evidence(schedule, code, reason) {
    var state = runtime(schedule), config = schedule.lockGoalConfig || {}, result = goal(schedule);
    return Object.freeze({ scheduleId: schedule.id, scheduleName: schedule.name, enabled: !!config.enabled, target: result.error ? null : result.target, count: state.count, capturedAt: new Date().toISOString(), code: code, reason: reason, demo: !!schedule.isLockGoalDemo });
  }
  function demoChecks() { return ['字段及鉴权演示通过', '来源ID防重演示通过', '黑名单演示未命中', '项目不执行接收去重', '号码检测演示正常', '项目关闭AI培育']; }
  function latch(schedule) {
    var state = runtime(schedule), config = schedule.lockGoalConfig || {}, result = goal(schedule);
    if (config.enabled && !result.error && Number.isSafeInteger(state.count) && state.count >= result.target && !state.stopLatched) {
      state.stopLatched = true; state.stoppedAt = new Date().toISOString(); state.stopSerial += 1;
      state.stopEvidence = { target: result.target, count: state.count };
      record(state, '达标停发', '有效锁单量' + state.count + '台，目标' + result.target + '台');
    }
    if (state.stopLatched) state.leads.forEach(function (lead) {
      if (!alreadyRequested(lead) && !lead.historyHeld) {
        if (!lead.goalStopEvidence) lead.goalStopEvidence = evidence(schedule, 'goal-paused', '排期有效锁单目标已达成');
        lead.goalPaused = true; lead.status = 'goal-paused';
      }
    });
    return state;
  }
  function gate(schedule, lead, now, otherBlock) {
    var state = latch(schedule), config = schedule.lockGoalConfig || {}, result = goal(schedule);
    if (alreadyRequested(lead)) return { allowed: false, code: 'existing-request', reason: '已有请求，继续跟踪原结果，不重复发送' };
    if (lead.historyHeld) return { allowed: false, code: 'history', reason: '恢复前历史记录继续保留，不自动下发' };
    if (lead.goalPaused) return { allowed: false, code: 'goal-paused', reason: '排期有效锁单目标已达成' };
    var unavailable = availability(schedule, now);
    if (unavailable || otherBlock) return { allowed: false, code: 'other-blocked', reason: unavailable || otherBlock };
    if (state.stopLatched) return { allowed: false, code: 'goal-paused', reason: '排期有效锁单目标已达成' };
    if (!config.enabled) return { allowed: true, code: 'allowed', reason: '本规则未开启，继续既有下发校验' };
    if (result.error) return { allowed: false, code: 'config-invalid', reason: result.error };
    if (!Number.isSafeInteger(state.count)) return { allowed: false, code: 'data-paused', reason: '有效锁单数据暂不可用' };
    return { allowed: true, code: 'allowed', reason: '有效锁单未达标，继续既有下发校验' };
  }
  function canResume(schedule, now, otherBlock) {
    var state = latch(schedule), config = schedule.lockGoalConfig || {}, result = goal(schedule);
    if (!state.stopLatched) return '当前没有待解除的达标停发';
    var unavailable = availability(schedule, now);
    if (unavailable || otherBlock) return unavailable || otherBlock;
    if (!config.enabled) return '';
    if (result.error) return result.error;
    if (!Number.isSafeInteger(state.count)) return '有效锁单数据暂不可用';
    if (state.count >= result.target) return '当前仍达到目标，请先提高目标或关闭停发开关并保存';
    return '';
  }
  function resume(schedule, now, otherBlock, serial) {
    var state = runtime(schedule);
    if (serial !== undefined && serial !== state.stopSerial) return { error: '停发状态已变化，请重新核对' };
    var error = canResume(schedule, now, otherBlock);
    if (error) return { error: error };
    state.leads.forEach(function (lead) { if (!alreadyRequested(lead)) { lead.historyHeld = true; lead.status = 'history-held'; } });
    state.stopLatched = false; state.resumedAt = new Date().toISOString(); state.resumeBoundary = tick(state);
    // Clear only the legacy configuration marker as part of explicit restoration.
    if (schedule.lockGoalConfig) schedule.lockGoalConfig.stopLatched = false;
    state.resumeEvidence = evidence(schedule, 'manual-resume', '仅恢复此操作之后新接收线索；原暂停记录继续保留');
    record(state, '确认恢复下发', '恢复时开关：' + ((schedule.lockGoalConfig || {}).enabled ? '开启' : '关闭') + '；目标：' + (goal(schedule).target === null ? '不适用' : goal(schedule).target + '台') + '；有效锁单：' + (state.count === null ? '数据不可用' : state.count + '台') + '。仅恢复此操作之后新接收线索；原暂停记录继续保留');
    return { restored: true };
  }
  function applyGate(schedule, lead, now, otherBlock) {
    var result = gate(schedule, lead, now, otherBlock);
    if (result.code === 'existing-request') return result;
    if (result.allowed) lead.status = 'success'; // Only a simulation, no network request.
    else if (!lead.goalPaused && !lead.historyHeld) lead.status = result.code;
    if (!lead.latestGateEvidence || lead.latestGateEvidence.code !== result.code) lead.latestGateEvidence = evidence(schedule, result.code, result.reason);
    lead.reason = result.reason;
    return result;
  }
  function setCount(schedule, count, now, otherBlock) {
    if (count !== null && (!Number.isSafeInteger(count) || count < 0)) return { error: '演示有效锁单量须为非负整数' };
    var state = runtime(schedule); state.count = count; state.countUpdatedAt = new Date().toISOString();
    record(state, count === null ? '演示数据不可用' : '更新演示有效锁单量', count === null ? '不按旧值或0放行' : count + '台');
    latch(schedule);
    // Only data-outage holds auto-recheck; success, in-flight and historical goal holds never replay.
    state.leads.filter(function (lead) { return lead.status === 'data-paused' && !lead.goalPaused && !lead.historyHeld; }).forEach(function (lead) { applyGate(schedule, lead, now, otherBlock); });
    return { updated: true };
  }
  function receive(schedule, now, otherBlock) {
    var state = runtime(schedule), seq = tick(state);
    var lead = { id: 'DEMO-' + seq, receivedSequence: seq, receivedAt: new Date().toISOString(), status: 'pending', preSendChecks: schedule.isLockGoalDemo ? demoChecks() : null };
    state.leads.push(lead); applyGate(schedule, lead, now, otherBlock); return lead;
  }
  window.ScheduleLockGoalModel = Object.freeze({ runtime: runtime, goal: goal, gate: gate, latch: latch, canResume: canResume, resume: resume, setCount: setCount, receive: receive, applyGate: applyGate, availability: availability });

  var currentId = null;
  function find(id) { return scheduleData.find(function (s) { return s.id === id; }); }
  function policyBlock(schedule) {
    if (typeof window.getSchedulePolicySummary !== 'function') return '';
    var summary = window.getSchedulePolicySummary(schedule.id);
    return summary.blocked.length ? '处理策略：' + summary.blocked[0].label : '';
  }
  function escape(value) { return escapeHTML(String(value == null ? '—' : value)); }
  function date(value) { return value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'; }
  function summary(schedule) {
    var state = latch(schedule), config = schedule.lockGoalConfig || {}, result = goal(schedule), blocked = availability(schedule, Date.now()) || policyBlock(schedule);
    var label = state.stopLatched ? '达标停发，待确认恢复' : blocked ? blocked : !config.enabled ? '本规则未开启' : result.error ? '停发配置待核对' : state.count === null ? '锁单数据暂不可用' : '未达目标，可继续校验';
    var category = state.stopLatched ? 'stopped' : blocked ? 'blocked' : !config.enabled ? 'off' : result.error ? 'invalid' : state.count === null ? 'unavailable' : 'ready';
    return { state: state, config: config, result: result, blocked: blocked, label: label, category: category };
  }
  window.getScheduleLockGoalSummary = summary;
  window.renderScheduleLockGoalCell = function (schedule) {
    var item = summary(schedule);
    return '<div class="schedule-goal-list-cell"><strong>' + escape(item.label) + '</strong><span>目标：' + (item.config.enabled && !item.result.error ? item.result.target + '台' : '—') + ' · 当前：' + (item.state.count === null ? '—' : item.state.count + '台') + '</span>' + (item.state.stopLatched && item.blocked ? '<span>' + escape(item.blocked) + '</span>' : '') + '<button class="btn btn-secondary btn-sm" type="button" onclick="openScheduleLockGoal(\'' + escape(schedule.id) + '\')">下发状态详情</button></div>';
  };
  window.renderScheduleLockGoalInline = function (schedule) {
    var el = document.getElementById('scheduleLockGoalRuntime'); if (!el) return;
    el.hidden = !schedule;
    if (!schedule) { el.innerHTML = ''; var emptyStatus = document.getElementById('scheduleEditorSavedStatus'); if (emptyStatus) emptyStatus.textContent = '新增排期，尚未保存。'; return; }
    var item = summary(schedule);
    var savedStatus = document.getElementById('scheduleEditorSavedStatus'); if (savedStatus) savedStatus.textContent = item.label;
    el.innerHTML = '<div class="form-hint">当前已保存状态：' + escape(item.label) + '。当前有效锁单量：' + (item.state.count === null ? '—（未接入）' : item.state.count + '台（演示）') + '。</div><div class="schedule-lock-runtime-actions"><button class="btn btn-secondary btn-sm" type="button" onclick="openScheduleLockGoal(\'' + escape(schedule.id) + '\')">查看停发与恢复详情</button></div>';
  };
  function render() {
    var schedule = find(currentId); if (!schedule) return;
    var item = summary(schedule), state = item.state, blocked = canResume(schedule, Date.now(), policyBlock(schedule));
    document.getElementById('scheduleLockGoalDetailName').textContent = schedule.name;
    document.getElementById('scheduleLockGoalStatus').textContent = item.label;
    document.getElementById('scheduleLockGoalDetail').innerHTML = '<div class="schedule-supplier-price-grid"><div>停发开关：<strong>' + (item.config.enabled ? '开启' : '关闭') + '</strong></div><div>当前目标：<strong>' + (item.config.enabled && !item.result.error ? item.result.target + '台' : '—') + '</strong></div><div>有效锁单量：<strong>' + (state.count === null ? '—（数据不可用）' : state.count + '台（演示）') + '</strong></div><div>计数更新时间：' + date(state.countUpdatedAt) + '</div><div>最近停发：' + date(state.stoppedAt) + '</div><div>最近恢复：' + date(state.resumedAt) + '</div></div>' + (item.blocked ? '<p class="form-hint">独立限制：' + escape(item.blocked) + '</p>' : '') + (state.stopEvidence ? '<p class="form-hint">最近停发依据：当时有效锁单' + state.stopEvidence.count + '台／目标' + state.stopEvidence.target + '台；该依据保留，不随修改目标改写。</p>' : '');
    if (state.resumeEvidence) {
      var restored = state.resumeEvidence;
      document.getElementById('scheduleLockGoalDetail').innerHTML += '<p class="form-hint">最近恢复依据：当时开关' + (restored.enabled ? '开启' : '关闭') + '，目标' + (restored.target === null ? '不适用' : restored.target + '台') + '，有效锁单' + (restored.count === null ? '数据不可用' : restored.count + '台') + '。仅恢复确认之后新接收线索，原记录继续保留。</p>';
    }
    var resumeButton = document.getElementById('scheduleLockGoalResume');
    resumeButton.hidden = !state.stopLatched; resumeButton.style.display = state.stopLatched ? '' : 'none'; resumeButton.disabled = !!blocked;
    resumeButton.title = blocked || '仅恢复之后新接收线索';
    document.getElementById('scheduleLockGoalResumeHint').textContent = state.stopLatched ? blocked || '可确认恢复；仅对恢复之后新接收线索生效。' : '仅发生达标停发后提供恢复操作；保存配置不会直接执行恢复。';
    var guidance = state.stopLatched
      ? (blocked ? '当前不能恢复：' + blocked + '。可先调整配置；保存不会直接恢复下发。' : '当前满足本规则的恢复条件。确认后仅放行之后新接收线索，历史记录继续保留。')
      : item.blocked ? '请先处理：' + item.blocked + '。本规则不覆盖该限制。'
      : item.config.enabled && state.count === null ? '有效锁单数据暂不可用；先核查数据，不能把未知数量当作0。'
      : '当前没有待解除的达标停发。需要调整目标时，可进入排期配置。';
    document.getElementById('scheduleLockGoalNextStep').textContent = guidance;
    document.getElementById('scheduleLockGoalDemo').hidden = !schedule.isLockGoalDemo;
    var body = document.getElementById('scheduleLockGoalLeadRows');
    var statuses = { success: '模拟下发成功', sending: '发送中，跟踪原请求', unknown: '结果待核查', 'goal-paused': '达标暂停，继续保留', 'history-held': '恢复前历史记录，继续保留', 'data-paused': '数据异常暂缓', pending: '待校验', 'other-blocked': '其他条件阻断', 'config-invalid': '配置待核对' };
    body.innerHTML = state.leads.length ? state.leads.map(function (lead) { return '<tr><td>' + escape(lead.id) + '</td><td>' + escape(statuses[lead.status] || lead.status) + '</td><td>' + escape(lead.goalPaused || lead.historyHeld ? '历史记录不自动补发' : lead.reason || '—') + '</td><td><button class="btn btn-secondary btn-sm" type="button" onclick="openScheduleGoalLeadDetail(\'' + escape(schedule.id) + '\',\'' + escape(lead.id) + '\')">查看线索</button></td></tr>'; }).join('') : '<tr><td colspan="4">暂无演示线索；实际历史暂停数据尚未接入。</td></tr>';
    document.getElementById('scheduleLockGoalEvents').innerHTML = state.events.length ? state.events.slice().reverse().map(function (e) { return '<tr><td>' + escape(date(e.at)) + '</td><td>' + escape(e.actor) + '</td><td>' + escape(e.action) + '</td><td>' + escape(e.reason) + '</td></tr>'; }).join('') : '<tr><td colspan="4">暂无操作记录</td></tr>';
  }
  function refresh() { renderScheduleTable(); renderScheduleLockGoalInline(find(currentEditingScheduleId)); render(); if (typeof window.refreshScheduleGoalReporting === 'function') window.refreshScheduleGoalReporting(); }
  window.openScheduleLockGoal = function (id) {
    if (!find(id)) return;
    currentId = id; render(); document.getElementById('scheduleLockGoalModal').classList.add('active');
  };
  window.confirmScheduleLockGoalResume = function () {
    var schedule = find(currentId); if (!schedule) return;
    var error = canResume(schedule, Date.now(), policyBlock(schedule));
    if (error) { showToast(error, 'warning'); refresh(); return; }
    var serial = runtime(schedule).stopSerial;
    showConfirmDialog('确认恢复排期「' + schedule.name + '」下发？恢复仅对之后新接收线索生效；此前保留的线索不自动下发，其他校验仍须通过。', function () {
      if (find(schedule.id) !== schedule) { showToast('排期配置已变化，请重新核对', 'warning'); refresh(); return; }
      var result = resume(schedule, Date.now(), policyBlock(schedule), serial);
      showToast(result.error || '已确认恢复，仅放行之后新接收的线索', result.error ? 'warning' : 'success'); refresh();
    });
  };
  window.editScheduleLockGoalConfig = function () {
    var schedule = find(currentId); if (!schedule) { showToast('排期不存在，请重新选择', 'warning'); return; }
    var panel = document.getElementById('scheduleModal');
    var sameOpen = panel.classList.contains('active') && currentEditingScheduleId === schedule.id;
    function open() {
      closeModal('scheduleLockGoalModal');
      if (sameOpen && currentScheduleMode === 'edit') {
        // Keep in-progress inputs; opening the status dialog must never discard a draft.
      } else openScheduleModal('edit', schedule.id);
      var locate = function () { if (typeof switchScheduleEditorTab === 'function') switchScheduleEditorTab('control'); document.getElementById('scheduleLockGoalSection').scrollIntoView({ block: 'start' }); document.getElementById('scheduleLockGoalEnabled').focus(); };
      if (window.requestAnimationFrame) window.requestAnimationFrame(locate); else locate();
    }
    if (panel.classList.contains('active') && !sameOpen && currentScheduleMode !== 'view') {
      showConfirmDialog('切换到所选排期会覆盖当前未保存的排期修改，是否继续？', open);
    } else open();
  };
  window.setScheduleLockGoalDemoCount = function (value) {
    var schedule = find(currentId); if (!schedule || !schedule.isLockGoalDemo) return;
    var count = value === 'unavailable' ? null : Number(document.getElementById('scheduleLockGoalDemoCount').value);
    if (value !== 'unavailable' && document.getElementById('scheduleLockGoalDemoCount').value.trim() === '') { showToast('请填写演示有效锁单量', 'warning'); return; }
    var result = setCount(schedule, count, Date.now(), policyBlock(schedule));
    if (result.error) showToast(result.error, 'warning'); refresh();
  };
  window.receiveScheduleLockGoalDemoLead = function () {
    var schedule = find(currentId); if (!schedule || !schedule.isLockGoalDemo) return;
    receive(schedule, Date.now(), policyBlock(schedule)); refresh();
  };
  window.checkScheduleLockGoalDemoLeads = function () {
    var schedule = find(currentId); if (!schedule || !schedule.isLockGoalDemo) return;
    runtime(schedule).leads.forEach(function (lead) { applyGate(schedule, lead, Date.now(), policyBlock(schedule)); }); refresh();
  };
  window.onScheduleLockGoalConfigSaved = function (schedule) { latch(schedule); };

  // An explicitly isolated fixture; existing schedules keep their configured state and no count is invented.
  var original = scheduleData.find(function (schedule) { return schedule.id === '04'; });
  if (original && !find('cpql-demo-202611')) {
    var demo = JSON.parse(JSON.stringify(original));
    demo.id = 'cpql-demo-202611'; demo.name = '【演示】线索工厂日产项目CPQL模式'; demo.startTime = '2026-11-01T00:00'; demo.endTime = '2026-11-30T23:59'; demo.isLockGoalDemo = true;
    demo.lockGoalConfig = { enabled: true, expectedSupply: 10000, expectedConversionRate: '1', target: 100 };
    demo.suppliers.forEach(function (supplier, i) { supplier.smartcode = 'SC-CPQL-DEMO-' + (i + 1); supplier.settlement = 'CPQL'; supplier.costPrice = 180; supplier.salePrice = 280; supplier.deliveryCost = null; supplier.deliverySale = null; });
    var state = runtime(demo); state.count = 99; state.countUpdatedAt = new Date().toISOString();
    state.leads = [{ id: 'DEMO-OLD-1', status: 'pending' }, { id: 'DEMO-OLD-2', status: 'pending' }, { id: 'DEMO-IN-FLIGHT', status: 'sending' }, { id: 'DEMO-UNKNOWN', status: 'unknown' }];
    state.leads.forEach(function(lead) { lead.receivedAt = new Date().toISOString(); lead.preSendChecks = demoChecks(); });
    scheduleData.push(demo);
  }
})();

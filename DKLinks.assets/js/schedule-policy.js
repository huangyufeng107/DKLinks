/* 排期处理策略讨论原型：本地草稿、发布与品牌依赖校验。 */
(function () {
  'use strict';
  var pilotId = 'pilot-202610';
  var chosenId = pilotId;
  var chosenBrand = 'DONGFENG_NISSAN';
  var draft = {};
  var pending = {};
  var returnContext = null;
  var brandCodes = { '东风日产': 'DONGFENG_NISSAN', '理想汽车': 'LIXIANG', '问界': 'AITO', '小鹏汽车': 'XIAOPENG' };
  var rows = [
    { key: 'phone', label: '号码状态检测', note: '检测动作沿用品牌号码状态处理规则。' },
    { key: 'dedup', label: '接收去重（拦截规则）', note: '沿用「拦截规则 → 去重规则」的适用规则；来源 ID 校验和请求幂等独立执行。' },
    { key: 'ai', label: 'AI 培育', note: '路由、等待、结果规则与在途任务互斥沿用品牌配置。' }
  ];
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function recordKey() { return 'dkSchedulePolicy:' + chosenId + ':' + chosenBrand; }
  function read() {
    try {
      var r = JSON.parse(localStorage.getItem(recordKey()) || '{}');
      if (!r || typeof r !== 'object' || Array.isArray(r)) return {};
      if (r.published) {
        r.published.overrides = r.published.overrides || {};
        rows.forEach(function (row) {
          var value = r.published.overrides[row.key];
          if (value !== 'on' && value !== 'off') r.published.overrides[row.key] = (r.published.effectiveAtPublish || {})[row.key] ? 'on' : 'off';
        });
      }
      return r;
    } catch (e) { return {}; }
  }
  function schedule() { return scheduleData.find(function (s) { return s.id === chosenId; }); }
  function brands(s) {
    var found = {};
    (s.baseSeries || []).forEach(function (series) { if (brandCodes[series.brandName]) found[brandCodes[series.brandName]] = series.brandName; });
    return found;
  }
  function defaults(code) {
    var phoneCode = code === 'AITO' ? 'WENJIE' : code;
    var phone = (window.phoneStatusConfigs || {})[phoneCode] || { enabled: false, actions: {} };
    var ai = window.OutboundBrandConfig ? window.OutboundBrandConfig.get(code) : null;
    var brandName = Object.keys(brandCodes).find(function (name) { return brandCodes[name] === code; });
    var rules = (typeof interceptRules === 'undefined' ? [] : interceptRules).filter(function (rule) { return rule.status === 1 && (!rule.brand_id || rule.brand_name === brandName); });
    return { phone: !!phone.enabled, dedup: rules.length > 0, ai: !!(ai && ai.enabled), phoneRules: clone(phone.actions || {}), dedupRules: clone(rules), aiConfig: clone(ai) };
  }
  function effective(base, overrides) {
    var result = {};
    rows.forEach(function (row) {
      var selected = overrides[row.key];
      result[row.key] = !!base[row.key] && selected !== 'off';
    });
    return result;
  }
  function errors(base, values, overrides, required) {
    var list = [];
    overrides = overrides || {};
    rows.forEach(function (row) {
      var needs = overrides[row.key] === 'on' || (required && required[row.key] && overrides[row.key] !== 'off');
      if (needs && !base[row.key]) list.push(row.key === 'dedup' ? '接收去重：无可用规则，请到「拦截规则 → 去重规则」启用适用的公共或品牌规则。' : row.label + '：品牌能力未开启或已关闭，请到对应品牌页面配置。');
    });
    if (values.phone) {
      var codes = typeof phoneStatusDefinitions === 'function' ? phoneStatusDefinitions().map(function (x) { return x.code; }) : [];
      if (!codes.length || codes.some(function (code) { return !['block', 'continue'].includes(base.phoneRules[code]); })) list.push('号码检测缺少完整状态处理规则，请先完善品牌号码状态处理配置。');
    }
    if (values.ai && !(base.aiConfig && base.aiConfig.ready && base.aiConfig.aiReady)) list.push('AI 培育缺少可用的品牌路由、等待或结果配置，请先完善品牌 AI 外呼配置。');
    return list;
  }
  function uniqueCodeOwner(all, code, excludedId) {
    return all.find(function (s) { return s.id !== excludedId && (s.suppliers || []).some(function (sup) { return sup.smartcode === code; }); }) || null;
  }
  window.SchedulePolicyModel = Object.freeze({ effective: effective, uniqueCodeOwner: uniqueCodeOwner, errors: errors });
  function write(value) { try { localStorage.setItem(recordKey(), JSON.stringify(value)); return true; } catch (e) { showToast('浏览器存储不可用，保存失败', 'error'); return false; } }
  function publishedState(base, rec) {
    if (!rec.published) return { blocked: false, reasons: [] };
    var pub = rec.published;
    var closedChanged = false;
    rows.forEach(function (row) {
      if (!base[row.key] && pub.overrides[row.key] !== 'off') { pub.overrides[row.key] = 'off'; closedChanged = true; }
    });
    if (rec.suspension && ['closed', 'rules'].includes(rec.suspension.kind)) { delete rec.suspension; closedChanged = true; }
    if (closedChanged) write(rec);
    var required = Object.assign({}, pub.effectiveAtPublish || {}, rec.requiredCapabilities || {}), changed = false;
    rows.forEach(function (row) { if (base[row.key] && pub.overrides[row.key] !== 'off' && !required[row.key]) { required[row.key] = true; changed = true; } });
    if (changed) { rec.requiredCapabilities = required; write(rec); }
    var reasons = errors(base, effective(base, pub.overrides), pub.overrides, required);
    var missingRules = !base.dedup && (pub.overrides.dedup === 'on' || (required.dedup && pub.overrides.dedup !== 'off'));
    var closed = rows.some(function (row) { return !base[row.key] && (pub.overrides[row.key] === 'on' || (required[row.key] && pub.overrides[row.key] !== 'off')); });
    if (reasons.length && !rec.suspension) {
      rec.suspension = { reasons: reasons.slice(), kind: missingRules ? 'rules' : closed ? 'closed' : 'incomplete', detectedAt: new Date().toISOString() };
      write(rec);
    }
    return { blocked: !!rec.suspension, reasons: reasons.length ? reasons : (rec.suspension ? ['依赖已恢复，请核对项目设置并重新发布。'] : []), label: rec.suspension && !reasons.length ? '依赖已恢复，待重新发布' : missingRules ? '去重规则不可用，需处理' : closed || (rec.suspension && rec.suspension.kind === 'closed') ? '依赖已关闭，需处理' : '依赖配置失效，需处理' };
  }
  window.getSchedulePolicySummary = function (id) {
    var s = scheduleData.find(function (item) { return item.id === id; });
    if (!s) return { blocked: [] };
    var oldId = chosenId, oldBrand = chosenBrand, blocked = [];
    chosenId = id;
    Object.keys(brands(s)).forEach(function (code) {
      chosenBrand = code;
      var rec = read(), state = publishedState(defaults(code), rec);
      if (state.blocked) blocked.push({ brand: brands(s)[code], label: state.label });
    });
    chosenId = oldId; chosenBrand = oldBrand;
    return { blocked: blocked };
  };
  window.refreshSchedulePolicyDependencies = function () {
    scheduleData.forEach(function (item) { window.getSchedulePolicySummary(item.id); });
  };
  window.getPolicyManualReviewContext = function (id, brand) {
    var oldId = chosenId, oldBrand = chosenBrand;
    try {
      chosenId = id; chosenBrand = brand;
      var s = schedule();
      if (!s) return { blocked: '原归属排期不存在' };
      var rec = read(), base = defaults(brand), state = publishedState(base, rec);
      var available = scheduleAvailability(s);
      return { blocked: !available.active ? available.label : state.blocked ? state.reasons.join('；') : !rec.published ? '尚未发布项目策略' : '', version: rec.published ? rec.published.version : null, publishedAt: rec.published ? rec.published.publishedAt : null };
    } finally { chosenId = oldId; chosenBrand = oldBrand; }
  };
  window.addEventListener('dk-brand-capability-change', function (event) {
    var detail = event.detail || {};
    if (typeof detail.enabled !== 'boolean' || !rows.some(function (row) { return row.key === detail.capability; })) return;
    var code = detail.brandCode === 'WENJIE' ? 'AITO' : detail.brandCode;
    scheduleData.forEach(function (s) {
      var key = 'dkSchedulePolicy:' + s.id + ':' + code;
      try {
        var rec = JSON.parse(localStorage.getItem(key) || '{}');
        var pub = rec.published;
        if (!pub || (pub.overrides || {})[detail.capability] === 'off') return;
        if (detail.enabled) {
          rec.requiredCapabilities = Object.assign({}, pub.effectiveAtPublish || {}, rec.requiredCapabilities || {});
          rec.requiredCapabilities[detail.capability] = true;
          localStorage.setItem(key, JSON.stringify(rec));
          return;
        }
        if ((pub.overrides || {})[detail.capability] !== 'on' && !((rec.requiredCapabilities || pub.effectiveAtPublish || {})[detail.capability])) return;
        pub.overrides = pub.overrides || {};
        pub.overrides[detail.capability] = 'off';
        if (rec.suspension && ['closed', 'rules'].includes(rec.suspension.kind)) delete rec.suspension;
        localStorage.setItem(key, JSON.stringify(rec));
      } catch (e) { showToast('品牌能力已关闭，但项目关闭状态保存失败，请核对关联排期', 'warning'); }
    });
  });
  function sameOverrides(left, right) {
    return rows.every(function (row) { return ((left || {})[row.key] || 'inherit') === ((right || {})[row.key] || 'inherit'); });
  }
  function scheduleAvailability(s, now) {
    var time = new Date(now == null ? Date.now() : now).toISOString();
    var beijing = new Date(Date.parse(time) + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
    if (s.status !== 1) return { active: false, label: '排期已停用' };
    if (!s.startTime || !s.endTime || s.startTime > s.endTime) return { active: false, label: '排期时间待完善' };
    if (beijing < s.startTime) return { active: false, label: '排期未开始' };
    if (beijing > s.endTime) return { active: false, label: '排期已结束' };
    return { active: true, label: '排期有效' };
  }
  function explicitSettings(settings, base) {
    var result = {};
    rows.forEach(function (row) { result[row.key] = !base[row.key] || (settings || {})[row.key] === 'off' ? 'off' : 'on'; });
    return result;
  }
  function loadDraft() {
    var r = read(), base = defaults(chosenBrand);
    var saved = pending[recordKey()] || r.draft || (r.published && explicitSettings(r.published.overrides, r.published.effectiveAtPublish || base));
    draft = explicitSettings(saved || {}, base);
  }
  window.openSchedulePolicy = function (id) {
    if (!scheduleData.some(function (s) { return s.id === id; })) { showToast('排期不存在', 'error'); return; }
    chosenId = id;
    chosenBrand = Object.keys(brands(schedule()))[0] || '';
    loadDraft();
    navigateTo('schedule-policy');
  };
  window.changeSchedulePolicyScope = function () {
    pending[recordKey()] = clone(draft);
    chosenId = document.getElementById('policySchedule').value;
    chosenBrand = Object.keys(brands(schedule()))[0] || '';
    loadDraft(); renderSchedulePolicy();
  };
  window.changeSchedulePolicyBrand = function () { pending[recordKey()] = clone(draft); chosenBrand = document.getElementById('policyBrand').value; loadDraft(); renderSchedulePolicy(); };
  window.changeSchedulePolicyValue = function (key, value) {
    if (!rows.some(function (row) { return row.key === key; }) || !['on', 'off'].includes(value)) return;
    if (value === 'on' && !defaults(chosenBrand)[key]) { showToast('请先开启品牌能力或配置可用规则', 'warning'); return; }
    draft[key] = value; pending[recordKey()] = clone(draft); renderSchedulePolicy();
  };
  window.renderSchedulePolicy = function () {
    hidePolicyReturnHints();
    var s = schedule(); if (!s) return;
    var select = document.getElementById('policySchedule'); if (!select) return;
    select.innerHTML = scheduleData.map(function (item) { return '<option value="' + esc(item.id) + '">' + esc(item.name) + '</option>'; }).join(''); select.value = chosenId;
    var bs = brands(s), brand = document.getElementById('policyBrand');
    brand.innerHTML = Object.keys(bs).map(function (code) { return '<option value="' + esc(code) + '">' + esc(bs[code]) + '</option>'; }).join('');
    brand.value = chosenBrand;
    var base = defaults(chosenBrand), rec = read();
    draft = explicitSettings(draft, base);
    var values = effective(base, draft);
    var state = publishedState(base, rec), availability = scheduleAvailability(s);
    document.getElementById('policyScenarioNote').textContent = (s.id === pilotId ? '总部日产试点：固定价格、指定门店、一发一。' : '') + '此页维护当前排期的处理策略；金额、预算及渠道账号为演示资料。发布和草稿仅保存在当前浏览器。';
    document.getElementById('policyContext').textContent = s.name + ' · ' + ((s.suppliers || []).map(function (sup) { return sup.accountName + '（' + sup.accountId + '） / ' + sup.smartcode; }).join('；') || '尚未关联供应商') + ' · ' + s.startTime.replace('T', ' ') + ' ～ ' + s.endTime.replace('T', ' ');
    document.getElementById('policyVersion').textContent = rec.published ? (state.blocked ? '策略第 ' + rec.published.version + ' 版 · 待处理' : !availability.active ? '已发布：策略第 ' + rec.published.version + ' 版 · ' + availability.label : '当前生效：策略第 ' + rec.published.version + ' 版') : '尚未发布项目策略';
    document.getElementById('policyVersion').className = 'status-badge ' + (rec.published && !state.blocked && availability.active ? 'status-active' : 'status-warning');
    var edited = !sameOverrides(draft, rec.published && rec.published.overrides);
    var draftStatus = document.getElementById('policyDraftStatus');
    draftStatus.textContent = edited ? (rec.draft && sameOverrides(draft, rec.draft) ? '草稿已保存，尚未发布' : '有未发布修改') : '';
    draftStatus.hidden = !edited;
    draftStatus.style.display = edited ? '' : 'none';
    var execution = document.getElementById('policyExecutionStatus');
    execution.textContent = state.blocked ? state.label + '。该排期后续新线索暂停自动处理，已创建任务沿用原快照；请修复品牌依赖或调整项目设置，核对并重新发布。' : (rec.published ? '已发布策略可供后续新接入线索使用；新线索处理前仍会复核品牌依赖。' : '当前项目差异尚未发布，后续新线索沿用可用的品牌默认规则。');
    if (!availability.active) execution.textContent = availability.label + '，当前不接收后续新线索进入该排期自动处理。' + (state.blocked ? state.label + '；修复依赖后仍需核对并重新发布。' : '策略发布记录与排期可执行状态分别管理。') + '已创建任务沿用原快照和既定停止机制。';
    execution.className = 'policy-notice ' + (state.blocked || !availability.active ? 'policy-warning' : '');
    document.getElementById('policyRows').innerHTML = rows.map(function (row) {
      var mode = draft[row.key];
      var blocked = mode === 'on' && !base[row.key];
      var dedup = row.key === 'dedup';
      var status = dedup ? (base.dedup ? '有可用规则（' + base.dedupRules.length + ' 条）' : '无可用规则') : (base[row.key] ? '已开启' : '未开启');
      var enabledText = dedup ? '本项目执行' : '本项目开启';
      var disabledText = dedup ? '本项目不执行' : '本项目关闭';
      var missingText = dedup ? '（需先配置规则）' : '（需先开启品牌能力）';
      var resultText = blocked ? (dedup ? '规则不可用' : '依赖未开启') : values[row.key] ? (dedup ? '执行' : '开启') : (dedup ? '不执行' : '关闭');
      var origin = '来源：本项目设置';
      return '<tr><td><strong>' + row.label + '</strong><div class="form-hint">' + row.note + '</div></td><td>' + status + '</td><td><select class="form-input" aria-label="' + row.label + '项目设置" onchange="changeSchedulePolicyValue(\'' + row.key + '\',this.value)"' + (row.locked ? ' disabled' : '') + '><option value="on"' + (mode === 'on' ? ' selected' : '') + (!base[row.key] ? ' disabled' : '') + '>' + enabledText + (!base[row.key] ? missingText : '') + '</option><option value="off"' + (mode === 'off' ? ' selected' : '') + '>' + disabledText + '</option></select></td><td><span class="status-badge ' + (blocked ? 'status-warning' : values[row.key] ? 'status-active' : 'status-inactive') + '">' + resultText + '</span><div class="form-hint">' + origin + '</div></td></tr>';
    }).join('');
    var issues = errors(base, values, draft);
    document.getElementById('policyReadiness').textContent = issues.length ? issues.join(' ') : '依赖配置已就绪，可发布项目差异。';
    document.getElementById('policyReadiness').className = 'policy-notice ' + (issues.length ? 'policy-warning' : '');
  };
  window.saveSchedulePolicyDraft = function () { var rec = read(); rec.draft = clone(draft); if (write(rec)) { delete pending[recordKey()]; renderSchedulePolicy(); showToast('项目策略草稿已保存', 'success'); } };
  window.resetSchedulePolicyDraft = function () {
    var targetKey = recordKey(), saved = read();
    var destination = saved.published ? '已发布的项目策略 P' + saved.published.version : '按当前品牌状态初始化项目开关';
    var message = (saved.published ? '' : '当前排期尚未发布。') + '确定放弃当前草稿修改，并将表单恢复为“' + destination + '”吗？已保存草稿及未保存修改都会清除。';
    showConfirmDialog(message, function () {
      if (recordKey() !== targetKey) { showToast('当前排期或品牌已变化，请重新确认', 'warning'); return; }
      var rec = read(), restored = clone((rec.published && rec.published.overrides) || {});
      delete rec.draft;
      if (!rec.published) rec.useBrandDefaults = true;
      if (!write(rec)) return;
      delete pending[targetKey];
      draft = restored;
      renderSchedulePolicy();
      showToast(rec.published ? '已放弃草稿修改，恢复为项目策略 P' + rec.published.version : '已放弃草稿修改，恢复为按当前品牌状态初始化项目开关', 'success');
    });
  };
  window.publishSchedulePolicy = function () {
    var s = schedule(); if (!s || !chosenBrand) { showToast('请先选择有效排期和品牌', 'error'); return; }
    var conflict = (s.suppliers || []).map(function (sup) { return uniqueCodeOwner(scheduleData, sup.smartcode, s.id); }).find(Boolean);
    if (conflict) { showToast('SmartCode 已被其他排期引用：' + conflict.name, 'error'); return; }
    var base = defaults(chosenBrand), values = effective(base, draft), issues = errors(base, values, draft);
    if (issues.length) { renderSchedulePolicy(); showToast('请先补齐依赖配置，再发布项目策略', 'warning'); return; }
    var rec = read(), state = publishedState(base, rec);
    if (rec.published && !state.blocked && sameOverrides(draft, rec.published.overrides) && rows.every(function (row) { return !!values[row.key] === !!(rec.published.effectiveAtPublish || {})[row.key]; })) {
      showToast('配置未变更，无需重复发布', 'info'); return;
    }
    var version = rec.published ? rec.published.version + 1 : 1;
    rec.requiredCapabilities = clone(values);
    rec.published = { version: version, overrides: clone(draft), publishedAt: new Date().toISOString(), effectiveAtPublish: clone(values) };
    delete rec.useBrandDefaults;
    delete rec.suspension;
    delete rec.draft;
    if (write(rec)) { delete pending[recordKey()]; renderSchedulePolicy(); var availability = scheduleAvailability(s); showToast('项目策略 P' + version + ' 已发布' + (availability.active ? '，供后续新接入线索使用' : '；' + availability.label + '，当前不执行新线索'), 'success'); }
  };
  function hidePolicyReturnHints() {
    window.scheduleDedupBrandContext = null;
    ['policyPhoneReturn', 'policyAiReturn', 'policyDedupReturn'].forEach(function (id) {
      var hint = document.getElementById(id); if (hint) hint.style.display = 'none';
    });
  }
  function capturePolicyReturn() {
    pending[recordKey()] = clone(draft);
    returnContext = { scheduleId: chosenId, brand: chosenBrand };
    hidePolicyReturnHints();
  }
  function showPolicyReturnHint(id) {
    var hint = document.getElementById(id), s = schedule();
    if (!hint || !s) return;
    document.getElementById(id + 'Text').textContent = '来自排期「' + s.name + '」 · ' + (brands(s)[chosenBrand] || chosenBrand) + (id === 'policyDedupReturn' ? '。当前查看适用的公共及品牌去重规则（含停用项）；修改公共规则会影响其他适用品牌和排期。' : '。此处保存的是品牌规则，会影响其他使用该品牌规则的排期。');
    hint.style.display = 'flex';
  }
  window.openPolicyBrandAi = function () {
    capturePolicyReturn();
    navigateTo('dcc-outbound-config');
    switchOutboundBrand(chosenBrand);
    var selected = document.getElementById('outboundBrandSwitch');
    if (selected && selected.value === chosenBrand) showPolicyReturnHint('policyAiReturn');
  };
  window.openPolicyPhoneRules = function () {
    capturePolicyReturn();
    navigateTo('lead-intercept');
    switchInterceptTab('phone-status');
    showPolicyReturnHint('policyPhoneReturn');
    var code = chosenBrand === 'AITO' ? 'WENJIE' : chosenBrand;
    document.querySelectorAll('#phoneStatusConfigTableBody tr').forEach(function (row) {
      var matched = row.getAttribute('data-phone-brand') === code;
      row.classList.toggle('policy-config-target', matched);
      if (matched) { row.tabIndex = -1; row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    });
  };
  window.openPolicyDedupRules = function () {
    capturePolicyReturn();
    navigateTo('lead-intercept');
    window.scheduleDedupBrandContext = { code: chosenBrand, name: brands(schedule())[chosenBrand] || chosenBrand };
    clearInterceptRuleFilter();
    switchInterceptTab('rules');
    showPolicyReturnHint('policyDedupReturn');
  };
  window.showAllPolicyDedupRules = function () {
    window.scheduleDedupBrandContext = null;
    document.getElementById('policyDedupReturnText').textContent = '当前查看全部品牌去重规则；可返回原排期继续编辑处理策略。';
    filterInterceptRules();
  };
  window.returnToSchedulePolicyFromBrandConfig = function () {
    if (!returnContext) { navigateTo('schedule'); return; }
    if (!scheduleData.some(function (s) { return s.id === returnContext.scheduleId; })) { hidePolicyReturnHints(); navigateTo('schedule'); showToast('原排期不存在，请重新选择', 'warning'); return; }
    chosenId = returnContext.scheduleId; chosenBrand = returnContext.brand;
    loadDraft();
    navigateTo('schedule-policy');
  };
  if (typeof scheduleData !== 'undefined' && !scheduleData.some(function (s) { return s.id === pilotId; })) {
    var source = scheduleData.find(function (s) { return s.id === '04'; });
    if (source) {
      var pilot = clone(source); pilot.id = pilotId; pilot.name = '2026年10月全国庆典促销'; pilot.startTime = '2026-10-01T00:00'; pilot.endTime = '2026-10-31T23:59';
      pilot.totalBudget = 90000; pilot.suppliers = [clone(source.suppliers[0])]; pilot.suppliers[0].smartcode = 'SC-OLD-001'; scheduleData.push(pilot);
    }
  }
  document.addEventListener('DOMContentLoaded', function () { loadDraft(); });
})();

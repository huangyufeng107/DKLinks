/* 排期依赖暂停的人工复核：会话演示，不调用真实重新校验或厂商接口。 */
(function () {
  'use strict';
  var result = null;
  function context() {
    var snap = LeadPolicyEvidence.samples.policyPaused;
    var current = getPolicyManualReviewContext(snap.scheduleId, 'DONGFENG_NISSAN');
    if (!current.blocked && (!current.publishedAt || Date.parse(current.publishedAt) <= Date.parse(snap.capturedAt.replace(' ', 'T') + '+08:00') || current.version <= snap.version)) current.blocked = '须在原暂停后核对并重新发布项目策略';
    return current;
  }
  window.openPolicyManualReview = function () {
    if (result) { showToast('本条已提交处理，请查看详情中的人工处理记录', 'info'); return; }
    var current = context();
    document.getElementById('policyManualCondition').textContent = current.blocked ? '当前不能重新校验：' + current.blocked + '。可前往修复配置，或核实后决定仅接收。' : '当前配置具备提交条件。提交时将再次复核，重新校验通过后才允许下发。';
    var option = document.getElementById('policyManualRetryOption'); option.disabled = !!current.blocked;
    document.getElementById('policyManualDecision').value = '';
    document.getElementById('policyManualRemark').value = '';
    openModal('policyManualModal');
  };
  window.openPolicyManualConfig = function () { closeModal('policyManualModal'); openSchedulePolicy(LeadPolicyEvidence.samples.policyPaused.scheduleId); };
  window.submitPolicyManualReview = function () {
    if (result) { showToast('本条已处理，请勿重复提交', 'warning'); return; }
    var choice = document.getElementById('policyManualDecision').value;
    var remark = document.getElementById('policyManualRemark').value.trim();
    if (!choice || !remark) { showToast('请选择处理方式并填写核查备注', 'warning'); return; }
    if (choice !== 'retry' && choice !== 'receive') return;
    var current = context();
    if (choice === 'retry' && current.blocked) { showToast(current.blocked, 'warning'); return; }
    var receive = choice === 'receive';
    result = { status: receive ? '仅接收' : '处理中', reason: receive ? '人工决定仅接收，不下发' : '人工提交重新校验（演示），尚未调用厂商接口', remark: remark, actor: '原型演示操作员', at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }), version: current.version };
    var data = leadDetailExamples.policyPaused;
    data.policyManualReview = result;
    data.statusHtml = '<span class="status-badge status-warning">' + result.status + '</span>';
    data.dispatchDecision = result.reason; data.note = result.reason + '；核查备注：' + remark;
    var cell = document.getElementById('policyPausedStatus'); cell.replaceChildren();
    var badge = document.createElement('span'); badge.className = 'status-badge status-warning'; badge.textContent = result.status;
    var hint = document.createElement('div'); hint.className = 'form-hint'; hint.textContent = result.reason; cell.append(badge, hint);
    document.getElementById('policyPausedProcess').hidden = true;
    document.getElementById('policyPausedProcess').style.display = 'none';
    var activeTab = document.querySelector('#page-leads .lead-status-tabs .tab-btn.active');
    if (activeTab) activeTab.click();
    closeModal('policyManualModal');
    showToast(receive ? '已完成：仅接收，不下发。详情保留人工处理记录。' : '已记录重新校验演示；真实校验队列尚未接入。', 'success');
  };
})();

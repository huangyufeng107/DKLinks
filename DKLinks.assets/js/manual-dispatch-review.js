// 关联外呼线索的人工处理入口。生产环境须由服务端校验准入与任务版本，并原子更新处理状态。
(function () {
  var reviewed = false;

  window.openManualDispatchReview = function () {
    if (reviewed) {
      showToast('该线索已处理，请刷新列表查看最新状态', 'info');
      return;
    }
    document.getElementById('manualDispatchReviewDecision').value = '';
    document.getElementById('manualDispatchReviewRemark').value = '';
    openModal('manualDispatchReviewModal');
  };

  window.submitManualDispatchReview = function () {
    var decision = document.getElementById('manualDispatchReviewDecision').value;
    var remark = document.getElementById('manualDispatchReviewRemark').value.trim();
    if (!decision) {
      showToast('请选择处理决定', 'error');
      return;
    }
    if (!remark) {
      showToast('请填写处理备注', 'error');
      return;
    }
    if (reviewed) {
      showToast('该线索已处理，请刷新列表查看最新状态', 'error');
      return;
    }

    // 原型只呈现状态流转；实际下发需由服务端复核并排队，不能从浏览器直接调用厂商接口。
    reviewed = true;
    var dispatch = decision === 'dispatch';
    var status = dispatch ? '处理中' : '仅接收';
    var statusCell = document.getElementById('manualDispatchLeadStatus');
    var badge = document.createElement('span');
    badge.className = 'status-badge ' + (dispatch ? 'status-primary' : 'status-warning');
    badge.textContent = status;
    var description = document.createElement('div');
    description.style.cssText = 'font-size:12px;color:var(--gray-600);margin-top:4px;';
    description.textContent = dispatch ? '人工确认，待厂商响应' : '人工决定不下发';
    statusCell.replaceChildren(badge, description);
    document.getElementById('manualDispatchLeadActions').innerHTML =
      '<button class="btn btn-secondary btn-sm" type="button" onclick="openLeadDetail(\'nissanLinkedManual\')">详情</button>';
    document.getElementById('manualDispatchTabCount').textContent = '0';
    var targetCount = document.getElementById(dispatch ? 'manualDispatchProcessingCount' : 'manualDispatchReceivedCount');
    targetCount.textContent = String(Number(targetCount.textContent) + 1);

    var detail = leadDetailExamples.nissanLinkedManual;
    detail.statusHtml = '<span class="status-badge ' + (dispatch ? 'status-primary' : 'status-warning') + '">' + status + '</span>';
    detail.dispatchDecision = dispatch ? '人工确认，已提交厂商下发队列，等待响应' : '人工决定仅接收，不下发';
    detail.note = dispatch
      ? '人工核查后确认进入厂商下发队列；不附外呼标签与小结。处理备注：' + remark
      : '人工核查后决定仅接收，不调用厂商接口。处理备注：' + remark;
    detail.decisionLog = detail.dispatchDecision + '；备注：' + remark;
    detail.decisionActor = '原型演示操作人';
    var now = new Date();
    var pad = function (value) { return String(value).padStart(2, '0'); };
    detail.decisionTime = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
      ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

    closeModal('manualDispatchReviewModal');
    var activeTab = document.querySelector('#page-leads .lead-status-tabs .tab-btn.active');
    if (activeTab) {
      var action = activeTab.getAttribute('onclick') || '';
      var match = action.match(/filterByStatus\(this, '([^']*)'\)/);
      if (match) {
        filterByStatus(activeTab, match[1]);
      }
    }
    showToast(dispatch ? '已提交厂商下发队列，等待响应' : '已标记为仅接收', 'success');
  };
})();

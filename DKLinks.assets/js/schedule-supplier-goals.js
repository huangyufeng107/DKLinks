(function () {
  'use strict';
  let selected = null;
  // Provide a visible review fixture without changing existing schedules.
  const base = scheduleData.find(item => item.id === '04');
  if (base && !scheduleData.some(item => item.id === 'supplier-goal-review')) {
    const example = JSON.parse(JSON.stringify(base));
    example.id = 'supplier-goal-review';
    example.name = '【样例】按量付费供应商锁单目标';
    example.startTime = '2026-11-01T00:00';
    example.endTime = '2026-12-31T23:59';
    example.totalBudget = 0;
    example.commercial = Object.assign({}, example.commercial, {
      settlement: 'CPQL', payment: 'volume', expectedSupply: 1000,
      expectedConversionRate: '1', targetLockedOrders: 10
    });
    example.suppliers.forEach((supplier, index) => {
      supplier.settlement = 'CPQL';
      supplier.targetLockedOrders = index === 0 ? 3 : 7;
      supplier.budget = 0;
      supplier.smartcode = 'SC-GOAL-REVIEW-' + (index + 1);
      supplier.lockSnapshot = {count: index === 0 ? 3 : 4, recordedAt: '2026-11-18 10:00（样例）'};
    });
    scheduleData.push(example);
  }

  function esc(value) { return escapeHTML(String(value ?? '—')); }
  function count(supplier) {
    const snapshot = supplier.lockSnapshot;
    return snapshot && Number.isSafeInteger(snapshot.count) && snapshot.count >= 0 ? snapshot.count : null;
  }
  window.openScheduleSupplierGoals = function (id) {
    const schedule = scheduleData.find(item => item.id === id);
    if (!schedule || schedule.commercial?.payment !== 'volume') {
      showToast('请选择按量付费排期', 'warning');
      return;
    }
    selected = schedule;
    const suppliers = schedule.suppliers || [];
    document.getElementById('scheduleSupplierGoalsName').textContent = schedule.name;
    document.getElementById('scheduleSupplierGoalsTarget').textContent = schedule.commercial.targetLockedOrders + ' 台';
    document.getElementById('scheduleSupplierGoalsAllocated').textContent =
      suppliers.reduce((sum, supplier) => sum + (supplier.targetLockedOrders || 0), 0) + ' 台';
    document.getElementById('scheduleSupplierGoalsCount').textContent = suppliers.length + ' 家';
    document.getElementById('scheduleSupplierGoalsRows').innerHTML = suppliers.length ? suppliers.map((supplier, index) => {
      const locked = count(supplier), target = supplier.targetLockedOrders;
      const validTarget = Number.isSafeInteger(target) && target > 0;
      const reached = locked !== null && validTarget && locked >= target;
      const state = locked === null ? '待接入锁单数据' : !validTarget ? '目标待完善' : reached ? '已达标' : '未达标';
      const dispatch = schedule.status !== 1 ? '排期已禁用' : locked === null || !validTarget ? '下发状态待核对' :
        reached ? '新进线索停止下发' : '按排期及处理策略校验';
      return '<tr><td>' + esc(supplier.accountName || supplier.accountId) +
        '<div class="form-hint">' + esc(supplier.accountId) + '</div></td><td>' +
        (validTarget ? target + ' 台' : '—') + '</td><td>' + (locked === null ? '—' : '<button type="button" class="lock-entry-count-link" data-supplier-lock-entries="' + index + '" aria-label="查看原传有效锁单明细">' + locked + ' 台</button>') +
        '</td><td><span class="status-badge ' + (reached ? 'status-warning' : 'status-pending') + '">' +
        state + '</span><div class="form-hint">' + dispatch + '</div></td><td>' +
        esc(supplier.lockSnapshot?.recordedAt) + '</td><td><button type="button" class="btn btn-secondary btn-sm" data-supplier-goal-log="' +
        index + '">下发日志</button></td></tr>';
    }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;">暂无供应商配置</td></tr>';
    navigateTo('schedule-supplier-goals');
  };
  document.getElementById('scheduleSupplierGoalsRows').addEventListener('click', function (event) {
    const entriesButton = event.target.closest('[data-supplier-lock-entries]');
    if (entriesButton && selected) { openSupplierLockEntries(selected.id, Number(entriesButton.dataset.supplierLockEntries)); return; }
    const button = event.target.closest('[data-supplier-goal-log]');
    if (!button || !selected) return;
    const supplier = selected.suppliers[Number(button.dataset.supplierGoalLog)];
    openSupplierDispatchLogs('', {schedule:selected.name, supplier:supplier.accountName || supplier.accountId});
  });
})();

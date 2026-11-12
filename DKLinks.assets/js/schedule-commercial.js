/* 仅用于排期新增、编辑、查看的配置原型；不执行扣费或停发。 */
(function () {
  'use strict';
  var methods = ['CPL', 'CPQL', 'CPO', 'CPS'];
  var savedPayment = null;
  function el(id) { return document.getElementById(id); }
  function value(id) { return el(id).value; }
  function quantityMode() { return value('schedulePayment') === 'volume'; }
  function target(supply, rate) {
    var q = String(supply).trim(), r = String(rate).trim();
    if (!/^\d+$/.test(q) || !Number.isSafeInteger(Number(q)) || Number(q) <= 0) return { error: '预期供应量须为正整数' };
    if (!/^\d+(\.\d+)?$/.test(r) || !Number.isFinite(Number(r)) || Number(r) <= 0 || Number(r) > 100) return { error: '预期转化率须大于0且不超过100%' };
    var parts = r.split('.'), digits = parts[1] || '', denominator = 100n * 10n ** BigInt(digits.length);
    return { target: Number((BigInt(q) * BigInt(parts[0] + digits) + denominator - 1n) / denominator) };
  }
  function cents(v) { var s = String(v).trim(); if (!/^\d+(\.\d{1,2})?$/.test(s)) return null; var p = s.split('.'); return BigInt(p[0]) * 100n + BigInt(((p[1] || '') + '00').slice(0, 2)); }
  function shareState() {
    var raw = String(value('scheduleHeadShare')).trim(), n = Number(raw);
    if (!/^(0|[1-9]\d*)(\.\d*)?$/.test(raw) || !Number.isFinite(n) || n < 0 || n > 100) return { error: '总部承担比例须在0—100之间，两方合计100%。' };
    var parts = raw.split('.'), places = (parts[1] || '').length, factor = 10n ** BigInt(places);
    var rest = String(100n * factor - BigInt(parts[0] + (parts[1] || ''))).padStart(places + 1, '0');
    return { head: n, store: Number(places ? rest.slice(0, -places) + '.' + rest.slice(-places) : rest) };
  }
  function shareInput() {
    var input = el('scheduleHeadShare'), raw = String(input.value).trim();
    if (raw === '') { input.dataset.lastShare = ''; change(); return; }
    if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(Number(raw))) {
      input.value = input.dataset.lastShare || ''; change(); return;
    }
    if (Number(raw) > 100) raw = '100';
    else if (Number(raw) < 0) raw = '0';
    else raw = raw.replace(/^-/, '').replace(/^0+(?=\d)/, '').replace(/^\./, '0.');
    input.value = raw; input.dataset.lastShare = raw; change();
  }
  function load(data, mode) {
    data = data || {}; var c = data.commercial || {};
    var savedMethods = Array.from(new Set((data.suppliers || []).map(function (s) { return s.settlement; })));
    el('scheduleSettlement').value = c.settlement || (savedMethods.length === 1 ? savedMethods[0] : mode === 'add' ? 'CPL' : '');
    el('schedulePartner').value = c.partner || '';
    el('scheduleHeadShare').value = c.headShare == null ? 100 : c.headShare;
    el('scheduleHeadShare').dataset.lastShare = String(el('scheduleHeadShare').value);
    el('scheduleStoreShare').value = 100 - Number(el('scheduleHeadShare').value);
    el('schedulePayment').value = c.payment || 'prepaid';
    savedPayment = mode === 'add' ? null : el('schedulePayment').value;
    el('schedulePayment').dataset.immutableAfterCreate = savedPayment ? 'true' : 'false';
    el('schedulePayment').hidden = !!savedPayment;
    el('schedulePaymentReadonly').hidden = !savedPayment;
    el('schedulePaymentReadonly').value = savedPayment === 'volume' ? '按量付费' : '预充值';
    el('schedulePaymentLockHint').hidden = !savedPayment;
    el('schedulePaymentRequired').hidden = !!savedPayment;
    el('scheduleExpectedSupply').value = c.expectedSupply || '';
    el('scheduleExpectedRate').value = c.expectedConversionRate || '';
    if (window.ScheduleDispatch) ScheduleDispatch.load(data.dispatch);
    el('scheduleLegacyNote').hidden = !(savedMethods.length > 1 && !c.settlement);
    change();
  }
  function supplier(idx, saved) {
    saved = saved || {};
    var panel = el('supplierRow' + idx);
    panel.querySelector('.schedule-supplier-form-grid').insertAdjacentHTML('beforeend',
      '<div class="form-group schedule-volume-field"><label class="form-label">分配锁单量（台） <span class="required">*</span></label><input class="form-input" id="supLockedTarget' + idx + '" type="number" min="1" step="1" placeholder="手动分配" oninput="ScheduleCommercial.change()"></div>');
    el('supLockedTarget' + idx).value = saved.targetLockedOrders || '';
    var select = el('supSettlement' + idx);
    select.value = value('scheduleSettlement') || saved.settlement || '';
    select.dataset.followSchedule = 'true'; select.readOnly = true; select.disabled = true;
    select.previousElementSibling.textContent = '结算方式（跟随排期）';
    el('supCostPrice' + idx).value = saved.costPrice || '';
    el('supSalePrice' + idx).value = saved.salePrice || '';
    el('supOrderCost' + idx).value = saved.orderCost || '';
    el('supOrderSale' + idx).value = saved.orderSale || '';
    ['CostPrice','SalePrice','DeliveryCost','DeliverySale','OrderCost','OrderSale'].forEach(function (name) {
      var input = el('sup' + name + idx);
      var errorId = 'sup' + name + 'Error' + idx;
      input.insertAdjacentHTML('afterend', '<p class="schedule-field-error" id="' + errorId + '" role="status" aria-live="polite"></p>');
      input.setAttribute('aria-describedby', errorId);
      input.inputMode = 'numeric';
      input.addEventListener('input', liveValidation);
      input.addEventListener('keydown', function (event) { if (['-', '+', '.', 'e', 'E'].includes(event.key)) { event.preventDefault(); el(errorId).textContent = '单价仅支持大于0的整数。'; } });
      input.addEventListener('paste', function (event) { if (!/^[1-9]\d*$/.test(event.clipboardData.getData('text').trim())) { event.preventDefault(); el(errorId).textContent = '请输入正整数，如10；不支持010、负数或小数。'; } });
    });
    change();
  }
  function change() {
    var volume = quantityMode(), method = value('scheduleSettlement');
    var shares = shareState();
    el('scheduleStoreShare').value = shares.error ? '' : shares.store;
    el('scheduleShareError').textContent = shares.error ? shares.error : '';
    el('scheduleHeadShare').style.borderColor = shares.error ? '#dc2626' : '';
    el('scheduleHeadShare').setAttribute('aria-invalid', shares.error ? 'true' : 'false');
    el('scheduleTotalBudget').closest('.form-group').hidden = volume;
    el('scheduleSupplyGroup').hidden = !volume;
    el('scheduleVolumeProjectGroup').hidden = !volume;
    el('scheduleRateGroup').hidden = !volume;
    el('scheduleTargetGroup').hidden = !volume;
    el('scheduleExpectedRate').required = volume;
    var projectTarget = target(value('scheduleExpectedSupply'), value('scheduleExpectedRate'));
    el('scheduleProjectTarget').value = projectTarget.error ? '—' : projectTarget.target.toLocaleString() + ' 台';
    el('scheduleProjectTarget').classList.toggle('is-calculated', !projectTarget.error);
    el('scheduleProjectTargetHint').textContent = projectTarget.error ? '填写供应量和转化率后自动计算' : '供应量 × 转化率，向上取整';
    el('scheduleTotalBudget').required = !volume;
    el('scheduleExpectedSupply').required = volume;
    el('schedulePaymentRule').textContent = volume ? '项目目标＝预期供应量×预期锁单转化率，向上取整。供应商手动分配锁单量，合计须等于项目目标；各自达标分别停发。供应量超出预期但有效锁单未达标，继续下发。' : '总预算与供应商分配预算合计须相等。此处配置计划额度；实际充值、余额扣减与停发服务另行接入。';
    document.querySelectorAll('#scheduleSupplierTbody .schedule-supplier-row').forEach(function (row) {
      var idx = row.id.replace('supplierRow', '');
      if (method) el('supSettlement' + idx).value = method;
      el('supSettlement' + idx).disabled = true;
      el('supSettlement' + idx).title = '跟随基础信息中的统一结算方式';
      var sectionTitle = row.querySelector('.schedule-panel-section-title');
      if (sectionTitle) {
        sectionTitle.textContent = volume ? '账号与锁单分配' : '账号与预算';
        if (sectionTitle.nextElementSibling) sectionTitle.nextElementSibling.textContent = volume ? '手动分配本供应商的有效锁单目标，合计须与项目目标一致' : '每个供应商独立维护分配预算、SMARTCODE与关联门店';
      }
      el('supBudget' + idx).closest('.form-group').hidden = volume;
      el('supBudget' + idx).required = !volume;
      el('supLockedTarget' + idx).required = volume;
      row.querySelectorAll('.schedule-volume-field').forEach(function (f) { f.hidden = !volume; });
      onScheduleSettlementChange(idx);
      updateScheduleSupplierCardSummary(idx);
    });
    el('scheduleEditorTab-suppliers').textContent = volume ? '账号与锁单分配' : '账号与预算';
    updateScheduleDrawerSummary();
  }
  function summary() {
    var volume = quantityMode(), sum = 0;
    document.querySelectorAll('#scheduleSupplierTbody .schedule-supplier-row').forEach(function (row) {
      var idx = row.id.replace('supplierRow', '');
      sum += Number(value(volume ? 'supLockedTarget' + idx : 'supBudget' + idx)) || 0;
      var meta = el('supTabMeta' + idx);
      if (volume && meta) meta.textContent = (el('supSettlement' + idx).value || '待选结算方式') + ' · 分配锁单 ' + (Number(value('supLockedTarget' + idx)) || 0) + ' 台';
    });
    el('scheduleSummaryBudget').previousElementSibling.textContent = volume ? '项目锁单目标' : '总预算';
    el('scheduleSummaryAllocated').previousElementSibling.textContent = volume ? '已分配锁单量' : '已分配预算';
    var total = volume ? target(value('scheduleExpectedSupply'), value('scheduleExpectedRate')).target || 0 : Number(value('scheduleTotalBudget')) || 0;
    if (volume) {
      el('scheduleSummaryBudget').textContent = total.toLocaleString() + ' 台';
      el('scheduleSummaryAllocated').textContent = sum.toLocaleString() + ' 台';
      el('scheduleFooterSummary').textContent = '锁单量已分配 ' + sum.toLocaleString() + ' / ' + total.toLocaleString() + ' 台；按供应商有效锁单目标分别停发';
    }
    liveValidation();
  }
  function priceError(idx, includeMissing) {
    var fields = ['CostPrice','SalePrice','DeliveryCost','DeliverySale'];
    if (value('supSettlement' + idx) === 'CPO') fields.push('OrderCost','OrderSale');
    var error = '';
    fields.forEach(function (name) {
      var input = el('sup' + name + idx), raw = String(input.value).trim();
      var invalid = raw ? !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) : includeMissing !== false && input.required;
      var message = invalid ? raw ? '请输入正整数，如10；不允许010、0、负数、小数或科学计数法。' : '请填写此项结算单价。' : '';
      input.style.borderColor = invalid ? '#dc2626' : '';
      input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      var hint = el('sup' + name + 'Error' + idx); if (hint) hint.textContent = message;
      if (invalid && !error) error = message;
    });
    return error;
  }
  function liveValidation() {
    var volume = quantityMode(), total = volume ? target(value('scheduleExpectedSupply'), value('scheduleExpectedRate')).target || 0 : Number(value('scheduleTotalBudget')) || 0, sum = 0, priceInvalid = false;
    var all = Array.from(document.querySelectorAll('#scheduleSupplierTbody .schedule-supplier-row'));
    all.forEach(function (row) { var idx = row.id.replace('supplierRow',''); sum += Number(value((volume ? 'supLockedTarget' : 'supBudget') + idx)) || 0; var error = priceError(idx, false); priceInvalid = priceInvalid || !!error; });
    if (!volume) sum = Number(sum.toFixed(2));
    var exceeded = total > 0 && sum > total;
    var feedback = el('scheduleAllocationFeedback');
    if (feedback) { feedback.textContent = total > 0 ? exceeded ? '分配超额：已分配 ' + sum.toLocaleString() + '，总额 ' + total.toLocaleString() + '，超出 ' + Number((sum-total).toFixed(2)).toLocaleString() + (volume ? ' 台' : ' 元') + '。请调整后保存。' : '已分配 ' + sum.toLocaleString() + ' / ' + total.toLocaleString() + (volume ? ' 台' : ' 元') + '；剩余可分配 ' + Number((total-sum).toFixed(2)).toLocaleString() + '，保存时合计须相等。' : '请先在基础信息填写' + (volume ? '预期供应量和转化率。' : '总预算。'); feedback.className = exceeded ? 'schedule-allocation-feedback is-error' : 'schedule-allocation-feedback'; }
    all.forEach(function (row) { var idx = row.id.replace('supplierRow',''), input = el((volume ? 'supLockedTarget' : 'supBudget') + idx); input.max = String(Math.max(0,total - sum + (Number(input.value)||0))); input.style.borderColor = exceeded ? '#dc2626' : ''; });
    el('scheduleSaveBtn').disabled = exceeded || priceInvalid || !!shareState().error;
  }
  function showError(message) { el('scheduleConfigIssueText').textContent = message; openModal('scheduleConfigIssueModal'); }
  function validate() {
    var settlement = value('scheduleSettlement'), payment = value('schedulePayment'), share = Number(value('scheduleHeadShare'));
    if (savedPayment && payment !== savedPayment) return { error: '支付方式在排期创建后不可修改，请恢复原支付方式。' };
    if (!methods.includes(settlement)) return { error: '请在基础信息中选择结算方式' };
    if (!['headquarters', 'store'].includes(value('schedulePartner'))) return { error: '请选择合作方' };
    if (shareState().error) return shareState();
    if (!['prepaid', 'volume'].includes(payment)) return { error: '请选择支付方式' };
    if (payment === 'prepaid' && (cents(value('scheduleTotalBudget')) === null || cents(value('scheduleTotalBudget')) <= 0n)) return { error: '总预算须大于0，最多两位小数' };
    if (payment === 'volume' && target(value('scheduleExpectedSupply'), '100').error) return { error: '预期供应总量须为正整数' };
    var calculated = target(value('scheduleExpectedSupply'), value('scheduleExpectedRate'));
    if (payment === 'volume' && calculated.error) return calculated;
    return { settlement: settlement, partner: value('schedulePartner'), headShare: share, storeShare: shareState().store, payment: payment, expectedSupply: payment === 'volume' ? Number(value('scheduleExpectedSupply')) : null, expectedConversionRate: payment === 'volume' ? value('scheduleExpectedRate') : null, targetLockedOrders: payment === 'volume' ? calculated.target : null };
  }
  function readSupplier(idx, commercial) {
    if (commercial.payment === 'prepaid') {
      var amount = cents(value('supBudget' + idx));
      return amount === null || amount <= 0n ? { error: '各供应商分配预算须大于0，最多两位小数' } : { budget: Number(value('supBudget' + idx)), expectedSupply: null, expectedConversionRate: null, targetLockedOrders: null };
    }
    var result = target(value('supLockedTarget' + idx), '100');
    if (result.error) return result;
    return { budget: 0, expectedSupply: null, expectedConversionRate: null, targetLockedOrders: result.target };
  }
  function checkTotals(suppliers, commercial) {
    if (commercial.payment === 'volume') return suppliers.reduce(function (sum, s) { return sum + s.targetLockedOrders; }, 0) === commercial.targetLockedOrders ? '' : '供应商分配锁单量合计必须等于项目目标锁单量';
    var sum = suppliers.reduce(function (v, s) { return v + cents(s.budget); }, 0n);
    return sum === cents(value('scheduleTotalBudget')) ? '' : '供应商分配预算合计必须等于排期总预算';
  }
  window.ScheduleCommercial = { load: load, supplier: supplier, shareInput: shareInput, change: change, summary: summary, validate: validate, readSupplier: readSupplier, checkTotals: checkTotals, target: target, cents: cents, quantityMode: quantityMode, priceError: priceError, showError: showError };
})();

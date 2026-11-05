/* 仅用于排期新增、编辑、查看的配置原型；不执行扣费或停发。 */
(function () {
  'use strict';
  var methods = ['CPL', 'CPQL', 'CPO', 'CPS'];
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
  function load(data, mode) {
    data = data || {}; var c = data.commercial || {};
    var savedMethods = Array.from(new Set((data.suppliers || []).map(function (s) { return s.settlement; })));
    el('scheduleSettlement').value = c.settlement || (savedMethods.length === 1 ? savedMethods[0] : mode === 'add' ? 'CPL' : '');
    el('schedulePartner').value = c.partner || '';
    el('scheduleHeadShare').value = c.headShare == null ? 100 : c.headShare;
    el('scheduleStoreShare').value = 100 - Number(el('scheduleHeadShare').value);
    el('schedulePayment').value = c.payment || 'prepaid';
    el('scheduleExpectedSupply').value = c.expectedSupply || '';
    el('scheduleLegacyNote').hidden = !(savedMethods.length > 1 && !c.settlement);
    change();
  }
  function supplier(idx, saved) {
    saved = saved || {};
    var panel = el('supplierRow' + idx);
    panel.querySelector('.schedule-supplier-form-grid').insertAdjacentHTML('beforeend',
      '<div class="form-group schedule-volume-field"><label class="form-label">分配预期供应量（条） <span class="required">*</span></label><input class="form-input" id="supExpectedSupply' + idx + '" type="number" min="1" step="1" oninput="ScheduleCommercial.change()"></div>' +
      '<div class="form-group schedule-volume-field"><label class="form-label">预期锁单转化率（%） <span class="required">*</span></label><input class="form-input" id="supExpectedRate' + idx + '" type="number" min="0" max="100" step="any" placeholder="1代表1%" oninput="ScheduleCommercial.change()"></div>' +
      '<div class="form-group schedule-volume-field"><label class="form-label">目标有效锁单量（台）</label><input class="form-input" id="supLockedTarget' + idx + '" readonly></div>');
    el('supExpectedSupply' + idx).value = saved.expectedSupply || '';
    el('supExpectedRate' + idx).value = saved.expectedConversionRate || '';
    var select = el('supSettlement' + idx);
    select.innerHTML = '<option value="">请选择排期结算方式</option>' + methods.map(function (m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
    select.value = value('scheduleSettlement') || saved.settlement || '';
    select.dataset.followSchedule = 'true'; select.disabled = true;
    select.previousElementSibling.textContent = '结算方式（跟随排期）';
    el('supCostPrice' + idx).value = select.value === 'CPO' ? saved.orderCost || '' : saved.costPrice || '';
    el('supSalePrice' + idx).value = select.value === 'CPO' ? saved.orderSale || '' : saved.salePrice || '';
    change();
  }
  function change() {
    var volume = quantityMode(), method = value('scheduleSettlement');
    el('scheduleStoreShare').value = value('scheduleHeadShare') === '' ? '' : 100 - Number(value('scheduleHeadShare'));
    el('scheduleTotalBudget').closest('.form-group').hidden = volume;
    el('scheduleSupplyGroup').hidden = !volume;
    el('scheduleTotalBudget').required = !volume;
    el('scheduleExpectedSupply').required = volume;
    el('schedulePaymentRule').textContent = volume ? '各供应商目标＝分配预期供应量×预期锁单转化率，向上取整；达到各自有效锁单目标时分别停发。供应量超出预期但锁单未达标，继续下发。' : '总预算与供应商分配预算合计须相等。此处配置计划额度；实际充值、余额扣减与停发服务另行接入。';
    document.querySelectorAll('#scheduleSupplierTbody .schedule-supplier-row').forEach(function (row) {
      var idx = row.id.replace('supplierRow', '');
      if (method) el('supSettlement' + idx).value = method;
      el('supSettlement' + idx).disabled = true;
      el('supSettlement' + idx).title = '跟随基础信息中的统一结算方式';
      var sectionTitle = row.querySelector('.schedule-panel-section-title');
      if (sectionTitle) {
        sectionTitle.textContent = volume ? '账号与供应量' : '账号与预算';
        if (sectionTitle.nextElementSibling) sectionTitle.nextElementSibling.textContent = volume ? '每个供应商独立分配供应量、填写转化率并计算有效锁单目标' : '每个供应商独立维护分配预算、SMARTCODE与关联专营店';
      }
      el('supBudget' + idx).closest('.form-group').hidden = volume;
      el('supBudget' + idx).required = !volume;
      el('supExpectedSupply' + idx).required = volume;
      el('supExpectedRate' + idx).required = volume;
      row.querySelectorAll('.schedule-volume-field').forEach(function (f) { f.hidden = !volume; });
      var result = target(value('supExpectedSupply' + idx), value('supExpectedRate' + idx));
      el('supLockedTarget' + idx).value = result.error ? '待填写供应量与转化率' : result.target + ' 台';
      var name = el('supSettlement' + idx).value === 'CPO' ? '锁单／订单' : el('supSettlement' + idx).value === 'CPQL' ? '有效线索' : '商机';
      el('supCostPrice' + idx).previousElementSibling.innerHTML = name + '成本价 <span class="required">*</span>';
      el('supSalePrice' + idx).previousElementSibling.innerHTML = name + '销售价 <span class="required">*</span>';
      onScheduleSettlementChange(idx);
      updateScheduleSupplierCardSummary(idx);
    });
    el('scheduleEditorTab-suppliers').textContent = volume ? '账号与供应量' : '账号与预算';
    updateScheduleDrawerSummary();
  }
  function summary() {
    var volume = quantityMode(), sum = 0;
    document.querySelectorAll('#scheduleSupplierTbody .schedule-supplier-row').forEach(function (row) {
      var idx = row.id.replace('supplierRow', '');
      sum += Number(value(volume ? 'supExpectedSupply' + idx : 'supBudget' + idx)) || 0;
      var meta = el('supTabMeta' + idx);
      if (volume && meta) meta.textContent = (el('supSettlement' + idx).value || '待选结算方式') + ' · ' + (Number(value('supExpectedSupply' + idx)) || 0).toLocaleString() + '条 · 目标' + (target(value('supExpectedSupply' + idx), value('supExpectedRate' + idx)).target || '—') + '台';
    });
    el('scheduleSummaryBudget').previousElementSibling.textContent = volume ? '预期供应总量' : '总预算';
    el('scheduleSummaryAllocated').previousElementSibling.textContent = volume ? '已分配供应量' : '已分配预算';
    var total = Number(value(volume ? 'scheduleExpectedSupply' : 'scheduleTotalBudget')) || 0;
    if (volume) {
      el('scheduleSummaryBudget').textContent = total.toLocaleString() + ' 条';
      el('scheduleSummaryAllocated').textContent = sum.toLocaleString() + ' 条';
      el('scheduleFooterSummary').textContent = '供应量已分配 ' + sum.toLocaleString() + ' / ' + total.toLocaleString() + ' 条；按供应商有效锁单目标分别停发';
    }
  }
  function validate() {
    var settlement = value('scheduleSettlement'), payment = value('schedulePayment'), share = Number(value('scheduleHeadShare'));
    if (!methods.includes(settlement)) return { error: '请在基础信息中选择结算方式' };
    if (!['headquarters', 'store'].includes(value('schedulePartner'))) return { error: '请选择合作方' };
    if (value('scheduleHeadShare') === '' || !Number.isFinite(share) || share < 0 || share > 100) return { error: '总部承担比例须为0至100%，门店比例自动补足100%' };
    if (!['prepaid', 'volume'].includes(payment)) return { error: '请选择支付方式' };
    if (payment === 'prepaid' && (cents(value('scheduleTotalBudget')) === null || cents(value('scheduleTotalBudget')) <= 0n)) return { error: '总预算须大于0，最多两位小数' };
    if (payment === 'volume' && target(value('scheduleExpectedSupply'), '100').error) return { error: '预期供应总量须为正整数' };
    return { settlement: settlement, partner: value('schedulePartner'), headShare: share, storeShare: 100 - share, payment: payment, expectedSupply: payment === 'volume' ? Number(value('scheduleExpectedSupply')) : null };
  }
  function readSupplier(idx, commercial) {
    if (commercial.payment === 'prepaid') {
      var amount = cents(value('supBudget' + idx));
      return amount === null || amount <= 0n ? { error: '各供应商分配预算须大于0，最多两位小数' } : { budget: Number(value('supBudget' + idx)), expectedSupply: null, expectedConversionRate: null, targetLockedOrders: null };
    }
    var result = target(value('supExpectedSupply' + idx), value('supExpectedRate' + idx));
    if (result.error) return result;
    return { budget: 0, expectedSupply: Number(value('supExpectedSupply' + idx)), expectedConversionRate: value('supExpectedRate' + idx), targetLockedOrders: result.target };
  }
  function checkTotals(suppliers, commercial) {
    if (commercial.payment === 'volume') return suppliers.reduce(function (sum, s) { return sum + s.expectedSupply; }, 0) === commercial.expectedSupply ? '' : '供应商分配预期供应量合计必须等于排期预期供应总量';
    var sum = suppliers.reduce(function (v, s) { return v + cents(s.budget); }, 0n);
    return sum === cents(value('scheduleTotalBudget')) ? '' : '供应商分配预算合计必须等于排期总预算';
  }
  window.ScheduleCommercial = { load: load, supplier: supplier, change: change, summary: summary, validate: validate, readSupplier: readSupplier, checkTotals: checkTotals, target: target, cents: cents, quantityMode: quantityMode };
})();

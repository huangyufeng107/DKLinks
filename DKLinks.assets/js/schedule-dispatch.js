/* 排期下发配置原型：只保存配置，不调用下发或计费接口。 */
(function () {
  'use strict';
  var supplierRules = {};
  var checkedProject = new Set();
  function el(id) { return document.getElementById(id); }
  function esc(v) { return escapeHTML(String(v)); }
  function multiple() { return el('scheduleDispatchMode').value === 'multiple'; }
  function logic() { return el('scheduleDispatchLogic').value; }
  function load(saved) {
    saved = saved || {}; supplierRules = {}; checkedProject.clear();
    el('scheduleDispatchMode').value = saved.mode || 'single';
    el('scheduleDispatchMax').value = saved.maxStores || '';
    el('scheduleDispatchLogic').value = saved.logic || 'specified';
    el('scheduleSpecifiedRules').innerHTML = '';
    supplier(0, saved.candidates);
    if (window.ScheduleRatio) ScheduleRatio.load(saved);
    change();
  }
  function change() {
    var multi = multiple(), select = el('scheduleDispatchLogic');
    if (!multi) select.value = 'specified';
    select.dataset.followSchedule = multi ? 'false' : 'true';
    select.disabled = !multi || currentScheduleMode === 'view';
    el('scheduleDispatchMaxGroup').hidden = !multi;
    el('scheduleDispatchMax').required = multi;
    el('scheduleDispatchHint').textContent = !multi ? '直接采用供应商传入的意向门店，通过校验后只发这一家。' : logic() === 'specified' ? '在下方统一配置指定门店下发清单；从清单内符合条件的门店中随机追加，跳过供应商传入的第一家及已分配门店。' : logic() === 'random' ? '从该供应商关联范围内随机选择其他门店，不重复分配。' : '按下方转化率区间比例配置分配追加名额；每轮10个，组内轮流，新店不补历史名额。';
    el('scheduleSpecifiedRules').hidden = !multi || logic() !== 'specified';
    render(0);
    if (window.ScheduleRatio) ScheduleRatio.change();
    document.querySelectorAll('#scheduleSupplierTbody .schedule-supplier-row').forEach(function(row) { render(row.id.replace('supplierRow','')); });
  }
  function supplier(idx, saved) {
    supplierRules[idx] = (saved || []).map(function(rule) { return {storeId:rule.storeId, weight:rule.weight == null ? '' : String(rule.weight)}; });
    var panel = Number(idx) === 0 ? el('scheduleSpecifiedRules') : el('supplierRow' + idx);
    panel.insertAdjacentHTML('beforeend', '<div class="schedule-panel-section" id="supAppendSection' + idx + '"><div class="schedule-panel-section-title">追加门店规则</div><p class="form-hint" id="supAppendHint' + idx + '"></p><div class="schedule-append-toolbar" id="supAppendToolbar' + idx + '"><select class="form-select" aria-label="选择追加候选门店" id="supAppendSelect' + idx + '"></select><button class="btn btn-secondary btn-sm" type="button" onclick="ScheduleDispatch.add(' + idx + ')">添加候选门店</button></div><div id="supAppendTable' + idx + '"></div><p class="schedule-field-error" id="supAppendError' + idx + '" role="status"></p></div>');
    if (Number(idx) === 0) el('supAppendSection0').querySelector('.schedule-panel-section-title').textContent = '指定门店下发清单';
    if (Number(idx) === 0) initPicker();
    render(idx);
  }
  function allowed(idx) {
    if (Number(idx) === 0) return getScheduleBrandStores();
    var ids = getScheduleSupplierStoreIds(idx);
    return getScheduleBrandStores().filter(function(store) { return ids.indexOf(store.id) >= 0; });
  }
  function render(idx) {
    if (!el('supAppendSection' + idx)) return;
    var multi = multiple(), kind = logic(), view = currentScheduleMode === 'view', rules = supplierRules[idx] || [];
    var project = Number(idx) === 0;
    var visible = multi && (project ? kind === 'specified' : kind === 'random');
    el('supAppendSection' + idx).hidden = !visible;
    if (!visible) return;
    var random = kind === 'random', stores = allowed(idx);
    el('supAppendHint' + idx).textContent = random ? '使用当前关联门店范围；自动排除供应商指定的第一家，数量不足时按实际门店数下发。' : kind === 'ratio' ? '配置参与追加的门店和固定比例，合计须为100%。先排除第一家，再按剩余门店相对比例选择，不重复分配；剩余比例为0时不追加。' : '所有供应商共用这份清单。至少选择' + (el('scheduleDispatchMax').value || '最多下发家数对应数量的') + '家不同门店；先匹配供应商允许范围，排除第一家及不可用门店；符合条件的门店多于剩余名额时随机选择，总家数包含第一家。';
    el('supAppendToolbar' + idx).hidden = random || view || project;
    if (project) { el('projectStorePicker').hidden = view; renderPicker(); el('supAppendTable0').innerHTML = view ? '<div class="store-selection-summary">' + storeSelectionSummary(rules.map(function(r){return r.storeId;}),getAllScheduleStores()) + '</div>' : ''; showError(0); return; }
    el('supAppendSelect' + idx).innerHTML = '<option value="">' + (project ? '选择排期品牌下的门店' : '选择关联范围内的门店') + '</option>' + stores.filter(function(store) { return !rules.some(function(rule) { return rule.storeId === store.id; }); }).map(function(store) { return '<option value="' + esc(store.id) + '">' + esc(store.name) + '</option>'; }).join('');
    if (random) { el('supAppendError' + idx).textContent = ''; el('supAppendTable' + idx).innerHTML = '<p class="form-hint">当前关联范围 ' + stores.length + ' 家；后续新增是否纳入由关联范围模式决定。</p>'; return; }
    var markup = (project ? '<div class="project-selected-heading"><strong>已选门店（' + rules.length + '家）</strong>' + (view ? '' : '<button type="button" class="btn btn-secondary btn-sm" onclick="ScheduleDispatch.bulkRemove()" ' + (!checkedProject.size ? 'disabled' : '') + '>移除勾选</button>') + '</div>' : '') + '<table class="schedule-append-table"><thead><tr>' + (project && !view ? '<th style="width:40px"></th>' : '') + (project ? '' : '<th>' + (kind === 'ratio' ? '序号' : '候选顺序') + '</th>') + '<th>门店</th>' + (kind === 'ratio' ? '<th>固定比例（%）</th>' : '') + (view ? '' : '<th>操作</th>') + '</tr></thead><tbody>';
    rules.forEach(function(rule, index) {
      var store = stores.find(function(s) { return s.id === rule.storeId; });
      markup += '<tr>' + (project && !view ? '<td><input type="checkbox" aria-label="勾选移除' + esc(store ? store.name : rule.storeId) + '" ' + (checkedProject.has(rule.storeId) ? 'checked' : '') + ' onchange="ScheduleDispatch.check(' + index + ',this.checked)"></td>' : '') + (project ? '' : '<td>' + (index + 1) + '</td>') + '<td>' + esc(store ? store.name : rule.storeId) + (!store ? '<span class="schedule-field-error">（已超出当前关联范围，请移除）</span>' : '') + '</td>';
      if (kind === 'ratio') markup += '<td><input class="form-input" inputmode="decimal" aria-label="' + esc(store ? store.name : rule.storeId) + '分配比例" value="' + esc(rule.weight) + '" ' + (view ? 'readonly' : '') + ' oninput="ScheduleDispatch.weight(' + idx + ',' + index + ',this.value)"></td>';
      if (!view) markup += '<td><div class="schedule-list-actions">' + (project ? '' : '<button class="btn btn-secondary btn-sm" type="button" ' + (index === 0 ? 'disabled' : '') + ' onclick="ScheduleDispatch.move(' + idx + ',' + index + ',-1)">上移</button> <button class="btn btn-secondary btn-sm" type="button" ' + (index === rules.length - 1 ? 'disabled' : '') + ' onclick="ScheduleDispatch.move(' + idx + ',' + index + ',1)">下移</button> ') + '<button class="btn btn-secondary btn-sm" type="button" onclick="ScheduleDispatch.remove(' + idx + ',' + index + ')">移除</button></div></td>';
      markup += '</tr>';
    });
    el('supAppendTable' + idx).innerHTML = markup + (!rules.length ? '<tr><td colspan="4" class="form-hint">' + (project ? '在上方筛选并勾选门店；已选门店可直接移除或批量移除' : '请先选择关联门店，再添加追加候选门店') + '</td></tr>' : '') + '</tbody></table>';
    showError(idx);
  }
  function initPicker() {
    el('supAppendToolbar0').insertAdjacentHTML('beforebegin', '<div id="projectStorePicker" class="project-store-picker"><div class="store-selection-summary" id="projectStoreSelectionSummary"></div><div class="project-store-filters"><input class="form-input" id="projectStoreSearch" placeholder="搜索门店名称或编码" aria-label="搜索门店" oninput="ScheduleDispatch.filterStores()"><select class="form-select" id="projectStoreProvince" aria-label="筛选省份" onchange="ScheduleDispatch.filterStores(true)"></select><select class="form-select" id="projectStoreCity" aria-label="筛选城市" onchange="ScheduleDispatch.filterStores()"></select></div><div class="project-store-pool-head"><label class="store-select-current"><input type="checkbox" id="projectStoreSelectAll" onchange="ScheduleDispatch.selectCurrent(this.checked)">全选当前结果</label><span id="projectStoreResultCount"></span></div><div class="project-store-pool" id="projectStorePool"></div><div class="store-clear-actions"><button class="btn btn-secondary btn-sm" id="projectStoreClear" type="button" onclick="ScheduleDispatch.clear()">清空已选</button></div></div>');
    el('projectStoreSearch').value = ''; el('projectStoreProvince').value = ''; el('projectStoreCity').value = '';
  }
  function filteredStores() {
    var key = el('projectStoreSearch').value.trim().toLowerCase(), province = el('projectStoreProvince').value, city = el('projectStoreCity').value;
    return allowed(0).filter(function(store) { return (!key || (store.name + ' ' + store.id).toLowerCase().includes(key)) && (!province || store.province === province) && (!city || store.city === city); });
  }
  function renderPicker() {
    var hasBrand = scheduleSelectedSeries.length > 0;
    ['projectStoreSearch','projectStoreProvince','projectStoreCity','projectStoreClear'].forEach(function(id) { el(id).disabled = !hasBrand || currentScheduleMode === 'view'; });
    var stores = allowed(0), province = el('projectStoreProvince').value, city = el('projectStoreCity').value;
    el('projectStoreProvince').innerHTML = '<option value="">全部省份</option>' + Array.from(new Set(stores.map(function(s) { return s.province; }).filter(Boolean))).map(function(p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('');
    el('projectStoreProvince').value = province;
    el('projectStoreCity').innerHTML = '<option value="">全部城市</option>' + Array.from(new Set(stores.filter(function(s) { return !province || s.province === province; }).map(function(s) { return s.city; }).filter(Boolean))).map(function(c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    el('projectStoreCity').value = city;
    var filtered = filteredStores(), rules = supplierRules[0] || [];
    el('projectStoreSelectionSummary').innerHTML = storeSelectionSummary(rules.map(function(r){return r.storeId;}),getAllScheduleStores());
    var selectedCount = filtered.filter(function(store){return rules.some(function(r){return r.storeId===store.id;});}).length;
    el('projectStoreSelectAll').checked = filtered.length > 0 && selectedCount === filtered.length;
    el('projectStoreSelectAll').indeterminate = selectedCount > 0 && selectedCount < filtered.length;
    el('projectStoreSelectAll').disabled = !filtered.length || currentScheduleMode === 'view';
    el('projectStoreResultCount').textContent = (scheduleSelectedSeries.length ? '门店范围：' + Array.from(new Set(scheduleSelectedSeries.map(function(series) { return getCarBrandName(series.brandId); }))).join('、') + ' · 筛选结果 ' + filtered.length + ' 家 · 已选 ' + rules.length + ' 家' : '已选 ' + rules.length + ' 家');
    el('projectStorePool').innerHTML = filtered.length ? filtered.map(function(store) {
      var selected = rules.some(function(r) { return r.storeId === store.id; });
      return '<label class="project-store-option"><input type="checkbox" ' + (selected ? 'checked' : '') + ' onchange="ScheduleDispatch.toggleStore(this.value,this.checked)" value="' + esc(store.id) + '"><span><strong>' + esc(store.name) + '</strong><small>' + esc([store.id,store.province,store.city].filter(Boolean).join(' · ')) + '</small></span></label>';
    }).join('') : '<p class="form-hint">' + (scheduleSelectedSeries.length ? '未找到匹配门店，请调整筛选条件' : '请先在关联车系中选择品牌及车系') + '</p>';
  }
  function filterStores(provinceChanged) { if (provinceChanged) el('projectStoreCity').value = ''; renderPicker(); }
  function toggleStore(id, selected) {
    if (currentScheduleMode === 'view') return;
    var rules = supplierRules[0] || (supplierRules[0] = []);
    if (selected && allowed(0).some(function(s) { return s.id === id; }) && !rules.some(function(r) { return r.storeId === id; })) rules.push({storeId:id,weight:''});
    if (!selected) { supplierRules[0] = rules.filter(function(r) { return r.storeId !== id; }); checkedProject.delete(id); }
    render(0);
  }
  function addFiltered() {
    if (currentScheduleMode === 'view') return;
    var rules = supplierRules[0] || (supplierRules[0] = []);
    filteredStores().forEach(function(store) { if (!rules.some(function(r) { return r.storeId === store.id; })) rules.push({storeId:store.id,weight:''}); }); render(0);
  }
  function selectCurrent(checked) {
    if(currentScheduleMode==='view')return;
    if(checked){addFiltered();return;}
    var ids=filteredStores().map(function(s){return s.id;});supplierRules[0]=(supplierRules[0]||[]).filter(function(r){return !ids.includes(r.storeId);});render(0);
  }
  function clear() {if(currentScheduleMode==='view')return;supplierRules[0]=[];checkedProject.clear();render(0);}
  function check(index, checked) { var rule = (supplierRules[0] || [])[index]; if (!rule || currentScheduleMode === 'view') return; if (checked) checkedProject.add(rule.storeId); else checkedProject.delete(rule.storeId); render(0); }
  function bulkRemove() { if (currentScheduleMode === 'view') return; supplierRules[0] = (supplierRules[0] || []).filter(function(r) { return !checkedProject.has(r.storeId); }); checkedProject.clear(); render(0); }
  function error(idx) {
    if (!multiple() || logic() === 'ratio' || logic() === 'random' || (logic() === 'specified' && Number(idx) !== 0) || (logic() !== 'specified' && Number(idx) === 0)) return '';
    var rules = supplierRules[idx] || [], stores = allowed(idx);
    if (!rules.length) return Number(idx) === 0 ? '请配置指定门店下发清单' : '请配置追加候选门店';
    if (Number(idx) === 0 && rules.length < Number(el('scheduleDispatchMax').value)) return '指定门店下发清单至少选择' + el('scheduleDispatchMax').value + '家不同门店';
    if (rules.some(function(rule) { return !stores.some(function(store) { return store.id === rule.storeId; }); })) return Number(idx) === 0 ? '指定门店须属于当前排期品牌范围' : '追加候选门店须在该供应商的关联门店范围内';
    if (logic() === 'ratio') {
      if (rules.some(function(rule) { return !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(rule.weight) || Number(rule.weight) > 100; })) return '门店比例须为0—100的数字，最多两位小数';
      var sum = rules.reduce(function(total, rule) { return total + Math.round(Number(rule.weight) * 100); },0);
      if (sum !== 10000) return '门店固定比例合计须为100%，当前合计' + (sum/100) + '%';
    }
    return '';
  }
  function showError(idx) { if (el('supAppendError' + idx)) el('supAppendError' + idx).textContent = Number(idx) === 0 && !scheduleSelectedSeries.length ? '' : error(idx); }
  function add(idx) {
    if (currentScheduleMode === 'view') return;
    var id = el('supAppendSelect' + idx).value, rules = supplierRules[idx] || (supplierRules[idx] = []);
    if (!id) { showToast('请先选择追加候选门店', 'info'); return; }
    if (!allowed(idx).some(function(s) { return s.id === id; }) || rules.some(function(r) { return r.storeId === id; })) return;
    rules.push({storeId:id, weight:''}); render(idx);
  }
  function move(idx, index, offset) {
    if (currentScheduleMode === 'view' || Number(idx) === 0) return;
    var rules = supplierRules[idx], target = index + offset;
    if (!rules || target < 0 || target >= rules.length) return;
    var item = rules.splice(index,1)[0]; rules.splice(target,0,item); render(idx);
  }
  function remove(idx, index) { if (currentScheduleMode !== 'view') { var removed = supplierRules[idx].splice(index,1)[0]; if (Number(idx) === 0 && removed) checkedProject.delete(removed.storeId); render(idx); } }
  function weight(idx,index,value) { if (currentScheduleMode !== 'view') { supplierRules[idx][index].weight=value; showError(idx); } }
  function validate() {
    if (!['single','multiple'].includes(el('scheduleDispatchMode').value)) return {error:'请选择下发方式',tab:'series'};
    if (!['specified','random','ratio'].includes(logic())) return {error:'请选择下发逻辑',tab:'series'};
    var raw = el('scheduleDispatchMax').value;
    if (multiple() && (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 2)) return {error:'一发多的最多下发门店数须为不小于2的整数',tab:'series'};
    if (logic() === 'specified' && error(0)) { showError(0); return {error:error(0),tab:'series'}; }
    if (window.ScheduleRatio) { var ratioError = ScheduleRatio.validate(); if (ratioError) return {error:ratioError,tab:'series'}; }
    var issue = '';
    document.querySelectorAll('#scheduleSupplierTbody .schedule-supplier-row').forEach(function(row) { var idx = row.id.replace('supplierRow',''); var message = error(idx); if (message && !issue) issue = '供应商' + idx + '：' + message; showError(idx); });
    if (issue) return {error:issue,tab:'suppliers'};
    return Object.assign({mode:multiple()?'multiple':'single',logic:multiple()?logic():'specified',maxStores:multiple()?Number(raw):1,dynamicPricing:false,dynamicRatio:false,candidates:rules(0),specifiedSelection:'random'}, window.ScheduleRatio ? ScheduleRatio.config() : {});
  }
  function rules(idx) { return (supplierRules[idx] || []).map(function(rule) { return {storeId:rule.storeId,weight:rule.weight}; }); }
  window.ScheduleDispatch={selectCurrent:selectCurrent,clear:clear,filterStores:filterStores,toggleStore:toggleStore,addFiltered:addFiltered,check:check,bulkRemove:bulkRemove,load:load,change:change,supplier:supplier,render:render,add:add,move:move,remove:remove,weight:weight,validate:validate,rules:rules};
})();

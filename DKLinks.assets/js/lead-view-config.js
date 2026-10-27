/* 线索列表视图配置：原型数据保存在当前浏览器。 */
(function () {
  var baseFilters = [
    { key: 'search', name: '客户姓名 / 电话 / 线索编号', type: '文本', fixed: true },
    { key: 'status', name: '线索状态', type: '单选' },
    { key: 'phone', name: '号码状态', type: '单选' },
    { key: 'level', name: '线索等级', type: '单选' },
    { key: 'apikey', name: 'API Key', type: '单选' },
    { key: 'brand', name: '品牌', type: '单选', fixed: true },
    { key: 'series', name: '意向车系', type: '单选' }
  ];
  var baseColumns = [
    { key: 'code', name: '线索编号', fixed: true }, { key: 'customer', name: '客户信息', fixed: true },
    { key: 'brand', name: '意向品牌' }, { key: 'vehicle', name: '意向车系' },
    { key: 'level', name: '意向等级' }, { key: 'apikey', name: 'API Key' },
    { key: 'store', name: '意向门店' }, { key: 'status', name: '线索状态', fixed: true },
    { key: 'phoneStatus', name: '号码状态' }, { key: 'time', name: '接收时间' },
    { key: 'action', name: '操作', fixed: true }
  ];
  var brandCodes = { '理想汽车': 'LIXIANG', '问界': 'WENJIE', '东风日产': 'DONGFENG_NISSAN', '小鹏': 'XIAOPENG', '比亚迪': 'BYD' };
  var draft = null;
  var pendingDrafts = {};
  var currentBrand = '';
  var originalHeader = null;
  var originalDropdown = null;
  window.hasLeadViewConfigPermission = function () {
    if (Array.isArray(window.DKLINKS_PERMISSION_CODES)) return window.DKLINKS_PERMISSION_CODES.includes('clue:list-view-config');
    var role = document.querySelector('.header-role');
    return !!role && role.textContent.includes('超级管理员');
  };
  function syncConfigEntry() {
    var allowed = hasLeadViewConfigPermission();
    ['leadViewConfigMenu', 'leadViewConfigButton'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = allowed ? '' : 'none';
    });
  }
  window.openLeadViewConfig = function () {
    if (!hasLeadViewConfigPermission()) { showToast('无权配置线索列表', 'error'); return; }
    var list = document.getElementById('page-leads');
    if (list && list.classList.contains('active')) document.getElementById('leadViewConfigBrand').value = document.getElementById('leadListBrand').value;
    navigateTo('lead-view-config');
    leadViewSelectConfig();
  };
  function key(brand) { return 'dkLeadView:' + (brand || 'all'); }
  function fields(brand) {
    if (!Array.isArray(window._customFieldData)) return [];
    return window._customFieldData.filter(function (f) {
      return f.status === 1 && (f.scope === 'global' || (brand && f.scope === 'brand' && f.brandCode === brandCodes[brand]));
    }).filter(function (f) { return !['customer_name', 'customer_phone', 'brand_id', 'series_id', 'store_id', 'lead_level', 'api_key'].includes(f.key); })
      .map(function (f) { return { key: 'field:' + f.key, name: f.name, type: f.typeName, field: f }; });
  }
  function available(brand, kind) {
    var extras = fields(brand).filter(function (f) { return kind === 'columns' || [1, 2, 3, 4].includes(f.field.type); });
    return (kind === 'columns' ? baseColumns : baseFilters).concat(extras);
  }
  function defaults(brand) {
    var extras = fields(brand).filter(function (f) { return f.field.scope === 'brand'; });
    return {
      filters: baseFilters.map(function (f) { return f.key; }).concat(extras.filter(function (f) { return [1, 2, 3, 4].includes(f.field.type); }).map(function (f) { return f.key; })),
      columns: baseColumns.map(function (f) { return f.key; }).concat(extras.map(function (f) { return f.key; }))
    };
  }
  function published(brand) {
    try { var saved = JSON.parse(localStorage.getItem(key(brand))); if (saved && Array.isArray(saved.filters) && Array.isArray(saved.columns)) return saved; } catch (e) {}
    return defaults(brand);
  }
  function escape(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function renderGroup(kind) {
    var target = document.getElementById(kind === 'filters' ? 'leadViewFilterItems' : 'leadViewColumnItems');
    if (!target) return;
    var list = available(currentBrand, kind);
    var selected = draft[kind];
    var ordered = selected.concat(list.map(function (f) { return f.key; }).filter(function (k) { return !selected.includes(k); }));
    target.innerHTML = ordered.map(function (k) {
      var f = list.find(function (x) { return x.key === k; }); if (!f) return '';
      var checked = selected.includes(k);
      return '<div class="lead-view-item' + (checked ? ' selected' : '') + '"><label><input type="checkbox" ' + (checked ? 'checked ' : '') + (f.fixed ? 'disabled ' : '') + 'onchange="leadViewToggle(\'' + kind + '\',\'' + escape(k) + '\',this.checked)"><span>' + escape(f.name) + '</span></label><small>' + escape(f.type || '固定列') + (f.fixed ? ' · 必选' : '') + '</small></div>';
    }).join('');
  }
  function dirty() { return JSON.stringify(draft) !== JSON.stringify(published(currentBrand)); }
  function renderConfig() {
    renderGroup('filters'); renderGroup('columns');
    var status = document.getElementById('leadViewStatus');
    status.textContent = dirty() ? '未发布修改' : '已发布';
    status.className = 'status-badge ' + (dirty() ? 'status-warning' : 'status-active');
    document.getElementById('leadViewMessage').textContent = currentBrand ? '当前品牌：' + currentBrand : '全部品牌仅使用公共视图';
  }
  window.leadViewSelectConfig = function () {
    var listBrand = document.getElementById('leadListBrand');
    var select = document.getElementById('leadViewConfigBrand');
    if (!select) return;
    if (document.getElementById('page-leads').classList.contains('active') && listBrand) select.value = listBrand.value;
    if (draft && dirty()) pendingDrafts[currentBrand || 'all'] = JSON.parse(JSON.stringify(draft));
    currentBrand = select.value;
    draft = pendingDrafts[currentBrand || 'all'] || JSON.parse(JSON.stringify(published(currentBrand)));
    renderConfig();
  };
  window.leadViewToggle = function (kind, k, enabled) {
    draft[kind] = draft[kind].filter(function (v) { return v !== k; });
    if (enabled) draft[kind].push(k);
    renderConfig();
  };
  window.leadViewDiscard = function () { delete pendingDrafts[currentBrand || 'all']; draft = JSON.parse(JSON.stringify(published(currentBrand))); renderConfig(); showToast('已放弃未发布修改', 'success'); };
  window.leadViewPublish = function () {
    if (!hasLeadViewConfigPermission()) { showToast('无权配置线索列表', 'error'); return; }
    if (!draft.filters.includes('brand') || !draft.filters.includes('search') || !['code', 'customer', 'status', 'action'].every(function (k) { return draft.columns.includes(k); })) { showToast('必选项不可移除', 'error'); return; }
    try { localStorage.setItem(key(currentBrand), JSON.stringify(draft)); } catch (e) { showToast('浏览器存储不可用，无法保存配置', 'error'); return; }
    delete pendingDrafts[currentBrand || 'all'];
    renderConfig(); leadViewApplyList(); showToast('配置已发布，选择该品牌后在线索列表生效', 'success');
  };
  function resetList() {
    var page = document.getElementById('page-leads'), table = page.querySelector('table');
    if (!originalHeader) {
      originalHeader = table.tHead.rows[0].innerHTML;
      originalDropdown = document.getElementById('columnSettingsDropdown').innerHTML;
    }
    table.tHead.rows[0].innerHTML = originalHeader;
    table.querySelectorAll('.lead-view-extra-col').forEach(function (el) { el.remove(); });
    document.getElementById('columnSettingsDropdown').innerHTML = originalDropdown;
    var style = document.getElementById('lead-view-style'); if (style) style.textContent = '';
    var legacy = document.getElementById('lead-column-style'); if (legacy) legacy.textContent = '';
    page.querySelectorAll('.filter-bar > .filter-item').forEach(function (el) { el.style.display = ''; });
    page.querySelector('.search-input-wrapper').style.display = '';
    page.querySelectorAll('.lead-view-extra-filter').forEach(function (el) { el.remove(); });
  }
  function fieldValue(row, f) {
    var code = row.cells[0].textContent.trim();
    var examples = {
      'LD2026051400001': { test_drive_intent: '有意试驾', trade_in_need: '有旧车需置换' },
      'LD2026051400002': { store_visit_intent: '本周可到店' },
      'LD2026051400003': { test_drive_intent: '已试驾' },
      'LD2026051400004': { finance_plan_intent: '低息分期', used_car_appraisal: '需要评估', displacement_pref: '2.0L' }
    };
    return (examples[code] && examples[code][f.field.key]) || '—';
  }
  window.leadViewApplyList = function () {
    var brandSelect = document.getElementById('leadListBrand'); if (!brandSelect) return;
    var brand = brandSelect.value, config = published(brand), page = document.getElementById('page-leads');
    resetList();
    document.getElementById('leadViewAppliedLabel').textContent = '当前视图：' + (brand || '全部品牌（公共视图）');
    document.getElementById('leadViewAppliedHint').textContent = brand ? '已应用该品牌发布的查询条件与默认列' : '选择品牌后显示该品牌的查询条件和列表列';
    var filterKeys = ['status', 'phone', 'level', 'apikey', 'brand', 'series'];
    page.querySelectorAll('.filter-bar > .filter-item').forEach(function (el, i) { el.style.display = config.filters.includes(filterKeys[i]) ? '' : 'none'; });
    page.querySelector('.search-input-wrapper').style.display = config.filters.includes('search') ? '' : 'none';
    var bar = page.querySelector('.filter-bar');
    available(brand, 'filters').filter(function (f) { return f.field && config.filters.includes(f.key); }).forEach(function (f) {
      var wrap = document.createElement('div'); wrap.className = 'filter-item lead-view-extra-filter';
      var label = document.createElement('span'); label.className = 'filter-label'; label.textContent = f.name; wrap.appendChild(label);
      var input;
      if (f.field.type === 4) {
        input = document.createElement('select'); input.className = 'filter-select';
        input.innerHTML = '<option value="">全部</option>' + (f.field.enumValues || []).map(function (v) { var s = v.split('='); return '<option value="' + escape(s[s.length - 1]) + '">' + escape(s[s.length - 1]) + '</option>'; }).join('');
      } else { input = document.createElement('input'); input.className = 'filter-input'; input.placeholder = f.name; input.type = f.field.type === 3 ? 'date' : (f.field.type === 2 ? 'number' : 'text'); }
      input.dataset.fieldKey = f.key; input.oninput = filterClueList; input.onchange = filterClueList; wrap.appendChild(input); bar.insertBefore(wrap, bar.querySelector('.btn'));
    });
    var table = page.querySelector('table'), head = table.tHead.rows[0], body = table.tBodies[0], allColumns = available(brand, 'columns');
    var extraColumns = allColumns.filter(function (f) { return f.field && config.columns.includes(f.key); });
    extraColumns.forEach(function (f) {
      var th = document.createElement('th'); th.className = 'lead-view-extra-col'; th.textContent = f.name; head.insertBefore(th, head.lastElementChild);
      Array.from(body.rows).forEach(function (row) { var td = document.createElement('td'); td.className = 'lead-view-extra-col'; td.textContent = fieldValue(row, f); row.insertBefore(td, row.lastElementChild); });
    });
    var dropdown = document.getElementById('columnSettingsDropdown');
    dropdown.querySelectorAll('input').forEach(function (box, i) { box.checked = config.columns.includes(baseColumns[i].key); box.closest('label').style.display = config.columns.includes(baseColumns[i].key) ? '' : 'none'; box.removeAttribute('onchange'); box.onchange = leadViewPersonalColumns; });
    extraColumns.forEach(function (f) { var label = document.createElement('label'); label.className = 'column-settings-item'; var box = document.createElement('input'); box.type = 'checkbox'; box.checked = true; box.onchange = leadViewPersonalColumns; label.appendChild(box); var span = document.createElement('span'); span.className = 'column-settings-item-label'; span.textContent = f.name; label.appendChild(span); dropdown.appendChild(label); });
    var style = document.getElementById('lead-view-style') || document.createElement('style'); style.id = 'lead-view-style'; document.head.appendChild(style);
    var saved; try { saved = JSON.parse(localStorage.getItem('dkLeadPersonal:' + (brand || 'all'))); } catch (e) {}
    var visible = saved && Array.isArray(saved.visible) && saved.visible.length === 11 + extraColumns.length ? saved.visible : null;
    dropdown.querySelectorAll('input').forEach(function (box, i) {
      if (!visible || box.disabled) return;
      box.checked = i < 11 ? (config.columns.includes(baseColumns[i].key) && visible[i]) : visible[i];
    });
    leadViewPersonalColumns();
    filterClueList(); leadViewFilterExtras();
  };
  window.leadViewPersonalColumns = function () {
    var brand = document.getElementById('leadListBrand').value, boxes = Array.from(document.querySelectorAll('#columnSettingsDropdown input'));
    var visible = boxes.map(function (b) { return b.checked; });
    var style = document.getElementById('lead-view-style'); if (!style) return;
    var extraCount = boxes.length - 11;
    var css = '';
    for (var i = 0; i < 10; i++) if (!visible[i]) css += '#page-leads table th:nth-child(' + (i + 1) + '),#page-leads table td:nth-child(' + (i + 1) + '){display:none}\n';
    for (var j = 0; j < extraCount; j++) if (!visible[11 + j]) css += '#page-leads table th:nth-child(' + (11 + j) + '),#page-leads table td:nth-child(' + (11 + j) + '){display:none}\n';
    style.textContent = css;
    try { localStorage.setItem('dkLeadPersonal:' + (brand || 'all'), JSON.stringify({ visible: visible })); } catch (e) {}
  };
  window.toggleColumnSettings = function () {
    var dropdown = document.getElementById('columnSettingsDropdown');
    if (dropdown) dropdown.classList.toggle('show');
  };
  window.leadViewFilterExtras = function () {
    var inputs = Array.from(document.querySelectorAll('#page-leads .lead-view-extra-filter input,#page-leads .lead-view-extra-filter select'));
    var brand = document.getElementById('leadListBrand').value;
    var fs = available(brand, 'filters');
    document.querySelectorAll('#clue-tbody tr').forEach(function (row) {
      if (row.style.display === 'none') return;
      var ok = inputs.every(function (input) {
        if (!input.value) return true;
        var f = fs.find(function (x) { return x.key === input.dataset.fieldKey; });
        var value = f ? fieldValue(row, f) : '';
        return value !== '—' && value.toLowerCase().includes(input.value.toLowerCase());
      });
      if (!ok) row.style.display = 'none';
    });
    var count = Array.from(document.querySelectorAll('#clue-tbody tr')).filter(function (row) { return row.style.display !== 'none'; }).length;
    var info = document.querySelector('#page-leads .pagination-info');
    if (info) info.textContent = '共 ' + count + ' 条数据';
  };
  window.leadViewOpenList = function () { document.getElementById('leadListBrand').value = currentBrand; leadViewApplyList(); };
  window.exportClueData = function () {
    if (typeof XLSX === 'undefined') { showToast('导出组件未加载，请稍后重试', 'error'); return; }
    var page = document.getElementById('page-leads'), table = page.querySelector('table');
    var headers = Array.from(table.tHead.rows[0].cells);
    var indexes = headers.map(function (th, i) { return { th: th, i: i }; }).filter(function (item, n) {
      return n < headers.length - 1 && getComputedStyle(item.th).display !== 'none';
    });
    var data = [indexes.reduce(function (out, item) {
      if (item.i === 1) out.push('客户姓名', '电话号码');
      else out.push(item.th.textContent.trim());
      return out;
    }, [])];
    Array.from(table.tBodies[0].rows).filter(function (row) { return getComputedStyle(row).display !== 'none'; }).forEach(function (row) {
      data.push(indexes.reduce(function (out, item) {
        var cell = row.cells[item.i];
        if (item.i === 1) {
          out.push((cell.querySelector('strong') || cell).textContent.trim());
          var phone = cell.querySelector('div:last-child'); out.push(phone ? phone.textContent.trim() : '');
        } else out.push(cell ? cell.textContent.trim() : '');
        return out;
      }, []));
    });
    var book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!cols'] = data[0].map(function () { return { wch: 18 }; });
    XLSX.utils.book_append_sheet(book, sheet, '线索数据');
    XLSX.writeFile(book, '线索数据_' + new Date().toLocaleDateString('zh-CN').replace(/\//g, '-') + '.xlsx');
    showToast('已导出 ' + (data.length - 1) + ' 条线索', 'success');
  };
  document.addEventListener('DOMContentLoaded', function () {
    syncConfigEntry();
    leadViewSelectConfig(); leadViewApplyList();
    document.getElementById('leadListBrand').addEventListener('change', function () { document.getElementById('leadViewConfigBrand').value = this.value; });
  });
})();

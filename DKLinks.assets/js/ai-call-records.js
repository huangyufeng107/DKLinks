// 原型样例数据，非真实厂商回传。样例来源和对接边界见功能文档 F9，不作为业务页面元素展示。
(function () {
  var records = [
    {
      id: 'DEMO-CALL-001', brandCode: 'DONGFENG_NISSAN', brand: '东风日产', taskState: '已完成', resultState: '有可用结果',
      routeSnapshot: { systemCode: 'DEMO_SYSTEM_A', systemName: '外呼系统 A', typeCode: 'DEMO_A_STANDARD', typeName: '标准外呼', scenarioId: 'DEMO_SCENE_A_001' },
      createdAt: '2026-10-20 09:40:00', finishedAt: '2026-10-20 09:48:30', leadIds: ['DEMO-LEAD-001'], sourceLeadId: 'DEMO-LEAD-001',
      attempts: [
        { no: 1, vendorCallId: 'DEMO-CDR-001', calledNumber: '138****1234', callTags: [], wechat: null, startedAt: '2026-10-20 09:41:00', answeredAt: '', endedAt: '2026-10-20 09:41:35', recordGeneratedAt: '2026-10-20 09:41:38', status: '未接通', ringSeconds: 35, talkSeconds: 0, reason: '无人接听', resultAt: '2026-10-20 09:41:40', summary: null },
        { no: 2, vendorCallId: 'DEMO-CDR-002', calledNumber: '138****1234', callTags: [{ code: 'PURCHASE_INTENT', name: '有购车意向' }], wechat: 'wx_****1234', startedAt: '2026-10-20 09:46:00', answeredAt: '2026-10-20 09:46:20', endedAt: '2026-10-20 09:48:30', recordGeneratedAt: '2026-10-20 09:48:33', status: '已接通', ringSeconds: 20, talkSeconds: 130, reason: '正常结束', resultAt: '2026-10-20 09:48:35', summary: '客户表示近期考虑到店了解车型。' }
      ],
      result: { callStatus: 'CONNECTED', tags: ['PURCHASE_INTENT'], summary: '客户表示近期考虑到店了解车型。', generatedAt: '2026-10-20 09:48:35' }
    },
    {
      id: 'CALL-DFN-20261020-004', brandCode: 'DONGFENG_NISSAN', brand: '东风日产', taskState: '已完成', resultState: '有可用结果',
      createdAt: '未记录', finishedAt: '2026-10-20 10:05:00', leadIds: ['LD2026102000004'], sourceLeadId: '未记录',
      attempts: [], result: { callStatus: 'CONNECTED', tags: ['NO_INTENT'], summary: '暂不考虑购车', generatedAt: '未记录' }
    },
    {
      id: 'CALL-DFN-20261020-001', brandCode: 'DONGFENG_NISSAN', brand: '东风日产', taskState: '未记录', resultState: '未取得有效结果',
      createdAt: '未记录', finishedAt: '未结束或未记录', leadIds: ['LD2026102000003'], sourceLeadId: 'LD2026102000000',
      attempts: [], result: null
    }
  ];
  var selectedId = records[0].id;
  var selectedAttempt = 0;
  var listScrollY = 0;
  var exactLeadQuery = '';
  var relatedLeadTaskId = '';
  var relatedLeadChoices = [];
  var unknownCode = '__UNRECORDED__';
  var facetChoices = { system: [], type: [] };
  var pickerChoices = { system: [], type: [] };

  function routing(record) { return record.routeSnapshot || {}; }
  function facetId(record, facet) { return routing(record)[facet + 'Code'] || unknownCode; }
  function catalogRelations() {
    var relations = records.map(function (record) {
      var route = routing(record);
      return { brandCode: record.brandCode, brand: record.brand, systemCode: route.systemCode || unknownCode, systemName: route.systemName || '未记录', typeCode: route.typeCode || unknownCode, typeName: route.typeName || '未记录' };
    });
    // 读取现有字典的关系供筛选；记录本身始终只读创建时快照。
    var dictionary;
    try { dictionary = JSON.parse(localStorage.getItem('dklinks_system_dictionary_v1') || '{}'); } catch (error) { dictionary = {}; }
    var items = dictionary && dictionary.items || {};
    var systems = Array.isArray(items.OUTBOUND_SYSTEM) ? items.OUTBOUND_SYSTEM : [];
    var types = Array.isArray(items.OUTBOUND_TYPE) ? items.OUTBOUND_TYPE : [];
    var brands = typeof brandManagementList !== 'undefined' && Array.isArray(brandManagementList) ? brandManagementList : [];
    types.forEach(function (type) {
      if (!type.code || !type.outboundSystemCode || !Array.isArray(type.brands)) return;
      var system = systems.find(function (entry) { return entry.code === type.outboundSystemCode; });
      type.brands.forEach(function (brandCode) {
        var brand = brands.find(function (entry) { return entry.code === brandCode; });
        var historical = records.find(function (record) { return record.brandCode === brandCode; });
        relations.push({ brandCode: brandCode, brand: brand && brand.name || historical && historical.brand || brandCode,
          systemCode: type.outboundSystemCode, systemName: system && system.name || type.outboundSystemCode,
          typeCode: type.code, typeName: type.name || type.code });
      });
    });
    return relations;
  }
  function choicesFor(relations, facet) {
    var choices = [];
    relations.forEach(function (relation) {
      var code = relation[facet + 'Code'];
      var choice = choices.find(function (item) { return item.code === code; });
      var name = relation[facet + 'Name'];
      if (choice) { if (choice.aliases.indexOf(name) < 0) choice.aliases.push(name); return; }
      choices.push({ code: code, name: name, aliases: [name], systemName: relation.systemName });
    });
    return choices;
  }
  function syncAiCallFacets() {
    var relations = catalogRelations();
    var brandSelect = document.getElementById('aiCallBrand');
    var brandValue = brandSelect.value;
    var brandChoices = [];
    relations.forEach(function (relation) { if (!brandChoices.some(function (item) { return item.code === relation.brandCode; })) brandChoices.push({ code: relation.brandCode, name: relation.brand }); });
    brandSelect.innerHTML = '<option value="">全部品牌</option>' + brandChoices.map(function (item) { return '<option value="' + escapeHtml(item.code) + '">' + escapeHtml(item.name) + '</option>'; }).join('');
    brandSelect.value = brandChoices.some(function (item) { return item.code === brandValue; }) ? brandValue : '';
    var scoped = relations.filter(function (relation) { return !brandSelect.value || relation.brandCode === brandSelect.value; });
    facetChoices.system = choicesFor(scoped, 'system');
    var systemField = document.getElementById('aiCallSystem');
    if (!facetChoices.system.some(function (item) { return item.code === systemField.value; })) systemField.value = '';
    facetChoices.type = choicesFor(scoped.filter(function (relation) { return !systemField.value || relation.systemCode === systemField.value; }), 'type');
    var typeField = document.getElementById('aiCallType');
    if (!facetChoices.type.some(function (item) { return item.code === typeField.value; })) typeField.value = '';
    ['system', 'type'].forEach(function (facet) {
      var prefix = facet === 'system' ? 'aiCallSystem' : 'aiCallType';
      var chosen = facetChoices[facet].find(function (item) { return item.code === document.getElementById(prefix).value; });
      var label = chosen ? choiceLabel(chosen, facet) : facet === 'system' ? '全部外呼系统' : '全部外呼类型';
      document.getElementById(prefix + 'Label').innerHTML = '<span>' + escapeHtml(label) + '</span>';
      document.getElementById(prefix + 'Label').title = label;
      renderAiCallPickerOptions(facet);
    });
  }
  function choiceLabel(item, facet) { return item.name + (facet === 'type' && item.code && item.code !== unknownCode ? ' · ' + item.systemName : ''); }
  function renderAiCallPickerOptions(facet) {
    var prefix = facet === 'system' ? 'aiCallSystem' : 'aiCallType';
    var query = document.getElementById(prefix + 'Search').value.trim().toLowerCase();
    pickerChoices[facet] = [{ code: '', name: facet === 'system' ? '全部外呼系统' : '全部外呼类型', aliases: [] }].concat(facetChoices[facet]).filter(function (item) {
      return !query || [item.name, item.code, item.systemName || ''].concat(item.aliases).join(' ').toLowerCase().indexOf(query) >= 0;
    });
    document.getElementById(prefix + 'Options').innerHTML = pickerChoices[facet].length ? pickerChoices[facet].map(function (item, index) {
      return '<button type="button" class="ai-call-picker-option' + (item.code === document.getElementById(prefix).value ? ' is-chosen' : '') + '" onclick="chooseAiCallFacet(\'' + facet + '\',' + index + ')"><span>' + escapeHtml(choiceLabel(item, facet)) + '</span>' + (item.code && item.code !== unknownCode ? '<small>' + escapeHtml(item.code) + '</small>' : '') + '</button>';
    }).join('') : '<p class="ai-call-picker-empty">没有匹配项</p>';
  }
  function chooseAiCallFacet(facet, index) {
    var option = pickerChoices[facet][index];
    if (!option) return;
    var prefix = facet === 'system' ? 'aiCallSystem' : 'aiCallType';
    document.getElementById(prefix).value = option.code;
    document.getElementById(prefix + 'Search').value = '';
    if (facet === 'system') document.getElementById('aiCallTypeSearch').value = '';
    document.getElementById(prefix + 'Picker').open = false;
    renderAiCallRecords();
    document.getElementById(prefix + 'Label').focus();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function field(label, value) {
    return '<div class="ai-call-field"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value == null || value === '' ? '未记录' : value) + '</strong></div>';
  }
  var callFieldHelp = {
    '任务状态': ['表示整个外呼任务当前执行到哪一步，例如待外呼、外呼中、重试中或已完成。一项任务可能有多次拨打，任务已完成不代表每次通话都接通，也不代表线索已下发。', '来源于已保存的任务状态，不能根据某一次拨打的状态推断。'],
    '结果状态': ['表示该任务是否已取得可用于结果规则判断的外呼结果。“有可用结果”不等于已接通或已下发；“未取得有效结果”也不等于空号、停机或任务失败。线索最终如何处理，请查看其处理进度。', '来源于任务结果及其可用性判定记录，独立于任务执行状态展示。'],
    '品牌': ['表示该外呼任务所属的业务品牌，用于区分品牌配置、任务关联范围及查询范围。', '来源于任务创建时保存的品牌信息，不按当前页面筛选条件补填。'],
    '外呼系统': ['表示本任务实际使用的外呼平台或供应商系统。同一品牌可以使用多个外呼系统。', '展示任务创建时线路快照中保存的系统名称；当前字典改名或停用不改写历史记录。'],
    '外呼类型': ['表示本任务采用的业务外呼类型，例如标准外呼、车系外呼。相同名称可能属于不同外呼系统，需结合外呼系统查看。', '展示任务创建时线路快照中保存的外呼类型名称，不按当前配置重新分配。'],
    '来源线索': ['表示最初触发创建这个外呼任务的线索。后续其他线索关联或复用本任务时，不会改写来源线索。', '来源于创建任务时保存的来源线索 ID。它可能与当前关联线索相同，也可能不同。'],
    '关联线索': ['表示当前记录中与本任务建立关联或结果复用关系的线索。关联在途任务时，各条线索独立等待；命中冷却期复用已完成结果时，不重新拨打，也不等待。', '来源于已保存的任务与线索关联记录，不按手机号临时拼凑。每条线索的关联原因、等待期限及处理决定以各自处理进度为准；来源线索不应在缺少关联记录时自动补入。'],
    '创建时间': ['表示本平台成功创建该外呼任务的时间。首条线索的任务等待期限从此时开始；后续关联线索有自己的等待期限。', '来源于任务创建成功时保存的时间，不等同于线索接收时间或首次拨打时间。'],
    '结束时间': ['表示整个外呼任务进入结束状态的时间，不一定等于某一次通话的结束时间。冷却期仅对已完成且有可用结果的任务生效，并从该任务结束时起算。', '来源于已保存的任务结束记录，不能用最后一次通话结束时间代填。“未结束或未记录”表示当前资料无法区分任务尚未结束与结束时间缺失。'],
    '外呼系统编码': ['识别本任务实际使用的外呼系统，用于区分不同供应商或平台。', '来源于任务创建时保存的线路配置快照；后续修改系统字典不改变历史任务记录。'],
    '外呼类型编码': ['识别本任务采用的外呼业务类型，例如标准外呼或车系外呼，需结合外呼系统一起查看。', '来源于任务创建时的线路配置快照。'],
    '实际使用的场景 ID': ['外呼系统中本任务实际使用的场景标识，用于核对任务调用了哪个业务场景或话术配置。', '来源于任务实际提交时保存的场景快照；场景的具体含义以对应外呼系统配置为准。'],
    '厂商任务 ID': ['外呼厂商为该任务分配的标识，用于到厂商系统查询任务或核对回传结果。它与本平台任务编号、单次通话 ID 不同。', '来源于厂商创建任务响应或任务回传，具体以接口约定为准。'],
    '请求 ID': ['用于追踪本平台向外呼系统发起的一次接口请求，供技术人员定位请求日志。一个任务重试时可能产生多次请求。', '来源于接口调用日志中保存的请求标识；此处展示与该任务关联并保存的请求 ID。'],
    '回调 ID': ['用于识别外呼系统回传的一条通知，供技术人员核对重复通知与回调处理日志。一个任务可能收到多条通知。', '来源于已保存的回调记录；标识由哪一方生成，以接口约定为准。此处展示任务记录所关联的回调。'],
    '回调到达时间': ['本平台收到所关联回调通知的时间，用于核查结果是否在等待截止时间前到达。它与通话结束时间、厂商结果生成时间不同。', '来源于本平台接收回调时记录的时间，不使用厂商生成时间代替；此处不代表所有历史回调的到达时间。'],
    '本次通话状态原值': ['当前选中的这一次拨打记录所保存的原始通话状态。切换拨打记录后，这里随之更新。', '来源于该次话单记录。任务可能经历多次拨打，因此此值可能与整个任务的 AI 结果状态不同。']
  };
  function technicalField(label, value) {
    return '<div class="ai-call-field"><span class="ai-call-tech-label">' + escapeHtml(label) +
      '<button type="button" class="ai-call-help-icon" aria-label="查看' + escapeHtml(label) + '说明" aria-haspopup="dialog" onclick="openAiCallFieldHelp(this)" data-field-help="' + escapeHtml(label) + '">?</button></span><strong>' + escapeHtml(displayValue(value)) + '</strong></div>';
  }
  function openAiCallFieldHelp(button) {
    var label = button.getAttribute('data-field-help');
    var help = callFieldHelp[label];
    if (!help) return;
    var dialog = document.getElementById('aiCallFieldHelpDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'aiCallFieldHelpDialog';
      dialog.className = 'ai-call-help-dialog';
      dialog.setAttribute('aria-labelledby', 'aiCallFieldHelpTitle');
      dialog.setAttribute('aria-describedby', 'aiCallFieldHelpBody');
      document.body.appendChild(dialog);
      dialog.addEventListener('click', function (event) {
        var bounds = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
      });
    }
    dialog.innerHTML = '<div class="modal-header"><h3 class="modal-title" id="aiCallFieldHelpTitle">' + escapeHtml(label) + '</h3><button type="button" class="modal-close" aria-label="关闭字段说明" onclick="document.getElementById(\'aiCallFieldHelpDialog\').close()">×</button></div>' +
      '<div class="modal-body" id="aiCallFieldHelpBody"><h4>字段含义</h4><p>' + escapeHtml(help[0]) + '</p><h4>数据来源</h4><p>' + escapeHtml(help[1]) + '</p><div class="ai-call-help-empty">显示“未记录”表示当前保存的数据没有该字段，可能未返回或未留存；不代表任务失败，也不会根据其他字段补推。</div></div>' +
      '<div class="modal-footer"><button type="button" class="btn btn-primary" onclick="document.getElementById(\'aiCallFieldHelpDialog\').close()">知道了</button></div>';
    dialog.showModal();
  }
  function displayValue(value) { return value == null || value === '' ? '未记录' : String(value); }
  function displayDuration(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? String(value) : '未记录'; }
  function maskedPhone(value) { return displayValue(value).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'); }
  function maskedWechat(value) {
    if (value == null || value === '') return '未记录';
    var text = String(value);
    return text.indexOf('*') >= 0 ? text : text.length < 5 ? '****' : text.slice(0, 2) + '****' + text.slice(-2);
  }
  // 平台已知编码的显示名称；厂商扩展编码通过接口中文名称或对接映射补充。
  var callStatusLabels = { CONNECTED: '已接通', NOT_CONNECTED: '未接通', UNKNOWN: '未知状态' };
  var callTagLabels = { PURCHASE_INTENT: '有购车意向', NO_INTENT: '无购车意向' };
  function chineseName(value) { return typeof value === 'string' && /[\u3400-\u9fff]/.test(value) ? value : ''; }
  function callStatusName(value, name) {
    if (value == null || value === '') return '未记录';
    return chineseName(name) || chineseName(value) || callStatusLabels[value] || '未知状态';
  }
  function tagCode(tag) { return typeof tag === 'string' ? tag : tag && tag.code || ''; }
  function callTagNames(tags) {
    if (!Array.isArray(tags)) return '未记录';
    if (!tags.length) return '无标签';
    return tags.map(function (tag) {
      var code = tagCode(tag);
      return chineseName(tag && tag.name) || chineseName(code) || callTagLabels[code] || '未识别标签';
    }).join('、');
  }
  function statusClass(value) {
    return value === '已完成' || value === '有可用结果' ? 'is-good' : 'is-wait';
  }
  function badge(value) {
    return '<span class="ai-call-badge ' + statusClass(value) + '">' + escapeHtml(value) + '</span>';
  }
  function currentFilters() {
    return {
      keyword: document.getElementById('aiCallKeyword').value.trim().toLowerCase(),
      brand: document.getElementById('aiCallBrand').value,
      system: document.getElementById('aiCallSystem').value,
      type: document.getElementById('aiCallType').value,
      taskState: document.getElementById('aiCallTaskState').value,
      resultState: document.getElementById('aiCallResultState').value
    };
  }
  function filteredRecords() {
    var f = currentFilters();
    return records.filter(function (record) {
      var leadIds = record.leadIds.concat(record.sourceLeadId && record.sourceLeadId !== '未记录' ? [record.sourceLeadId] : []);
      var matchesKeyword = exactLeadQuery && f.keyword === exactLeadQuery.toLowerCase()
        ? leadIds.includes(exactLeadQuery)
        : !f.keyword || [record.id].concat(leadIds).some(function (value) { return value.toLowerCase().indexOf(f.keyword) !== -1; });
      return matchesKeyword && (!f.brand || record.brandCode === f.brand) && (!f.system || facetId(record, 'system') === f.system) && (!f.type || facetId(record, 'type') === f.type) && (!f.taskState || record.taskState === f.taskState) && (!f.resultState || record.resultState === f.resultState);
    });
  }
  function renderAiCallRecords() {
    syncAiCallFacets();
    var visible = filteredRecords();
    var rows = document.getElementById('aiCallRows');
    if (!rows) return;
    if (!visible.some(function (record) { return record.id === selectedId; })) selectedId = visible.length ? visible[0].id : '';
    rows.innerHTML = visible.map(function (record) {
      return '<tr class="' + (selectedId === record.id ? 'is-selected' : '') + '">' +
        '<td><strong>' + escapeHtml(record.id) + '</strong></td>' +
        '<td>' + escapeHtml(record.brand) + '</td><td>' + escapeHtml(routing(record).systemName || '未记录') + '</td><td>' + escapeHtml(routing(record).typeName || '未记录') + '</td>' +
        '<td>' + badge(record.taskState) + '</td><td>' + badge(record.resultState) + '</td>' +
        '<td>' + record.leadIds.map(escapeHtml).join('<br>') + '</td><td>' + escapeHtml(record.finishedAt) + '</td>' +
        '<td><button type="button" class="btn btn-secondary btn-sm" onclick="selectAiCallRecord(\'' + record.id + '\')">查看话单</button></td></tr>';
    }).join('');
    document.getElementById('aiCallCount').textContent = '共 ' + visible.length + ' 个任务';
    document.getElementById('aiCallEmpty').hidden = visible.length > 0;
  }
  function renderAiCallDetail() {
    var section = document.getElementById('aiCallDetail');
    if (!section) return;
    var record = records.find(function (item) { return item.id === selectedId; });
    if (!record) { section.innerHTML = '<p class="ai-call-absence">未找到该外呼任务，请返回列表重新选择。</p>'; return; }
    document.getElementById('aiCallDetailTitle').textContent = '话单详情 - ' + record.id;
    document.getElementById('aiCallDetailBreadcrumb').textContent = record.id;
    var hasAttempts = record.attempts.length > 0;
    var attempt = record.attempts[selectedAttempt] || record.attempts[0];
    var attempts = hasAttempts ? '<div class="table-wrapper"><table class="ai-call-attempts-table"><thead><tr><th>次数</th><th>通话ID</th><th>电话号码</th><th>通话标签</th><th>微信号</th><th>通话开始时间</th><th>通话结束时间</th><th>通话记录生成时间</th><th class="ai-call-numeric">通话时长(秒)</th><th>通话状态</th><th>操作</th></tr></thead><tbody>' +
      record.attempts.map(function (item, index) {
        return '<tr class="' + (selectedAttempt === index ? 'is-selected' : '') + '"><td>第 ' + item.no + ' 次</td><td>' + escapeHtml(displayValue(item.vendorCallId)) + '</td><td>' + escapeHtml(maskedPhone(item.calledNumber)) + '</td><td class="ai-call-tags-cell">' + escapeHtml(callTagNames(item.callTags)) + '</td><td>' + escapeHtml(maskedWechat(item.wechat)) + '</td><td>' + escapeHtml(displayValue(item.startedAt)) + '</td><td>' + escapeHtml(displayValue(item.endedAt)) + '</td><td>' + escapeHtml(displayValue(item.recordGeneratedAt)) + '</td><td class="ai-call-numeric">' + escapeHtml(displayDuration(item.talkSeconds)) + '</td><td>' + escapeHtml(callStatusName(item.status, item.statusName)) + '</td><td><button class="btn btn-secondary btn-sm" type="button" onclick="selectAiCallAttempt(' + index + ')">查看</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="ai-call-absence">暂无拨打记录</p>';
    var attemptDetail = attempt ? '<div class="ai-call-attempt-detail"><h4>第 ' + attempt.no + ' 次拨打详情</h4><div class="ai-call-field-grid">' +
      field('通话ID', attempt.vendorCallId) + field('电话号码', maskedPhone(attempt.calledNumber)) + field('通话标签', callTagNames(attempt.callTags)) + field('微信号', maskedWechat(attempt.wechat)) +
      field('通话开始时间', attempt.startedAt) + field('通话结束时间', attempt.endedAt) + field('通话记录生成时间', attempt.recordGeneratedAt) + field('通话时长(秒)', displayDuration(attempt.talkSeconds)) + field('通话状态', callStatusName(attempt.status, attempt.statusName)) +
      field('接通时间', attempt.answeredAt || (callStatusName(attempt.status, attempt.statusName) === '未接通' ? '未接通' : '未记录')) + field('振铃时长(秒)', displayDuration(attempt.ringSeconds)) + field('结束原因', attempt.reason) + field('结果回传时间', attempt.resultAt) + '</div><div class="ai-call-summary ai-call-attempt-summary' + (typeof attempt.summary === 'string' && attempt.summary.trim() ? '' : ' is-empty') + '"><span>通话小结</span><p>' + escapeHtml(typeof attempt.summary === 'string' && attempt.summary.trim() ? attempt.summary : '暂无通话小结') + '</p></div></div>' : '';
    section.innerHTML = '<div class="card-header"><strong class="card-title">任务与拨打信息</strong></div>' +
      '<div class="ai-call-detail-body">' +
      '<div class="ai-call-section"><h3>任务概览</h3><div class="ai-call-field-grid">' + technicalField('任务状态', record.taskState) + technicalField('结果状态', record.resultState) + technicalField('品牌', record.brand) + technicalField('外呼系统', routing(record).systemName) + technicalField('外呼类型', routing(record).typeName) + technicalField('来源线索', record.sourceLeadId) + technicalField('关联线索', record.leadIds.join('、')) + technicalField('创建时间', record.createdAt) + technicalField('结束时间', record.finishedAt) + '</div>' +
      (accessibleRelatedLeads(record).length ? '<div class="ai-call-related"><button type="button" class="btn btn-secondary btn-sm" onclick="openLeadFromAiCall(\'' + record.id + '\')">查看关联线索的处理进度</button></div>' : '') + '</div>' +
      '<div class="ai-call-section"><h3>拨打记录</h3>' + attempts + attemptDetail + '</div>' +
      '<div class="ai-call-section"><h3>录音与转写</h3><p class="ai-call-absence">暂无录音与转写记录</p></div>' +
      '</div>';
  }
  function selectAiCallRecord(id) {
    if (!records.some(function (item) { return item.id === id; })) return;
    listScrollY = window.scrollY || 0;
    selectedId = id;
    selectedAttempt = 0;
    navigateTo('ai-call-record-detail');
    window.scrollTo(0, 0);
  }
  function returnToAiCallList() {
    navigateTo('ai-call-records');
    window.scrollTo(0, listScrollY);
  }
  function selectAiCallAttempt(index) {
    var record = records.find(function (item) { return item.id === selectedId; });
    if (!record || !Number.isInteger(index) || index < 0 || index >= record.attempts.length) return;
    selectedAttempt = index;
    renderAiCallDetail();
  }
  function resetAiCallFilters() {
    exactLeadQuery = '';
    ['aiCallKeyword', 'aiCallBrand', 'aiCallSystem', 'aiCallType', 'aiCallSystemSearch', 'aiCallTypeSearch', 'aiCallTaskState', 'aiCallResultState'].forEach(function (id) { document.getElementById(id).value = ''; });
    ['aiCallSystemPicker', 'aiCallTypePicker'].forEach(function (id) { document.getElementById(id).open = false; });
    renderAiCallRecords();
  }
  function openAiCallRecordsForLead(leadId) {
    if (typeof leadId !== 'string' || !leadId.trim()) return;
    leadId = leadId.trim();
    exactLeadQuery = leadId;
    document.getElementById('aiCallKeyword').value = leadId;
    document.getElementById('aiCallBrand').value = '';
    document.getElementById('aiCallSystem').value = '';
    document.getElementById('aiCallType').value = '';
    document.getElementById('aiCallSystemSearch').value = '';
    document.getElementById('aiCallTypeSearch').value = '';
    document.getElementById('aiCallTaskState').value = '';
    document.getElementById('aiCallResultState').value = '';
    navigateTo('ai-call-records');
    renderAiCallRecords();
  }
  function accessibleRelatedLeads(record) {
    if (!record || typeof window.getLeadDetailReferences !== 'function' || typeof window.openLeadDetailById !== 'function') return [];
    var ids = Array.isArray(record.leadIds) ? record.leadIds : [];
    return window.getLeadDetailReferences(ids).filter(function (lead, index, leads) {
      return lead && ids.includes(lead.id) && leads.findIndex(function (item) { return item.id === lead.id; }) === index;
    });
  }
  function relatedLeadUnavailable() {
    if (typeof window.showToast === 'function') window.showToast('关联线索不可查看，请刷新后重试', 'warning');
    renderAiCallDetail();
  }
  function openAiCallRelatedLead(index) {
    var choice = relatedLeadChoices[index];
    var record = records.find(function (item) { return item.id === relatedLeadTaskId; });
    if (!choice || !record || record.id !== selectedId || !accessibleRelatedLeads(record).some(function (lead) { return lead.id === choice.id; })) {
      var staleDialog = document.getElementById('aiCallRelatedLeadDialog');
      if (staleDialog && staleDialog.open) staleDialog.close();
      relatedLeadUnavailable(); return;
    }
    var dialog = document.getElementById('aiCallRelatedLeadDialog');
    if (dialog && dialog.open) dialog.close();
    if (!window.openLeadDetailById(choice.id)) { relatedLeadUnavailable(); return; }
    if (typeof window.switchLeadTab === 'function') window.switchLeadTab('trace', true);
  }
  function openLeadFromAiCall(taskId) {
    var record = records.find(function (item) { return item.id === taskId; });
    if (!record || record.id !== selectedId) return;
    relatedLeadTaskId = taskId;
    relatedLeadChoices = accessibleRelatedLeads(record);
    if (!relatedLeadChoices.length) { relatedLeadUnavailable(); return; }
    if (relatedLeadChoices.length === 1) { openAiCallRelatedLead(0); return; }
    var dialog = document.getElementById('aiCallRelatedLeadDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'aiCallRelatedLeadDialog';
      dialog.className = 'ai-call-help-dialog';
      dialog.setAttribute('aria-labelledby', 'aiCallRelatedLeadTitle');
      document.body.appendChild(dialog);
      dialog.addEventListener('click', function (event) {
        var rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
      });
    }
    dialog.innerHTML = '<div class="modal-header"><h3 class="modal-title" id="aiCallRelatedLeadTitle">选择关联线索</h3><button type="button" class="modal-close" aria-label="关闭线索选择" onclick="document.getElementById(\'aiCallRelatedLeadDialog\').close()">×</button></div><div class="modal-body ai-call-related-choices">' +
      relatedLeadChoices.map(function (lead, index) { return '<button type="button" class="btn btn-secondary" onclick="openAiCallRelatedLead(' + index + ')">' + escapeHtml(lead.id) + '<span>查看处理进度 →</span></button>'; }).join('') + '</div>';
    dialog.showModal();
  }
  window.openAiCallRelatedLead = openAiCallRelatedLead;
  window.openAiCallFieldHelp = openAiCallFieldHelp;
  window.renderAiCallRecords = renderAiCallRecords;
  window.selectAiCallRecord = selectAiCallRecord;
  window.returnToAiCallList = returnToAiCallList;
  window.renderAiCallDetail = renderAiCallDetail;
  window.selectAiCallAttempt = selectAiCallAttempt;
  window.resetAiCallFilters = resetAiCallFilters;
  window.openAiCallRecordsForLead = openAiCallRecordsForLead;
  window.openLeadFromAiCall = openLeadFromAiCall;
  window.renderAiCallPickerOptions = renderAiCallPickerOptions;
  window.chooseAiCallFacet = chooseAiCallFacet;
  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'aiCallKeyword') exactLeadQuery = '';
  }, true);
  document.addEventListener('click', function (event) {
    ['aiCallSystemPicker', 'aiCallTypePicker'].forEach(function (id) { var picker = document.getElementById(id); if (picker && !picker.contains(event.target)) picker.open = false; });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    ['aiCallSystemPicker', 'aiCallTypePicker'].forEach(function (id) { var picker = document.getElementById(id); if (picker && picker.open) { picker.open = false; picker.querySelector('summary').focus(); } });
  });
})();

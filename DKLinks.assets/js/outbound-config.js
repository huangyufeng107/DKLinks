// 按品牌保存外呼接入范围与预评分分配；保留东风日产旧配置读取。
(function () {
  var brandConfigStorageKey = 'dklinks_outbound_brand_configs_v1';
  var legacyScopeStorageKey = 'dklinks_nissan_outbound_scope_v1';
  var legacyRouteStorageKey = 'dklinks_nissan_score_routes_v1';
  var channelStorageKey = 'dklinks_nissan_ai_channels_v1';
  var dictionaryStorageKey = 'dklinks_system_dictionary_v1';
  var nissanDictionarySeedKey = 'dklinks_nissan_outbound_dictionary_seed_v1';
  var nissanFlowSeedKey = 'dklinks_nissan_outbound_flow_seed_v1';
  var outboundSystemTypeCode = 'OUTBOUND_SYSTEM';
  var channelTypeCode = 'OUTBOUND_TYPE';
  var phoneStatusTypeCode = 'PHONE_STATUS';
  var selectedDictionaryType = channelTypeCode;
  var nissanBrandCode = 'DONGFENG_NISSAN';
  var selectedBrandCode = nissanBrandCode;
  var loadedRulesFingerprint = '';
  var loadedTaskDedupFingerprint = '';
  var loadedOriginalWaitFingerprint = '';
  var loadedWaitFingerprint = '';
  var loadedResultRulesFingerprint = '';
  var resultActions = ['dispatch', 'manual', 'receive_only'];
  var resultCallStatuses = ['ANY', 'CONNECTED', 'NOT_CONNECTED', 'UNKNOWN'];
  var resultTagModes = ['tag', 'no_tag', 'unmapped_tag'];
  var brandNames = { DONGFENG_NISSAN: '东风日产', LIXIANG: '理想汽车', AITO: '问界', XIAOPENG: '小鹏汽车', NIO: '蔚来' };
  var seriesBrandIds = { DONGFENG_NISSAN: '5', LIXIANG: '1', AITO: '2', XIAOPENG: '3', NIO: '4' };
  var exampleRules = [
    { start: 0, end: 11, endInclusive: false, target: 'ai' },
    { start: 11, end: 100, endInclusive: true, target: 'ai' }
  ];

  function managedBrands() {
    var items = typeof brandManagementList !== 'undefined' && Array.isArray(brandManagementList) && brandManagementList.length
      ? brandManagementList : Object.keys(brandNames).map(function (code) { return { code: code, name: brandNames[code] }; });
    return items.filter(function (item) { return item && item.code && item.name; }).map(function (item) {
      brandNames[item.code] = item.name;
      return { code: item.code, name: item.name };
    });
  }

  function readBrandConfigs() {
    var configs = {};
    try {
      var saved = JSON.parse(localStorage.getItem(brandConfigStorageKey) || 'null');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) configs = saved;
    } catch (error) {}
    if (!Object.prototype.hasOwnProperty.call(configs, nissanBrandCode)) {
      try {
        var legacyScope = JSON.parse(localStorage.getItem(legacyScopeStorageKey) || 'null');
        var legacyRoutes = JSON.parse(localStorage.getItem(legacyRouteStorageKey) || 'null');
        if (legacyScope || legacyRoutes) configs[nissanBrandCode] = { scope: legacyScope, routes: legacyRoutes };
      } catch (error) {}
    }
    return configs;
  }

  function readScope(brandCode) {
    var entry = readBrandConfigs()[brandCode || selectedBrandCode];
    return entry && entry.scope && typeof entry.scope.enabled === 'boolean' ? entry.scope : { enabled: false };
  }

  function readTaskDedup(brandCode) {
    var entry = readBrandConfigs()[brandCode || selectedBrandCode];
    var saved = entry && entry.taskDedup;
    return saved && typeof saved.enabled === 'boolean'
      ? { enabled: saved.enabled, cooldownEnabled: saved.cooldownEnabled === true,
        cooldownHours: Number.isInteger(saved.cooldownHours) && saved.cooldownHours >= 1 && saved.cooldownHours <= 8760 ? saved.cooldownHours : null }
      : { enabled: false, cooldownEnabled: false, cooldownHours: null };
  }

  function readStoredRoutes(brandCode) {
    var entry = readBrandConfigs()[brandCode || selectedBrandCode];
    var saved = entry && entry.routes;
    return saved && Array.isArray(saved.rules) && saved.rules.length && ['ai', 'human'].includes(saved.fallback) ? saved : null;
  }

  function readRoutes(brandCode) {
    var saved = readStoredRoutes(brandCode);
    return saved && saved.fallback === 'ai' && saved.rules.every(function (rule) { return rule.target === 'ai'; }) ? saved : null;
  }

  function readLinkedLeadWait(brandCode) {
    var entry = readBrandConfigs()[brandCode || selectedBrandCode];
    var saved = entry && entry.linkedLeadWait;
    return saved && Number.isInteger(saved.minutes) && saved.minutes >= 1 && saved.minutes <= 1440 &&
      ['normal', 'manual'].includes(saved.timeoutAction) ? saved : null;
  }

  function readOriginalLeadWait(brandCode) {
    var entry = readBrandConfigs()[brandCode || selectedBrandCode];
    var saved = entry && entry.originalLeadWait;
    return saved && Number.isInteger(saved.minutes) && saved.minutes >= 1 && saved.minutes <= 1440 &&
      ['normal', 'manual'].includes(saved.timeoutAction) ? saved : null;
  }

  function readResultRules(brandCode) {
    var entry = readBrandConfigs()[brandCode || selectedBrandCode];
    var saved = entry && entry.resultRouting;
    if (!saved || !Array.isArray(saved.rules) || !resultActions.includes(saved.fallbackAction)) return null;
    if (saved.rules.some(function (rule) {
      return !rule || !resultCallStatuses.includes(rule.callStatus) || !resultTagModes.includes(rule.tagMode) ||
        (rule.outboundSystemCode != null && typeof rule.outboundSystemCode !== 'string') ||
        (rule.outboundTypeCode != null && typeof rule.outboundTypeCode !== 'string') ||
        (rule.outboundTypeCode && !rule.outboundSystemCode) ||
        !resultActions.includes(rule.action) || (rule.tagMode === 'tag' && !String(rule.tagCode || '').trim());
    })) return null;
    return saved;
  }

  // 标签、小结与通话状态分别记录；只有任务结束回传才进入结果映射，无标签也属于可映射结果。
  function classifyOutboundResult(resultState) {
    if (resultState === 'terminal_no_result') return { kind: 'failed' };
    if (resultState === 'usable' || resultState === 'terminal_result') {
      return { kind: 'completed', callStatus: 'UNKNOWN', tagCondition: 'unclassified', tags: [], summary: '' };
    }
    if (!resultState || typeof resultState !== 'object') return { kind: 'pending' };
    var taskStatus = String(resultState.taskStatus || resultState.status || '').toUpperCase();
    if (resultState.terminalNoResult === true || ['FAILED', 'CANCELLED'].includes(taskStatus)) return { kind: 'failed' };
    if (resultState.terminal !== true && !['COMPLETED', 'FINISHED', 'SUCCESS'].includes(taskStatus)) return { kind: 'pending' };
    var tags = (Array.isArray(resultState.tags) ? resultState.tags : [resultState.tags]).filter(function (tag) {
      return typeof tag === 'string' && tag.trim();
    }).map(function (tag) { return tag.trim(); });
    return {
      kind: 'completed',
      callStatus: String(resultState.callStatus || 'UNKNOWN').toUpperCase(),
      tagCondition: tags.length ? 'has_tag' : 'no_tag',
      tags: tags,
      outboundSystemCode: (resultState.taskRouteSnapshot && resultState.taskRouteSnapshot.systemCode) || resultState.outboundSystemCode || '',
      outboundTypeCode: (resultState.taskRouteSnapshot && resultState.taskRouteSnapshot.typeCode) || resultState.outboundTypeCode || '',
      summary: typeof resultState.summary === 'string' ? resultState.summary.trim() : ''
    };
  }

  function saveBrandConfig(part, value) {
    var configs = readBrandConfigs();
    var entry = configs[selectedBrandCode] && typeof configs[selectedBrandCode] === 'object' ? configs[selectedBrandCode] : {};
    entry[part] = value;
    configs[selectedBrandCode] = entry;
    localStorage.setItem(brandConfigStorageKey, JSON.stringify(configs));
  }

  function normalizeItems(items) {
    return (Array.isArray(items) ? items : []).filter(function (item) { return item && item.name && item.code; }).map(function (item, index) {
      var brands = Array.isArray(item.brands) ? item.brands : item.brand ? [item.brand] : [];
      return { name: item.name, code: item.code, brands: brands.filter(function (brand) { return !!brandNames[brand]; }), outboundSystemCode: item.outboundSystemCode || '', seriesRelated: item.seriesRelated === true, scenarioId: item.scenarioId || '', defaultScenarioId: item.defaultScenarioId || '', seriesScenarioMappings: Array.isArray(item.seriesScenarioMappings) ? item.seriesScenarioMappings.filter(function (mapping) { return mapping && mapping.seriesCode && mapping.scenarioId; }).map(function (mapping) { return { seriesCode: mapping.seriesCode, scenarioId: mapping.scenarioId }; }) : [], enabled: item.enabled === true, sort: Number.isInteger(Number(item.sort)) && Number(item.sort) >= 0 ? Number(item.sort) : (index + 1) * 10, description: item.description || '' };
    }).sort(function (a, b) { return a.sort - b.sort || a.code.localeCompare(b.code); });
  }

  function readDictionary() {
    var base = { types: [
      { code: outboundSystemTypeCode, name: '外呼系统', scope: '业务字典', description: '先维护外呼平台或供应商系统', brandScoped: false, locked: true },
      { code: channelTypeCode, name: '外呼类型', scope: '业务字典', description: '关联外呼系统与支持品牌，作为分配规则选择的线路通道', brandScoped: true, locked: true },
      { code: phoneStatusTypeCode, name: '号码检测状态', scope: '全局共享', description: '维护号码状态服务的返回码与显示名称；UNKNOWN 为检测异常的固定兜底', brandScoped: false, locked: true }
    ], items: {} };
    base.items[outboundSystemTypeCode] = [];
    base.items[channelTypeCode] = [];
    base.items[phoneStatusTypeCode] = [
      { code: 'NORMAL', name: '正常', sort: 10, enabled: true },
      { code: 'SHUTDOWN', name: '停机', sort: 20, enabled: true },
      { code: 'POWER_OFF', name: '关机', sort: 30, enabled: true },
      { code: 'NOT_EXIST', name: '空号', sort: 40, enabled: true },
      { code: 'SUSPECTED_POWER_OFF', name: '疑似关机', sort: 50, enabled: true },
      { code: 'BUSY', name: '忙', sort: 60, enabled: true },
      { code: 'UNKNOWN', name: '未知 / 检测异常', sort: 999, enabled: true, description: '固定兜底；不能停用或删除' }
    ];
    try {
      var saved = JSON.parse(localStorage.getItem(dictionaryStorageKey) || 'null');
      if (saved && Array.isArray(saved.types) && saved.items && typeof saved.items === 'object') {
        if (saved.items.AI_OUTBOUND_CHANNEL && !saved.items[channelTypeCode]) saved.items[channelTypeCode] = saved.items.AI_OUTBOUND_CHANNEL;
        saved.types = saved.types.filter(function (type) { return type.code !== 'AI_OUTBOUND_CHANNEL'; });
        base.types.slice().reverse().forEach(function (entry) { if (!saved.types.some(function (type) { return type.code === entry.code; })) saved.types.unshift(entry); });
        saved.types.forEach(function (type) { if (type.code === channelTypeCode) { type.brandScoped = true; type.locked = true; } if (type.code === outboundSystemTypeCode || type.code === phoneStatusTypeCode) { type.brandScoped = false; type.locked = true; } });
        if (!saved.items[outboundSystemTypeCode]) saved.items[outboundSystemTypeCode] = [];
        saved.items[channelTypeCode] = normalizeItems(saved.items[channelTypeCode]);
        if (!Array.isArray(saved.items[phoneStatusTypeCode])) saved.items[phoneStatusTypeCode] = base.items[phoneStatusTypeCode];
        if (!saved.items[phoneStatusTypeCode].some(function (item) { return item.code === 'UNKNOWN'; })) saved.items[phoneStatusTypeCode].push(base.items[phoneStatusTypeCode][6]);
        saved.items[phoneStatusTypeCode] = normalizeItems(saved.items[phoneStatusTypeCode]).map(function (item) {
          if (item.code === 'UNKNOWN') item.enabled = true;
          return item;
        });
        return saved;
      }
      base.items[channelTypeCode] = normalizeItems(JSON.parse(localStorage.getItem(channelStorageKey) || '[]'));
      return base;
    } catch (error) {
      return base;
    }
  }

  function writeDictionary(dictionary) {
    localStorage.setItem(dictionaryStorageKey, JSON.stringify(dictionary));
    window.renderOutboundChannelDictionary();
    refreshChannelOptions();
    renderStatus();
    if (selectedDictionaryType === phoneStatusTypeCode) {
      if (typeof reconcilePhoneStatusConfigs === 'function') reconcilePhoneStatusConfigs();
      if (typeof renderDispatchFieldTable === 'function') renderDispatchFieldTable();
    }
  }

  function readChannels() {
    var dictionary = readDictionary();
    var systems = normalizeItems(dictionary.items[outboundSystemTypeCode]);
    return normalizeItems(dictionary.items[channelTypeCode]).filter(function (item) {
      return systems.some(function (system) { return system.code === item.outboundSystemCode && system.enabled; }) && sceneConfigured(item);
    });
  }

  function sceneConfigured(item) {
    return item.seriesRelated ? !!item.defaultScenarioId && item.seriesScenarioMappings.length > 0 : !!item.scenarioId;
  }

  function managedSeriesForBrands(brands) {
    if (typeof carSeriesData !== 'object' || !carSeriesData) return [];
    var result = [];
    brands.forEach(function (brand) {
      (carSeriesData[seriesBrandIds[brand]] || []).forEach(function (series) {
        result.push({ code: series.code, name: series.name, brand: brand });
      });
    });
    return result;
  }

  function eligibleChannels() {
    return readChannels().filter(function (item) { return item.brands.includes(selectedBrandCode) && item.enabled; });
  }

  function channelOptions(selected) {
    var select = document.createElement('select');
    select.className = 'form-input score-rule-channel';
    select.setAttribute('aria-label', 'AI 外呼线路通道');
    select.style.minWidth = '210px';
    select.add(new Option('请选择线路通道', ''));
    eligibleChannels().forEach(function (channel) {
      select.add(new Option(channel.name + '（' + channel.code + '）', channel.code));
    });
    if (selected && !Array.from(select.options).some(function (option) { return option.value === selected; })) {
      select.add(new Option('原通道不可用（' + selected + '）', selected));
    }
    select.value = selected || '';
    return select;
  }

  function syncRowChannel(row) {
    var isAi = row.querySelector('.score-rule-target').value === 'ai';
    var channel = row.querySelector('.score-rule-channel');
    channel.disabled = !isAi;
    channel.style.display = isAi ? '' : 'none';
  }

  function syncFallbackChannel() {
    var isAi = document.getElementById('outboundScoreFallback').value === 'ai';
    document.getElementById('outboundFallbackChannelGroup').style.display = isAi ? '' : 'none';
    document.getElementById('outboundFallbackChannel').disabled = !isAi;
  }

  function refreshChannelOptions() {
    Array.from(document.querySelectorAll('#outboundScoreRulesBody tr')).forEach(function (row) {
      var old = row.querySelector('.score-rule-channel');
      var replacement = channelOptions(old.value);
      old.replaceWith(replacement);
      syncRowChannel(row);
    });
    var fallback = document.getElementById('outboundFallbackChannel');
    var replacement = channelOptions(fallback.value);
    replacement.id = 'outboundFallbackChannel';
    fallback.replaceWith(replacement);
    syncFallbackChannel();
    var list = document.getElementById('outboundAiChannelList');
    var channels = eligibleChannels();
    var brandName = brandNames[selectedBrandCode] || selectedBrandCode;
    list.textContent = channels.length ? '可选的' + brandName + ' AI 线路通道：' + channels.map(function (item) { return item.name + '（' + item.code + '）'; }).join('、') : brandName + '暂无可用的 AI 线路通道，请先在数据字典中启用外呼系统，并完成外呼类型的品牌及场景 ID 配置。';
  }

  function renderStatus(preserveScopeInput) {
    var enabled = readScope().enabled;
    var savedRoutes = readRoutes();
    var storedRoutes = readStoredRoutes();
    var hasUnsupportedRoute = !!storedRoutes && !savedRoutes;
    var brandName = brandNames[selectedBrandCode] || selectedBrandCode;
    var channels = eligibleChannels();
    var routesConfigured = !!savedRoutes && savedRoutes.rules.every(function (rule) {
      return channels.some(function (item) { return item.code === rule.channel; });
    }) && channels.some(function (item) { return item.code === savedRoutes.fallbackChannel; });
    var needsOriginalWait = !!savedRoutes && (savedRoutes.rules.some(function (rule) { return rule.target === 'ai'; }) || savedRoutes.fallback === 'ai');
    var originalWaitConfigured = !needsOriginalWait || !!readOriginalLeadWait();
    var resultRulesConfigured = !needsOriginalWait || !!readResultRules();
    var dispatchMappingConfigured = !needsOriginalWait || !!(window.DispatchAiResultMapping && window.DispatchAiResultMapping.get(selectedBrandCode));
    var configured = routesConfigured && originalWaitConfigured && resultRulesConfigured && dispatchMappingConfigured;
    var input = document.getElementById('outboundEnabled');
    var badge = document.getElementById('outboundScopeStatus');
    var hint = document.getElementById('outboundConfigHint');
    var ruleBadge = document.getElementById('outboundScoreRuleStatus');
    var ruleHint = document.getElementById('outboundScoreRuleHint');
    if (!input || !badge || !hint || !ruleBadge || !ruleHint) return;
    document.getElementById('outboundScopeTitle').textContent = '外呼接入范围';
    document.getElementById('outboundScopeDescription').textContent = '开启后，所有通过现有接收与准入校验的' + brandName + '新线索进入外呼分配；不按来源或渠道筛选。';
    document.getElementById('outboundScopeRange').textContent = brandName + ' · 通过现有接收与准入校验的新线索';
    document.getElementById('outboundScopeToggleLabel').setAttribute('aria-label', '启用' + brandName + '外呼分配');
    document.getElementById('outboundBrandSummary').textContent = brandName + '的配置独立保存；切换页签可继续编辑，各分区分别保存。';
    if (!preserveScopeInput) input.checked = enabled;
    badge.className = 'status-badge ' + (enabled ? 'status-warning' : 'status-pending');
    badge.textContent = enabled ? (configured ? '已开启 · 接入、等待与结果已配置' : !routesConfigured ? (storedRoutes ? '已开启 · 分配规则待修复' : '已开启 · 分配规则待配置') : !originalWaitConfigured ? '已开启 · 首条线索等待待配置' : !resultRulesConfigured ? '已开启 · 结果规则待配置' : '已开启 · 下发映射未确认') : '未启用';
    hint.textContent = configured ? '外呼分配、等待、结果规则与下发字段映射已配置。' : hasUnsupportedRoute ? '已保存规则含本期不支持的人工外呼去向，请为对应区间和兜底重新选择 AI 线路通道并保存。' : !routesConfigured ? (savedRoutes ? '已保存规则引用的线路通道不可用，请检查外呼系统、支持品牌和场景 ID 配置。' : '预评分区间与兜底分配规则待配置。') : !originalWaitConfigured ? 'AI 外呼首条线索等待规则待配置；配置完成前不创建 AI 外呼任务。' : !resultRulesConfigured ? 'AI 外呼结果映射规则待配置；配置完成前不创建 AI 外呼任务。' : 'AI 外呼结果下发映射尚未确认；确认前不创建新的 AI 外呼任务，沿用原线索流程。';
    ruleBadge.className = 'status-badge ' + (routesConfigured ? 'status-active' : 'status-pending');
    ruleBadge.textContent = routesConfigured ? '已保存' : storedRoutes ? '待修复' : '待配置';
    ruleHint.textContent = '按预评分原始数值比较，不取整。起始分含边界；结束分可选择是否含边界；各区间和兜底均分配到 AI 线路通道。' +
      (hasUnsupportedRoute ? '已保存规则含人工外呼去向，本期暂停使用；请为原人工区间和兜底指定 AI 线路通道并保存。' : savedRoutes ? '下方为已保存的区间规则。' : '当前品牌尚无已保存的分配规则，请配置区间并设置兜底线路。');
    if (typeof window.refreshNissanOutboundWalkthrough === 'function') window.refreshNissanOutboundWalkthrough();
    if (!preserveScopeInput && window.captureOutboundConfigSection) window.captureOutboundConfigSection('scope');
  }

  function currentRulesFingerprint() {
    var rows = Array.from(document.querySelectorAll('#outboundScoreRulesBody tr')).map(function (row) {
      return [row.querySelector('.score-rule-start').value, row.querySelector('.score-rule-end').value,
        row.querySelector('.score-rule-end-inclusive').checked, row.querySelector('.score-rule-target').value,
        row.querySelector('.score-rule-channel').value];
    });
    return JSON.stringify([rows, document.getElementById('outboundScoreFallback').value, document.getElementById('outboundFallbackChannel').value]);
  }

  function currentTaskDedupFingerprint() {
    return JSON.stringify([
      document.getElementById('outboundTaskDedupEnabled').checked,
      document.getElementById('outboundEndedCooldownEnabled').checked,
      document.getElementById('outboundEndedCooldownHours').value
    ]);
  }

  function syncEndedCooldownInputs() {
    document.getElementById('outboundEndedCooldownHours').disabled = !document.getElementById('outboundEndedCooldownEnabled').checked;
  }

  function currentWaitFingerprint() {
    return JSON.stringify([
      document.getElementById('outboundLinkedLeadWaitMinutes').value,
      document.getElementById('outboundLinkedLeadTimeoutAction').value
    ]);
  }

  function currentOriginalWaitFingerprint() {
    return JSON.stringify([
      document.getElementById('outboundOriginalLeadWaitMinutes').value,
      document.getElementById('outboundOriginalLeadTimeoutAction').value
    ]);
  }

  function currentResultRulesFingerprint() {
    var rows = Array.from(document.querySelectorAll('#outboundResultRulesBody tr')).map(function (row) {
      return [row.querySelector('.outbound-result-system').value, row.querySelector('.outbound-result-type').value, row.querySelector('.outbound-result-call-status').value,
        row.querySelector('.outbound-result-tag-mode').value,
        row.querySelector('.outbound-result-tag-code').value,
        row.querySelector('.outbound-result-action').value];
    });
    return JSON.stringify([rows, document.getElementById('outboundResultFallbackAction').value]);
  }

  function syncResultTagInput(row) {
    var needsCode = row.querySelector('.outbound-result-tag-mode').value === 'tag';
    var input = row.querySelector('.outbound-result-tag-code');
    input.disabled = !needsCode;
    input.placeholder = needsCode ? '填写外呼系统返回的标签编码' : '无需填写';
  }

  function appendResultRuleRow(rule) {
    var body = document.getElementById('outboundResultRulesBody');
    if (!body) return;
    var row = document.createElement('tr');
    if (rule && rule.id) row.dataset.ruleId = rule.id;
    row.innerHTML = '<td><select class="form-input outbound-result-system" aria-label="适用外呼系统" style="min-width:180px;"></select></td>' +
      '<td><select class="form-input outbound-result-type" aria-label="适用外呼类型" style="min-width:180px;"></select></td>' +
      '<td><select class="form-input outbound-result-call-status" aria-label="通话状态" style="min-width:150px;">' +
      '<option value="ANY">任意状态</option><option value="CONNECTED">已接通</option><option value="NOT_CONNECTED">未接通</option><option value="UNKNOWN">未知</option></select></td>' +
      '<td><select class="form-input outbound-result-tag-mode" aria-label="标签条件" style="min-width:160px;">' +
      '<option value="tag">指定标签</option><option value="no_tag">无标签</option><option value="unmapped_tag">标签未映射</option></select></td>' +
      '<td><input class="form-input outbound-result-tag-code" type="text" maxlength="100" aria-label="标签编码" style="min-width:190px;"></td>' +
      '<td><select class="form-input outbound-result-action" aria-label="执行动作" style="min-width:220px;">' +
      '<option value="">请选择</option><option value="dispatch">继续厂商下发</option><option value="manual">暂停自动下发，转人工处理</option><option value="receive_only">仅接收不下发</option></select></td>' +
      '<td><button class="btn btn-secondary btn-sm" type="button" onclick="removeOutboundResultRule(this)">删除</button></td>';
    row.querySelector('.outbound-result-call-status').value = rule.callStatus || 'ANY';
    row.querySelector('.outbound-result-tag-mode').value = rule.tagMode || 'tag';
    row.querySelector('.outbound-result-tag-code').value = rule.tagCode || '';
    row.querySelector('.outbound-result-action').value = rule.action || '';
    populateResultScope(row, rule);
    row.querySelector('.outbound-result-tag-mode').onchange = function () { syncResultTagInput(row); };
    syncResultTagInput(row);
    body.appendChild(row);
  }

  function resultScopeItems() {
    var dictionary = readDictionary();
    return { systems: normalizeItems(dictionary.items[outboundSystemTypeCode]),
      types: normalizeItems(dictionary.items[channelTypeCode]).filter(function (item) { return item.brands.includes(selectedBrandCode); }) };
  }
  function populateResultScope(row, rule) {
    var items = resultScopeItems();
    var systemSelect = row.querySelector('.outbound-result-system');
    var typeSelect = row.querySelector('.outbound-result-type');
    row.dataset.originalSystemCode = rule.outboundSystemCode || '';
    row.dataset.originalTypeCode = rule.outboundTypeCode || '';
    row.dataset.originalSystemName = rule.outboundSystemName || '';
    row.dataset.originalTypeName = rule.outboundTypeName || '';
    systemSelect.add(new Option('品牌内全部系统', ''));
    items.systems.filter(function (system) { return items.types.some(function (type) { return type.outboundSystemCode === system.code; }); }).forEach(function (system) {
      systemSelect.add(new Option(system.name + (system.enabled ? '' : '（已停用）'), system.code));
    });
    if (rule.outboundSystemCode && !Array.from(systemSelect.options).some(function (option) { return option.value === rule.outboundSystemCode; })) {
      systemSelect.add(new Option((rule.outboundSystemName || rule.outboundSystemCode) + '（历史引用）', rule.outboundSystemCode));
    }
    systemSelect.value = rule.outboundSystemCode || '';
    function fillTypes(selected) {
      typeSelect.innerHTML = '';
      typeSelect.add(new Option('该范围内全部类型', ''));
      items.types.filter(function (type) { return !systemSelect.value || type.outboundSystemCode === systemSelect.value; }).forEach(function (type) {
        var system = items.systems.find(function (item) { return item.code === type.outboundSystemCode; });
        var option = new Option(type.name + (!systemSelect.value ? ' · ' + (system ? system.name : type.outboundSystemCode) : '') + (type.enabled ? '' : '（已停用）'), type.code);
        option.dataset.systemCode = type.outboundSystemCode;
        typeSelect.add(option);
      });
      if (selected && selected === row.dataset.originalTypeCode && systemSelect.value === row.dataset.originalSystemCode && !Array.from(typeSelect.options).some(function (option) { return option.value === selected; })) {
        typeSelect.add(new Option((rule.outboundTypeName || selected) + '（历史引用）', selected));
      }
      typeSelect.value = Array.from(typeSelect.options).some(function (option) { return option.value === selected; }) ? selected : '';
    }
    fillTypes(rule.outboundTypeCode || '');
    systemSelect.onchange = function () { fillTypes(typeSelect.value); };
    typeSelect.onchange = function () {
      var type = items.types.find(function (item) { return item.code === typeSelect.value; });
      if (type && !systemSelect.value) { systemSelect.value = type.outboundSystemCode; fillTypes(type.code); }
    };
  }

  function renderResultRules() {
    var saved = readResultRules();
    var body = document.getElementById('outboundResultRulesBody');
    if (!body) return;
    body.innerHTML = '';
    (saved ? saved.rules : []).forEach(appendResultRuleRow);
    document.getElementById('outboundResultFallbackAction').value = saved ? saved.fallbackAction : '';
    var badge = document.getElementById('outboundResultRuleStatus');
    badge.className = 'status-badge ' + (saved ? 'status-active' : 'status-pending');
    badge.textContent = saved ? '已保存' : '待配置';
    document.getElementById('outboundResultRuleHint').textContent = (brandNames[selectedBrandCode] || selectedBrandCode) +
      '的结果规则独立保存；可限定外呼系统和类型，再按通话状态与标签条件设置动作。' +
      (saved ? '下方为已保存规则。' : '请新增规则并选择未命中时的兜底动作。');
    loadedResultRulesFingerprint = currentResultRulesFingerprint();
    if (window.captureOutboundConfigSection) window.captureOutboundConfigSection('result');
  }

  function collectResultRules() {
    var rows = Array.from(document.querySelectorAll('#outboundResultRulesBody tr'));
    var seen = new Set();
    var rules = rows.map(function (row, index) {
      var callStatus = row.querySelector('.outbound-result-call-status').value;
      var tagMode = row.querySelector('.outbound-result-tag-mode').value;
      var tagCode = tagMode === 'tag' ? row.querySelector('.outbound-result-tag-code').value.trim() : '';
      var action = row.querySelector('.outbound-result-action').value;
      var outboundSystemCode = row.querySelector('.outbound-result-system').value;
      var outboundTypeCode = row.querySelector('.outbound-result-type').value;
      var scopeItems = resultScopeItems();
      var system = scopeItems.systems.find(function (item) { return item.code === outboundSystemCode; });
      var type = scopeItems.types.find(function (item) { return item.code === outboundTypeCode && item.outboundSystemCode === outboundSystemCode; });
      if ((outboundTypeCode && (!outboundSystemCode || (!type && (outboundTypeCode !== row.dataset.originalTypeCode || outboundSystemCode !== row.dataset.originalSystemCode)))) ||
          (outboundSystemCode && !system && outboundSystemCode !== row.dataset.originalSystemCode)) throw new Error('第 ' + (index + 1) + ' 行请选择有效的外呼系统与类型范围');
      if (!resultCallStatuses.includes(callStatus) || !resultTagModes.includes(tagMode) ||
          (tagMode === 'tag' && !tagCode) || !resultActions.includes(action)) {
        throw new Error('第 ' + (index + 1) + ' 行请填写完整的通话状态、标签条件与执行动作');
      }
      var key = [outboundSystemCode, outboundTypeCode, callStatus, tagMode, tagCode.toUpperCase()].join('|');
      if (seen.has(key)) throw new Error('第 ' + (index + 1) + ' 行与已有结果规则重复');
      seen.add(key);
      return { id: row.dataset.ruleId || null, callStatus: callStatus, tagMode: tagMode, tagCode: tagCode, action: action,
        outboundSystemCode: outboundSystemCode, outboundSystemName: outboundSystemCode ? system ? system.name : row.dataset.originalSystemName || '' : '',
        outboundTypeCode: outboundTypeCode, outboundTypeName: outboundTypeCode ? type ? type.name : row.dataset.originalTypeName || '' : '' };
    });
    var fallbackAction = document.getElementById('outboundResultFallbackAction').value;
    if (!resultActions.includes(fallbackAction)) throw new Error('请选择结果规则未命中时的兜底动作');
    return { rules: rules, fallbackAction: fallbackAction };
  }

  function renderTaskDedup() {
    var saved = readTaskDedup();
    var brandName = brandNames[selectedBrandCode] || selectedBrandCode;
    var enabled = saved.enabled;
    document.getElementById('outboundTaskDedupEnabled').checked = enabled;
    var cooldownToggle = document.getElementById('outboundEndedCooldownEnabled');
    cooldownToggle.checked = saved.cooldownEnabled;
    cooldownToggle.onchange = syncEndedCooldownInputs;
    document.getElementById('outboundEndedCooldownHours').value = saved.cooldownHours || '';
    document.getElementById('outboundEndedCooldownToggleLabel').setAttribute('aria-label', '启用' + brandName + '已结束任务重复外呼控制');
    syncEndedCooldownInputs();
    document.getElementById('outboundTaskDedupTitle').textContent = '外呼任务去重';
    document.getElementById('outboundTaskDedupToggleLabel').setAttribute('aria-label', '启用' + brandName + '外呼任务去重');
    document.getElementById('outboundTaskDedupDescription').textContent = '开启后，' + brandName + '线索若以同品牌、同手机号命中在途外呼任务，关联原任务，不新建 AI 外呼任务。';
    var badge = document.getElementById('outboundTaskDedupStatus');
    badge.className = 'status-badge ' + (enabled ? 'status-active' : 'status-pending');
    badge.textContent = enabled ? (saved.cooldownEnabled ? (saved.cooldownHours ? '已启用 · 含结束后间隔' : '已启用 · 间隔待修复') : '已启用') : '未启用';
    document.getElementById('outboundTaskDedupHint').textContent = enabled
      ? (readScope().enabled ? '当前品牌已启用任务去重；只对保存后接收并通过准入的新线索生效。' : '任务去重已保存；当前品牌外呼开关关闭，暂不生效。')
      : '当前品牌未启用外呼任务去重；通过准入的新线索仍按分配规则创建各自任务。';
    document.getElementById('outboundEndedCooldownHint').textContent = saved.cooldownEnabled
      ? (saved.cooldownHours ? '同品牌、同手机号的最近一次已完成且有可用结果任务，自结束后 ' + saved.cooldownHours + ' 小时内不重复外呼；新线索复用该结果并按接收时的规则重新判定。' : '间隔时长无效，请填写 1～8760 小时并重新保存。') + (!enabled ? ' 上方去重开关关闭，当前规则暂不生效。' : '')
      : '关闭时不检查已结束任务；开启后须填写 1～8760 小时的间隔。';
    loadedTaskDedupFingerprint = currentTaskDedupFingerprint();
    if (window.captureOutboundConfigSection) window.captureOutboundConfigSection('dedup');
  }

  function renderOriginalLeadWait() {
    var saved = readOriginalLeadWait();
    var brandName = brandNames[selectedBrandCode] || selectedBrandCode;
    document.getElementById('outboundOriginalLeadWaitMinutes').value = saved ? saved.minutes : '';
    document.getElementById('outboundOriginalLeadTimeoutAction').value = saved ? saved.timeoutAction : '';
    document.getElementById('outboundOriginalLeadWaitTitle').textContent = '首条线索等待 AI 外呼结果';
    document.getElementById('outboundOriginalLeadWaitDescription').textContent = '适用于为' + brandName + '创建 AI 外呼任务的首条线索；从任务创建成功时开始计时。';
    var badge = document.getElementById('outboundOriginalLeadWaitStatus');
    badge.className = 'status-badge ' + (saved ? 'status-active' : 'status-pending');
    badge.textContent = saved ? '已保存' : '待配置';
    document.getElementById('outboundOriginalLeadWaitHint').textContent = saved
      ? '最长等待 ' + saved.minutes + ' 分钟；任务明确失败或到期未收到有效结束回传时' + (saved.timeoutAction === 'normal' ? '按现有规则继续下发，不附外呼标签与小结。' : '暂停自动下发，进入线索列表 → 待人工处理。') + (!readScope().enabled ? ' 当前品牌外呼开关关闭，规则暂不生效。' : '')
      : 'AI 外呼任务创建成功时开始计时；请配置最长等待期限与未收到有效结束回传时的处理方式。';
    loadedOriginalWaitFingerprint = currentOriginalWaitFingerprint();
    if (window.captureOutboundConfigSection) window.captureOutboundConfigSection('firstWait');
  }

  function renderLinkedLeadWait() {
    var saved = readLinkedLeadWait();
    var brandName = brandNames[selectedBrandCode] || selectedBrandCode;
    document.getElementById('outboundLinkedLeadWaitMinutes').value = saved ? saved.minutes : '';
    document.getElementById('outboundLinkedLeadTimeoutAction').value = saved ? saved.timeoutAction : '';
    document.getElementById('outboundLinkedLeadWaitDescription').textContent = brandName + '启用外呼任务去重后，线索通过现有接收与准入校验且关联在途任务时，按本规则等待原任务结果。已被现有接收去重规则拦截的线索不进入本规则。';
    var badge = document.getElementById('outboundLinkedLeadWaitStatus');
    badge.className = 'status-badge ' + (saved ? 'status-active' : 'status-pending');
    badge.textContent = saved ? '已保存' : '待配置';
    document.getElementById('outboundLinkedLeadWaitHint').textContent = saved
      ? '等待 ' + saved.minutes + ' 分钟；任务明确失败或到期未收到有效结束回传时' + (saved.timeoutAction === 'normal' ? '按现有规则继续下发，不附外呼标签与小结。' : '暂停自动下发，进入线索列表 → 待人工处理。') + (!readScope().enabled ? ' 当前品牌外呼开关关闭，规则暂不生效。' : !readTaskDedup().enabled ? ' 外呼任务去重关闭，关联等待规则暂不生效。' : '')
      : '从新线索完成接收与准入校验时开始计时；收到原任务的有效结束回传后进入结果映射。';
    loadedWaitFingerprint = currentWaitFingerprint();
    if (window.captureOutboundConfigSection) window.captureOutboundConfigSection('linkedWait');
  }

  window.switchOutboundBrand = function (brandCode) {
    var select = document.getElementById('outboundBrandSwitch');
    if (!managedBrands().some(function (brand) { return brand.code === brandCode; })) { select.value = selectedBrandCode; return; }
    if (brandCode === selectedBrandCode) return;
    var scopeChanged = document.getElementById('outboundEnabled').checked !== readScope().enabled;
    var taskDedupChanged = currentTaskDedupFingerprint() !== loadedTaskDedupFingerprint;
    var rulesChanged = currentRulesFingerprint() !== loadedRulesFingerprint;
    var originalWaitChanged = currentOriginalWaitFingerprint() !== loadedOriginalWaitFingerprint;
    var waitChanged = currentWaitFingerprint() !== loadedWaitFingerprint;
    var resultRulesChanged = currentResultRulesFingerprint() !== loadedResultRulesFingerprint;
    if ((scopeChanged || taskDedupChanged || rulesChanged || originalWaitChanged || waitChanged || resultRulesChanged) && !window.confirm('当前品牌有未保存的外呼配置，切换品牌将放弃这些修改。确定切换吗？')) {
      select.value = selectedBrandCode;
      return;
    }
    selectedBrandCode = brandCode;
    select.value = brandCode;
    renderRules();
    renderTaskDedup();
    renderOriginalLeadWait();
    renderLinkedLeadWait();
    renderResultRules();
    if (typeof window.refreshNissanOutboundWalkthrough === 'function') window.refreshNissanOutboundWalkthrough();
  };

  function renderBrandSelector() {
    var select = document.getElementById('outboundBrandSwitch');
    if (!select) return;
    select.innerHTML = '';
    managedBrands().forEach(function (brand) { select.add(new Option(brand.name, brand.code)); });
    if (!Array.from(select.options).some(function (option) { return option.value === selectedBrandCode; })) selectedBrandCode = select.options.length ? select.options[0].value : '';
    select.value = selectedBrandCode;
  }

  function renderDictionaryBrandChoices() {
    var brands = managedBrands();
    var filter = document.getElementById('outboundChannelBrandFilter');
    var selectedFilter = filter.value;
    filter.innerHTML = '';
    filter.add(new Option('全部品牌', ''));
    brands.forEach(function (brand) { filter.add(new Option(brand.name, brand.code)); });
    filter.value = selectedFilter;
    var container = document.getElementById('outboundChannelBrands');
    var checked = Array.from(container.querySelectorAll('input:checked')).map(function (input) { return input.value; });
    container.innerHTML = '';
    brands.forEach(function (brand) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      input.type = 'checkbox'; input.value = brand.code; input.checked = checked.includes(brand.code);
      input.addEventListener('change', window.renderOutboundSeriesSceneOptions);
      label.appendChild(input); label.appendChild(document.createTextNode(' ' + brand.name)); container.appendChild(label);
    });
  }

  function appendRuleRow(rule) {
    var body = document.getElementById('outboundScoreRulesBody');
    if (!body) return;
    var row = document.createElement('tr');
    row.innerHTML = '<td><input class="form-input score-rule-start" type="number" min="0" step="any" aria-label="起始分" style="width:120px;"><input class="score-rule-target" type="hidden" value="ai"></td>' +
      '<td><input class="form-input score-rule-end" type="number" min="0" step="any" aria-label="结束分" style="width:120px;"></td>' +
      '<td><label style="display:inline-flex; align-items:center; gap:8px; white-space:nowrap;"><input class="score-rule-end-inclusive" type="checkbox">包含</label></td>' +
      '<td class="score-rule-channel-cell"></td>' +
      '<td><button class="btn btn-secondary btn-sm" type="button" onclick="removeOutboundScoreRule(this)">删除</button></td>';
    row.querySelector('.score-rule-start').value = rule.start == null ? '' : rule.start;
    row.querySelector('.score-rule-end').value = rule.end == null ? '' : rule.end;
    row.querySelector('.score-rule-end-inclusive').checked = !!rule.endInclusive;
    row.querySelector('.score-rule-channel-cell').appendChild(channelOptions(rule.target === 'ai' ? rule.channel : ''));
    syncRowChannel(row);
    body.appendChild(row);
  }

  function renderRules(preserveScopeInput) {
    var saved = readStoredRoutes();
    var body = document.getElementById('outboundScoreRulesBody');
    var fallback = document.getElementById('outboundScoreFallback');
    if (!body || !fallback) return;
    body.innerHTML = '';
    (saved ? saved.rules : selectedBrandCode === nissanBrandCode ? exampleRules : []).forEach(appendRuleRow);
    fallback.value = 'ai';
    refreshChannelOptions();
    document.getElementById('outboundFallbackChannel').value = saved && saved.fallback === 'ai' ? saved.fallbackChannel || '' : '';
    syncFallbackChannel();
    fallback.onchange = syncFallbackChannel;
    renderStatus(preserveScopeInput);
    loadedRulesFingerprint = currentRulesFingerprint();
    if (window.captureOutboundConfigSection) window.captureOutboundConfigSection('score');
  }

  function collectRules() {
    var rows = Array.from(document.querySelectorAll('#outboundScoreRulesBody tr'));
    if (!rows.length) throw new Error('请至少配置一个预评分区间');
    var rules = rows.map(function (row, index) {
      var startText = row.querySelector('.score-rule-start').value.trim();
      var endText = row.querySelector('.score-rule-end').value.trim();
      var start = Number(startText);
      var end = Number(endText);
      if (!startText || !endText || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
        throw new Error('第 ' + (index + 1) + ' 行分数无效：需填写非负数，且结束分大于起始分');
      }
      var target = row.querySelector('.score-rule-target').value;
      if (target !== 'ai') throw new Error('本期仅支持 AI 外呼分配');
      var channel = row.querySelector('.score-rule-channel').value;
      if (!eligibleChannels().some(function (item) { return item.code === channel; })) {
        throw new Error('第 ' + (index + 1) + ' 行选择 AI 外呼时，请指定已启用且适用于' + (brandNames[selectedBrandCode] || selectedBrandCode) + '的线路通道');
      }
      return {
        start: start,
        end: end,
        endInclusive: row.querySelector('.score-rule-end-inclusive').checked,
        target: target,
        channel: channel
      };
    }).sort(function (a, b) { return a.start - b.start; });
    for (var i = 1; i < rules.length; i++) {
      var previous = rules[i - 1];
      var current = rules[i];
      if (previous.end > current.start || (previous.end === current.start && previous.endInclusive)) {
        throw new Error('预评分区间不能重叠，请调整 ' + previous.start + '～' + previous.end + ' 与 ' + current.start + '～' + current.end);
      }
    }
    var fallback = document.getElementById('outboundScoreFallback').value;
    if (fallback !== 'ai') throw new Error('本期仅支持 AI 外呼兜底');
    var fallbackChannel = document.getElementById('outboundFallbackChannel').value;
    if (!eligibleChannels().some(function (item) { return item.code === fallbackChannel; })) {
      throw new Error('兜底去向选择 AI 外呼时，请指定已启用且适用于' + (brandNames[selectedBrandCode] || selectedBrandCode) + '的线路通道');
    }
    return { rules: rules, fallback: fallback, fallbackChannel: fallbackChannel };
  }

  window.evaluateOutboundScore = function (score, rules, fallback, fallbackChannel) {
    if (!Array.isArray(rules) || fallback !== 'ai' || rules.some(function (rule) { return rule.target !== 'ai'; })) {
      return { target: 'original', reason: '分配规则含本期不支持的去向，沿用原线索流程' };
    }
    var value = score === '' || score == null ? NaN : Number(score);
    if (Number.isFinite(value) && value >= 0) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (value >= rule.start && (value < rule.end || (rule.endInclusive && value === rule.end))) {
          return { target: 'ai', channel: rule.channel || '', reason: '命中区间 ≥' + rule.start + '、' + (rule.endInclusive ? '≤' : '<') + rule.end };
        }
      }
    }
    return { target: 'ai', channel: fallbackChannel || '', reason: Number.isFinite(value) && value >= 0 ? '未命中区间，使用兜底线路' : '未取得有效分数，使用兜底线路' };
  };
  window.evaluateNissanOutboundScore = window.evaluateOutboundScore;

  function channelIsReferenced(code) {
    return channelReferenceCount(code) > 0;
  }

  function channelReferenceCount(code) {
    var configs = readBrandConfigs();
    return Object.keys(configs).reduce(function (count, brandCode) {
      var routes = readStoredRoutes(brandCode);
      return count + (routes ? routes.rules.filter(function (rule) { return rule.target === 'ai' && rule.channel === code; }).length + (routes.fallback === 'ai' && routes.fallbackChannel === code ? 1 : 0) : 0);
    }, 0);
  }

  function systemReferenceCount(code) {
    return normalizeItems(readDictionary().items[channelTypeCode]).filter(function (item) { return item.outboundSystemCode === code; }).length;
  }

  function currentType(dictionary) {
    return dictionary.types.find(function (type) { return type.code === selectedDictionaryType; }) || dictionary.types[0];
  }

  function selectedItems(dictionary) {
    var type = currentType(dictionary);
    return normalizeItems(dictionary.items[type.code]);
  }

  window.SystemDictionary = Object.freeze({
    listTypes: function () { return readDictionary().types.map(function (type) { return Object.assign({}, type); }); },
    listItems: function (typeCode) { return normalizeItems(readDictionary().items[typeCode]); },
    listManagedSeries: function (brandCodes) { return managedSeriesForBrands(Array.isArray(brandCodes) ? brandCodes : []); },
    resolveOutboundScene: function (outboundTypeCode, seriesCode, brandCode) {
      var item = readChannels().find(function (entry) { return entry.code === outboundTypeCode && entry.enabled && (!brandCode || entry.brands.includes(brandCode)); });
      if (!item) return null;
      if (!item.seriesRelated) return { scenarioId: item.scenarioId, source: '统一场景' };
      var validSeriesCode = !brandCode || managedSeriesForBrands([brandCode]).some(function (series) { return series.code === seriesCode; });
      var mapping = validSeriesCode && item.seriesScenarioMappings.find(function (entry) { return entry.seriesCode === seriesCode; });
      return mapping ? { scenarioId: mapping.scenarioId, source: '车系映射' } : { scenarioId: item.defaultScenarioId, source: '默认场景' };
    },
    getOptions: function (typeCode, brandCode) {
      var dictionary = readDictionary();
      var type = dictionary.types.find(function (entry) { return entry.code === typeCode; });
      if (!type) return [];
      var enabledSystems = normalizeItems(dictionary.items[outboundSystemTypeCode]).filter(function (system) { return system.enabled; }).map(function (system) { return system.code; });
      return normalizeItems(dictionary.items[typeCode]).filter(function (item) {
        return item.enabled && (!type.brandScoped || !brandCode || item.brands.includes(brandCode)) &&
          (typeCode !== channelTypeCode || (enabledSystems.includes(item.outboundSystemCode) && sceneConfigured(item)));
      });
    }
  });

  function saveSelectedItems(items) {
    var dictionary = readDictionary();
    dictionary.items[currentType(dictionary).code] = items;
    writeDictionary(dictionary);
  }

  window.selectSystemDictionaryType = function (code) {
    selectedDictionaryType = code;
    window.resetOutboundChannelFilters();
  };

  window.renderOutboundChannelDictionary = function () {
    var body = document.getElementById('outboundChannelTableBody');
    if (!body) return;
    var dictionary = readDictionary();
    var type = currentType(dictionary);
    var channels = selectedItems(dictionary);
    var typeList = document.getElementById('systemDictionaryTypeList');
    typeList.innerHTML = '';
    dictionary.types.forEach(function (entry) {
      var button = document.createElement('button'); button.type = 'button';
      button.className = 'outbound-dictionary-category' + (entry.code === type.code ? ' active' : '');
      var label = document.createElement('span'); var name = document.createElement('strong'); name.textContent = entry.name;
      var meta = document.createElement('small'); meta.textContent = entry.scope + ' · ' + normalizeItems(dictionary.items[entry.code]).length + ' 项';
      label.appendChild(name); label.appendChild(meta); button.appendChild(label);
      var arrow = document.createElement('span'); arrow.textContent = '›'; button.appendChild(arrow);
      button.addEventListener('click', function () { window.selectSystemDictionaryType(entry.code); });
      typeList.appendChild(button);
    });
    document.getElementById('systemDictionaryTypeCount').textContent = '共 ' + dictionary.types.length + ' 个字典';
    document.getElementById('outboundChannelCount').textContent = '共 ' + dictionary.types.reduce(function (sum, entry) { return sum + normalizeItems(dictionary.items[entry.code]).length; }, 0) + ' 个字典项';
    document.getElementById('systemDictionarySelectedTitle').textContent = type.name;
    document.getElementById('systemDictionarySelectedDescription').textContent = type.description || type.scope;
    document.getElementById('systemDictionaryNote').textContent = type.code === channelTypeCode ? '外呼类型须关联已启用的外呼系统，并选择支持品牌；各品牌的分配规则只显示适用于该品牌的可用线路。既有任务保留原快照。' : type.code === outboundSystemTypeCode ? '先维护外呼平台或供应商系统，再在“外呼类型”中配置具体线路通道。停用系统后，其下类型不会进入新分配规则。' : type.code === phoneStatusTypeCode ? '此处维护号码状态服务返回码与显示名称；品牌处理方式及厂商下发枚举行读取已启用字典项。新增并启用状态后，未补齐处理动作或目标值的品牌检测暂停，补齐后需重新启用。未识别的返回码和调用异常按 UNKNOWN 兜底；UNKNOWN 不能停用或删除。' : '此分类可统一维护字典项，供后续业务页面接入。编码保存后不可修改；停用项不应供新配置选择。';
    document.getElementById('outboundChannelBrandFilter').style.display = type.brandScoped ? '' : 'none';
    Array.from(document.querySelectorAll('.dictionary-brand-column')).forEach(function (node) { node.style.display = type.brandScoped ? '' : 'none'; });
    Array.from(document.querySelectorAll('.dictionary-system-column')).forEach(function (node) { node.style.display = type.code === channelTypeCode ? '' : 'none'; });
    Array.from(document.querySelectorAll('.dictionary-scene-column')).forEach(function (node) { node.style.display = type.code === channelTypeCode ? '' : 'none'; });
    var keyword = (document.getElementById('outboundChannelSearch').value || '').trim().toLowerCase();
    var brand = document.getElementById('outboundChannelBrandFilter').value;
    var status = document.getElementById('outboundChannelStatusFilter').value;
    var filtered = channels.filter(function (item) {
      return (!keyword || (item.name + ' ' + item.code + ' ' + item.description).toLowerCase().includes(keyword)) &&
        (!type.brandScoped || !brand || item.brands.includes(brand)) && (!status || (item.enabled ? 'enabled' : 'disabled') === status);
    });
    body.innerHTML = '';
    filtered.forEach(function (item) {
      var row = document.createElement('tr');
      var codeCell = document.createElement('td'); var codeTag = document.createElement('code'); codeTag.textContent = item.code; codeCell.appendChild(codeTag); row.appendChild(codeCell);
      [item.name, item.description || '—'].forEach(function (value) { var cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); });
      var systemCell = document.createElement('td');
      var system = normalizeItems(dictionary.items[outboundSystemTypeCode]).find(function (entry) { return entry.code === item.outboundSystemCode; });
      systemCell.textContent = system ? system.name + (system.enabled ? '' : '（已停用）') : '待关联';
      systemCell.className = 'dictionary-system-column'; systemCell.style.display = type.code === channelTypeCode ? '' : 'none'; row.appendChild(systemCell);
      var brandCell = document.createElement('td');
      item.brands.forEach(function (brand) { var tag = document.createElement('span'); tag.className = 'outbound-dictionary-brand'; tag.textContent = brandNames[brand]; brandCell.appendChild(tag); });
      if (!item.brands.length) brandCell.textContent = '待设置';
      brandCell.className = 'dictionary-brand-column'; brandCell.style.display = type.brandScoped ? '' : 'none'; row.appendChild(brandCell);
      var sceneCell = document.createElement('td');
      sceneCell.textContent = item.seriesRelated ? '按车系配置 · ' + item.seriesScenarioMappings.length + ' 项；默认 ' + (item.defaultScenarioId || '待配置') : '统一场景 · ' + (item.scenarioId || '待配置');
      sceneCell.className = 'dictionary-scene-column'; sceneCell.style.display = type.code === channelTypeCode ? '' : 'none'; row.appendChild(sceneCell);
      var sortCell = document.createElement('td'); sortCell.textContent = item.sort; row.appendChild(sortCell);
      var referenceCell = document.createElement('td');
      var refs = type.code === channelTypeCode ? channelReferenceCount(item.code) : type.code === outboundSystemTypeCode ? systemReferenceCount(item.code) : 0;
      if (refs) { var refTag = document.createElement('span'); refTag.className = 'outbound-dictionary-ref'; refTag.textContent = '被 ' + refs + ' 处引用'; referenceCell.appendChild(refTag); }
      else referenceCell.textContent = type.code === channelTypeCode ? '未引用' : type.code === phoneStatusTypeCode ? '号码检测配置' : '待业务接入';
      row.appendChild(referenceCell);
      var statusCell = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'status-badge ' + (item.enabled ? 'status-active' : 'status-inactive');
      badge.textContent = item.enabled ? '启用' : '停用';
      statusCell.appendChild(badge); row.appendChild(statusCell);
      var actionCell = document.createElement('td');
      [['编辑', 'btn btn-secondary btn-sm', function () { window.openOutboundChannelForm(item.code); }],
        [item.enabled ? '停用' : '启用', 'btn btn-secondary btn-sm', function () { window.toggleOutboundChannelDictionaryItem(item.code); }],
        ['删除', 'btn btn-danger btn-sm', function () { window.deleteOutboundChannelDictionaryItem(item.code); }]
      ].filter(function (action) { return !(type.code === phoneStatusTypeCode && item.code === 'UNKNOWN' && action[0] !== '编辑'); }).forEach(function (action) {
        var button = document.createElement('button'); button.type = 'button'; button.className = action[1]; button.textContent = action[0]; button.style.marginRight = '6px'; button.addEventListener('click', action[2]); actionCell.appendChild(button);
      });
      row.appendChild(actionCell); body.appendChild(row);
    });
    document.getElementById('outboundChannelEmpty').style.display = filtered.length ? 'none' : '';
  };

  window.resetOutboundChannelFilters = function () {
    document.getElementById('outboundChannelSearch').value = '';
    document.getElementById('outboundChannelBrandFilter').value = '';
    document.getElementById('outboundChannelStatusFilter').value = '';
    window.renderOutboundChannelDictionary();
  };

  function selectedBrandsInForm() {
    return Array.from(document.querySelectorAll('#outboundChannelBrands input[type="checkbox"]:checked')).map(function (checkbox) { return checkbox.value; });
  }

  window.addOutboundSeriesSceneRow = function (mapping) {
    var container = document.getElementById('outboundSeriesSceneRows');
    var row = document.createElement('div'); row.className = 'outbound-scene-row';
    var seriesSelect = document.createElement('select'); seriesSelect.className = 'form-input outbound-scene-series'; seriesSelect.setAttribute('aria-label', '车系');
    var sceneInput = document.createElement('input'); sceneInput.className = 'form-input outbound-scene-id'; sceneInput.placeholder = '外呼场景 ID'; sceneInput.setAttribute('aria-label', '该车系的外呼场景 ID'); sceneInput.value = mapping ? mapping.scenarioId : '';
    var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-secondary btn-sm'; remove.textContent = '删除'; remove.addEventListener('click', function () { row.remove(); });
    row.appendChild(seriesSelect); row.appendChild(sceneInput); row.appendChild(remove); container.appendChild(row);
    window.renderOutboundSeriesSceneOptions();
    seriesSelect.value = mapping ? mapping.seriesCode : '';
    if (mapping && mapping.seriesCode && seriesSelect.value !== mapping.seriesCode) {
      seriesSelect.add(new Option('原车系不可用（' + mapping.seriesCode + '）', mapping.seriesCode)); seriesSelect.value = mapping.seriesCode;
    }
  };

  window.renderOutboundSeriesSceneOptions = function () {
    var series = managedSeriesForBrands(selectedBrandsInForm());
    Array.from(document.querySelectorAll('#outboundSeriesSceneRows .outbound-scene-series')).forEach(function (select) {
      var previous = select.value;
      select.innerHTML = '';
      select.add(new Option(series.length ? '请选择车系' : '所选品牌暂无车系', ''));
      series.forEach(function (entry) { select.add(new Option(brandNames[entry.brand] + ' · ' + entry.name + '（' + entry.code + '）', entry.code)); });
      if (previous && !series.some(function (entry) { return entry.code === previous; })) select.add(new Option('原车系不属于已选品牌（' + previous + '）', previous));
      select.value = previous || '';
    });
  };

  window.syncOutboundSceneMode = function () {
    var related = document.querySelector('input[name="outboundSeriesRelated"]:checked').value === 'yes';
    document.getElementById('outboundGlobalSceneGroup').style.display = related ? 'none' : '';
    document.getElementById('outboundSeriesSceneGroup').style.display = related ? '' : 'none';
    if (related && !document.querySelector('#outboundSeriesSceneRows .outbound-scene-row')) window.addOutboundSeriesSceneRow();
  };

  window.openOutboundChannelForm = function (code) {
    renderDictionaryBrandChoices();
    var dictionary = readDictionary();
    var type = currentType(dictionary);
    var items = selectedItems(dictionary);
    var item = code ? items.find(function (entry) { return entry.code === code; }) : null;
    document.getElementById('outboundChannelEditCode').value = item ? item.code : '';
    document.getElementById('outboundChannelCode').value = item ? item.code : '';
    document.getElementById('outboundChannelCode').readOnly = !!item;
    document.getElementById('outboundChannelName').value = item ? item.name : '';
    Array.from(document.querySelectorAll('#outboundChannelBrands input[type="checkbox"]')).forEach(function (checkbox) { checkbox.checked = !!item && item.brands.includes(checkbox.value); });
    document.getElementById('outboundChannelSort').value = item ? item.sort : (items.length + 1) * 10;
    document.getElementById('outboundChannelEnabled').value = item && !item.enabled ? 'disabled' : 'enabled';
    document.getElementById('outboundChannelEnabled').disabled = type.code === phoneStatusTypeCode && !!item && item.code === 'UNKNOWN';
    document.getElementById('outboundChannelDescription').value = item ? item.description : '';
    document.getElementById('outboundChannelFormTitle').textContent = item ? '编辑字典项' : '新增字典项';
    var systemGroup = document.getElementById('systemDictionaryOutboundSystemGroup');
    systemGroup.style.display = type.code === channelTypeCode ? '' : 'none';
    var systemSelect = document.getElementById('systemDictionaryOutboundSystem');
    systemSelect.innerHTML = '';
    systemSelect.add(new Option('请选择已启用的外呼系统', ''));
    normalizeItems(dictionary.items[outboundSystemTypeCode]).forEach(function (system) {
      if (system.enabled || (item && item.outboundSystemCode === system.code)) systemSelect.add(new Option(system.name + (system.enabled ? '' : '（已停用）'), system.code));
    });
    systemSelect.value = item ? item.outboundSystemCode : '';
    document.getElementById('systemDictionaryBrandGroup').style.display = type.brandScoped ? '' : 'none';
    document.getElementById('systemDictionarySceneGroup').style.display = type.code === channelTypeCode ? '' : 'none';
    document.querySelector('input[name="outboundSeriesRelated"][value="' + (item && item.seriesRelated ? 'yes' : 'no') + '"]').checked = true;
    document.getElementById('outboundGlobalSceneId').value = item ? item.scenarioId : '';
    document.getElementById('outboundDefaultSceneId').value = item ? item.defaultScenarioId : '';
    document.getElementById('outboundSeriesSceneRows').innerHTML = '';
    if (item && item.seriesRelated) item.seriesScenarioMappings.forEach(window.addOutboundSeriesSceneRow);
    window.syncOutboundSceneMode();
    document.getElementById('outboundChannelFormCard').classList.add('active');
    document.getElementById('outboundChannelCode').focus();
  };

  window.closeOutboundChannelForm = function () { document.getElementById('outboundChannelFormCard').classList.remove('active'); };

  window.saveOutboundChannelDictionaryItem = function () {
    var dictionary = readDictionary();
    var type = currentType(dictionary);
    var original = document.getElementById('outboundChannelEditCode').value;
    var code = document.getElementById('outboundChannelCode').value.trim();
    var name = document.getElementById('outboundChannelName').value.trim();
    var brands = selectedBrandsInForm();
    var sortText = document.getElementById('outboundChannelSort').value.trim();
    var sort = Number(sortText);
    var enabled = document.getElementById('outboundChannelEnabled').value === 'enabled';
    var description = document.getElementById('outboundChannelDescription').value.trim();
    var outboundSystemCode = type.code === channelTypeCode ? document.getElementById('systemDictionaryOutboundSystem').value : '';
    var seriesRelated = type.code === channelTypeCode && document.querySelector('input[name="outboundSeriesRelated"]:checked').value === 'yes';
    var scenarioId = type.code === channelTypeCode && !seriesRelated ? document.getElementById('outboundGlobalSceneId').value.trim() : '';
    var defaultScenarioId = seriesRelated ? document.getElementById('outboundDefaultSceneId').value.trim() : '';
    var seriesScenarioMappings = seriesRelated ? Array.from(document.querySelectorAll('#outboundSeriesSceneRows .outbound-scene-row')).map(function (row) {
      return { seriesCode: row.querySelector('.outbound-scene-series').value, scenarioId: row.querySelector('.outbound-scene-id').value.trim() };
    }) : [];
    if (!code || !name || (type.brandScoped && !brands.length)) { showToast('请填写编码、名称及此分类要求的适用品牌', 'error'); return; }
    if (type.code === channelTypeCode && !normalizeItems(dictionary.items[outboundSystemTypeCode]).some(function (system) { return system.code === outboundSystemCode && system.enabled; })) { showToast('请先关联已启用的外呼系统', 'error'); return; }
    if (type.code === channelTypeCode && !seriesRelated && !scenarioId) { showToast('未关联车系时，请填写统一外呼场景 ID', 'error'); return; }
    if (seriesRelated) {
      if (!defaultScenarioId) { showToast('关联车系时，请填写默认外呼场景 ID', 'error'); return; }
      if (!seriesScenarioMappings.length || seriesScenarioMappings.some(function (mapping) { return !mapping.seriesCode || !mapping.scenarioId; })) { showToast('请至少完整配置一条车系与场景 ID 映射', 'error'); return; }
      var eligibleSeries = managedSeriesForBrands(brands).map(function (series) { return series.code; });
      if (seriesScenarioMappings.some(function (mapping) { return !eligibleSeries.includes(mapping.seriesCode); })) { showToast('车系映射必须来自已选品牌的基础车系数据', 'error'); return; }
      if (new Set(seriesScenarioMappings.map(function (mapping) { return mapping.seriesCode; })).size !== seriesScenarioMappings.length) { showToast('同一车系只能配置一个外呼场景 ID', 'error'); return; }
    }
    if (!sortText || !Number.isInteger(sort) || sort < 0) { showToast('排序必须是非负整数', 'error'); return; }
    if (original && code !== original) { showToast('已保存的通道编码不可修改', 'error'); return; }
    if (!/^[A-Za-z0-9_-]+$/.test(code)) { showToast('字典项编码只能使用字母、数字、下划线和连字符', 'error'); return; }
    if (type.code === phoneStatusTypeCode && (code !== code.toUpperCase() || !/^[A-Z][A-Z0-9_]*$/.test(code))) { showToast('号码检测状态编码须与服务返回码一致，使用大写字母、数字和下划线', 'error'); return; }
    if (type.code === phoneStatusTypeCode && code === 'UNKNOWN' && !enabled) { showToast('UNKNOWN 是检测异常的固定兜底，不能停用', 'error'); return; }
    var channels = selectedItems(dictionary);
    if (!original && channels.some(function (item) { return item.code === code; })) { showToast('该分类中编码已存在', 'error'); return; }
    var item = { code: code, name: name, brands: type.brandScoped ? brands : [], outboundSystemCode: outboundSystemCode, seriesRelated: seriesRelated, scenarioId: scenarioId, defaultScenarioId: defaultScenarioId, seriesScenarioMappings: seriesScenarioMappings, sort: sort, enabled: enabled, description: description };
    if (original) {
      var index = channels.findIndex(function (channel) { return channel.code === original; });
      if (index < 0) { showToast('原通道不存在，请刷新后重试', 'error'); return; }
      channels[index] = item;
    } else channels.push(item);
    try { saveSelectedItems(channels); window.closeOutboundChannelForm(); showToast('字典项已保存', 'success'); }
    catch (error) { showToast('字典项保存失败，请检查浏览器存储设置', 'error'); }
  };

  window.toggleOutboundChannelDictionaryItem = function (code) {
    if (selectedDictionaryType === phoneStatusTypeCode && code === 'UNKNOWN') { showToast('UNKNOWN 是固定兜底，不能停用', 'error'); return; }
    var channels = selectedItems(readDictionary());
    var item = channels.find(function (channel) { return channel.code === code; });
    if (!item) return;
    item.enabled = !item.enabled;
    try { saveSelectedItems(channels); showToast(item.enabled ? '字典项已启用' : '字典项已停用', 'success'); }
    catch (error) { showToast('状态保存失败，请检查浏览器存储设置', 'error'); }
  };

  window.deleteOutboundChannelDictionaryItem = function (code) {
    if (selectedDictionaryType === phoneStatusTypeCode && code === 'UNKNOWN') { showToast('UNKNOWN 是固定兜底，不能删除', 'error'); return; }
    if (selectedDictionaryType === channelTypeCode && channelIsReferenced(code)) { showToast('该通道已被分配规则引用，请先修改规则；可先停用通道', 'error'); return; }
    if (selectedDictionaryType === outboundSystemTypeCode && systemReferenceCount(code)) { showToast('该外呼系统已有外呼类型关联，请先调整类型归属；可先停用系统', 'error'); return; }
    try { saveSelectedItems(selectedItems(readDictionary()).filter(function (item) { return item.code !== code; })); showToast('字典项已删除', 'success'); }
    catch (error) { showToast('字典项删除失败，请检查浏览器存储设置', 'error'); }
  };

  window.openSystemDictionaryTypeForm = function (editing) {
    var type = editing ? currentType(readDictionary()) : null;
    document.getElementById('systemDictionaryTypeEditCode').value = type ? type.code : '';
    document.getElementById('systemDictionaryTypeCode').value = type ? type.code : '';
    document.getElementById('systemDictionaryTypeCode').readOnly = !!type;
    document.getElementById('systemDictionaryTypeName').value = type ? type.name : '';
    document.getElementById('systemDictionaryTypeScope').value = type ? type.scope : '业务字典';
    document.getElementById('systemDictionaryBrandScoped').checked = !!type && !!type.brandScoped;
    document.getElementById('systemDictionaryBrandScoped').disabled = !!type && !!type.locked;
    document.getElementById('systemDictionaryTypeDescription').value = type ? type.description || '' : '';
    document.getElementById('systemDictionaryTypeTitle').textContent = type ? '编辑字典分类' : '新增字典分类';
    document.getElementById('systemDictionaryTypeModal').classList.add('active');
  };

  window.closeSystemDictionaryTypeForm = function () { document.getElementById('systemDictionaryTypeModal').classList.remove('active'); };

  window.saveSystemDictionaryType = function () {
    var dictionary = readDictionary();
    var original = document.getElementById('systemDictionaryTypeEditCode').value;
    var code = document.getElementById('systemDictionaryTypeCode').value.trim().toUpperCase();
    var name = document.getElementById('systemDictionaryTypeName').value.trim();
    var scope = document.getElementById('systemDictionaryTypeScope').value;
    var brandScoped = document.getElementById('systemDictionaryBrandScoped').checked;
    var description = document.getElementById('systemDictionaryTypeDescription').value.trim();
    if (!code || !name || !/^[A-Z][A-Z0-9_]*$/.test(code)) { showToast('请填写名称；分类编码需使用大写字母、数字及下划线，且以字母开头', 'error'); return; }
    if (original && code !== original) { showToast('分类编码保存后不可修改', 'error'); return; }
    if (!original && dictionary.types.some(function (type) { return type.code === code; })) { showToast('分类编码已存在', 'error'); return; }
    var previous = dictionary.types.find(function (type) { return type.code === original; });
    if (previous && previous.brandScoped !== brandScoped && selectedItems(dictionary).length) { showToast('分类已有字典项，不能切换适用品牌维度', 'error'); return; }
    var entry = { code: code, name: name, scope: scope, description: description, brandScoped: brandScoped, locked: !!previous && !!previous.locked };
    if (previous) dictionary.types[dictionary.types.indexOf(previous)] = entry;
    else { dictionary.types.push(entry); dictionary.items[code] = []; selectedDictionaryType = code; }
    try { writeDictionary(dictionary); window.closeSystemDictionaryTypeForm(); showToast('字典分类已保存', 'success'); }
    catch (error) { showToast('字典分类保存失败，请检查浏览器存储设置', 'error'); }
  };

  window.deleteSystemDictionaryType = function () {
    var dictionary = readDictionary();
    var type = currentType(dictionary);
    if (type.locked) { showToast('系统内置字典分类不能删除', 'error'); return; }
    if (selectedItems(dictionary).length) { showToast('请先清空该分类的字典项', 'error'); return; }
    dictionary.types = dictionary.types.filter(function (entry) { return entry.code !== type.code; });
    delete dictionary.items[type.code];
    selectedDictionaryType = channelTypeCode;
    try { writeDictionary(dictionary); showToast('字典分类已删除', 'success'); }
    catch (error) { showToast('字典分类删除失败，请检查浏览器存储设置', 'error'); }
  };

  window.addOutboundScoreRule = function () {
    appendRuleRow({ start: '', end: '', endInclusive: false, target: 'ai' });
  };

  window.addOutboundResultRule = function () {
    appendResultRuleRow({ callStatus: 'ANY', tagMode: 'tag', tagCode: '', action: '' });
  };

  window.removeOutboundResultRule = function (button) {
    var row = button.closest('tr');
    if (row) row.remove();
  };

  window.removeOutboundScoreRule = function (button) {
    var row = button.closest('tr');
    if (row) row.remove();
  };

  window.saveBrandOutboundScope = function () {
    var input = document.getElementById('outboundEnabled');
    if (!input) return;
    if (input.checked && !(window.DispatchAiResultMapping && window.DispatchAiResultMapping.get(selectedBrandCode))) {
      input.checked = readScope().enabled;
      showToast('请先确认该品牌的 AI 外呼结果下发字段，当前不能新启用外呼', 'warning');
      renderStatus();
      return;
    }
    try {
      saveBrandConfig('scope', { enabled: input.checked });
      renderStatus();
      showToast((brandNames[selectedBrandCode] || selectedBrandCode) + '外呼接入范围已保存', 'success');
    } catch (error) {
      showToast('配置保存失败，请检查浏览器存储设置', 'error');
    }
  };

  window.saveBrandTaskDedup = function () {
    var input = document.getElementById('outboundTaskDedupEnabled');
    if (!input) return;
    try {
      var cooldownEnabled = document.getElementById('outboundEndedCooldownEnabled').checked;
      var hoursText = document.getElementById('outboundEndedCooldownHours').value.trim();
      var cooldownHours = hoursText ? Number(hoursText) : null;
      if (cooldownEnabled && !input.checked) throw new Error('请先启用上方外呼任务去重，再启用已结束任务间隔');
      if (cooldownEnabled && (!Number.isInteger(cooldownHours) || cooldownHours < 1 || cooldownHours > 8760)) {
        throw new Error('再次外呼间隔须为 1～8760 小时的整数');
      }
      saveBrandConfig('taskDedup', { enabled: input.checked, cooldownEnabled: cooldownEnabled, cooldownHours: cooldownHours });
      renderTaskDedup();
      if (typeof window.refreshNissanOutboundWalkthrough === 'function') window.refreshNissanOutboundWalkthrough();
      showToast((brandNames[selectedBrandCode] || selectedBrandCode) + '外呼任务去重配置已保存', 'success');
    } catch (error) {
      showToast(error.message === '请先启用上方外呼任务去重，再启用已结束任务间隔' || error.message === '再次外呼间隔须为 1～8760 小时的整数'
        ? error.message : '去重配置保存失败，请检查浏览器存储设置', 'error');
    }
  };

  function collectWaitPolicy(minutesId, actionId) {
    var minutesText = document.getElementById(minutesId).value.trim();
    var minutes = Number(minutesText);
    var timeoutAction = document.getElementById(actionId).value;
    if (!minutesText || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new Error('等待期限须为 1～1440 分钟的整数');
    }
    if (!['normal', 'manual'].includes(timeoutAction)) {
      throw new Error('请选择任务失败或未收到结束回传时的处理方式');
    }
    return { minutes: minutes, timeoutAction: timeoutAction };
  }

  window.saveBrandOriginalLeadWaitPolicy = function () {
    try {
      saveBrandConfig('originalLeadWait', collectWaitPolicy('outboundOriginalLeadWaitMinutes', 'outboundOriginalLeadTimeoutAction'));
      renderOriginalLeadWait();
      renderStatus(true);
      showToast((brandNames[selectedBrandCode] || selectedBrandCode) + '首条线索等待规则已保存', 'success');
    } catch (error) {
      showToast(error.message === '等待期限须为 1～1440 分钟的整数' || error.message === '请选择任务失败或未收到结束回传时的处理方式'
        ? error.message : '等待规则保存失败，请检查浏览器存储设置', 'error');
    }
  };

  window.saveBrandLinkedLeadWaitPolicy = function () {
    try {
      saveBrandConfig('linkedLeadWait', collectWaitPolicy('outboundLinkedLeadWaitMinutes', 'outboundLinkedLeadTimeoutAction'));
      renderLinkedLeadWait();
      if (typeof window.refreshNissanOutboundWalkthrough === 'function') window.refreshNissanOutboundWalkthrough();
      showToast((brandNames[selectedBrandCode] || selectedBrandCode) + '关联线索等待规则已保存', 'success');
    } catch (error) {
      showToast(error.message === '等待期限须为 1～1440 分钟的整数' || error.message === '请选择任务失败或未收到结束回传时的处理方式'
        ? error.message : '等待规则保存失败，请检查浏览器存储设置', 'error');
    }
  };

  window.saveBrandScoreRules = function () {
    var config;
    try {
      config = collectRules();
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }
    try {
      saveBrandConfig('routes', config);
      renderRules(true);
      showToast('预评分区间与兜底分配规则已保存', 'success');
    } catch (error) {
      showToast('规则保存失败，请检查浏览器存储设置', 'error');
    }
  };

  window.saveBrandResultRules = function () {
    var config;
    try { config = collectResultRules(); }
    catch (error) { showToast(error.message, 'error'); return; }
    try {
      var previous = readResultRules(selectedBrandCode);
      var suffix = Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      config.id = previous && previous.id ? previous.id : 'RRSET-' + selectedBrandCode + '-' + suffix;
      config.version = previous && Number.isInteger(previous.version) && previous.version > 0 ? previous.version + 1 : 1;
      config.savedAt = new Date().toISOString();
      config.rules.forEach(function (rule, index) {
        if (!rule.id) rule.id = 'RR-' + selectedBrandCode + '-' + suffix + '-' + (index + 1);
      });
      saveBrandConfig('resultRouting', config);
      renderResultRules();
      renderStatus(true);
      showToast((brandNames[selectedBrandCode] || selectedBrandCode) + 'AI 外呼结果规则已保存', 'success');
    } catch (error) {
      showToast('结果规则保存失败，请检查浏览器存储设置', 'error');
    }
  };

  function resolveResultAction(config, sourceResult) {
    var result = sourceResult && sourceResult.kind ? sourceResult : classifyOutboundResult(sourceResult);
    if (result && result.taskRouteSnapshot) result = Object.assign({}, result, {
      outboundSystemCode: result.taskRouteSnapshot.systemCode || result.outboundSystemCode || '',
      outboundTypeCode: result.taskRouteSnapshot.typeCode || result.outboundTypeCode || ''
    });
    if (result.kind !== 'completed') return { action: 'not_completed', reason: '尚未收到有效任务结束回传' };
    if (!config || !Array.isArray(config.rules) || !resultActions.includes(config.fallbackAction)) {
      return { action: 'rule_unconfigured', result: result, reason: '当前品牌的外呼结果规则未配置' };
    }
    var callStatus = resultCallStatuses.includes(result.callStatus) && result.callStatus !== 'ANY' ? result.callStatus : 'UNKNOWN';
    var tags = Array.isArray(result.tags) ? result.tags : [];
    if (config.rules.some(function (rule) { return rule && (rule.outboundSystemCode && !result.outboundSystemCode || rule.outboundTypeCode && rule.outboundSystemCode === result.outboundSystemCode && !result.outboundTypeCode); })) {
      return { action: 'manual', status: '待人工处理', queue: 'leads', result: result, reason: '任务结果缺少外呼系统或类型快照，无法可靠匹配适用范围' };
    }
    function match(mode) {
      var candidates = config.rules.filter(function (rule) {
        return rule && (!rule.outboundSystemCode || rule.outboundSystemCode === result.outboundSystemCode) &&
          (!rule.outboundTypeCode || rule.outboundTypeCode === result.outboundTypeCode) && rule.tagMode === mode && (mode !== 'tag' || tags.some(function (tag) {
          return String(tag).toUpperCase() === String(rule.tagCode || '').toUpperCase();
        }));
      });
      candidates.sort(function (a, b) { return (b.outboundTypeCode ? 2 : b.outboundSystemCode ? 1 : 0) - (a.outboundTypeCode ? 2 : a.outboundSystemCode ? 1 : 0); });
      return candidates.find(function (rule) { return rule.callStatus === callStatus; }) ||
        candidates.find(function (rule) { return rule.callStatus === 'ANY'; }) || null;
    }
    var matched = result.tagCondition === 'unclassified' ? null :
      tags.length ? (match('tag') || match('unmapped_tag')) : match('no_tag');
    var action = matched ? matched.action : config.fallbackAction;
    var decision = { action: action, result: result, callStatus: callStatus,
      matchedRule: matched ? Object.assign({}, matched) : null,
      usedFallback: !matched };
    if (action === 'manual') { decision.status = '待人工处理'; decision.queue = 'leads'; }
    if (action === 'receive_only') decision.status = '仅接收';
    decision.reason = matched ? '命中 AI 外呼结果规则' : '结果规则未命中，执行已配置兜底动作';
    return decision;
  }

  function prepareResultDispatch(ruleSnapshot, mappingSnapshot, resultState) {
    var decision = resolveResultAction(ruleSnapshot, resultState);
    if (decision.action !== 'dispatch') return decision;
    var built = window.DispatchAiResultMapping && window.DispatchAiResultMapping.compose(mappingSnapshot, decision.result);
    if (!built || !built.ok) return {
      action: 'manual', status: '待人工处理', queue: 'leads',
      reason: '外呼结果下发字段校验未通过：' + (built ? built.reason : '字段映射未配置'),
      result: decision.result, matchedRule: decision.matchedRule, usedFallback: decision.usedFallback
    };
    return Object.assign({}, decision, { dispatchFields: built.fields, dispatchMapping: built.mapping });
  }

  window.OutboundBrandConfig = Object.freeze({
    get: function (brandCode) {
      var brand = managedBrands().find(function (item) { return item.code === brandCode; });
      if (!brand) return null;
      var scope = readScope(brandCode);
      var routes = readRoutes(brandCode);
      var channels = readChannels().filter(function (item) { return item.enabled && item.brands.includes(brandCode); });
      var routesReady = !!routes && routes.rules.every(function (rule) { return channels.some(function (item) { return item.code === rule.channel; }); }) &&
        channels.some(function (item) { return item.code === routes.fallbackChannel; });
      var originalLeadWait = readOriginalLeadWait(brandCode);
      var resultRouting = readResultRules(brandCode);
      var needsOriginalWait = !!routes && (routes.rules.some(function (rule) { return rule.target === 'ai'; }) || routes.fallback === 'ai');
      var dispatchMapping = window.DispatchAiResultMapping ? window.DispatchAiResultMapping.get(brandCode) : null;
      var aiReady = !needsOriginalWait || (!!originalLeadWait && !!resultRouting && !!dispatchMapping);
      var linkedLeadWait = readLinkedLeadWait(brandCode);
      var taskDedup = readTaskDedup(brandCode);
      return { brandCode: brandCode, enabled: scope.enabled, ready: routesReady, aiReady: aiReady,
        routes: routes ? JSON.parse(JSON.stringify(routes)) : null,
        taskDedup: { enabled: taskDedup.enabled, cooldownEnabled: taskDedup.cooldownEnabled, cooldownHours: taskDedup.cooldownHours }, originalLeadWait: originalLeadWait ? Object.assign({}, originalLeadWait) : null,
        linkedLeadWait: linkedLeadWait ? Object.assign({}, linkedLeadWait) : null,
        resultRouting: resultRouting ? JSON.parse(JSON.stringify(resultRouting)) : null,
        dispatchMapping: dispatchMapping ? JSON.parse(JSON.stringify(dispatchMapping)) : null };
    },
    evaluate: function (brandCode, score) {
      var config = this.get(brandCode);
      if (!config || !config.enabled || !config.ready) return { target: 'original', reason: '未启用或分配规则不可用，沿用原线索流程' };
      var decision = window.evaluateOutboundScore(score, config.routes.rules, config.routes.fallback, config.routes.fallbackChannel);
      return decision.target === 'ai' && !config.aiReady
        ? { target: 'original', reason: '首条线索等待、结果规则或厂商下发字段未配置，不创建 AI 外呼任务，沿用原线索流程' }
        : decision;
    },
    snapshotOriginalLeadWait: function (brandCode) {
      var config = this.get(brandCode);
      return config && config.enabled && config.ready && config.aiReady && config.originalLeadWait
        ? { brandCode: brandCode, minutes: config.originalLeadWait.minutes, timeoutAction: config.originalLeadWait.timeoutAction,
          resultRouting: JSON.parse(JSON.stringify(config.resultRouting)),
          dispatchMapping: JSON.parse(JSON.stringify(config.dispatchMapping)) }
        : null;
    },
    snapshotLinkedLeadWait: function (brandCode) {
      var config = this.get(brandCode);
      return config && config.enabled && config.taskDedup.enabled && config.linkedLeadWait
        ? { brandCode: brandCode, minutes: config.linkedLeadWait.minutes, timeoutAction: config.linkedLeadWait.timeoutAction }
        : null;
    },
    snapshotTaskDedup: function (brandCode) {
      var config = this.get(brandCode);
      return config && config.enabled && config.ready && config.aiReady && config.taskDedup.enabled
        ? { brandCode: brandCode, enabled: true, cooldownEnabled: config.taskDedup.cooldownEnabled,
          cooldownHours: config.taskDedup.cooldownHours }
        : null;
    },
    snapshotResultRouting: function (brandCode) {
      var config = this.get(brandCode);
      return config && config.enabled && config.resultRouting
        ? JSON.parse(JSON.stringify(config.resultRouting)) : null;
    },
    snapshotAiResultMapping: function (brandCode) {
      var config = this.get(brandCode);
      return config && config.enabled && config.aiReady && config.dispatchMapping
        ? JSON.parse(JSON.stringify(config.dispatchMapping)) : null;
    },
    evaluateResultRouting: function (ruleSnapshot, resultState) {
      return resolveResultAction(ruleSnapshot, resultState);
    },
    prepareAiResultDispatch: function (ruleSnapshot, mappingSnapshot, resultState) {
      return prepareResultDispatch(ruleSnapshot, mappingSnapshot, resultState);
    },
    // 生产环境需对「品牌＋完整手机号」在任务创建事务内加锁，原子复核在途及已结束任务。
    // 冷却期复用结果时，在新线索准入事务内保存本次规则、映射和旧任务结果快照；最终动作按线索 ID 幂等落库。
    evaluateTaskDedup: function (brandCode, lead, tasks, passedAdmission, nowMs) {
      if (passedAdmission !== true) return { action: 'skip', reason: '线索未通过接收、去重或准入校验，不进入外呼任务去重' };
      var config = this.get(brandCode);
      if (!config || !config.enabled) return { action: 'original', reason: '品牌外呼未启用，沿用原线索流程' };
      var canCreateTask = config.ready && config.aiReady;
      var missingConfigReason = '外呼新建任务配置不完整，沿用原线索流程';
      if (!lead || (lead.brandCode && lead.brandCode !== brandCode)) return { action: 'invalid', reason: '线索品牌与配置品牌不一致' };
      var phone = String(lead.phone || '').replace(/\D/g, '').replace(/^86(?=1\d{10}$)/, '');
      if (!/^1\d{10}$/.test(phone)) return { action: 'invalid', reason: '须使用完整手机号匹配外呼任务' };
      if (!config.taskDedup.enabled) return canCreateTask
        ? { action: 'create_task', reason: '当前品牌未启用外呼任务去重，按分配规则创建任务' }
        : { action: 'original', reason: missingConfigReason };
      var activeStatuses = ['PENDING_ASSIGNMENT', 'PENDING_CALL', 'CALLING', 'RETRYING', '待分配', '待外呼', '外呼中', '重试中'];
      var matches = (Array.isArray(tasks) ? tasks : []).filter(function (task) {
        if (!task || task.brandCode !== brandCode || !activeStatuses.includes(task.status)) return false;
        return String(task.phone || '').replace(/\D/g, '').replace(/^86(?=1\d{10}$)/, '') === phone;
      });
      if (matches.length > 1) return { action: 'conflict', taskIds: matches.map(function (task) { return task.id; }), reason: '发现多张同键在途任务，暂停新建并排查' };
      if (matches.length) return { action: 'link_existing', taskId: matches[0].id, originalLeadId: matches[0].leadId || '', reason: '关联同品牌、同手机号的在途任务，不重复创建外呼任务' };
      if (!config.taskDedup.cooldownEnabled) return canCreateTask
        ? { action: 'create_task', reason: '未命中在途任务，结束后间隔未启用，按预评分分配规则创建任务' }
        : { action: 'original', reason: missingConfigReason };
      var hours = config.taskDedup.cooldownHours;
      var now = nowMs == null ? Date.now() : Number(nowMs);
      if (!Number.isFinite(now)) return { action: 'invalid', reason: '当前时间无效，无法判断再次外呼间隔' };
      var completedStatuses = ['COMPLETED', 'COMPLETED_WITH_RESULT', 'SUCCESS', 'FINISHED', '已完成', '外呼完成'];
      var completed = (Array.isArray(tasks) ? tasks : []).filter(function (task) {
        if (!task || task.brandCode !== brandCode || !completedStatuses.includes(task.status)) return false;
        var rawResult = task.result || task.outboundResult || (task.resultState && typeof task.resultState === 'object' ? task.resultState : null);
        var hasUsableResult = task.resultState === 'usable' || task.resultState === 'terminal_result' || task.hasUsableResult === true ||
          (rawResult && classifyOutboundResult(rawResult.kind === 'completed' ? Object.assign({ terminal: true }, rawResult) : rawResult).kind === 'completed');
        if (!hasUsableResult) return false;
        return String(task.phone || '').replace(/\D/g, '').replace(/^86(?=1\d{10}$)/, '') === phone;
      }).map(function (task) {
        var endedAt = task.finishedAtMs == null ? Date.parse(task.finishedAt || '') : Number(task.finishedAtMs);
        return { task: task, endedAt: endedAt };
      });
      if (!completed.length) return canCreateTask
        ? { action: 'create_task', reason: '未命中已完成且有可用结果的同客户任务，按预评分分配规则创建任务' }
        : { action: 'original', reason: missingConfigReason };
      if (!Number.isInteger(hours) || hours < 1 || hours > 8760) {
        return { action: 'manual_review', leadAction: 'manual', status: '待人工处理', priorTaskIds: completed.map(function (item) { return item.task.id || ''; }),
          reason: '已结束任务间隔配置无效，无法确定是否复用结果；暂停外呼与下发，转人工核查' };
      }
      if (completed.some(function (item) { return !Number.isFinite(item.endedAt) || item.endedAt > now; })) {
        return { action: 'manual_review', leadAction: 'manual', status: '待人工处理', priorTaskIds: completed.map(function (item) { return item.task.id || ''; }),
          reason: '历史任务结束时间异常，无法确定冷却期；暂停外呼与下发，转人工核查' };
      }
      completed.sort(function (a, b) { return b.endedAt - a.endedAt; });
      var latest = completed[0];
      var cooldownUntil = latest.endedAt + hours * 3600000;
      if (now >= cooldownUntil) return canCreateTask
        ? { action: 'create_task', priorTaskId: latest.task.id || '', reason: '已超过最近一次可用外呼结果的任务结束间隔，按预评分分配规则创建新任务' }
        : { action: 'original', priorTaskId: latest.task.id || '', reason: missingConfigReason };
      var rawResult = latest.task.result || latest.task.outboundResult ||
        (latest.task.resultState && typeof latest.task.resultState === 'object' ? latest.task.resultState : null);
      var resultSnapshot = rawResult && classifyOutboundResult(Object.assign({}, rawResult.kind === 'completed' ? Object.assign({ terminal: true }, rawResult) : rawResult,
        { taskRouteSnapshot: latest.task.routeSnapshot || rawResult.taskRouteSnapshot }));
      var ruleSnapshot = config.resultRouting ? JSON.parse(JSON.stringify(config.resultRouting)) : null;
      var mappingSnapshot = config.dispatchMapping ? JSON.parse(JSON.stringify(config.dispatchMapping)) : null;
      var leadDecision = resultSnapshot && resultSnapshot.kind === 'completed'
        ? prepareResultDispatch(ruleSnapshot, mappingSnapshot, resultSnapshot)
        : { action: 'manual', status: '待人工处理', queue: 'leads', reason: '最近一次任务缺少可核验的外呼结果明细' };
      if (!resultActions.includes(leadDecision.action)) leadDecision = {
        action: 'manual', status: '待人工处理', queue: 'leads', reason: '当前结果规则不可用，无法对复用结果作出可靠判定'
      };
      return { action: 'reuse_completed_result', leadAction: leadDecision.action, leadDecision: leadDecision,
        shouldCreateTask: false, shouldWait: false, priorTaskId: latest.task.id || '', priorTaskFinishedAtMs: latest.endedAt,
        cooldownHours: hours, cooldownUntil: cooldownUntil, decidedAtMs: now,
        resultSnapshot: resultSnapshot && resultSnapshot.kind === 'completed' ? resultSnapshot : null,
        resultRuleSnapshot: ruleSnapshot, dispatchMappingSnapshot: mappingSnapshot,
        reason: '冷却期内不重复外呼；复用最近一次任务结果，按本线索接收时的结果规则重新判定' };
    },
    // 首条线索的等待期限从 AI 任务创建成功时计；结果接收时间用于判断回调是否赶在截止前。
    // 生产环境按线索 ID 原子抢占一次下发/人工处理决定，并保留创建任务时的品牌配置快照。
    evaluateOriginalLeadWait: function (policySnapshot, taskCreatedAtMs, nowMs, resultState, alreadyResolved, resultReceivedAtMs, resultRuleSnapshot) {
      if (alreadyResolved) return { action: 'none', reason: '已下发或转人工处理；迟到外呼结果仅记录，不重复下发' };
      if (!policySnapshot || !Number.isInteger(policySnapshot.minutes) || policySnapshot.minutes < 1 || policySnapshot.minutes > 1440 || !['normal', 'manual'].includes(policySnapshot.timeoutAction)) {
        return { action: 'manual', status: '待人工处理', queue: 'leads', reason: '首条线索等待规则快照无效，转人工核查' };
      }
      var createdAt = Number(taskCreatedAtMs);
      var now = Number(nowMs);
      if (!Number.isFinite(createdAt) || !Number.isFinite(now) || now < createdAt) return { action: 'manual', status: '待人工处理', queue: 'leads', reason: '任务创建时间或当前时间无效，转人工核查' };
      var deadline = createdAt + policySnapshot.minutes * 60000;
      var result = classifyOutboundResult(resultState);
      if (result.kind === 'completed') {
        var hasResultTime = resultReceivedAtMs !== undefined && resultReceivedAtMs !== null;
        var resultAt = hasResultTime ? Number(resultReceivedAtMs) : now;
        if (!Number.isFinite(resultAt) || resultAt < createdAt || resultAt > now) return { action: 'manual', status: '待人工处理', queue: 'leads', reason: '外呼结果接收时间无效，转人工核查' };
        if (resultAt <= deadline) {
          var originalRules = resultRuleSnapshot !== undefined ? resultRuleSnapshot : policySnapshot.resultRouting;
          if (originalRules) return Object.assign({ deadline: deadline }, prepareResultDispatch(originalRules, policySnapshot.dispatchMapping, result));
          return { action: 'route_by_result_rule', deadline: deadline, result: result,
            reason: '期限内收到任务结束回传，进入品牌外呼结果映射' };
        }
      }
      if (result.kind !== 'failed' && now < deadline) return { action: 'wait', deadline: deadline, reason: '等待首条线索的 AI 外呼任务结束回传' };
      return policySnapshot.timeoutAction === 'normal'
        ? { action: 'dispatch_without_result', deadline: deadline, reason: '任务明确失败或到期未收到有效结束回传，按现有规则下发且不附外呼标签与小结' }
        : { action: 'manual', status: '待人工处理', queue: 'leads', deadline: deadline,
          reason: '任务明确失败或到期未收到有效结束回传，暂停自动下发并进入线索列表待人工处理' };
    },
    // 原型只计算处理决定；实际关联、定时触发及厂商下发幂等需由服务端按线索 ID 落地。
    evaluateLinkedLeadWait: function (policySnapshot, acceptedAtMs, nowMs, resultState, alreadyResolved, resultReceivedAtMs, resultRuleSnapshot, dispatchMappingSnapshot) {
      if (alreadyResolved) return { action: 'none', reason: '已执行下发或人工兜底；迟到外呼结果仅记录，不重复处理' };
      if (!policySnapshot || !Number.isInteger(policySnapshot.minutes) || policySnapshot.minutes < 1 || policySnapshot.minutes > 1440 || !['normal', 'manual'].includes(policySnapshot.timeoutAction)) {
        return { action: 'original', reason: '接收时未取得有效等待规则快照，沿用原流程' };
      }
      var acceptedAt = Number(acceptedAtMs);
      var now = Number(nowMs);
      if (!Number.isFinite(acceptedAt) || !Number.isFinite(now) || now < acceptedAt) return { action: 'invalid', reason: '接收时间或当前时间无效' };
      var deadline = acceptedAt + policySnapshot.minutes * 60000;
      var result = classifyOutboundResult(resultState);
      if (result.kind === 'completed') {
        var hasResultTime = resultReceivedAtMs !== undefined && resultReceivedAtMs !== null;
        var resultAt = hasResultTime ? Number(resultReceivedAtMs) : now;
        if (!Number.isFinite(resultAt) || resultAt < acceptedAt || resultAt > now) return { action: 'invalid', reason: '关联任务结果接收时间无效' };
        if (resultAt <= deadline) {
          // 关联线索沿用原任务创建时的规则和下发字段快照，不能改读当前品牌配置。
          if (resultRuleSnapshot !== undefined && dispatchMappingSnapshot !== undefined) {
            return Object.assign({ deadline: deadline }, prepareResultDispatch(resultRuleSnapshot, dispatchMappingSnapshot, result));
          }
          return { action: 'route_by_result_rule', deadline: deadline, result: result,
            reason: '期限内收到原任务结束回传，进入品牌外呼结果映射' };
        }
      }
      if (result.kind !== 'failed' && now < deadline) return { action: 'wait', deadline: deadline, reason: '等待关联外呼任务结束回传' };
      return policySnapshot.timeoutAction === 'normal'
        ? { action: 'dispatch_without_result', deadline: deadline, reason: '任务明确失败或到期未收到有效结束回传，按现有规则下发且不附外呼标签与小结' }
        : { action: 'manual', status: '待人工处理', queue: 'leads', deadline: deadline,
          reason: '任务明确失败或到期未收到有效结束回传，暂停自动下发并进入线索列表待人工处理' };
    }
  });

  window.refreshOutboundBrandConfig = function () {
    renderBrandSelector();
    renderRules();
    renderTaskDedup();
    renderOriginalLeadWait();
    renderLinkedLeadWait();
    renderResultRules();
  };

  window.refreshSystemDictionaryBrandChoices = function () {
    renderDictionaryBrandChoices();
    window.renderOutboundChannelDictionary();
  };

  function initializeNissanDictionaryData() {
    try {
      if (localStorage.getItem(nissanDictionarySeedKey) === '1') return;
      var dictionary = readDictionary();
      var systems = normalizeItems(dictionary.items[outboundSystemTypeCode]);
      var outboundTypes = normalizeItems(dictionary.items[channelTypeCode]);
      if (!systems.some(function (item) { return item.code === 'DFN_AI_OUTBOUND'; })) {
        systems.push({ code: 'DFN_AI_OUTBOUND', name: '东风日产 AI 外呼平台', description: '东风日产试点使用的外呼系统', brands: [], outboundSystemCode: '', seriesRelated: false, scenarioId: '', defaultScenarioId: '', seriesScenarioMappings: [], sort: 10, enabled: true });
      }
      if (!outboundTypes.some(function (item) { return item.code === 'DFN_AI_STANDARD'; })) {
        outboundTypes.push({ code: 'DFN_AI_STANDARD', name: '日产 AI 外呼 · 标准线路', description: '统一使用外呼场景 ID', brands: [nissanBrandCode], outboundSystemCode: 'DFN_AI_OUTBOUND', seriesRelated: false, scenarioId: 'DFN_AI_STANDARD_001', defaultScenarioId: '', seriesScenarioMappings: [], sort: 10, enabled: true });
      }
      if (!outboundTypes.some(function (item) { return item.code === 'DFN_AI_BY_SERIES'; })) {
        var mappings = managedSeriesForBrands([nissanBrandCode]).map(function (series) {
          return { seriesCode: series.code, scenarioId: 'DFN_AI_' + series.code.replace(/^DFN_/, '') + '_001' };
        });
        if (mappings.length) outboundTypes.push({ code: 'DFN_AI_BY_SERIES', name: '日产 AI 外呼 · 车系线路', description: '按意向车系匹配外呼场景 ID', brands: [nissanBrandCode], outboundSystemCode: 'DFN_AI_OUTBOUND', seriesRelated: true, scenarioId: '', defaultScenarioId: 'DFN_AI_DEFAULT_001', seriesScenarioMappings: mappings, sort: 20, enabled: true });
      }
      dictionary.items[outboundSystemTypeCode] = systems;
      dictionary.items[channelTypeCode] = outboundTypes;
      localStorage.setItem(dictionaryStorageKey, JSON.stringify(dictionary));
      localStorage.setItem(nissanDictionarySeedKey, '1');
    } catch (error) {
      // 存储不可用时仍允许查看页面；保存动作会提示具体错误。
    }
  }

  function initializeNissanOutboundFlowData() {
    try {
      if (localStorage.getItem(nissanFlowSeedKey) === '1') return;
      var configs = readBrandConfigs();
      var original = configs[nissanBrandCode] && typeof configs[nissanBrandCode] === 'object' ? configs[nissanBrandCode] : {};
      var entry = Object.assign({}, original);
      var available = readChannels().filter(function (item) { return item.enabled && item.brands.includes(nissanBrandCode); });
      var standard = available.find(function (item) { return item.code === 'DFN_AI_STANDARD'; }) || available[0];
      var bySeries = available.find(function (item) { return item.code === 'DFN_AI_BY_SERIES'; }) || standard;
      if (!standard) return;
      var savedRoutes = readRoutes(nissanBrandCode);
      var routesUsable = !!savedRoutes && savedRoutes.rules.every(function (rule) {
        return available.some(function (item) { return item.code === rule.channel; });
      }) && available.some(function (item) { return item.code === savedRoutes.fallbackChannel; });
      if (!routesUsable) {
        entry.routes = { rules: [
          { start: 0, end: 11, endInclusive: false, target: 'ai', channel: standard.code },
          { start: 11, end: 100, endInclusive: true, target: 'ai', channel: bySeries.code }
        ], fallback: 'ai', fallbackChannel: standard.code };
      }
      if (!entry.scope || typeof entry.scope.enabled !== 'boolean') entry.scope = { enabled: true };
      if (!entry.taskDedup || entry.taskDedup.enabled !== true || entry.taskDedup.cooldownEnabled !== true ||
          !Number.isInteger(entry.taskDedup.cooldownHours) || entry.taskDedup.cooldownHours < 1 || entry.taskDedup.cooldownHours > 8760) {
        entry.taskDedup = { enabled: true, cooldownEnabled: true, cooldownHours: 168 };
      }
      if (!readOriginalLeadWait(nissanBrandCode)) entry.originalLeadWait = { minutes: 30, timeoutAction: 'manual' };
      if (!readLinkedLeadWait(nissanBrandCode)) entry.linkedLeadWait = { minutes: 15, timeoutAction: 'manual' };
      if (!readResultRules(nissanBrandCode)) entry.resultRouting = { id: 'RRSET-DFN-DEMO', version: 1, savedAt: '2026-10-20T09:00:00+08:00', rules: [
        { id: 'RR-DFN-001', callStatus: 'CONNECTED', tagMode: 'tag', tagCode: 'PURCHASE_INTENT', action: 'dispatch' },
        { id: 'RR-DFN-002', callStatus: 'ANY', tagMode: 'tag', tagCode: 'NO_INTENT', action: 'receive_only' },
        { id: 'RR-DFN-003', callStatus: 'CONNECTED', tagMode: 'no_tag', tagCode: '', action: 'manual' },
        { id: 'RR-DFN-004', callStatus: 'ANY', tagMode: 'unmapped_tag', tagCode: '', action: 'manual' }
      ], fallbackAction: 'manual' };
      localStorage.setItem(nissanFlowSeedKey + '_previous', JSON.stringify(original));
      configs[nissanBrandCode] = entry;
      localStorage.setItem(brandConfigStorageKey, JSON.stringify(configs));
      localStorage.setItem(nissanFlowSeedKey, '1');
    } catch (error) {
      // 浏览器存储不可用时保留原有配置，不阻断页面浏览。
    }
  }

  function initializeOutboundConfig() {
    renderBrandSelector();
    renderDictionaryBrandChoices();
    initializeNissanDictionaryData();
    initializeNissanOutboundFlowData();
    renderRules();
    renderTaskDedup();
    renderOriginalLeadWait();
    renderLinkedLeadWait();
    renderResultRules();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOutboundConfig);
  } else {
    initializeOutboundConfig();
  }
})();

// 线索详情处理进度。此处是原型数据；正式实现由服务端返回按线索 ID 追加的事件与当时的规则快照。
(function () {
  function event(time, stage, state, summary, data, rule, action, result, reference, record) {
    return { time: time, stage: stage, state: state, summary: summary, data: data, rule: rule, action: action, result: result,
      reference: reference || '未记录', record: record || null };
  }

  var traces = {
    blacklist: {
      status: '仅接收',
      reason: '手机号命中黑名单；接收记录已保存，停止后续检测、外呼与厂商下发。',
      next: '查看黑名单记录及其维护人；如需纠正，按权限处理黑名单后重新提交线索。',
      events: [
        event('2026-05-14 10:12:08', '接收', 'success', '来源线索接收并保存', '来源线索 ID：DCC_20260514_004；品牌：东风日产；手机号：136****0000', '接收字段校验通过；保留接收记录', '写入接收记录', '已接收', 'DCC_20260514_004'),
        event('2026-05-14 10:12:09', '手机号命中黑名单', 'blocked', '因命中黑名单，本次停止后续检测、外呼和厂商下发。', '命中类型：手机号黑名单；命中手机号仅按权限查看', '命中手机号黑名单；黑名单项 ID 与版本未记录', '停止线索下发', '仅接收；未调用厂商接口', '黑名单命中记录'),
        event('—', '后续环节', 'skipped', '因黑名单拦截，后续检测、外呼和厂商下发均未执行。', '不适用', '黑名单校验已终止本次流程', '未执行（因黑名单拦截）', '号码检测、预评分、外呼及厂商下发均未执行', '不适用')
      ]
    },
    nissanLinkedManual: {
      status: '待人工处理',
      reason: '这条线索关联了已有外呼任务；独立等待 15 分钟后，仍未收到可用的外呼结果，因此暂停自动下发。',
      next: '前往“待人工处理”核查，再决定继续厂商下发或仅接收。',
      events: [
        event('2026-10-20 10:00:00', '接收与准入', 'success', '线索接收，准入通过', '来源线索 ID：DCD_NSN_20261020_003；品牌：东风日产；手机号：137****6688', '接收、黑名单及现有去重规则均未拦截', '保留独立线索 ID', '进入外呼任务判断', 'LD2026102000003'),
        event('2026-10-20 10:00:03', '与已有外呼任务关联', 'info', '同品牌、同手机号已有任务在进行；本次没有重复外呼。', '原任务状态：在途；原任务 ID：CALL-DFN-20261020-001', '外呼任务去重已开启；品牌＋完整手机号命中在途任务', '关联原任务，不创建第二个 AI 任务', '本线索独立等待原任务结果', '原任务：CALL-DFN-20261020-001；原线索：LD2026102000000'),
        event('2026-10-20 10:00:03', '开始等待原任务结果', 'info', '这条线索从关联时起独立等待 15 分钟。', '等待期限：15 分钟；截止：2026-10-20 10:15:03', '关联线索等待规则：15 分钟；无有效回传时转人工处理；规则 ID 与版本未记录', '启动本线索等待计时', '原任务通话不受影响', '本线索等待规则快照'),
        event('2026-10-20 10:15:03', '等待外呼结果超时', 'manual', '等待 15 分钟仍未收到有效结果；已暂停自动下发，转人工核查。', '未收到可用于规则判定的任务最终结束回传；通话状态、标签和小结无可信快照', '命中本线索保存的超时兜底规则', '暂停自动下发，生成待人工处理事项', '厂商接口尚未调用；迟到结果只记追溯日志', 'CALL-DFN-20261020-001')
      ]
    },
    nissanCooldown: {
      status: '仅接收',
      reason: '近期已有可用的外呼结果；本次没有重复外呼，并按这条新线索的规则决定处理方式。',
      next: '已完成处理。可展开查看来源任务、复用数据与本次命中的结果规则。',
      events: [
        event('2026-10-20 11:10:00', '接收与准入', 'success', '线索接收，准入通过', '来源线索 ID：DCD_NSN_20261020_004；品牌：东风日产；手机号：136****7788', '接收、黑名单及现有去重规则均未拦截', '保留新线索独立 ID', '进入外呼任务去重判断', 'LD2026102000004', { eventId: 'EVT-LD2026102000004-001', sequence: 1, recordedAt: '2026-10-20 11:10:00' }),
        event('2026-10-20 11:10:02', '近期已有外呼结果', 'info', '距上次有效外呼结果 65 分钟；本次不再重复外呼。', '任务结束时间：2026-10-20 10:05:00；本次接收距结束 65 分钟', '外呼任务去重与冷却期已开启；同品牌＋完整手机号；间隔 168 小时', '关联来源任务，不等待、不新建任务', '进入本线索结果判定', 'CALL-DFN-20261020-004', { eventId: 'EVT-LD2026102000004-002', sequence: 2, recordedAt: '2026-10-20 11:10:02' }),
        event('2026-10-20 11:10:02', '复用外呼结果', 'info', '等待读取来源任务的结果快照', '结果快照未读取', '须关联来源任务的有效结果', '待核查，未提交新动作', '暂不判定', '未生成'),
        event('2026-10-20 11:10:03', '结果规则判定', 'pending', '等待按本线索规则快照判定', '规则快照未读取', '须保存接收时生效的规则', '待核查，未提交新动作', '暂不判定', '未生成')
      ]
    },
    dispatched: {
      status: '下发回执待核查',
      reason: '已保存“已下发”摘要，但厂商请求 ID、响应码和回执未记录。',
      next: '核查厂商下发请求与回执，确认接口调用结果。',
      events: [
        event('2026-05-14 08:45:20', '接收与准入', 'success', '线索接收，黑名单与去重校验通过', '来源线索 ID：YC_20260514_003；品牌：理想汽车', '接收时的字段与准入规则均通过；历史规则版本号未保存', '保存线索并进入号码检测', '准入通过', 'LD2026051400003'),
        event('2026-05-14 08:45:21', '号码状态检测', 'info', '取得停机状态', '检测返回：SHUTDOWN（停机）', '品牌号码状态规则：SHUTDOWN → 标记后继续；历史版本号未保存', '保留状态并映射 phone_status=shutdown', '允许继续厂商下发', '号码检测结果'),
        event('2026-05-14 08:45:23', '厂商下发摘要', 'info', '已保存下发摘要，接口回执未记录', '报文摘要包含 phone_status=shutdown；请求 ID、响应码和外部返回 ID 未记录', '按接收时生效的品牌字段映射组装；历史映射版本号未保存', '已保存下发动作摘要', '已下发摘要；不能核验厂商接口成功回执', '厂商下发记录未记录')
      ]
    },
    failed: {
      status: '下发失败',
      reason: '线索通过准入，但厂商接口调用失败；当前未取得下发成功回执。',
      next: '核查失败响应与重试记录；符合条件时在线索列表执行重新下发。',
      events: [
        event('2026-05-13 16:20:03', '接收与准入', 'success', '线索接收，黑名单与去重校验通过', '来源线索 ID：DCC_20260513_128；品牌：理想汽车', '接收时的字段与准入规则均通过；历史规则版本号未保存', '保存线索，准备厂商下发', '准入通过', 'LD2026051300128'),
        event('2026-05-13 16:20:04', '下发准备', 'info', '选择品牌下发接口并组装报文', '意向门店：深圳理想南山店；具体报文与请求 ID 未记录', '品牌下发接口与字段映射；历史版本号未保存', '进入厂商下发队列', '等待接口响应', '品牌下发记录'),
        event('2026-05-13 16:20:10', '厂商下发', 'error', '接口调用失败', '历史示例未保存具体错误码和响应体', '接口成功判定未通过；具体重试策略需读取当时的下发配置', '记录失败并停止本次下发', '下发失败；尚无成功回执', '厂商下发记录'),
        event('—', '后续处理', 'pending', '按重试策略处理，必要时由人工重新下发', '原始请求与具体失败原因未记录', '重新下发须校验当前状态和重复提交', '等待重试或人工处理', '尚未形成新的成功回执', 'LD2026051300128')
      ]
    }
  };

  function legacyTrace(data) {
    var decision = String(data.dispatchDecision || '—').replace(/<[^>]*>/g, '');
    return {
      status: data.preScore && data.outboundConfigSnapshot ? '下发回执待核查' : String(data.statusHtml || '状态未记录').replace(/<[^>]*>/g, ''),
      reason: data.preScore && !data.outboundConfigSnapshot ? '已保存预评分与下发摘要；外呼路径和厂商回执未记录。' : data.note || '此线索没有完整的结构化处理进度。',
      next: data.preScore && data.outboundConfigSnapshot ? '核查厂商下发请求与回执，确认下发结果。' : plain(data.dispatchDecision) === '待下发' ? '等待下发队列执行；完成后查看厂商接口回执。' : plain(data.dispatchDecision) === '下发中' ? '等待厂商接口响应；失败时查看具体原因并按重试策略处理。' : '查看各环节的保存结果与处理原因；缺少依据的记录需进一步核查。',
      events: [
        event('时间未记录', '处理摘要', 'info', '当前仅有接收与处理摘要，暂无完整处理进度',
          '接收时间：' + (data.receiveTime || '未记录') + '；来源线索 ID：' + (data.sourceId || '未记录') + '；接收结果：' + (data.receiveResult || '未记录'),
          '逐环节命中条件、规则 ID 与版本未记录',
          '校验摘要：' + (data.checkLog || '未记录') + '；处理摘要：' + (data.decisionLog || '未记录'),
          '当前状态：' + decision + '；接口请求与回执未记录', data.code)
      ]
    };
  }

  function node(tag, className, value) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = String(value);
    return element;
  }

  function appendField(parent, label, value) {
    var row = node('div', 'lead-trace-field');
    row.appendChild(node('dt', '', label));
    row.appendChild(node('dd', '', value == null || value === '' ? '未记录' : value));
    parent.appendChild(row);
  }

  function applyCooldownSnapshot(trace, events, data) {
    var snapshot = data && data.resultDecisionSnapshot;
    var ruleSet = snapshot && snapshot.ruleSet;
    var result = snapshot && snapshot.result;
    var decision = snapshot && snapshot.decision;
    if (!snapshot || !snapshot.snapshotId || !ruleSet || !ruleSet.id || !ruleSet.version || !result || !decision ||
        !decision.id || !decision.action || !decision.reasonCode || decision.ruleSetId !== ruleSet.id || decision.ruleSetVersion !== ruleSet.version) {
      events[2] = event('—', '复用外呼结果', 'pending', '缺少可核验的结果快照', '来源任务、通话状态、标签与小结未完整记录', '缺少本线索接收时保存的结果或规则快照', '未记录已执行的新动作', '无法核验本次自动判断', data.code);
      events[3] = event('—', '结果规则判定', 'pending', '已保存的处理决定无法核验', '规则集、命中规则或决定记录缺失', '不得使用当前配置重新判定历史线索', '未记录已执行的新动作', '尚不能确认本次自动处理依据', data.code);
      return { status: '处理依据待核查', reason: '这条线索的冷却期结果或接收时规则记录不完整，现有轨迹不足以解释已保存的处理决定。', next: '核查来源任务和本线索的历史记录；核查前不据此重做下发。' };
    }
    var matched = Array.isArray(ruleSet.rules) && decision.matchedRuleId
      ? ruleSet.rules.find(function (rule) { return rule.id === decision.matchedRuleId; }) : null;
    var actionNames = { dispatch: '继续厂商下发', manual: '暂停转人工处理', receive_only: '仅接收不下发' };
    var actionName = actionNames[decision.action];
    if (!actionName || result.terminal !== true || (decision.matchedRuleId && (!matched || matched.action !== decision.action)) ||
        (!decision.matchedRuleId && ruleSet.fallbackAction !== decision.action)) {
      events[3] = event('—', '结果规则判定', 'pending', '已保存的处理决定无法核验', '决定 ID：' + decision.id + '；快照 ID：' + snapshot.snapshotId, '规则集：' + ruleSet.id + ' / v' + ruleSet.version, '未记录已执行的新动作', '已保存的决定与规则记录不一致，不能据此自动下发', data.code);
      return { status: '处理依据待核查', reason: '这条线索的处理决定与历史规则记录不一致，现有轨迹不足以解释该决定。', next: '核查本线索的结果和决定记录；核查前不据此重做下发。' };
    }
    var tags = Array.isArray(result.tags) && result.tags.length ? result.tags.join('、') : '无';
    var resultTime = snapshot.resultReadAt || snapshot.capturedAt || '—';
    var decidedAt = snapshot.decidedAt || snapshot.capturedAt || '—';
    events[2] = event(resultTime, '使用上次外呼结果', 'success', '读取最近一次任务的通话状态、标签和小结；本次没有重新外呼。',
      '来源任务：' + snapshot.sourceTaskId + '；结束时间：' + (snapshot.sourceTaskFinishedAt || '未记录') + '；通话状态：' + (result.callStatus || '未记录') + '；标签：' + tags + '；小结：' + (result.summary || '无'),
      '任务最终结束：' + (result.terminal ? '是' : '否') + '；结果快照：' + snapshot.snapshotId,
      '复用数据供本线索重新判定，不复制旧线索动作', '本线索不等待、不新建 AI 任务', snapshot.sourceTaskId, snapshot.resultEvent);
    var matchedText = matched
      ? '规则 ' + (matched.id || 'ID 未记录') + '（通话状态 ' + matched.callStatus + '；标签条件 ' + matched.tagMode + (matched.tagCode ? ' / ' + matched.tagCode : '') + '）'
      : '未命中规则，使用兜底动作 ' + ruleSet.fallbackAction;
    events[3] = event(decidedAt, '确定本线索处理方式', decision.action === 'receive_only' ? 'receive_only' : decision.action === 'manual' ? 'manual' : 'info',
      '根据这条新线索接收时的规则，决定“' + actionName + '”；未沿用旧线索的决定。',
      '判定输入：' + (result.callStatus || '未记录') + '；标签：' + tags + '；小结：' + (result.summary || '无') + '；接收时快照：' + snapshot.snapshotId + '（' + (snapshot.capturedAt || '时间未记录') + '）',
      '规则集 ' + ruleSet.id + ' / v' + ruleSet.version + '（保存于 ' + (ruleSet.savedAt || '时间未记录') + '）；命中 ' + matchedText,
      '本线索独立提交动作：' + actionName + '；原因码：' + decision.reasonCode,
      decision.action === 'receive_only' ? '仅接收；本次未创建 AI 任务、未调用厂商接口' : decision.action === 'manual' ? '进入待人工处理，暂停自动下发' : '进入下发准备；是否已调用接口须查看下发记录',
      '决定：' + decision.id + '；快照：' + snapshot.snapshotId, decision);
    return {
      status: decision.status || (decision.action === 'dispatch' ? '待下发' : actionName),
      reason: '近期已有可用外呼结果；本次没有重复外呼。系统按这条新线索接收时的规则，决定“' + actionName + '”。',
      next: decision.nextAction || (decision.action === 'manual' ? '在线索列表的“待人工处理”中核查。' : '查看下发记录确认后续结果。')
    };
  }

  window.renderLeadTrace = function (type, data) {
    data = data || {};
    var trace = traces[type] || legacyTrace(data);
    var events = trace.events.slice();
    var status = trace.status;
    var reason = trace.reason;
    var next = trace.next;
    if (type === 'nissanCooldown') {
      var cooldownView = applyCooldownSnapshot(trace, events, data);
      status = cooldownView.status;
      reason = cooldownView.reason;
      next = cooldownView.next;
    }
    if (type === 'nissanLinkedManual' && data.decisionActor) {
      var receivedOnly = String(data.dispatchDecision).indexOf('仅接收') !== -1;
      status = receivedOnly ? '仅接收' : '处理中';
      reason = data.dispatchDecision;
      next = receivedOnly ? '人工处理完成；不调用厂商接口。' : '等待厂商接口回执，成功后更新为已下发，失败后保留失败原因。';
      events.push(event(data.decisionTime || '—', '人工处理', receivedOnly ? 'receive_only' : 'info', data.dispatchDecision,
        '处理人：' + data.decisionActor + '；' + (data.note || ''), '人工复核接收、去重、准入及当前下发状态',
        receivedOnly ? '确认仅接收' : '提交厂商下发队列，不附无效外呼结果',
        receivedOnly ? '处理终结' : '等待厂商响应', data.code));
    }
    if (events.every(function (item) { return item.record && Number.isInteger(item.record.sequence); })) {
      events.sort(function (left, right) { return left.record.sequence - right.record.sequence; });
    }

    renderProgress(type, data, events, status, reason, next);
  };

  var stageNames = ['鉴权与接收字段校验', '来源线索 ID 检查', '黑名单', '接收去重规则', '号码状态检测', '外呼处理', '厂商下发'];
  var stateNames = { passed: '已通过', skipped: '已跳过', processing: '处理中', stopped: '已停止', not_run: '未执行', unrecorded: '未记录' };

  function plain(value) { return String(value || '').replace(/<[^>]*>/g, ''); }

  // 未识别事件和跨环节汇总只进入独立历史区，不默认归入外呼。
  function eventStageIndex(item) {
    var groups = [
      ['接收'], [], ['手机号命中黑名单'], [], ['号码状态检测'],
      ['与已有外呼任务关联', '开始等待原任务结果', '等待外呼结果超时', '近期已有外呼结果', '复用外呼结果', '结果规则判定', '使用上次外呼结果', '确定本线索处理方式', '人工处理'],
      ['下发准备', '厂商下发', '厂商下发摘要', '后续处理']
    ];
    return groups.findIndex(function (names) { return names.indexOf(item.stage) !== -1; });
  }

  // 只使用已保存的逐项结果或对应事件；汇总“准入通过”不拆成多个通过记录。
  function progressStages(type, data, events, status) {
    var stages = stageNames.map(function (name) {
      return { name: name, state: 'unrecorded', reason: '该环节的判断结果未记录。', events: [], evidence: '' };
    });
    var admission = events.filter(function (item) { return item.stage === '接收'; });
    stages[0].events = admission;
    stages[0].reason = '已保存接收记录；鉴权与字段校验的逐项结果未记录。';
    stages[1].reason = '是否重复提交同一来源线索的检查结果未记录。';
    stages[1].evidence = '来源渠道：' + plain(data.apiKey || '未记录') + '；来源线索 ID：' + plain(data.sourceId || '未记录') + '；本次是否命中原接收记录：未记录。';
    [['blacklistCheck', 2], ['interceptCheck', 3]].forEach(function (entry) {
      var value = plain(data[entry[0]]);
      if (value === '未命中') {
        stages[entry[1]].state = 'passed';
        stages[entry[1]].reason = '未命中，继续后续处理。';
        stages[entry[1]].evidence = '已保存的校验结果：未命中；逐项发生时间、规则版本未记录。';
      }
    });
    var phoneConfig = data.phoneStatusConfigSnapshot;
    var hasPhoneConfig = phoneConfig && typeof phoneConfig.enabled === 'boolean';
    var phone = plain(data.phoneStatusResult);
    var hasPhoneResult = phone && phone !== '—';
    stages[4].reason = '缺少当时的号码检测配置快照和执行记录，无法确认是否开启或检测过。';
    stages[4].evidence = '当时的号码检测开关：未记录；配置快照：未记录；执行记录：未记录。不能据此认定当时未开启检测。';
    if (hasPhoneConfig) {
      stages[4].evidence = '当时的号码检测开关：' + (phoneConfig.enabled ? '开启' : '关闭') +
        '；快照编号：' + plain(phoneConfig.snapshotId || '未记录') + '；快照时间：' + plain(phoneConfig.capturedAt || '未记录') + '。';
      stages[4].reason = phoneConfig.enabled ? '当时已开启号码检测，但执行记录与结果未记录，无法确认是否完成检测。' : '当时未开启号码状态检测，已跳过本环节。';
      if (!phoneConfig.enabled) stages[4].state = 'skipped';
    }
    if (hasPhoneResult) {
      stages[4].state = 'passed';
      stages[4].reason = phone + '；' + plain(data.phoneStatusAction);
      stages[4].evidence = (hasPhoneConfig ? stages[4].evidence : '当时的号码检测开关快照未记录。') +
        '已保存的号码检测结果：' + phone + '；处理动作：' + plain(data.phoneStatusAction) + '。';
      if (hasPhoneConfig && !phoneConfig.enabled) {
        stages[4].state = 'unrecorded';
        stages[4].reason = '当时开关为关闭，但保存了检测结果；记录不一致，需要核查。';
      }
    }
    events.forEach(function (item) {
      var index = eventStageIndex(item);
      if (index > 0) stages[index].events.push(item);
    });
    var outboundConfig = data.outboundConfigSnapshot;
    if (outboundConfig && typeof outboundConfig.enabled === 'boolean') {
      stages[5].evidence = '当时的 AI 外呼开关：' + (outboundConfig.enabled ? '开启' : '关闭') +
        '；快照编号：' + plain(outboundConfig.snapshotId || '未记录') + '；快照时间：' + plain(outboundConfig.capturedAt || '未记录') + '。';
      if (!outboundConfig.enabled && !stages[5].events.length) {
        stages[5].state = 'skipped';
        stages[5].reason = '已判断当时的外呼配置：AI 外呼关闭，沿用原线索下发流程；未创建外呼任务。';
      } else if (!outboundConfig.enabled) {
        stages[5].reason = '开关快照为关闭，但存在外呼处理记录，需要核查记录一致性。';
      } else if (!stages[5].events.length) {
        stages[5].reason = '当时已开启 AI 外呼，但后续分配与执行记录未记录。';
      }
    }
    var current = -1;
    if (type === 'blacklist') {
      current = 2;
      stages[2].state = 'stopped';
      stages[2].reason = '手机号命中黑名单；保留接收记录，停止后续处理。';
    } else if (type === 'phoneStatusBlocked') {
      current = 4;
      stages[4].state = 'stopped';
    } else if (type === 'nissanLinkedManual') {
      current = 5;
      stages[5].state = 'stopped';
      stages[5].reason = '关联已有外呼任务 → 独立等待 15 分钟 → 超时转人工；本次未重复外呼。';
      if (data.decisionActor) {
        if (plain(data.dispatchDecision).indexOf('仅接收') !== -1) stages[5].reason = '人工已决定仅接收，不再继续厂商下发。';
        else {
          stages[5].state = 'passed';
          stages[5].reason = '外呼等待超时后，人工已决定继续厂商下发。';
          current = 6;
          stages[6].state = 'processing';
          stages[6].reason = '人工已提交下发队列，等待厂商接口回执。';
          stages[6].evidence = '处理人：' + data.decisionActor + '；处理时间：' + (data.decisionTime || '未记录') + '；决定：' + plain(data.dispatchDecision);
        }
      }
    } else if (type === 'nissanCooldown') {
      current = 5;
      stages[5].state = status === '处理依据待核查' ? 'unrecorded' : 'stopped';
      stages[5].reason = status === '处理依据待核查' ? '复用结果或规则记录不完整，需要核查处理依据。' : '冷却期内复用上次结果 → 按本线索规则判定 → ' + status + '。';
      if (status === '待下发') {
        stages[5].state = 'passed';
        current = 6;
        stages[6].state = 'processing';
        stages[6].reason = '已决定继续下发，等待下发记录。';
      }
    } else if (type === 'failed') {
      current = 6;
      stages[6].state = 'stopped';
      stages[6].reason = '厂商接口调用失败；具体错误码未记录，需核查失败记录。';
    } else if (type === 'normal' || type === 'processing') {
      current = 6;
      stages[6].state = 'processing';
      stages[6].reason = type === 'normal' ? '已进入下发队列，等待执行。' : '已调用厂商接口，等待响应。';
      stages[6].evidence = plain(data.decisionLog);
    } else if (plain(data.statusHtml).indexOf('已下发') !== -1) {
      current = 6;
      stages[6].reason = '已保存“已下发”摘要；缺少接口回执，暂不能核验下发成功。';
      stages[6].evidence = plain(data.decisionLog);
    }
    if (current >= 0) stages[current].current = true;
    if (current >= 0 && stages[current].state === 'stopped' && status !== '处理依据待核查') {
      for (var i = current + 1; i < stages.length; i++) {
        stages[i].state = 'not_run';
        stages[i].reason = '在“' + stages[current].name + '”停止，未进入本环节。';
      }
    } else if (status === '处理依据待核查') {
      stages[6].reason = '前序处理依据待核查，不能确认后续执行情况。';
    }
    return stages;
  }

  function renderEvidence(parent, item) {
    var detail = node('details', 'lead-progress-evidence');
    var title = node('summary', '', item.stage);
    title.appendChild(node('span', 'lead-progress-evidence-time', item.time && item.time !== '—' ? item.time : '时间未记录'));
    detail.appendChild(title);
    var fields = node('dl', 'lead-trace-fields');
    appendField(fields, '取得数据', item.data);
    appendField(fields, '判断依据', item.rule);
    appendField(fields, '执行动作', item.action);
    appendField(fields, '执行结果', item.result);
    appendField(fields, '关联记录', item.reference);
    detail.appendChild(fields);
    parent.appendChild(detail);
  }

  function renderProgress(type, data, events, status, reason, next) {
    var stages = progressStages(type, data, events, status);
    var current = stages.find(function (stage) { return stage.current; });
    document.getElementById('leadTraceCurrentStatus').textContent = status;
    document.getElementById('leadTraceCurrentReason').textContent = reason;
    document.getElementById('leadTraceNextAction').textContent = next;
    document.getElementById('leadProgressLocation').textContent = current
      ? current.name + (current.state === 'stopped' ? ' · 已停止' : current.state === 'processing' ? ' · 处理中' : ' · ' + stateNames[current.state]) : '当前环节未记录';
    document.getElementById('leadTraceOverviewActions').hidden = !(type === 'nissanLinkedManual' && !data.decisionActor);
    document.getElementById('leadTraceEventCount').textContent = '7 个环节';
    var container = document.getElementById('leadTraceEvents');
    container.replaceChildren();
    stages.forEach(function (stage, index) {
      var row = node('details', 'lead-progress-stage is-' + stage.state + (stage.current ? ' is-current' : ''));
      var summary = node('summary', 'lead-progress-stage-summary');
      summary.appendChild(node('span', 'lead-progress-number', index + 1));
      var main = node('span', 'lead-progress-main');
      var headline = node('span', 'lead-progress-headline');
      headline.appendChild(node('strong', '', stage.name));
      headline.appendChild(node('span', 'lead-progress-state', stateNames[stage.state]));
      if (stage.current) headline.appendChild(node('span', 'lead-progress-current', '当前环节'));
      main.appendChild(headline);
      main.appendChild(node('span', 'lead-progress-reason', stage.reason));
      summary.appendChild(main);
      summary.appendChild(node('span', 'lead-progress-expand', '查看依据'));
      row.appendChild(summary);
      var body = node('div', 'lead-progress-body');
      if (stage.evidence) body.appendChild(node('p', 'lead-progress-saved', stage.evidence));
      if (!stage.events.length && !stage.evidence) body.appendChild(node('p', 'lead-progress-saved', stage.state === 'not_run' ? stage.reason : '该环节的详细依据未记录。'));
      stage.events.forEach(function (item) { renderEvidence(body, item); });
      row.appendChild(body);
      container.appendChild(row);
    });
  }
})();

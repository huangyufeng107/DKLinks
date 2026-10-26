// 东风日产原型流程体验：读取已保存的外呼规则，使用独立线索样例逐步展示处理路径。
(function () {
  var brandCode = 'DONGFENG_NISSAN';
  var visibleSteps = 0;
  var currentTrace = null;
  var scenarios = {
    first: { leadId: 'LD-DFN-101', customer: '陈先生', phone: '13800001111', seriesCode: 'DFN_SYLPHY', score: 82.5,
      result: { terminal: true, callStatus: 'CONNECTED', tags: ['PURCHASE_INTENT'], summary: '客户有购车计划，希望了解轩逸配置。' } },
    linked: { leadId: 'LD-DFN-102', customer: '陈先生', phone: '13800001111', seriesCode: 'DFN_SYLPHY', score: null,
      result: { terminal: true, callStatus: 'CONNECTED', tags: ['PURCHASE_INTENT'], summary: '客户有购车计划，希望了解轩逸配置。' } },
    cooldown: { leadId: 'LD-DFN-103', customer: '陈先生', phone: '13800001111', seriesCode: 'DFN_SYLPHY', score: null,
      result: { terminal: true, callStatus: 'CONNECTED', tags: ['PURCHASE_INTENT'], summary: '客户有购车计划，希望了解轩逸配置。' } },
    'no-score': { leadId: 'LD-DFN-104', customer: '李女士', phone: '13900002222', seriesCode: 'DFN_ALTIMA', score: null,
      result: { terminal: true, callStatus: 'CONNECTED', tags: [], summary: '客户表示稍后再联系。' } },
    'low-score': { leadId: 'LD-DFN-105', customer: '王先生', phone: '13700003333', seriesCode: 'DFN_SYLPHY', score: 8,
      result: { terminal: true, callStatus: 'CONNECTED', tags: ['NO_INTENT'], summary: '客户目前没有购车计划。' } },
    timeout: { leadId: 'LD-DFN-106', customer: '赵女士', phone: '13600004444', seriesCode: 'DFN_SYLPHY', score: 45, result: null }
  };
  var previewMapping = { brandCode: brandCode, mode: 'combined', fields: [
    { sourceKey: 'ai_outbound_remark', targetName: '流程体验展示内容', maxLength: 10000, lengthUnit: 'chars' }
  ] };

  function step(steps, title, detail) { steps.push({ title: title, detail: detail }); }
  function actionName(action) {
    return { dispatch: '继续厂商下发', manual: '暂停自动下发，转人工处理', receive_only: '仅接收不下发',
      dispatch_without_result: '按现有规则下发，不附外呼结果', original: '沿用原线索流程', wait: '等待中' }[action] || action || '待核查';
  }
  function resultText(result) {
    if (!result) return '未收到有效外呼结果';
    return '通话状态 ' + result.callStatus + '；标签 ' + (result.tags && result.tags.length ? result.tags.join('、') : '无') +
      '；小结 ' + (result.summary || '无');
  }
  function addOutcome(steps, decision, result, mappingConfirmed) {
    var action = decision && decision.action;
    step(steps, '结果规则判定', resultText(result) + '。当前规则决定：' + actionName(action) + '。' +
      (decision && decision.reason ? ' ' + decision.reason : ''));
    if (action === 'dispatch') {
      var content = decision.dispatchFields && Object.keys(decision.dispatchFields).map(function (key) {
        return decision.dispatchFields[key];
      }).join('；');
      step(steps, '厂商下发', '符合继续下发条件。拟写入内容：' + (content || '无外呼标签与小结') +
        '。' + (mappingConfirmed ? '按已确认的品牌映射组装报文。' : '东风日产接口目标字段和长度尚待确认，当前不生成正式报文，也不调用厂商接口。'));
    } else if (action === 'manual') {
      step(steps, '人工处理', '线索进入“待人工处理”，记录命中规则与原因；不自动调用厂商接口。');
    } else if (action === 'receive_only') {
      step(steps, '处理结束', '保留线索接收记录，不调用厂商接口。');
    } else if (action === 'dispatch_without_result') {
      step(steps, '厂商下发', '按现有接收与准入规则处理，不附外呼标签与小结；当前仅展示决策，不调用厂商接口。');
    } else {
      step(steps, '处理暂停', '当前配置无法完成可靠判定，请检查规则和字段映射。');
    }
  }

  function buildTrace(key, nowMs) {
    var sample = scenarios[key] || scenarios.first;
    var steps = [];
    var config = window.OutboundBrandConfig && window.OutboundBrandConfig.get(brandCode);
    var mappingConfirmed = !!(window.DispatchAiResultMapping && window.DispatchAiResultMapping.get(brandCode));
    var time = Number.isFinite(nowMs) ? nowMs : Date.now();
    var meta = sample.leadId + ' · ' + sample.customer + ' · ' + sample.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') +
      ' · 预评分：' + (key === 'linked' || key === 'cooldown' ? '本次不重新查询' : sample.score == null ? '未取得' : sample.score);
    step(steps, '接收与准入', '线索已接收，黑名单、接收去重及准入规则均通过；保留独立线索 ID ' + sample.leadId + '。');
    if (!config || !config.enabled) {
      step(steps, '品牌外呼开关', '东风日产外呼未开启，沿用原线索流程。');
      return { meta: meta, steps: steps, outcome: 'original' };
    }
    var tasks = [];
    if (key === 'linked') tasks.push({ id: 'CALL-DFN-101', brandCode: brandCode, phone: sample.phone,
      leadId: 'LD-DFN-101', status: 'CALLING' });
    if (key === 'cooldown') tasks.push({ id: 'CALL-DFN-101', brandCode: brandCode, phone: sample.phone,
      leadId: 'LD-DFN-101', status: 'COMPLETED',
      finishedAtMs: time - Math.min(30 * 60000, (config.taskDedup.cooldownHours || 1) * 1800000), result: sample.result });
    var previewConfig = Object.assign({}, config, {
      aiReady: !!(config.originalLeadWait && config.resultRouting),
      dispatchMapping: mappingConfirmed ? config.dispatchMapping : previewMapping
    });
    var dedup = window.OutboundBrandConfig.evaluateTaskDedup.call({ get: function () { return previewConfig; } },
      brandCode, { brandCode: brandCode, phone: sample.phone, id: sample.leadId }, tasks, true, time);
    step(steps, '外呼任务去重', dedup.reason + (dedup.taskId || dedup.priorTaskId ? ' 任务 ID：' + (dedup.taskId || dedup.priorTaskId) + '。' : ''));
    if (dedup.action === 'reuse_completed_result') {
      addOutcome(steps, dedup.leadDecision, dedup.resultSnapshot, mappingConfirmed);
      return { meta: meta, steps: steps, outcome: dedup.leadAction };
    }
    if (dedup.action === 'link_existing') {
      var linkedPolicy = config.linkedLeadWait;
      if (!linkedPolicy) {
        step(steps, '等待规则', '关联线索等待规则尚未保存，无法继续处理。');
        return { meta: meta, steps: steps, outcome: 'unconfigured' };
      }
      var waiting = window.OutboundBrandConfig.evaluateLinkedLeadWait(linkedPolicy, time, time + 3 * 60000,
        null, false, null, config.resultRouting, previewConfig.dispatchMapping);
      step(steps, '关联线索独立等待', '原任务仍在途；本线索从接收时起等待 ' + linkedPolicy.minutes +
        ' 分钟。当前状态：' + actionName(waiting.action) + (waiting.action === 'wait' ? '。' : '（' + waiting.reason + '）。'));
      var resultAt = time + Math.min(8, Math.max(1, linkedPolicy.minutes - 1)) * 60000;
      var linkedDecision = window.OutboundBrandConfig.evaluateLinkedLeadWait(linkedPolicy, time, resultAt,
        sample.result, false, resultAt, config.resultRouting, previewConfig.dispatchMapping);
      addOutcome(steps, linkedDecision, linkedDecision.result || sample.result, mappingConfirmed);
      return { meta: meta, steps: steps, outcome: linkedDecision.action };
    }
    if (dedup.action !== 'create_task') {
      step(steps, '本次去向', actionName(dedup.action) + '。' + (dedup.reason || ''));
      return { meta: meta, steps: steps, outcome: dedup.action };
    }
    var scoreDecision = window.OutboundBrandConfig.evaluate(brandCode, sample.score);
    // 正式字段未对接时，体验区仍可读取已保存的分配规则展示后续路径，不改变真实可执行状态。
    if (scoreDecision.target !== 'ai' && config.routes) {
      scoreDecision = window.evaluateOutboundScore(sample.score, config.routes.rules,
        config.routes.fallback, config.routes.fallbackChannel);
    }
    if (scoreDecision.target !== 'ai' || !scoreDecision.channel) {
      step(steps, '预评分与分配', '分配规则或线路不可用，不能创建新的 AI 外呼任务。');
      return { meta: meta, steps: steps, outcome: 'unconfigured' };
    }
    var channel = window.SystemDictionary && window.SystemDictionary.getOptions('OUTBOUND_TYPE').find(function (item) {
      return item.code === scoreDecision.channel;
    });
    var scene = window.SystemDictionary && window.SystemDictionary.resolveOutboundScene(
      scoreDecision.channel, sample.seriesCode, brandCode);
    step(steps, '预评分与线路分配', (sample.score == null ? '6 分钟内未取得有效预评分，使用无分兜底。' : '取得预评分 ' + sample.score + '。') +
      scoreDecision.reason + '，选择 ' + (channel ? channel.name : scoreDecision.channel) + '（' + scoreDecision.channel + '）' +
      (scene ? '，外呼场景 ID：' + scene.scenarioId + '（' + scene.source + '）' : '') + '。');
    var createdAt = time + (sample.score == null ? 6 * 60000 : 0);
    step(steps, '创建 AI 外呼任务', '为 ' + sample.leadId + ' 创建一张任务，记录线路、等待与结果规则快照；首条线索从任务创建成功时开始计时。');
    var policy = Object.assign({}, config.originalLeadWait || {}, {
      resultRouting: config.resultRouting, dispatchMapping: previewConfig.dispatchMapping
    });
    if (key === 'timeout') {
      var deadlinePassed = createdAt + (policy.minutes + 1) * 60000;
      var timeoutDecision = window.OutboundBrandConfig.evaluateOriginalLeadWait(policy, createdAt,
        deadlinePassed, null, false, null, config.resultRouting);
      step(steps, '等待 AI 外呼结果', '等待期限 ' + policy.minutes + ' 分钟已届满，仍无有效结束回传。');
      step(steps, '超时处理', actionName(timeoutDecision.action) + '。' + timeoutDecision.reason);
      if (timeoutDecision.action === 'manual') step(steps, '人工处理', '线索进入“待人工处理”，不自动调用厂商接口。');
      return { meta: meta, steps: steps, outcome: timeoutDecision.action };
    }
    var waitNow = createdAt + Math.min(3, Math.max(1, policy.minutes - 1)) * 60000;
    var firstWait = window.OutboundBrandConfig.evaluateOriginalLeadWait(policy, createdAt, waitNow,
      null, false, null, config.resultRouting);
    step(steps, '等待 AI 外呼结果', '任务创建后等待回传；当前状态：' +
      (firstWait.action === 'wait' ? '等待中' : actionName(firstWait.action)) + '。');
    var resultAt = createdAt + Math.min(8, Math.max(1, policy.minutes - 1)) * 60000;
    var resultDecision = window.OutboundBrandConfig.evaluateOriginalLeadWait(policy, createdAt,
      resultAt, sample.result, false, resultAt, config.resultRouting);
    addOutcome(steps, resultDecision, resultDecision.result || sample.result, mappingConfirmed);
    return { meta: meta, steps: steps, outcome: resultDecision.action };
  }

  function render() {
    var meta = document.getElementById('nissanOutboundWalkthroughMeta');
    var list = document.getElementById('nissanOutboundWalkthroughSteps');
    var button = document.getElementById('nissanOutboundNextStep');
    if (!meta || !list || !button) return;
    if (!currentTrace) currentTrace = buildTrace(document.getElementById('nissanOutboundScenario').value);
    meta.textContent = currentTrace.meta + '。点击“开始体验”，逐步查看处理路径。';
    list.innerHTML = '';
    currentTrace.steps.slice(0, visibleSteps).forEach(function (item, index) {
      var row = document.createElement('li');
      if (index === visibleSteps - 1) row.className = 'current';
      var number = document.createElement('span'); number.className = 'step-index'; number.textContent = String(index + 1);
      var body = document.createElement('div');
      var title = document.createElement('strong'); title.textContent = item.title;
      var detail = document.createElement('p'); detail.textContent = item.detail;
      body.appendChild(title); body.appendChild(detail); row.appendChild(number); row.appendChild(body); list.appendChild(row);
    });
    var complete = visibleSteps >= currentTrace.steps.length;
    button.disabled = complete;
    button.textContent = complete ? '流程已结束' : visibleSteps ? '下一步' : '开始体验';
  }

  window.resetNissanOutboundWalkthrough = function () { visibleSteps = 0; currentTrace = null; render(); };
  window.nextNissanOutboundWalkthroughStep = function () {
    if (!currentTrace) currentTrace = buildTrace(document.getElementById('nissanOutboundScenario').value);
    if (visibleSteps < currentTrace.steps.length) visibleSteps++;
    render();
  };
  window.refreshNissanOutboundWalkthrough = function () {
    var panel = document.getElementById('nissanOutboundWalkthrough');
    var brand = document.getElementById('outboundBrandSwitch');
    if (!panel || !brand) return;
    panel.style.display = brand.value === brandCode ? '' : 'none';
    var shortcut = document.getElementById('nissanOutboundWalkthroughShortcut');
    if (shortcut) shortcut.style.display = brand.value === brandCode ? '' : 'none';
    if (brand.value === brandCode) window.resetNissanOutboundWalkthrough();
  };
  window.buildNissanOutboundWalkthrough = buildTrace;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.refreshNissanOutboundWalkthrough);
  else window.refreshNissanOutboundWalkthrough();
})();

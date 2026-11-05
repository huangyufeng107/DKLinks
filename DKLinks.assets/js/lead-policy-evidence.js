/* 接收时策略依据的独立演示快照，不读取当前可变排期或品牌配置。 */
(function () {
  'use strict';
  function freeze(value) { Object.keys(value).forEach(function (key) { if (value[key] && typeof value[key] === 'object') freeze(value[key]); }); return Object.freeze(value); }
  var name = '2026年10月全国庆典促销';
  var samples = {
    policyProject: { code: 'LD2026102700101', customerName: '陈先生', phone: '138****0101', source: '排期策略', scheduleId: 'pilot-202610', scheduleName: name, version: 1, capturedAt: '2026-10-27 10:00:00', outcome: '待处理', reason: '号码检测标记后继续；AI 培育由项目策略关闭，等待厂商下发。', steps: ['号码状态检测：命中 NORMAL → 标记后继续；执行依据：排期策略第 1 版，沿用品牌号码处理规则。', '接收去重：本项目不执行；来源 ID 校验与请求幂等仍独立执行。', 'AI 培育未执行：排期策略第 1 版配置为关闭。'], phoneEnabled: true, ai: false },
    policyInherited: { code: 'LD2026102700102', customerName: '林女士', phone: '138****0102', source: '排期内沿用品牌默认', scheduleId: 'pilot-202610', scheduleName: name, version: null, capturedAt: '2026-10-27 09:00:00', outcome: '待处理', reason: '接收时该排期尚未发布项目差异，采用当时可用的品牌默认配置。', steps: ['接收去重：公共／品牌适用规则已执行，未命中拦截。', '号码检测与 AI 培育：接收时品牌未开启，未执行。'], phoneEnabled: false, ai: false },
    policyPaused: { code: 'LD2026102700103', customerName: '周先生', phone: '138****0103', source: '排期策略', scheduleId: 'pilot-202610', scheduleName: name, version: 1, capturedAt: '2026-10-27 11:00:00', outcome: '待人工处理', reason: '排期策略第 1 版依赖的品牌号码检测已关闭，后续自动处理暂停。', steps: ['依赖检查：号码检测能力已关闭，暂停项目自动处理。', '号码检测、接收去重、AI 培育与厂商下发：本次均未执行；不生成规则命中记录。', '依赖修复后须核对并重新发布；本条暂停记录不自动重跑，需人工核查补处理。'], phoneEnabled: false, ai: false }
  };
  samples.policyProject.reason = '号码检测正常；按排期配置跳过去重和 AI 培育，等待厂商下发。';
  samples.policyPaused.outcome = '待处理';
  samples.policyPaused.reason = '接收时品牌号码检测已关闭，本项目跳过号码检测；按项目设置不执行接收去重和AI培育，等待厂商下发。';
  samples.policyPaused.steps = ['号码检测：接收时品牌已关闭，跳过本环节，不因该开关转人工。', '接收去重和AI培育：本项目关闭，不执行。来源ID、请求防重及黑名单仍独立校验。', '等待厂商下发；尚无厂商请求成功记录，不标记为已下发。'];
  samples.policyProject.stageEvidence = [
    ['号码状态检测', '已检测，正常，继续处理', '排期策略第 1 版要求检测；按当时品牌号码处理规则标记后继续。'],
    ['接收去重', '未执行', '排期策略第 1 版配置为不执行；来源 ID 校验、请求幂等仍独立执行。'],
    ['AI 培育', '未执行', '排期策略第 1 版配置为关闭。'],
    ['厂商下发', '等待处理', '尚未执行下发，暂无厂商回执。']
  ];
  samples.policyInherited.stageEvidence = [
    ['号码状态检测', '未执行', '接收时品牌未开启号码检测；当时无项目发布，沿用品牌默认。'],
    ['接收去重', '已执行，未命中拦截', '按接收时适用的公共／品牌去重规则执行；具体规则版本未记录。'],
    ['AI 培育', '未执行', '接收时品牌未开启 AI 培育，沿用品牌默认。'],
    ['厂商下发', '未记录', '此演示记录未保存下发执行结果及厂商回执，不推断是否已调用接口。']
  ];
  samples.policyPaused.stageEvidence = [
    ['号码状态检测', '未执行', '接收时品牌能力关闭，本项目跳过号码检测。'],
    ['接收去重', '未执行', '本项目不执行接收去重；公共校验仍独立执行。'],
    ['AI 培育', '未执行', '本项目关闭AI培育，不创建任务。'],
    ['厂商下发', '等待处理', '继续后续流程；厂商请求与回执尚未记录。']
  ];
  samples.policyProject.configEvidence = [
    ['号码状态检测', '开启', '排期策略第 1 版；处理动作沿用当时品牌规则'],
    ['接收去重', '不执行', '排期策略第 1 版的项目差异'],
    ['AI 培育', '关闭', '排期策略第 1 版的项目差异']
  ];
  samples.policyInherited.configEvidence = [
    ['号码状态检测', '关闭', '接收时品牌默认；当时无项目发布'],
    ['接收去重', '沿用适用规则', '接收时启用的公共／品牌规则'],
    ['AI 培育', '关闭', '接收时品牌默认；当时无项目发布']
  ];
  samples.policyPaused.configEvidence = [['号码状态检测', '关闭', '接收时品牌已关闭，本项目跳过'], ['接收去重', '不执行', '本项目设置'], ['AI培育', '关闭', '本项目设置']];
  Object.keys(samples).forEach(function (key) {
    samples[key].commonChecks = [
      { state: 'unrecorded', reason: '鉴权与接收字段校验的逐项结果未记录；关联排期不代表跳过校验，也不能据此推断通过。' },
      { state: 'unrecorded', reason: '来源线索 ID 重复检查及请求幂等结果未记录；项目关闭接收去重不取消此项校验。' },
      key === 'policyPaused'
        ? { state: 'unrecorded', reason: '本条演示未保存黑名单校验结果，不能根据排期归属推断。' }
        : { state: 'passed', reason: '本条接收记录保存了黑名单未命中结果，允许继续处理。' }
    ];
  });
  samples.nissanLinkedManual = {
    code: 'LD2026102000003', customerName: '王先生', phone: '137****6688', source: '排期策略', scheduleId: 'pilot-202610', scheduleName: name, version: 1, capturedAt: '2026-10-20 10:00:00', outcome: '待人工处理', phoneEnabled: false, ai: true,
    reason: '排期策略第1版开启AI培育；关联外呼任务等待15分钟仍无有效结束回传，命中品牌等待超时转人工规则，暂停厂商下发。',
    steps: ['排期策略第1版：AI培育开启；号码检测关闭，跳过检测。', '关联任务CALL-DFN-20261020-001，等待15分钟未收到有效结束回传，不重复创建任务。', '命中接收时保存的等待超时兜底规则：暂停自动下发，转人工核查；厂商接口尚未调用。'],
    configEvidence: [['号码状态检测','关闭','接收时品牌关闭，跳过'],['接收去重','执行','本项目设置'],['AI培育','开启','排期策略第1版；等待与超时动作沿用品牌规则']],
    commonChecks: [{state:'passed',reason:'本演示接收字段与鉴权通过'},{state:'passed',reason:'本演示来源ID及请求防重通过'},{state:'passed',reason:'本演示黑名单未命中'}],
    stageEvidence: [['号码状态检测','未执行','品牌关闭，跳过检测'],['接收去重','已执行','未命中拦截'],['AI培育','等待超时，转人工','关联任务等待15分钟，命中超时兜底规则；不重复外呼'],['厂商下发','未执行','等待人工决定；尚未调用厂商接口']]
  };
  samples.brandLinkedManual = JSON.parse(JSON.stringify(samples.nissanLinkedManual));
  Object.assign(samples.brandLinkedManual, { code: 'LD2026102000005', customerName: '孙先生', phone: '139****5505', source: '品牌默认规则', scheduleId: null, scheduleName: '未归属排期', version: null, reason: '未归属排期，按接收时品牌AI规则处理；关联外呼等待15分钟超时，命中转人工兜底规则，暂停厂商下发。' });
  samples.brandLinkedManual.steps = ['本条未归属排期，采用接收时东风日产品牌AI配置；号码检测关闭。', '关联任务CALL-DFN-20261020-005，等待15分钟无有效结束回传；不重复外呼。', '命中品牌等待超时转人工规则，厂商接口尚未调用。'];
  samples.brandLinkedManual.configEvidence = [['号码状态检测','关闭','接收时品牌默认'],['接收去重','执行','适用的公共或品牌规则'],['AI培育','开启','接收时品牌默认规则；等待15分钟超时转人工']];
  freeze(samples);
  function get(code) { return Object.keys(samples).map(function (key) { return samples[key]; }).find(function (item) { return item.code === code; }) || null; }
  function describe(snapshot) { return snapshot ? snapshot.source + (snapshot.version ? ' · 策略第 ' + snapshot.version + ' 版' : '') + (snapshot.scheduleName ? ' · ' + snapshot.scheduleName : '') : '执行依据未记录'; }
  function renderStages(snapshot) {
    var body = document.getElementById('leadPolicyStageRows');
    if (!body) return;
    body.replaceChildren();
    var records = snapshot && Array.isArray(snapshot.configEvidence) ? snapshot.configEvidence : ['号码状态检测', '接收去重', 'AI 培育'].map(function (stage) { return [stage, '未记录', '历史记录未保存该环节依据，不根据当前配置推断。']; });
    records.forEach(function (record) {
      var row = document.createElement('tr');
      record.forEach(function (value) { var cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); });
      body.appendChild(row);
    });
  }
  window.LeadPolicyEvidence = Object.freeze({ samples: samples, get: get, describe: describe, renderStages: renderStages });
})();

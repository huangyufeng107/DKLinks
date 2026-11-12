// 配置导航只切换可见内容；表单值和各分区的独立保存方式保持在原模块中。
(function () {
  var groups = { access: ['scope', 'score'], dedup: ['dedup'], wait: ['firstWait', 'linkedWait'], result: ['result'] };
  var keys = Object.keys(groups);
  var activeTab = 'access';
  var baselines = {};
  function fingerprint(section) {
    var root = document.getElementById('outboundSection-' + section);
    return root ? JSON.stringify(Array.from(root.querySelectorAll('input,select,textarea')).map(function (field) {
      return [field.id || field.className, field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value];
    })) : '';
  }
  function dirty(tab) { return groups[tab].some(function (section) { return baselines[section] !== fingerprint(section); }); }
  function setStatus(key, text, state) {
    var node = document.getElementById('outboundConfigStatus-' + key);
    if (!node) return;
    node.textContent = dirty(key) ? '未保存' : text;
    node.className = 'outbound-config-tab-status is-' + (dirty(key) ? 'dirty' : state);
  }
  function refresh() {
    if (!window.OutboundBrandConfig) return;
    var selector = document.getElementById('outboundBrandSwitch');
    var config = selector && window.OutboundBrandConfig.get(selector.value);
    if (!config) return;
    setStatus('access', config.ready ? config.enabled ? '已配置' : '未启用' : '需补充', config.ready ? 'ready' : 'pending');
    setStatus('dedup', config.taskDedup.enabled ? '已启用' : '未启用', config.taskDedup.enabled ? 'ready' : 'off');
    var waitReady = !!config.originalLeadWait && (!config.taskDedup.enabled || !!config.linkedLeadWait);
    setStatus('wait', waitReady ? '已配置' : '待配置', waitReady ? 'ready' : 'pending');
    var resultReady = !!config.resultRouting && !!config.dispatchMapping;
    setStatus('result', resultReady ? '已配置' : config.resultRouting ? '需补充' : '待配置', resultReady ? 'ready' : 'pending');
    var issues = [];
    if (!config.ready) issues.push({ tab: 'access', text: '补齐分配规则与可用外呼类型' });
    if (!config.originalLeadWait) issues.push({ tab: 'wait', text: '配置首条线索等待规则' });
    if (config.taskDedup.enabled && !config.linkedLeadWait) issues.push({ tab: 'wait', text: '配置关联线索等待规则' });
    if (!config.resultRouting) issues.push({ tab: 'result', text: '配置结果处理规则' });
    if (!config.dispatchMapping) issues.push({ tab: 'result', text: '确认外呼结果下发映射' });
    var node = document.getElementById('outboundConfigReadiness');
    if (!node) return;
    node.classList.toggle('is-ready', !issues.length);
    var content = '<strong>' + (!config.enabled ? '品牌外呼未启用' : issues.length ? '品牌外呼配置尚未就绪' : '品牌外呼配置已就绪') + '</strong>' +
      (issues.length ? '<span>待完成：</span>' + issues.map(function (issue) {
        return '<button type="button" class="outbound-config-issue" onclick="switchOutboundConfigTab(\'' + issue.tab + '\')">' + issue.text + '</button>';
      }).join('') : '<span>' + (config.enabled ? '后续接收的线索按已保存规则执行。' : '可在“接入与分配”中启用。') + '</span>');
    if (node.innerHTML !== content) node.innerHTML = content;
  }
  function switchTab(key) {
    if (!groups[key]) return;
    activeTab = key;
    keys.forEach(function (name) {
      var selected = name === key;
      var button = document.getElementById('outboundConfigTab-' + name);
      var panel = document.getElementById('outboundConfigPanel-' + name);
      if (button) { button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }
      if (panel) panel.hidden = !selected;
    });
    refresh();
  }
  window.switchOutboundConfigTab = switchTab;
  window.refreshOutboundConfigTabs = refresh;
  window.captureOutboundConfigSection = function (section) { baselines[section] = fingerprint(section); refresh(); };
  window.handleOutboundConfigTabKeys = function (event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    var index = keys.indexOf(activeTab);
    var next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
    switchTab(keys[next]);
    document.getElementById('outboundConfigTab-' + keys[next]).focus();
  };
  function init() {
    var page = document.getElementById('page-dcc-outbound-config');
    if (!page) return;
    Object.keys(groups).forEach(function (tab) { groups[tab].forEach(function (section) { baselines[section] = fingerprint(section); }); });
    ['input', 'change', 'click'].forEach(function (name) { page.addEventListener(name, function () { window.requestAnimationFrame(refresh); }); });
    switchTab(activeTab);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

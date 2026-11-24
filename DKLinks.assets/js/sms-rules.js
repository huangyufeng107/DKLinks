(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const e = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const SAMPLE_BRAND = 'DONGFENG_NISSAN';
  const standard = 'DFN_AI_STANDARD';
  const bySeries = 'DFN_AI_BY_SERIES';
  const storageKey = 'dklinks_sms_rules_v1';
  const tagCatalog = {
    [standard]: {PURCHASE_INTENT:'有购车意向',TEST_DRIVE:'愿意试驾',NO_INTENT:'暂无意向'},
    [bySeries]: {PURCHASE_INTENT:'有购车意向',TEST_DRIVE:'愿意试驾',NO_INTENT:'暂无意向'}
  };
  const seed = [
    {id:'sample-invite',brand:SAMPLE_BRAND,name:'有购车意向 · 车型咨询',channel:standard,priority:10,tags:['PURCHASE_INTENT'],exclude:['NO_INTENT'],logic:'any',series:[],min:20,max:null,action:'send',template:'model-info',enabled:true,updated:'样例'},
    {id:'sample-no-intent',brand:SAMPLE_BRAND,name:'暂无意向 · 停止触达',channel:standard,priority:5,tags:['NO_INTENT'],exclude:[],logic:'any',series:[],min:null,max:null,action:'skip',template:'',enabled:false,updated:'样例'}
  ];
  const brands = () => typeof brandManagementList === 'undefined' ? [] : brandManagementList;
  const channels = brand => window.SystemDictionary?.getOptions('OUTBOUND_TYPE', brand) || [];
  const series = brand => window.SystemDictionary?.listManagedSeries([brand]) || [];
  const options = Array.from;
  const tags = channel => Object.entries(tagCatalog[channel] || {}).map(([code,name]) => ({code,name}));
  const templateList = brand => window.SmsTemplates.available(brand);
  const range = r => r.min == null && r.max == null ? '不限' : r.min == null ? '≤ ' + r.max + ' 秒' : r.max == null ? '≥ ' + r.min + ' 秒' : r.min + '–' + r.max + ' 秒';
  let rules;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    rules = Array.isArray(saved) ? saved : seed;
  } catch (_) { rules = seed; }
  let model = null;
  let pendingStatus = null;
  let page = 1;
  const pageSize = 10;
  function persist(next) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch (_) { return false; }
    rules = next;
    return true;
  }
  function setOptions(id, list, placeholder, selected, label = item => item.name) {
    const select = $(id);
    select.replaceChildren();
    if (placeholder) select.add(new Option(placeholder,''));
    list.forEach(item => select.add(new Option(label(item), item.code ?? item.id)));
    if (selected != null) select.value = options(select.options).some(o => o.value === selected) ? selected : '';
  }
  function getChoice(id) {
    return [...$(id).querySelectorAll('input:checked')].map(input => input.value);
  }
  function formatNames(codes, list, separator) {
    return codes.map(code => list.find(item => item.code === code)?.name || code).join(separator);
  }
  function render() {
    const current = $('smsBrand').value;
    setOptions('smsBrand', brands(), '', current || brands().find(b => b.code === SAMPLE_BRAND)?.code || brands()[0]?.code);
    const brand = $('smsBrand').value;
    const available = channels(brand);
    setOptions('smsChannelFilter', available, '全部线路', $('smsChannelFilter').value);
    $('smsNew').disabled = available.length === 0;
    const channel = $('smsChannelFilter').value;
    const status = $('smsStateFilter').value;
    const keyword = $('smsSearch').value.trim().toLocaleLowerCase();
    const rows = rules.filter(r => r.name.toLocaleLowerCase().includes(keyword) && r.brand === brand && (!channel || r.channel === channel) && (!status || r.enabled === (status === 'on')))
      .sort((a,b) => a.priority - b.priority || a.name.localeCompare(b.name,'zh-CN'));
    const pageCount = Math.max(1,Math.ceil(rows.length/pageSize));
    page = Math.min(page,pageCount);
    $('smsCount').textContent = '共 ' + rows.length + ' 条数据';
    const paging = (label, aria, value, disabled, active = false) => '<button type="button" class="pagination-btn'+(active?' active':'')+'" aria-label="'+aria+'" data-sms-page="'+value+'"'+(disabled?' disabled':'')+(active?' aria-current="page"':'')+'>'+label+'</button>';
    const visible = [...new Set([1,page-1,page,page+1,pageCount])].filter(n => n>=1 && n<=pageCount).sort((a,b)=>a-b);
    $('smsPages').innerHTML = !rows.length ? '' : paging('‹','上一页',page-1,page===1)+visible.map((n,i) =>
      (i && n-visible[i-1]>1 ? '<span aria-hidden="true">…</span>' : '')+paging(n,'第 '+n+' 页',n,false,n===page)
    ).join('')+paging('›','下一页',page+1,page===pageCount);
    $('smsRows').innerHTML = rows.slice((page-1)*pageSize,page*pageSize).map(r => {
      const route = available.find(item => item.code === r.channel)?.name;
      const catalog = tags(r.channel);
      const badge = r.enabled ? 'status-active' : 'status-pending';
      return '<tr><td><strong>'+e(r.name)+'</strong></td><td>'+e(route || r.channel)+
        '<div class="form-hint">优先级 '+e(r.priority)+(route?'':' · 线路不可用')+'</div></td><td>'+e('包含：'+formatNames(r.tags,catalog,r.logic==='all'?' 且 ':' 或 '))+
        (r.exclude.length ? '<div class="form-hint">排除：'+e(formatNames(r.exclude,catalog,'、'))+'</div>' : '')+
        '<div class="form-hint sms-summary-line">车系：'+e(formatNames(r.series,series(brand),'、') || '不限')+' · 时长：'+e(range(r))+'</div></td><td>'+
        (r.action==='send' ? '发送短信<div class="form-hint">'+e(templateLabel(r.template))+'</div>' : '不发送')+
        '</td><td><span class="status-badge '+badge+'">'+(r.enabled?'启用':'停用')+'</span></td><td>'+e(r.updated)+
        '</td><td><div class="sms-actions"><button type="button" data-sms-view="'+e(r.id)+'">查看</button><button type="button" data-sms-edit="'+e(r.id)+'">编辑</button><button type="button" class="'+(r.enabled?'sms-stop':'')+'" data-sms-toggle="'+e(r.id)+'">'+(r.enabled?'停用':'启用')+'</button></div></td></tr>';
    }).join('') || '<tr><td colspan="7" class="sms-empty">'+(available.length?'没有匹配的规则，可调整筛选或新增规则。':'当前品牌暂无可用 AI 线路，请先到数据字典管理维护。')+'</td></tr>';
  }
  const tagPerPage = 40;
  const tagGroups = [
    {key:'Include',list:'smsTags',empty:'请选择包含标签',codes:new Set(),limit:tagPerPage},
    {key:'Exclude',list:'smsExclude',empty:'不排除标签',codes:new Set(),limit:tagPerPage}
  ];
  const tagEl = (g, part) => $('smsTag'+g.key+part);
  function renderTagGroup(g, focusCode) {
    const catalog = tags($('smsRuleChannel').value);
    const other = tagGroups.find(group => group !== g).codes;
    const keyword = tagEl(g,'Search').value.trim().toLocaleLowerCase();
    const selectedOnly = tagEl(g,'Selected').checked;
    const matches = catalog.filter(t => (!selectedOnly || g.codes.has(t.code)) &&
      (t.name+' '+t.code).toLocaleLowerCase().includes(keyword));
    const selected = [...g.codes];
    const summary = tagEl(g,'Summary');
    summary.textContent = selected.length ? formatNames(selected.slice(0,2),catalog,'、')+(selected.length>2?' 等 '+selected.length+' 项':'') : g.empty;
    summary.title = formatNames(selected,catalog,'、');
    summary.closest('summary').setAttribute('aria-label',(g.key==='Include'?'包含标签：':'排除标签：')+summary.textContent);
    const list = $(g.list);
    list.innerHTML = matches.slice(0,g.limit).map(t => {
      const excluded = other.has(t.code);
      return '<label><input type="checkbox" value="'+e(t.code)+'"'+(g.codes.has(t.code)?' checked':'')+(excluded?' disabled':'')+
        '><span>'+e(t.name)+(excluded?' <small>已选在另一组</small>':'')+'</span><small>'+e(t.code)+'</small></label>';
    }).join('') || '<p class="form-hint sms-series-empty">'+(selectedOnly && !selected.length?'尚未选择标签':'没有匹配的标签')+'</p>';
    tagEl(g,'Count').textContent = '已选 '+selected.length+' 项 · 匹配 '+matches.length+' 项';
    tagEl(g,'More').hidden = matches.length <= g.limit;
    tagEl(g,'Clear').disabled = !selected.length;
    if (focusCode) {
      const input = [...list.querySelectorAll('input')].find(input => input.value===focusCode);
      (input || tagEl(g,'Selected')).focus({preventScroll:true});
    }
  }
  function fillTags(include = [], exclude = []) {
    const channel = $('smsRuleChannel').value;
    const list = tags(channel);
    $('smsTagGroups').hidden = !list.length;
    $('smsTagNotice').hidden = !!list.length;
    $('smsTagNotice').textContent = channel ? '当前线路暂无可选标签样例。' : '先选择 AI 线路，再配置话单标签。';
    tagGroups.forEach((g,i) => {
      g.codes = new Set((i===0?include:exclude).filter(code => list.some(t => t.code===code)));
      g.limit = tagPerPage;
      tagEl(g,'Search').value = '';
      tagEl(g,'Selected').checked = false;
      tagEl(g,'Picker').open = false;
    });
    tagGroups.forEach(g => renderTagGroup(g));
  }
  tagGroups.forEach(g => {
    const resetResults = () => { g.limit=tagPerPage; renderTagGroup(g); };
    tagEl(g,'Search').oninput = tagEl(g,'Selected').onchange = resetResults;
    tagEl(g,'Clear').onclick = () => { g.codes.clear(); tagGroups.forEach(group => renderTagGroup(group)); tagEl(g,'Search').focus(); };
    tagEl(g,'More').onclick = () => {
      const prior = g.limit;
      g.limit+=tagPerPage;
      renderTagGroup(g);
      $(g.list).querySelectorAll('label')[prior]?.scrollIntoView({block:'nearest'});
      if (tagEl(g,'More').hidden) tagEl(g,'Search').focus({preventScroll:true});
    };
    $(g.list).onchange = event => {
      const input = event.target;
      if (input.type!=='checkbox' || input.disabled) return;
      if (input.checked) g.codes.add(input.value); else g.codes.delete(input.value);
      tagGroups.forEach(group => renderTagGroup(group,group===g?input.value:null));
    };
  });
  function durationText(value) {
    return value === '' || (/^[0-9]+$/.test(value) && Number.isSafeInteger(Number(value)));
  }
  function durationRange() {
    const min=$('smsMin').value,max=$('smsMax').value;
    if (![min,max].every(durationText)) return '请输入非负整数秒，例如 20。';
    return min!=='' && max!=='' && Number(min)>Number(max) ? '最短时长不能大于最长时长。' : '';
  }
  function durationHint(message='') {
    $('smsDurationError').textContent=message;
    $('smsDurationError').hidden=!message;
  }
  function resetDuration(r) {
    for (const [id,value] of [['smsMin',r?.min],['smsMax',r?.max]]) {
      const input=$(id);
      input.value=value==null?'':String(value);
      input.dataset.lastDuration=input.value;
    }
    durationHint();
  }
  ['smsMin','smsMax'].forEach(id => {
    const input=$(id);
    input.addEventListener('beforeinput',event => {
      if (event.data && event.inputType.startsWith('insert') && /[^0-9]/.test(event.data) && event.cancelable && !event.isComposing) {
        event.preventDefault();
        durationHint('请输入非负整数秒，例如 20。');
      }
    });
    input.addEventListener('paste',event => {
      const text=event.clipboardData?.getData('text/plain');
      if (text!=null && (!text || !durationText(text))) {
        event.preventDefault();
        durationHint('粘贴内容须为非负整数秒。');
      }
    });
    input.addEventListener('input',event => {
      if (event.isComposing) return;
      if (!durationText(input.value)) {
        input.value=input.dataset.lastDuration||'';
        durationHint('请输入非负整数秒，例如 20。');
        return;
      }
      input.dataset.lastDuration=input.value;
      durationHint(durationRange());
    });
    input.addEventListener('blur',() => {
      if (input.value && durationText(input.value)) input.value=String(Number(input.value));
      input.dataset.lastDuration=durationText(input.value)?input.value:'';
      durationHint(durationRange());
    });
  });
  function templateLabel(id) {
    const t = window.SmsTemplates.get(id);
    return t ? t.name+(t.enabled?'':'（已停用）') : '模板不可用';
  }
  function fillChoices(brand, r = {}) {
    setOptions('smsRuleChannel',channels(brand),'请选择 AI 线路',r.channel || '');
    if (r.channel && !$('smsRuleChannel').value) {
      $('smsRuleChannel').add(new Option(r.channel+'（不可用）',r.channel,true,true));
    }
    fillTags(r.tags,r.exclude);
    const models = series(brand);
    const selected = r.series || [];
    $('smsSeriesPicker').open = false;
    $('smsSeriesSearch').value = '';
    $('smsSeries').innerHTML = models.map(item => '<label><input type="checkbox" value="'+e(item.code)+'"'+(selected.includes(item.code) ? ' checked' : '')+'><span>'+e(item.name)+'</span><small>'+e(item.code)+'</small></label>').join('');
    updateSeriesPicker();
    setOptions('smsTemplate',templateList(brand).map(t => ({name:t.name,id:t.id})),'请选择短信模板',r.template || '');
    if (r.template && !$('smsTemplate').value) {
      $('smsTemplate').add(new Option(templateLabel(r.template),r.template,true,true));
      $('smsTemplate').options[$('smsTemplate').options.length-1].disabled = true;
    }
    updateAction();
  }
  function updateSeriesPicker() {
    const list = $('smsSeries');
    const keyword = $('smsSeriesSearch').value.trim().toLocaleLowerCase();
    const names = series($('smsRuleBrand').value);
    const selected = getChoice('smsSeries');
    let matches = 0;
    list.querySelectorAll('label').forEach(label => {
      label.hidden = !label.textContent.toLocaleLowerCase().includes(keyword);
      if (!label.hidden) matches++;
    });
    const summary = selected.length ? formatNames(selected.slice(0,3),names,'、')+(selected.length>3?' 等 '+selected.length+' 项':'') : '不限车系';
    $('smsSeriesSummary').textContent = summary;
    $('smsSeriesSummary').title = selected.length ? formatNames(selected,names,'、') : summary;
    $('smsSeriesClear').disabled = !selected.length;
    $('smsSeriesEmpty').hidden = matches>0;
    $('smsSeriesEmpty').textContent = names.length ? '没有匹配的车系' : '当前品牌暂无可选车系';
  }
  function updateAction() {
    const send = $('smsAction').value === 'send';
    $('smsTemplateField').hidden = !send;
    const template = send && window.SmsTemplates.get($('smsTemplate').value);
    $('smsTemplatePreview').hidden = !template;
    $('smsTemplatePreview').textContent = template ? (template.signature?'【'+template.signature+'】':'')+template.body : '';
  }
  function error(message) {
    $('smsError').textContent = message || '';
    $('smsError').hidden = !message;
    if (message) $('smsError').scrollIntoView({block:'nearest'});
  }
  function detail(r) {
    const brand = brands().find(item => item.code===r.brand)?.name || r.brand;
    const route = channels(r.brand).find(item => item.code===r.channel)?.name || r.channel+'（不可用）';
    const catalog = tags(r.channel);
    const template = window.SmsTemplates.get(r.template);
    const block = (title, pairs) => '<section class="sms-form-block"><h3>'+title+'</h3><dl class="sms-detail-grid">'+
      pairs.map(([label,value]) => '<div><dt>'+e(label)+'</dt><dd>'+e(value)+'</dd></div>').join('')+'</dl></section>';
    $('smsDetailContent').innerHTML =
      block('基本信息',[['规则名称',r.name],['配置品牌',brand],['AI 线路',route],['优先级',r.priority],['状态',r.enabled?'启用':'停用'],['更新时间',r.updated]])+
      block('命中条件',[['包含标签',formatNames(r.tags,catalog,r.logic==='all'?' 且 ':' 或 ')],['排除标签',formatNames(r.exclude,catalog,'、')||'不限'],
        ['车系 ID',formatNames(r.series,series(r.brand).map(item => ({...item,name:item.name+' · '+item.code})),'、')||'不限'],['通话时长',range(r)]])+
      block('执行动作',r.action==='send'?[['命中后','发送短信'],['短信模板',templateLabel(r.template)]]:[['命中后','不发送']])+
      (r.action==='send' && template ? '<p class="sms-preview">'+e(template.body)+'</p>' : '');
  }
  function open(mode, r) {
    const readOnly = mode==='view';
    model = {mode,r};
    $('smsRuleTitle').textContent = ({new:'新增规则',view:'规则详情',edit:'编辑规则'})[mode];
    $('smsDetailPanel').hidden = !readOnly;
    $('smsRuleForm').hidden = readOnly;
    if (readOnly) {
      detail(r);
    } else {
      $('smsRuleForm').reset();
      $('smsName').value = r?.name || '';
      $('smsPriority').value = r?.priority ?? 100;
      resetDuration(r);
      $('smsTagLogic').value = r?.logic || 'any';
      $('smsAction').value = r?.action || 'send';
      setOptions('smsRuleBrand',brands(),'请选择品牌',r?.brand || $('smsBrand').value);
      fillChoices($('smsRuleBrand').value,r || {channel:$('smsChannelFilter').value});
      error();
    }
    if (!$('smsRuleDialog').open) $('smsRuleDialog').showModal();
    (readOnly ? $('smsDetailClose') : $('smsRuleChannel').value ? $('smsName') : $('smsRuleChannel')).focus();
  }
  function validation(r) {
    const list = tags(r.channel);
    if (!r.name) return '请填写规则名称。';
    if (!Number.isSafeInteger(r.priority) || r.priority < 1) return '优先级须为正整数。';
    if (!r.brand || !channels(r.brand).some(item => item.code === r.channel)) return '请选择当前品牌可用的 AI 线路。';
    if (!r.tags.length || [...r.tags,...r.exclude].some(code => !list.some(item => item.code === code))) return '请至少选择一个当前线路的包含标签。';
    if (r.tags.some(code => r.exclude.includes(code))) return '同一标签不能同时设为包含和排除。';
    if (r.series.some(code => !series(r.brand).some(item => item.code === code))) return '请选择当前品牌的车系。';
    if ([r.min,r.max].some(v => v != null && (!Number.isSafeInteger(v) || v < 0))) return '通话时长须为非负整数。';
    if (r.min != null && r.max != null && r.min > r.max) return '最短通话时长不能大于最长通话时长。';
    if (r.action === 'send' && !templateList(r.brand).some(t => t.id === r.template)) return '请选择当前品牌可用的短信模板。';
    if (r.enabled && rules.some(other => other.id!==r.id && other.enabled && other.brand===r.brand && other.channel===r.channel && other.priority===r.priority)) return '同品牌、同线路已有启用规则使用此优先级，请先调整。';
    return '';
  }
  function update(rule) {
    const found = rules.some(r => r.id === rule.id);
    return persist(found ? rules.map(r => r.id===rule.id ? rule : r) : [...rules,rule]);
  }
  const now = () => new Date().toLocaleString('sv-SE');
  $('smsNew').onclick = () => open('new');
  $('smsBrand').onchange = () => { page=1; $('smsChannelFilter').value=''; render(); };
  $('smsSearch').oninput = () => { page=1; render(); };
  $('smsResetFilters').onclick = () => {
    $('smsSearch').value=''; $('smsChannelFilter').value=''; $('smsStateFilter').value=''; page=1; render();
  };
  $('smsChannelFilter').onchange = $('smsStateFilter').onchange = () => { page=1; render(); };
  $('smsPages').onclick = event => {
    const button = event.target.closest('[data-sms-page]');
    if (button && !button.disabled) { page = Number(button.dataset.smsPage); render(); }
  };
  $('smsRuleBrand').onchange = () => { fillChoices($('smsRuleBrand').value); error(); };
  $('smsRuleChannel').onchange = () => { fillTags(); error(); };
  $('smsSeriesSearch').oninput = updateSeriesPicker;
  $('smsSeries').onchange = updateSeriesPicker;
  $('smsSeriesClear').onclick = () => {
    $('smsSeries').querySelectorAll('input:checked').forEach(input => { input.checked=false; });
    updateSeriesPicker();
  };
  $('smsAction').onchange = $('smsTemplate').onchange = updateAction;
  $('smsDetailEdit').onclick = () => { if (model?.mode==='view') open('edit',model.r); };
  $('smsClose').onclick = $('smsCancel').onclick = $('smsDetailClose').onclick = () => $('smsRuleDialog').close();
  $('smsRows').onclick = event => {
    const button = event.target.closest('button');
    if (!button) return;
    const {smsView,smsEdit,smsToggle} = button.dataset;
    const r = rules.find(rule => rule.id === (smsView || smsEdit || smsToggle));
    if (!r) return;
    if (smsView || smsEdit) { open(smsView?'view':'edit',r); return; }
    const next = {...r,enabled:!r.enabled,updated:now()};
    const message = next.enabled ? validation(next) : '';
    if (message) { showToast(message,'error'); return; }
    pendingStatus = next;
    const verb = next.enabled?'启用':'停用';
    $('smsStatusTitle').textContent = verb+'规则';
    $('smsStatusMessage').textContent = next.enabled ? '启用「'+r.name+'」后，该规则将参与此线路的短信判定。' : '停用「'+r.name+'」后，该规则将不再参与此线路的短信判定。';
    $('smsStatusConfirm').textContent = '确认'+verb;
    $('smsStatusError').hidden = true;
    $('smsStatusDialog').showModal();
  };
  $('smsStatusDialog').addEventListener('close',() => { pendingStatus=null; });
  $('smsStatusConfirm').onclick = () => {
    if (!pendingStatus) return;
    const next = {...pendingStatus,updated:now()};
    const message = (next.enabled ? validation(next) : '') || (update(next) ? '' : '保存失败，请检查浏览器存储是否可用。');
    if (message) { $('smsStatusError').textContent=message; $('smsStatusError').hidden=false; return; }
    $('smsStatusDialog').close();
    render();
    showToast(next.enabled?'规则已启用':'规则已停用','success');
  };
  $('smsRuleForm').onsubmit = event => {
    event.preventDefault();
    if (!model || model.mode==='view') return;
    const rangeMessage=durationRange();
    if (rangeMessage) { durationHint(rangeMessage); $('smsDurationError').scrollIntoView({block:'nearest'}); return; }
    const existing = model.r;
    const number = id => $(id).validity.badInput ? NaN : $(id).value==='' ? null : Number($(id).value);
    const rule = {
      id:existing?.id || 'sms-' + (globalThis.crypto?.randomUUID?.() || Date.now()+'-'+Math.random().toString(36).slice(2)),
      brand:$('smsRuleBrand').value,channel:$('smsRuleChannel').value,name:$('smsName').value.trim(),
      priority:number('smsPriority'),tags:[...tagGroups[0].codes],exclude:[...tagGroups[1].codes],logic:$('smsTagLogic').value,series:getChoice('smsSeries'),
      min:$('smsMin').value===''?null:Number($('smsMin').value), max:$('smsMax').value===''?null:Number($('smsMax').value),action:$('smsAction').value,template:$('smsAction').value==='send' ? $('smsTemplate').value : '',
      enabled:existing?.enabled || false,version:existing ? (existing.version||1)+1 : 1,updated:now()
    };
    const message = validation(rule);
    if (message) { error(message); return; }
    if (!update(rule)) { error('保存失败，请检查浏览器存储是否可用。'); return; }
    $('smsRuleDialog').close();
    $('smsBrand').value = rule.brand;
    const edited = !!existing;
    if (!edited || existing.brand !== rule.brand) {
      $('smsChannelFilter').value = '';
      $('smsStateFilter').value = '';
      $('smsSearch').value = '';
      page=1;
    }
    render();
    showToast(edited?'规则已保存':'规则已保存，启用后才会参与匹配','success');
  };
  function matchCall(call) {
    if (!call?.final || !call.callId || !call.brand || !call.channel) return null;
    const returned = new Set(Array.isArray(call.tags)?call.tags:[]);
    return rules.filter(r => r.enabled && r.brand===call.brand && r.channel===call.channel &&
      r.tags.length && (r.logic==='all' ? r.tags.every(tag=>returned.has(tag)) : r.tags.some(tag=>returned.has(tag))) &&
      !r.exclude.some(tag=>returned.has(tag)) && (!r.series.length||r.series.includes(call.seriesId)) &&
      ((r.min==null && r.max==null)||(Number.isInteger(call.seconds)&&call.seconds>=0&&(r.min==null||r.min<=call.seconds)&&(r.max==null||call.seconds<=r.max))))
      .sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id))[0] || null;
  }
  window.SmsRules = Object.freeze({render, matchCall, templateReferences: id => rules.filter(r => r.action==='send' && r.template===id).map(({name,enabled})=>({name,enabled}))});
})();

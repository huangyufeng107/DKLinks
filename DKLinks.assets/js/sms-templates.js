(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const e = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const brandCode = 'DONGFENG_NISSAN';
  const key = 'dklinks_sms_templates_v1';
  const now = () => new Date().toLocaleString('sv-SE');
  const seed = [
    {id:'test-drive',name:'试驾邀约（样例）',body:'您好，感谢您关注东风日产。如有试驾意向，可与意向门店联系预约。',code:'DEMO-TEST-DRIVE'},
    {id:'model-info',name:'车型咨询（样例）',body:'您好，感谢您关注东风日产。欢迎联系意向门店了解车型及配置。',code:'DEMO-MODEL-INFO'}
  ].map(t => ({...t,brand:brandCode,signature:'东风日产',enabled:true,version:1,history:[],updated:'样例'}));
  let records;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    records = Array.isArray(saved) ? saved : seed;
  } catch (_) { records = seed; }
  const get = id => records.find(t => t.id === id);
  const available = brand => records.filter(t => t.brand === brand && t.enabled && t.signature && t.code);
  window.SmsTemplates = Object.freeze({get,available});

  const brands = () => typeof brandManagementList === 'undefined' ? [] : brandManagementList;
  const brandName = code => brands().find(b => b.code === code)?.name || code;
  const refs = id => window.SmsRules?.templateReferences(id) || [];
  const stamp = t => ({name:t.name,body:t.body,signature:t.signature,code:t.code,version:t.version,updated:t.updated});
  const preview = t => (t.signature ? '【'+t.signature+'】' : '')+t.body;
  const templatePageSize = 10;
  let page = 1;
  let current = null;
  let pending = null;
  function store(record) {
    const next = get(record.id) ? records.map(t => t.id === record.id ? record : t) : [...records,record];
    try { localStorage.setItem(key,JSON.stringify(next)); } catch (_) { return false; }
    records = next;
    return true;
  }
  function setBrands(id, value) {
    const select = $(id);
    select.replaceChildren(...brands().map(b => new Option(b.name,b.code)));
    select.value = brands().some(b => b.code === value) ? value : brands()[0]?.code || '';
  }
  function render() {
    setBrands('smsTplFilterBrand',$('smsTplFilterBrand').value || $('smsBrand').value || brandCode);
    const brand = $('smsTplFilterBrand').value;
    const keyword = $('smsTplSearch').value.trim().toLocaleLowerCase();
    const state = $('smsTplState').value;
    const list = records.filter(t => t.brand===brand && (t.name+' '+t.code).toLocaleLowerCase().includes(keyword) && (!state || t.enabled===(state==='on')))
      .sort((a,b) => b.updated.localeCompare(a.updated,'en') || a.name.localeCompare(b.name,'zh-CN'));
    const pages = Math.max(1,Math.ceil(list.length/templatePageSize));
    page = Math.min(pages,page);
    $('smsTplCount').textContent = '共 '+list.length+' 条数据';
    const pager = (n,label,title,disabled,active=false) => '<button class="pagination-btn'+(active?' active':'')+'" type="button" data-page="'+n+'" aria-label="'+title+'"'+(disabled?' disabled':'')+(active?' aria-current="page"':'')+'>'+label+'</button>';
    const visible = [...new Set([1,page-1,page,page+1,pages])].filter(n => n>=1 && n<=pages).sort((a,b)=>a-b);
    $('smsTplPages').innerHTML = !list.length ? '' : pager(page-1,'‹','上一页',page===1)+visible.map((n,i) =>
      (i && n-visible[i-1]>1 ? '<span aria-hidden="true">…</span>' : '')+pager(n,n,'第 '+n+' 页',false,n===page)).join('')+pager(page+1,'›','下一页',page===pages);
    $('smsTplRows').innerHTML = list.slice((page-1)*templatePageSize,page*templatePageSize).map(t => {
      const linked = refs(t.id);
      const active = linked.filter(r => r.enabled).length;
      const button = (action,label,tone='') => '<button type="button" data-template-action="'+action+'" data-template-id="'+e(t.id)+'" class="'+tone+'">'+label+'</button>';
      return '<tr><td><strong>'+e(t.name)+'</strong><div class="form-hint">'+e(t.code||'待填写编号')+'</div></td><td><div class="sms-summary-line">'+e(preview(t))+
        '</div></td><td>'+linked.length+' 条'+(active?'<div class="form-hint">'+active+' 条已启用</div>':'')+'</td><td><span class="status-badge '+(t.enabled?'status-active':'status-pending')+'">'+(t.enabled?'启用':'停用')+
        '</span></td><td>'+e(t.updated)+'</td><td><div class="sms-actions">'+button('view','预览')+button('edit','编辑')+button('toggle',t.enabled?'停用':'启用',t.enabled?'sms-stop':'')+'</div></td></tr>';
    }).join('') || '<tr><td colspan="6" class="sms-empty">没有匹配的短信模板，可调整筛选或新增模板。</td></tr>';
  }
  const error = (id,message='') => { $(id).textContent=message; $(id).hidden=!message; if (message) $(id).scrollIntoView({block:'nearest'}); };
  function fromForm() {
    return {brand:$('smsTplBrand').value,name:$('smsTplName').value.trim(),signature:$('smsTplSignature').value.trim(),
      code:$('smsTplCode').value.trim(),body:$('smsTplBody').value.trim()};
  }
  function live() {
    const t = fromForm();
    $('smsTplLength').textContent = $('smsTplBody').value.length+' / 500 字';
    $('smsTplLivePreview').textContent = t.body ? preview(t) : '填写正文后预览短信。';
  }
  function open(mode,t) {
    current = t || null;
    const isView = mode==='view';
    $('smsTplTitle').textContent = isView?'模板预览':t?'编辑模板':'新增模板';
    $('smsTplDetail').hidden = !isView;
    $('smsTplForm').hidden = isView;
    if (isView) {
      const field = (name,value) => '<div><dt>'+e(name)+'</dt><dd>'+e(value)+'</dd></div>';
      const linked = refs(t.id);
      $('smsTplDetailContent').innerHTML = '<section class="sms-form-block"><h3>模板信息</h3><dl class="sms-detail-grid">'+
        field('模板名称',t.name)+field('配置品牌',brandName(t.brand))+field('模板编号',t.code||'未填写')+field('签名',t.signature||'未填写')+
        field('状态',t.enabled?'启用':'停用')+field('内容版本','v'+t.version)+'</dl></section><section class="sms-form-block"><h3>短信预览</h3><p class="sms-preview">'+
        e(preview(t))+'</p></section><section class="sms-form-block"><h3>关联规则（'+linked.length+'）</h3>'+
        (linked.length?'<ul class="sms-template-impact">'+linked.map(r=>'<li>'+e(r.name)+' · '+(r.enabled?'启用':'停用')+'</li>').join('')+'</ul>':'<p class="form-hint">暂无关联规则</p>')+'</section>';
    } else {
      setBrands('smsTplBrand',t?.brand||$('smsTplFilterBrand').value);
      $('smsTplBrand').disabled = !!t;
      for (const [id,name] of [['smsTplName','name'],['smsTplSignature','signature'],['smsTplCode','code'],['smsTplBody','body']]) $(id).value=t?.[name]||'';
      error('smsTplError'); live();
    }
    if (!$('smsTplDialog').open) $('smsTplDialog').showModal();
    $(isView?'smsTplDetailClose':'smsTplName').focus();
  }
  function canEnable(t) {
    return t.signature && t.code ? '' : '请先填写短信签名和通道模板编号。';
  }
  function prompt(t) {
    const message = t.enabled ? '' : canEnable(t);
    if (message) { showToast(message,'error'); return; }
    pending = t.id;
    const verb = t.enabled?'停用':'启用';
    $('smsTplStatusTitle').textContent = verb+'模板';
    $('smsTplConfirm').textContent = '确认'+verb;
    const linked = refs(t.id);
    const active = linked.filter(r => r.enabled).length;
    $('smsTplStatusMessage').textContent = t.enabled ?
      '停用「'+t.name+'」后将不能继续发送。关联的 '+linked.length+' 条规则保留，其中 '+active+' 条已启用；需启用此模板或为规则更换模板后恢复发送。' :
      '启用「'+t.name+'」后，同品牌规则可选择此模板。已引用此模板的启用规则也将恢复使用。';
    $('smsTplImpact').hidden = !t.enabled || !linked.length;
    $('smsTplImpact').innerHTML = t.enabled ? linked.map(r => '<li>'+e(r.name)+' · '+(r.enabled?'启用':'停用')+'</li>').join('') : '';
    error('smsTplStatusError');
    $('smsTplStatusDialog').showModal();
  }
  $('smsTplNew').onclick = () => open('new');
  $('smsTplFilterBrand').onchange = $('smsTplState').onchange = $('smsTplSearch').oninput = () => { page=1; render(); };
  $('smsTplReset').onclick = () => { $('smsTplState').value=''; $('smsTplSearch').value=''; page=1; render(); };
  $('smsTplPages').onclick = event => { const target=event.target.closest('[data-page]'); if(target&&!target.disabled){page=Number(target.dataset.page);render();} };
  $('smsTplRows').onclick = event => {
    const button = event.target.closest('[data-template-action]');
    const t = button && get(button.dataset.templateId);
    if (!t) return;
    if (button.dataset.templateAction==='toggle') prompt(t);
    else open(button.dataset.templateAction,t);
  };
  $('smsTplDetailEdit').onclick = () => open('edit',current);
  $('smsTplClose').onclick = $('smsTplDetailClose').onclick = $('smsTplCancel').onclick = () => $('smsTplDialog').close();
  $('smsTplBody').oninput = $('smsTplSignature').oninput = live;
  $('smsTplStatusDialog').addEventListener('close',() => { pending=null; });
  $('smsTplConfirm').onclick = () => {
    const t = pending && get(pending);
    if (!t) return;
    const updated = {...t,enabled:!t.enabled,updated:now()};
    if (!store(updated)) { error('smsTplStatusError','保存失败，请检查浏览器存储是否可用。'); return; }
    pending=null; $('smsTplStatusDialog').close(); render();
    showToast(updated.enabled?'模板已启用':'模板已停用','success');
  };
  $('smsTplForm').onsubmit = event => {
    event.preventDefault();
    if ($('smsTplForm').hidden) return;
    const form = fromForm();
    if (current) form.brand=current.brand;
    if (!brands().some(b => b.code===form.brand) || !form.name || !form.body) { error('smsTplError','请选择品牌并填写模板名称和固定正文。'); return; }
    if (records.some(t => t.id!==current?.id && t.brand===form.brand && t.name===form.name)) { error('smsTplError','同品牌已存在同名模板。'); return; }
    if (current?.enabled && canEnable(form)) { error('smsTplError',canEnable(form)); return; }
    const changed = current && ['name','signature','code','body'].some(k => current[k]!==form[k]);
    const record = {
      ...form,id:current?.id || 'tpl-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),
      enabled:current?.enabled||false,version:(current?.version||1)+(changed?1:0),
      history:changed?[...(current.history||[]),stamp(current)]:(current?.history||[]),updated:now()
    };
    if (!store(record)) { error('smsTplError','保存失败，请检查浏览器存储是否可用。'); return; }
    if (!current || $('smsTplFilterBrand').value!==record.brand) {
      $('smsTplFilterBrand').value=record.brand; $('smsTplState').value=''; $('smsTplSearch').value=''; page=1;
    }
    $('smsTplDialog').close(); render();
    showToast(current?'模板已保存':'模板已保存，启用后才可选用','success');
  };
  const tabs = [$('smsRulesTab'),$('smsTemplatesTab'),$('smsImportTab'),$('smsRecordsTab')];
  const panels = [$('smsRulesPanel'),$('smsTemplatesPanel'),$('smsImportPanel'),$('smsRecordsPanel')];
  function select(i, focus=false) {
    tabs.forEach((tab,j) => {
      tab.setAttribute('aria-selected',String(i===j));
      tab.tabIndex = i===j?0:-1;
      tab.classList.toggle('active',i===j);
      panels[j].hidden=i!==j;
    });
    if (i===3) window.SmsRecords?.render(); else if (i===2) window.SmsImport?.render(); else if (i===1) render(); else window.SmsRules?.render();
    if (focus) tabs[i].focus();
  }
  tabs.forEach((tab,i) => {
    tab.onclick = () => select(i);
    tab.onkeydown = event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); select(event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+tabs.length+(event.key==='ArrowRight'?1:-1))%tabs.length,true);
    };
  });
})();

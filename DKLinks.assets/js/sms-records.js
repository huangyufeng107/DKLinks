(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = x => String(x ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const brandCode = 'DONGFENG_NISSAN';
  const states = {accepted:'已受理',delivered:'已送达',failed:'发送失败',pending:'待核对',skipped:'已跳过'};
  const panes = {accepted:'status-active',delivered:'status-active',failed:'status-warning',pending:'status-warning',skipped:'status-pending'};
  const brands = () => typeof brandManagementList === 'undefined' ? [] : brandManagementList;
  const brandName = code => brands().find(b=>b.code===code)?.name || code;
  const date = value => new Date(value).toLocaleString('sv-SE');
  const exampleTemplate = Object.freeze({id:'model-info',name:'车型咨询（样例）',brand:brandCode,signature:'东风日产',code:'DEMO-MODEL-INFO',version:1,body:'您好，感谢您关注东风日产。欢迎联系意向门店了解车型及配置。'});
  const samples = [
    {id:'DEMO-SMS-001',time:new Date('2026-10-20T09:48:36+08:00').getTime(),status:'delivered',masked:'138****1234',demoNumber:'13800001234',taskId:'DEMO-CALL-001',callId:'DEMO-CDR-002',rule:'有购车意向 · 车型咨询（样例判定）',reason:'模拟回执：短信已送达'},
    {id:'DEMO-SMS-002',time:new Date('2026-10-20T10:05:00+08:00').getTime(),status:'failed',masked:'139****4567',reason:'模拟回执：通道明确未受理'},
    {id:'DEMO-SMS-003',time:new Date('2026-10-20T10:20:00+08:00').getTime(),status:'pending',masked:'136****7890',reason:'模拟回执：请求超时，受理结果待核对'}
  ].map(x=>({...x,source:'ai',brand:brandCode,template:exampleTemplate,example:true}));
  const pageSize = 10;
  let page = 1;
  let selected = null;
  let visible = [];
  let queryRevision = 0;
  let filter = {brand:brandCode,source:'',status:'',template:'',from:'',to:'',phone:''};
  function readAll() {
    const {batches,aiEvents}=window.SmsImport.listForRecords();
    return [...samples,...aiEvents.filter(r=>r.status!=='ignored').map(r=>({...r,source:'ai',example:true})),...batches.flatMap(batch=>batch.rows
      .filter(row=>row.status==='accepted'||row.status==='skipped')
      .map(row=>({...row,id:batch.id+'-'+row.row,batchId:batch.id,brand:batch.brand,template:batch.template,time:batch.created,source:'import',example:true})))];
  }
  function fill(id,list,blank,selected) {
    const options=[...(blank?[new Option(blank,'')]:[]),...list.map(item=>new Option(item.name,item.id||item.code))];
    $(id).replaceChildren(...options);
    if(options.some(o=>o.value===selected)) $(id).value=selected;
  }
  function fillTemplates(rows,brand,selected) {
    const options=new Map();
    rows.filter(r=>r.brand===brand&&r.template).forEach(r=>options.set(r.template.id,r.template));
    window.SmsTemplates.available(brand).forEach(t=>options.set(t.id,t));
    fill('smsRecordTemplate',[...options.values()],'全部模板',selected);
  }
  const error = message => { $('smsRecordFilterError').textContent=message||''; $('smsRecordFilterError').hidden=!message; };
  function pager() {
    const pages=Math.max(1,Math.ceil(visible.length/pageSize));
    page=Math.min(page,pages);
    const button=(n,label,title,disabled=false,active=false) => '<button type="button" class="pagination-btn'+(active?' active':'')+'" aria-label="'+title+'" data-sms-record-page="'+n+'"'+(active?' aria-current="page"':'')+(disabled?' disabled':'')+'>'+label+'</button>';
    const nums=[...new Set([1,page-1,page,page+1,pages])].filter(n=>n>=1&&n<=pages).sort((a,b)=>a-b);
    $('smsRecordPages').innerHTML=visible.length?button(page-1,'‹','上一页',page===1)+nums.map((n,i)=>
      (i&&n-nums[i-1]>1?'<span aria-hidden="true">…</span>':'')+button(n,n,'第 '+n+' 页',false,n===page)).join('')+button(page+1,'›','下一页',page===pages):'';
  }
  function paint() {
    pager();
    $('smsRecordCount').textContent='共 '+visible.length+' 条数据';
    $('smsRecordRows').innerHTML=visible.slice((page-1)*pageSize,page*pageSize).map(r=>{
      const source = r.source==='ai'?'AI 外呼':'批量导入';
      const relation = r.source==='ai' ? r.callId||'模拟触发' : r.batchId;
      return '<tr><td>'+esc(date(r.time))+'</td><td>'+esc(r.masked)+'<div class="form-hint">'+esc(brandName(r.brand))+
        '</div></td><td>'+source+'<div class="form-hint">'+esc(relation)+'</div></td><td>'+esc(r.template?.name||'—')+
        '</td><td><span class="status-badge '+panes[r.status]+'">'+states[r.status]+'</span><div class="form-hint sms-summary-line">'+esc(r.reason)+
        '</div></td><td><div class="sms-actions"><button type="button" data-sms-record="'+esc(r.id)+'">查看详情</button></div></td></tr>';
    }).join('') || '<tr><td colspan="6" class="sms-empty">没有匹配的记录，可调整筛选条件。</td></tr>';
  }
  function dayBound(input,end) {
    if(!input) return end?Infinity:-Infinity;
    const day=new Date(input+'T00:00:00');
    if(end) day.setDate(day.getDate()+1);
    return day.getTime();
  }
  function apply(rows) {
    const from=dayBound(filter.from,false), to=dayBound(filter.to,true);
    visible=rows.filter(r=>r.brand===filter.brand && (!filter.source||r.source===filter.source) && (!filter.status||r.status===filter.status) &&
      (!filter.template||r.template?.id===filter.template) && r.time>=from && r.time<to &&
      (!filter.phone || (filter.phone.length===4 ? r.masked.endsWith(filter.phone) : r.demoNumber===filter.phone || (filter.hash && r.hash===filter.hash))))
      .sort((a,b)=>b.time-a.time || a.id.localeCompare(b.id));
    paint();
  }
  function render() {
    try {
      const rows=readAll();
      fill('smsRecordBrand',brands(),null,filter.brand);
      fillTemplates(rows,filter.brand,filter.template);
      apply(rows);
    } catch (_) { error('无法读取当前浏览器的短信记录。'); }
  }
  $('smsRecordFilters').onsubmit=async event=>{
    event.preventDefault();
    const seq=++queryRevision;
    error();
    const input=$('smsRecordPhone').value.trim().normalize('NFKC');
    const phone=/^\d{4}$/.test(input) ? input : window.SmsImport.normalize(input);
    const next={brand:$('smsRecordBrand').value,source:$('smsRecordSource').value,status:$('smsRecordStatus').value,template:$('smsRecordTemplate').value,
      from:$('smsRecordFrom').value,to:$('smsRecordTo').value,phone};
    if(input&&!phone) {error('请输入完整手机号或后四位数字。');return;}
    if(next.from&&next.to&&next.from>next.to){error('结束日期不能早于开始日期。');return;}
    try {
      if(phone.length===11) next.hash=await window.SmsImport.phoneKey(phone);
      if(seq!==queryRevision) return;
      const rows=readAll();
      filter=next; page=1; apply(rows);
    } catch(err) { if(seq===queryRevision) error(err.message || '查询失败，请重试。'); }
  };
  $('smsRecordBrand').onchange=()=>{
    ++queryRevision;
    try { fillTemplates(readAll(),$('smsRecordBrand').value,''); } catch (_) { error('无法读取当前品牌的模板。'); }
  };
  $('smsRecordReset').onclick=()=>{
    ++queryRevision;
    const brand=$('smsRecordBrand').value;
    $('smsRecordFilters').reset();
    filter={brand,source:'',status:'',template:'',from:'',to:'',phone:''}; page=1; error();render();
  };
  $('smsRecordPages').onclick=event=>{
    const button=event.target.closest('[data-sms-record-page]');
    if(button&&!button.disabled){page=Number(button.dataset.smsRecordPage);paint();}
  };
  const detailBlock=(title,fields)=>'<section class="sms-form-block"><h3>'+title+'</h3><dl class="sms-detail-grid">'+
    fields.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl></section>';
  function detail(r) {
    selected=r;
    const t=r.template;
    const context=r.source==='import'?[['导入批次',r.batchId],['原文件行号',r.row]]:
      [['通话 ID',r.callId||'未关联话单'],['外呼任务',r.taskId||'—'],['命中规则',r.rule||'未记录']];
    $('smsRecordDetail').innerHTML=detailBlock('处理结果',[['手机号',r.masked],['品牌',brandName(r.brand)],['处理时间',date(r.time)],['来源',r.source==='ai'?'AI 外呼':'批量导入'],
      ['状态',states[r.status]],['处理说明',r.reason]])+detailBlock('来源追溯',context)+
      (t?detailBlock('当时使用的模板',[['模板名称',t.name],['模板版本','v'+t.version],['通道模板编号',t.code||'—']])+
       '<p class="sms-preview">'+esc((t.signature?'【'+t.signature+'】':'')+t.body)+'</p>':'');
    $('smsRecordSourceLink').hidden=!r.batchId&&!r.taskId;
    $('smsRecordSourceLink').textContent=r.batchId?'查看导入批次':'查看 AI 话单';
    $('smsRecordDialog').showModal();
  }
  $('smsRecordRows').onclick=event=>{
    const button=event.target.closest('[data-sms-record]');
    const r=button&&visible.find(row=>row.id===button.dataset.smsRecord);
    if(r) detail(r);
  };
  $('smsRecordClose').onclick=()=>$('smsRecordDialog').close();
  $('smsRecordSourceLink').onclick=()=>{
    const r=selected;
    if(!r)return;
    $('smsRecordDialog').close();
    if (r.batchId) {
      try { if(window.SmsImport.openBatch(r.batchId,r.brand))return; } catch (_) {}
      showToast('未找到该导入批次','error'); return;
    }
    if(r.taskId) {
      const scroll=window.scrollY;
      if (!window.selectAiCallRecord(r.taskId,{callId:r.callId,onBack:()=>{
        navigateTo('sms-touch');
        window.scrollTo(0,scroll);
        [...$('smsRecordRows').querySelectorAll('[data-sms-record]')].find(el=>el.dataset.smsRecord===r.id)?.focus({preventScroll:true});
      }})) showToast('未找到对应话单','error');
    }
  };
  window.SmsRecords=Object.freeze({render});
})();

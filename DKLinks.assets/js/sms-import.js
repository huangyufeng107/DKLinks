(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const e = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const key = 'dklinks_sms_import_v1';
  const windowMs = 72 * 60 * 60 * 1000;
  const pageSize = 10;
  const maxRows = 1000;
  const maxFileBytes = 5 * 1024 * 1024;
  const labels = {ready:'可发送',pending:'发送状态待核对',bad:'格式错误',duplicate:'批次内重复',recent:'近 72 小时已发',accepted:'模拟已受理',skipped:'已跳过'};
  const tones = {ready:'status-active',pending:'status-warning',bad:'status-warning',duplicate:'status-pending',recent:'status-pending',accepted:'status-active',skipped:'status-pending'};
  const demoRows = ['+86 13900000021','13900000022','139-0000-0021','13900000023','12345'].map((value,i) => ({row:i+2,value}));
  const brands = () => typeof brandManagementList === 'undefined' ? [] : brandManagementList;
  const displayDate = time => new Date(time).toLocaleString('sv-SE');
  const templateText = t => (t.signature ? '【'+t.signature+'】':'')+t.body;
  let source = null;
  let draft = null;
  let result = null;
  let previewPage = 1;
  let historyPage = 1;
  let resultPage = 1;
  let sourceGeneration = 0;
  let busy = false;
  function read() {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    return saved && Array.isArray(saved.batches) && saved.ledger ? {...saved,aiEvents:Array.isArray(saved.aiEvents)?saved.aiEvents:[]} : {ledger:{},batches:[],aiEvents:[]};
  }
  const write = state => localStorage.setItem(key,JSON.stringify(state));
  const locked = work => navigator.locks ? navigator.locks.request(key,work) : Promise.resolve().then(work);
  function normalize(value) {
    let phone = String(value ?? '').normalize('NFKC').trim().replace(/[\s\-()]/g,'');
    if (/^\+86/.test(phone)) phone=phone.slice(3);
    else if (/^0086/.test(phone)) phone=phone.slice(4);
    else if (/^86\d{11}$/.test(phone)) phone=phone.slice(2);
    return /^1[3-9][0-9]{9}$/.test(phone) ? phone : '';
  }
  async function phoneKey(phone) {
    if (!globalThis.crypto?.subtle) throw Error('当前浏览器无法校验号码，请在支持 Web Crypto 的浏览器打开原型。');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(phone));
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  }
  const recent = (ledger,id,now) => Number.isFinite(ledger[id]?.acceptedAt) && now-ledger[id].acceptedAt < windowMs;
  const blockedReason = (ledger,id,now) => ledger[id]?.status==='pending' ? '同号发送状态待核对' : recent(ledger,id,now) ? '近 72 小时已发送' : '';
  const mask = phone => phone.slice(0,3)+'****'+phone.slice(-4);
  const blank = value => String(value ?? '').trim()==='';
  function count(rows,status) { return rows.filter(r => r.status===status).length; }
  function pager(id,total,current) {
    const pages=Math.max(1,Math.ceil(total/pageSize));
    const button=(value,text,title,disabled=false,active=false) => '<button type="button" class="pagination-btn'+(active?' active':'')+'" data-sms-import-page="'+value+'" aria-label="'+title+'"'+(active?' aria-current="page"':'')+(disabled?' disabled':'')+'>'+text+'</button>';
    const visible=[...new Set([1,current-1,current,current+1,pages])].filter(n=>n>=1&&n<=pages).sort((a,b)=>a-b);
    $(id).innerHTML=!total?'':button(current-1,'‹','上一页',current===1)+visible.map((n,i)=>
      (i&&n-visible[i-1]>1?'<span aria-hidden="true">…</span>':'')+button(n,n,'第 '+n+' 页',false,n===current)).join('')+button(current+1,'›','下一页',current===pages);
  }
  function rowHtml(row) {
    return '<tr><td>'+row.row+'</td><td>'+e(row.masked)+'</td><td><span class="status-badge '+tones[row.status]+'">'+labels[row.status]+'</span></td><td>'+e(row.reason)+'</td></tr>';
  }
  function error(id,message='') { $(id).textContent=message; $(id).hidden=!message; }
  function chooseTemplate() {
    const brand=$('smsImportBrand').value;
    return window.SmsTemplates.available(brand).find(t=>t.id===$('smsImportTemplate').value);
  }
  function setOptions(id,list,placeholder,selected) {
    $(id).replaceChildren(...(placeholder?[new Option(placeholder,'')]:[]),...list.map(x=>new Option(x.name,x.id||x.code)));
    if (list.some(x=>(x.id||x.code)===selected)) $(id).value=selected;
  }
  function render() {
    const brand=$('smsImportBrand').value || $('smsTplFilterBrand').value || $('smsBrand').value;
    const tpl=$('smsImportTemplate').value;
    setOptions('smsImportBrand',brands(),null,brand);
    setOptions('smsImportTemplate',window.SmsTemplates.available($('smsImportBrand').value),'请选择已启用的模板',tpl);
    if (draft && !sameTemplate(draft.template,chooseTemplate())) invalidate();
    renderSource();
    renderHistory();
  }
  function renderSource() {
    const template=chooseTemplate();
    $('smsImportText').hidden=!template;
    $('smsImportText').textContent=template ? templateText(template) : '';
    const fileName=$('smsImportFileName');
    fileName.textContent=source ? '已选：'+source.name : '';
    fileName.hidden=!source;
    $('smsImportChooseFile').textContent=source ? '更换文件' : '选择 Excel 文件';
    $('smsImportValidate').disabled=busy||!template||!source;
  }
  function step(number) {
    [...$('smsImportSteps').children].forEach((item,index) => {
      if (index===number-1) item.setAttribute('aria-current','step');
      else item.removeAttribute('aria-current');
    });
  }
  function invalidate() {
    draft=null; previewPage=1;
    $('smsImportPreview').hidden=true;
    $('smsImportConfirm').disabled=true;
    $('smsImportSimStatus').textContent='';
    step(1);
  }
  function setSource(next) {
    source=next;
    invalidate();
    renderSource();
  }
  function labelValue(name,total,style) {
    return '<div class="sms-import-stat '+style+'"><span>'+name+'</span><strong>'+total+'</strong></div>';
  }
  function renderPreview() {
    const rows=draft.rows;
    $('smsImportPreview').hidden=false;
    $('smsImportTotals').innerHTML=labelValue('可发送',count(rows,'ready'),'is-ready')+labelValue('格式错误',count(rows,'bad'),'')+
      labelValue('批次内重复',count(rows,'duplicate'),'')+labelValue('近 72 小时已发',count(rows,'recent'),'')+labelValue('待核对',count(rows,'pending'),'');
    $('smsImportRows').innerHTML=rows.slice((previewPage-1)*pageSize,previewPage*pageSize).map(rowHtml).join('');
    $('smsImportRowCount').textContent='共 '+rows.length+' 条数据';
    pager('smsImportPages',rows.length,previewPage);
    $('smsImportConfirm').disabled=busy||!count(rows,'ready');
    $('smsImportErrors').disabled=rows.every(r=>r.status==='ready');
    $('smsImportSimulate').hidden=!draft.demo;
    $('smsImportSimulate').disabled=!draft.demo||draft.simulated||!count(rows,'ready');
  }
  const snapshot = t => ({id:t.id,brand:t.brand,name:t.name,signature:t.signature,code:t.code,body:t.body,version:t.version});
  function sameTemplate(s,t) { return !!t && s.id===t.id && s.brand===t.brand && s.version===t.version; }
  async function assess(input,ledger,time) {
    const seen=new Set();
    return Promise.all(input.map(async item => {
      const phone=normalize(item.value);
      if (!phone) return {row:item.row,masked:'—',status:'bad',reason:'请输入有效的 11 位手机号'};
      const duplicate=seen.has(phone);
      seen.add(phone);
      const row={row:item.row,masked:mask(phone)};
      if (duplicate) return {...row,status:'duplicate',reason:'同批次已存在相同手机号'};
      const hash=await phoneKey(phone);
      const reason=blockedReason(ledger,hash,time);
      return reason ? {...row,hash,status:ledger[hash]?.status==='pending'?'pending':'recent',reason}
        : {...row,hash,status:'ready',reason:'—'};
    }));
  }
  function renderHistory() {
    try {
      const batches=read().batches.filter(b=>b.brand===$('smsImportBrand').value);
      historyPage=Math.min(historyPage,Math.max(1,Math.ceil(batches.length/pageSize)));
      $('smsImportHistory').innerHTML=batches.slice((historyPage-1)*pageSize,historyPage*pageSize).map(b =>
        '<tr><td><strong>'+e(b.id)+'</strong><div class="form-hint">'+e(b.file)+'</div></td><td>'+e(b.template.name)+'</td><td>'+
        e(displayDate(b.created))+'</td><td>已受理 '+count(b.rows,'accepted')+' 条 · 跳过 '+count(b.rows,'skipped')+' 条</td>'+
        '<td><div class="sms-actions"><button type="button" data-sms-batch="'+e(b.id)+'">查看结果</button></div></td></tr>'
      ).join('') || '<tr><td colspan="5" class="sms-empty">当前品牌暂无导入批次</td></tr>';
      $('smsImportHistoryCount').textContent='共 '+batches.length+' 个批次';
      pager('smsImportHistoryPages',batches.length,historyPage);
    } catch (_) { error('smsImportError','无法读取本地批次记录，请检查浏览器存储。'); }
  }
  function renderResult() {
    $('smsImportResultMeta').textContent=result.id+' · '+result.template.name+' · '+displayDate(result.created);
    $('smsImportResultText').textContent='模拟已受理 '+count(result.rows,'accepted')+' 条，确认后跳过 '+count(result.rows,'skipped')+
      ' 条，预览阶段未提交 '+result.rows.filter(row=>!['accepted','skipped'].includes(row.status)).length+' 条。';
    $('smsImportResultRows').innerHTML=result.rows.slice((resultPage-1)*pageSize,resultPage*pageSize).map(rowHtml).join('');
    $('smsImportResultCount').textContent='共 '+result.rows.length+' 条数据';
    pager('smsImportResultPages',result.rows.length,resultPage);
  }
  function openResult(batch) {
    result=batch; resultPage=1;
    renderResult();
    $('smsImportResult').showModal();
  }
  function workbook() {
    if (!window.XLSX?.utils) throw Error('Excel 组件未加载。可先载入样例体验，或联网刷新后再导入、下载。');
    return window.XLSX;
  }
  function download(name,sheetName,rows) {
    try {
      const x=workbook(), book=x.utils.book_new();
      const sheet=x.utils.aoa_to_sheet(rows);
      x.utils.book_append_sheet(book,sheet,sheetName);
      x.writeFile(book,name);
      error('smsImportError');
    } catch (err) { error('smsImportError',err.message); }
  }
  async function load(file) {
    const seq=++sourceGeneration;
    setSource(null);
    if (!file) return;
    error('smsImportError');
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size>maxFileBytes) throw Error('请上传不超过 5 MB 的 .xlsx 文件。');
      const x=workbook();
      const book=x.read(await file.arrayBuffer(),{type:'array'});
      if (seq!==sourceGeneration) return;
      const sheet=book.Sheets[book.SheetNames[0]];
      if (!sheet?.['!ref']) throw Error('工作簿第一张表为空。');
      const used=x.utils.decode_range(sheet['!ref']);
      if (used.e.r>=maxRows+1) throw Error('每批最多支持 1,000 行名单，请拆分后重新上传。');
      let phoneColumn=null;
      for (let c=used.s.c;c<=used.e.c;c++) {
        const header=sheet[x.utils.encode_cell({r:0,c})];
        if (String(header?.v??'').trim()==='手机号') {
          if (phoneColumn!=null) throw Error('首行只能有一列「手机号」。');
          phoneColumn=c;
        }
      }
      if (phoneColumn==null) throw Error('请在第一张工作表的首行填写「手机号」列名。');
      const rows=[];
      for (let r=1;r<=used.e.r;r++) {
        const cell=sheet[x.utils.encode_cell({r,c:phoneColumn})];
        const value=cell?.f ? '公式单元格' : cell?.v;
        // Blank rows within the effective phone list are errors; unused trailing rows are ignored.
        rows.push({row:r+1,value});
      }
      while (rows.length && blank(rows[rows.length-1].value)) rows.pop();
      if (!rows.length) throw Error('名单为空，请填写手机号后重新上传。');
      setSource({name:file.name,rows,demo:false});
    } catch (err) {
      if (seq===sourceGeneration) { $('smsImportFile').value=''; error('smsImportError',err.message||'无法读取工作簿，请重新上传。'); }
    }
  }
  $('smsImportBrand').onchange=()=>{ historyPage=1; invalidate(); $('smsImportTemplate').value=''; render(); };
  $('smsImportTemplate').onchange=()=>{ invalidate(); error('smsImportError'); renderSource(); };
  $('smsImportChooseFile').onclick=()=>$('smsImportFile').click();
  $('smsImportFile').onchange=()=>{
    const input=$('smsImportFile');
    const file=input.files[0];
    input.value='';
    if (!file) return;
    const work=load(file);
    const seq=sourceGeneration;
    const status=$('smsImportFileName');
    status.hidden=false;
    status.textContent='正在读取：'+file.name;
    return work.finally(()=>{
      if (seq===sourceGeneration && !source) {
        status.hidden=true;
        status.textContent='';
      }
    });
  };
  $('smsImportDownload').onclick=()=>download('短信导入模板.xlsx','短信名单',[['手机号']]);
  $('smsImportErrors').onclick=()=>{ if(draft) download('短信导入异常行.xlsx','异常行',[['原文件行号','手机号（脱敏）','校验结果','原因'],...draft.rows.filter(r=>r.status!=='ready').map(r=>[r.row,r.masked,labels[r.status],r.reason])]); };
  $('smsImportReset').onclick=()=>{ sourceGeneration++; $('smsImportFile').value=''; $('smsImportTemplate').value=''; setSource(null); error('smsImportError'); };
  $('smsImportExample').onclick=async()=>{
    const seq=++sourceGeneration;
    $('smsImportFile').value='';
    setSource(null);
    error('smsImportError');
    try {
      const hash=await phoneKey(normalize(demoRows[3].value));
      if (seq!==sourceGeneration) return;
      await locked(()=>{
        const state=read();
        if (!blockedReason(state.ledger,hash,Date.now())) {
          state.ledger[hash]={acceptedAt:Date.now(),source:'ai-demo'};
          write(state);
        }
      });
      if (seq!==sourceGeneration) return;
      if (!chooseTemplate()) {
        const available=window.SmsTemplates.available($('smsImportBrand').value);
        if (available.length) $('smsImportTemplate').value=available[0].id;
      }
      setSource({name:'短信导入样例.xlsx',rows:demoRows,demo:true});
    } catch (err) { if(seq===sourceGeneration) error('smsImportError',err.message); }
  };
  $('smsImportValidate').onclick=async()=>{
    const template=chooseTemplate(), list=source;
    if (busy||!template||!list) return;
    invalidate(); error('smsImportError');
    busy=true; renderSource();
    try {
      const state=read(), rows=await assess(list.rows,state.ledger,Date.now());
      if (list!==source || !sameTemplate(template,chooseTemplate())) return;
      const nonce=crypto.randomUUID?.() || String(Date.now())+'-'+Math.random().toString(36).slice(2);
      draft={id:'SMS-'+nonce.slice(0,12).toUpperCase(),template:snapshot(template),file:list.name,rows,demo:list.demo,simulated:false};
      step(2);
    } catch (err) { error('smsImportError',err.message); }
    finally { busy=false; renderSource(); if(draft) renderPreview(); }
  };
  $('smsImportSimulate').onclick=async()=>{
    const current=draft, candidate=current?.rows.find(r=>r.status==='ready');
    if(!current?.demo || current.simulated || !candidate) return;
    $('smsImportSimulate').disabled=true;
    try {
      await locked(()=>{
        const state=read();
        if (!blockedReason(state.ledger,candidate.hash,Date.now())) {
          const time=Date.now();
          state.ledger[candidate.hash]={acceptedAt:time,source:'ai-demo'};
          state.aiEvents.unshift({id:'SIM-'+current.id+'-'+candidate.row,brand:current.template.brand,masked:candidate.masked,hash:candidate.hash,
            template:current.template,time,status:'accepted',reason:'导入预览期间模拟 AI 通道受理'});
          write(state);
        }
      });
      if(draft===current) {
        current.simulated=true;
        $('smsImportSimStatus').textContent=candidate.masked+' 已模拟受理；确认发送时将跳过这一行。';
      }
    } catch(err) { $('smsImportSimStatus').textContent=err.message; }
    finally { if(draft===current) renderPreview(); }
  };
  $('smsImportConfirm').onclick=()=>{
    if (!draft||busy||!count(draft.rows,'ready')) return;
    $('smsImportDialogText').textContent='将以「'+draft.template.name+'」处理 '+count(draft.rows,'ready')+' 条可发送记录。确认后自动执行，实际受理条数以批次结果为准。';
    error('smsImportDialogError'); $('smsImportDialog').showModal();
  };
  $('smsImportExecute').onclick=async()=>{
    if (!draft||busy||!count(draft.rows,'ready')) return;
    const current=draft;
    busy=true; $('smsImportExecute').disabled=true; renderPreview();
    try {
      const batch=await locked(()=>{
        const state=read(), replay=state.batches.find(b=>b.id===current.id);
        if(replay) return replay;
        const template=window.SmsTemplates.available(current.template.brand).find(t=>t.id===current.template.id);
        if(!sameTemplate(current.template,template)) throw Error('模板已更新或停用，请取消后重新校验预览。');
        const time=Date.now();
        const rows=current.rows.map(({hash,...row})=>{
          if(row.status!=='ready') return row;
          const reason=blockedReason(state.ledger,hash,time);
          if(reason) return {...row,hash,status:'skipped',reason};
          state.ledger[hash]={acceptedAt:time,source:'import',batchId:current.id};
          return {...row,hash,status:'accepted',reason:'模拟通道已受理'};
        });
        const batch={id:current.id,brand:current.template.brand,template:current.template,file:current.file,created:time,rows};
        write({...state,batches:[batch,...state.batches]});
        return batch;
      });
      $('smsImportDialog').close();
      sourceGeneration++; $('smsImportFile').value=''; setSource(null);
      step(3); historyPage=1; renderHistory();
      openResult(batch);
    } catch (err) { error('smsImportDialogError',err.message); }
    finally { busy=false; $('smsImportExecute').disabled=false; renderSource(); if(draft) renderPreview(); }
  };
  function bindPager(id,set,paint) {
    $(id).onclick=event=>{
      const button=event.target.closest('[data-sms-import-page]');
      if(button&&!button.disabled){set(Number(button.dataset.smsImportPage));paint();}
    };
  }
  bindPager('smsImportPages',n=>{previewPage=n;},renderPreview);
  bindPager('smsImportResultPages',n=>{resultPage=n;},renderResult);
  bindPager('smsImportHistoryPages',n=>{historyPage=n;},renderHistory);
  $('smsImportHistory').onclick=event=>{
    const button=event.target.closest('[data-sms-batch]');
    if(!button) return;
    try {
      const batch=read().batches.find(b=>b.id===button.dataset.smsBatch && b.brand===$('smsImportBrand').value);
      if(batch) openResult(batch);
    } catch (_) { error('smsImportError','无法读取本地批次记录。'); }
  };
  $('smsImportResultClose').onclick=()=>$('smsImportResult').close();
  async function simulateCall(call) {
    if (!call?.final || !call.callId || !call.brand || !call.channel) return {status:'ignored',reason:'还没有可判定的最终话单'};
    const phone=normalize(call.phone);
    const hash=phone ? await phoneKey(phone) : '';
    const id='AI-'+[call.brand,call.channel,call.callId].map(encodeURIComponent).join(':');
    return locked(()=>{
      const state=read(), previous=state.aiEvents.find(event=>event.id===id);
      if (previous) return {...previous,replay:true};
      const rule=window.SmsRules.matchCall(call);
      const template=rule?.action==='send'?window.SmsTemplates.get(rule.template):null;
      const usable=template&&window.SmsTemplates.available(call.brand).some(t=>t.id===template.id);
      const time=Date.now();
      const reason=!rule?'未命中启用规则':rule.action==='skip'?'命中不发送规则':!usable?'短信模板不可用':!hash?'手机号无效':blockedReason(state.ledger,hash,time);
      const event={id,taskId:call.taskId,callId:call.callId,brand:call.brand,masked:phone?mask(phone):'—',hash,
        rule:rule?rule.name+' · v'+(rule.version||1):'',template:template?snapshot(template):null,time,
        status:!rule?'ignored':reason?'skipped':'accepted',reason:reason||'模拟通道已受理'};
      if(event.status==='accepted') state.ledger[hash]={acceptedAt:time,source:'ai-demo'};
      state.aiEvents.unshift(event);
      write(state);
      return event;
    });
  }
  window.SmsImport=Object.freeze({render,normalize,phoneKey,simulateCall,
    callResult:(brand,channel,callId)=>read().aiEvents.find(r=>r.id==='AI-'+[brand,channel,callId].map(encodeURIComponent).join(':')),
    listForRecords:()=>{const state=read();return {batches:state.batches,aiEvents:state.aiEvents};},
    openBatch:(id,brand)=>{
      const batch=read().batches.find(b=>b.id===id&&b.brand===brand);
      if(!batch) return false;
      openResult(batch);
      return true;
    }
  });
})();

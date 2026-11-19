/* Contextual report for the shared supplier review fixture; legacy report rows are retained. */
(function () {
  'use strict';
  let selected = null, applied = {from:'',to:''};
  const states = new Map();
  function esc(value) { return escapeHTML(String(value == null ? '—' : value)); }
  function current() { return scheduleData.find(item=>item.id===selected); }
  function receivedRecords(s) {
    if (s.id !== 'supplier-goal-review') return null;
    const records = new Map();
    LockEntryRecords.rows().filter(row=>row.scheduleId===s.id).forEach(row=>records.set(row.leadId,{
      id:row.leadId, originalId:row.originalId, origin:row.origin, supplierId:row.supplierId, supplier:row.supplierName,
      store:row.store, receivedAt:row.receivedAt, locked:true, lockId:row.lockId
    }));
    getSupplierDispatchLeadRecords().filter(lead=>lead.scheduleId===s.id).forEach(lead=>{
      records.set(lead.id,{id:lead.id,originalId:lead.id,origin:'original',supplierId:lead.supplierId,supplier:lead.supplierName,
        store:'X 店',receivedAt:lead.created,locked:false});
      lead.logs.filter(log=>log.id!=='—').forEach(log=>records.set(log.id,{id:log.id,originalId:lead.id,origin:'derived',
        supplierId:lead.supplierId,supplier:lead.supplierName,store:log.store,receivedAt:lead.created,locked:false}));
    });
    return Array.from(records.values()).filter(record=>{
      const time=record.receivedAt.replace(' ','T').slice(0,16);
      return (!applied.from||time>=applied.from)&&(!applied.to||time<=applied.to);
    });
  }
  function row(id,parent,level,values,records) {
    const base={id,parent,level,name:'—',accountName:'—',accountShort:'—',area:'—',subArea:'—',store:'—',
      allocatedBudget:null,budgetConsumed:null,remainingBudget:null,progress:null,leadCost:null,leadSale:null,
      deliveryCost:null,deliverySale:null,profit:null,originalLeads:null,duplicateLeads:null,emptyLeads:null,
      dedupedLeads:null,validLeads:null,arrivals:null,deliveries:null,lockedOrders:null,validLockedOrders:null,
      retentionRate:null,validRate:null,arrivalRate:null,conversionRate:null};
    const item=Object.assign(base,values);
    if(records){
      item.sourceStats={sample:true,records};
      item.originalLeads=ReportSourceStats.recordsFor(item,'original').length;
      item.validLockedOrders=ReportSourceStats.recordsFor(item,'originalLocked').length;
      item.lockedOrders=item.validLockedOrders;
    }
    const state=states.get(id)||{expanded:level<4,detailOpen:false};
    Object.assign(state,item);states.set(id,state);return state;
  }
  window.getScheduleScopedReportData=function () {
    const s=current();if(!s)return selected===null?null:[];
    // The existing June report remains its own fixed demonstration data.
    if(s.id==='04')return reportRawData;
    const records=receivedRecords(s),root='report-schedule-'+s.id;
    const output=[row(root,'',0,{name:s.name,accountName:'全部供应商',accountShort:'全部供应商'},records)];
    (s.suppliers||[]).forEach(supplier=>{
      const id=root+'-'+supplier.accountId,subset=records?records.filter(record=>record.supplierId===supplier.accountId):null;
      output.push(row(id,root,1,{accountName:supplier.accountName,accountShort:supplier.accountShort||supplier.accountName||supplier.accountId},subset));
      if(!subset?.length)return;
      const area=id+'-area',subarea=id+'-subarea';
      output.push(row(area,id,2,{area:'未记录'},subset));
      output.push(row(subarea,area,3,{subArea:'未记录'},subset));
      Array.from(new Set(subset.map(record=>record.store))).forEach(store=>
        output.push(row(subarea+'-'+store,subarea,4,{store},subset.filter(record=>record.store===store))));
    });
    return output;
  };
  window.initScheduleGoalReportContext=function () {
    const subtitle=document.querySelector('#page-dk-report .page-subtitle'),s=current();
    if(subtitle)subtitle.textContent=s?'当前排期：'+s.name+' · 按排期、账号、区域、门店查看统计':'按排期、账号、区域、门店层级查看预算消耗、线索质量与转化数据';
  };
  window.applyScheduleReportRange=function () {
    applied={from:document.getElementById('reportDateFrom').value,to:document.getElementById('reportDateTo').value};
  };
  window.openScheduleReport=function (id) {
    const s=scheduleData.find(item=>item.id===id);if(!s){showToast('排期不存在，请重新选择','warning');return;}
    selected=id;document.getElementById('reportDateFrom').value=s.startTime;document.getElementById('reportDateTo').value=s.endTime;
    applyScheduleReportRange();navigateTo('dk-report');
  };
  window.hasScheduleGoalReportContext=function(){return selected!==null;};
  window.resetScheduleGoalReportDates=function(){
    const s=current();if(!s)return false;
    document.getElementById('reportDateFrom').value=s.startTime;document.getElementById('reportDateTo').value=s.endTime;applyScheduleReportRange();return true;
  };
  window.SupplierReviewReport=Object.freeze({receivedRecords});
})();

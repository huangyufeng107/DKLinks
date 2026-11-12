/* 转化率区间配置，仅演示配置；实际指标取数、分配和计费未接入。 */
(function () {
  'use strict';
  var bands = [];
  function el(id) { return document.getElementById(id); }
  function esc(v) { return escapeHTML(String(v)); }
  function active() { return el('scheduleDispatchMode').value === 'multiple' && el('scheduleDispatchLogic').value === 'ratio'; }
  function load(saved) {
    bands = ((saved && saved.ratioBands) || [{min:'4',max:'100',share:'60'},{min:'0',max:'4',share:'40'}]).map(function(b) { return {min:String(b.min),max:String(b.max),share:String(b.share)}; });
    render();
  }
  function render() {
    var view = currentScheduleMode === 'view';
    el('scheduleRatioRules').innerHTML = '<div class="schedule-panel-section"><div class="schedule-section-heading"><h3>门店转化率分配</h3><p>全排期统一配置，比例仅用于平台追加门店，供应商指定的第一家不参与本轮计数</p></div><div class="schedule-ratio-summary"><span>每轮 <strong>10个计划追加名额</strong></span><span>先高转化组，再低转化组</span><span>组内轮流分配</span></div><p class="form-hint">区间含下限、不含上限；上限100%时包含100%。本期比例按10%的整数倍设置，合计100%。</p><div class="table-wrapper"><table class="schedule-ratio-table"><thead><tr><th>转化率下限（%）</th><th>转化率上限（%）</th><th>下发比例（%）</th><th>每轮计划名额</th>' + (view ? '' : '<th>操作</th>') + '</tr></thead><tbody>' + bands.map(function(b,index) {
      return '<tr>' + ['min','max','share'].map(function(key) { return '<td><input class="form-input" inputmode="decimal" aria-label="区间' + (index+1) + ({min:'下限',max:'上限',share:'比例'}[key]) + '" value="' + esc(b[key]) + '" ' + (view?'readonly':'') + ' oninput="ScheduleRatio.update(' + index + ',\'' + key + '\',this.value)"></td>'; }).join('') + '<td id="ratioQuota' + index + '"></td>' + (view ? '' : '<td><button class="btn btn-secondary btn-sm" type="button" onclick="ScheduleRatio.remove(' + index + ')">移除</button></td>') + '</tr>';
    }).join('') + '</tbody></table></div><div class="ratio-table-footer">' + (view ? '' : '<button class="btn btn-secondary btn-sm" type="button" onclick="ScheduleRatio.add()">＋ 新增区间</button>') + '<span id="scheduleRatioTotals"></span></div><p id="scheduleRatioError" class="schedule-field-error" role="status"></p><div class="ratio-preview-section"><h4>每轮分配预览</h4><div id="scheduleRatioPreview" class="schedule-ratio-preview" aria-live="polite"></div><p class="ratio-preview-caption">按进线逐个处理计划名额，处理完10个即结束本轮；转组或未追加也推进1个名额，不补回本轮。</p></div><details class="ratio-supporting-notes ratio-explanation"><summary>查看分配说明</summary><div class="ratio-explanation-body"><div class="ratio-new-store-note"><strong>新店加入</strong><span>符合品牌、供应商关联范围及区间条件后，加入组内轮流分配；不补历史名额，不扩大本轮配额。每条线索仍排除第一家及已分配门店。</span></div><div class="ratio-new-store-note"><strong>无可用门店</strong><span>当前组无可用门店时，转给其他有可用门店的组；实际去向独立记录，不挤占后续组的计划名额。所有组均无可用门店时记为“未追加”，该计划名额仍视为处理完毕。</span></div><div class="ratio-new-store-note"><strong>数据来源</strong><span>按门店编码从独立数据表查询转化率；查不到的门店暂不参与按比例追加，不影响供应商指定的第一家。具体表名、字段及更新方式待数据表提供后对接。</span></div></div></details></div>';

    summary();
  }
  function error() {
    if (!bands.length) return '请至少配置一个转化率区间';
    var number = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
    if (bands.some(function(b) { return !number.test(b.min) || !number.test(b.max) || Number(b.min)<0 || Number(b.max)>100 || Number(b.min)>=Number(b.max); })) return '转化率区间须在0—100%内，下限小于上限，最多两位小数';
    if (bands.some(function(b) { return !/^[1-9]\d*$/.test(b.share) || Number(b.share)>100 || Number(b.share)%10!==0; })) return '下发比例须为10%—100%，且为10%的整数倍';
    if (bands.reduce(function(sum,b) { return sum+Number(b.share); },0)!==100) return '各区间下发比例合计须为100%';
    var sorted = bands.slice().sort(function(a,b) {return Number(a.min)-Number(b.min);});
    if (Number(sorted[0].min)!==0 || Number(sorted[sorted.length-1].max)!==100) return '转化率区间须完整覆盖0—100%';
    for(var i=1;i<sorted.length;i++) if(Number(sorted[i].min)!==Number(sorted[i-1].max)) return '转化率区间不能重叠或留空档，相邻区间上下限须相同';
    return '';
  }
  function summary() {
    var issue=error();
    bands.forEach(function(b,index) { var valid=/^[1-9]\d*$/.test(b.share)&&Number(b.share)<=100&&Number(b.share)%10===0;el('ratioQuota'+index).textContent=valid?Number(b.share)/10+'个':'—'; });
    el('scheduleRatioError').textContent=issue;
    var sum = bands.reduce(function(total,b) { return total + (Number.isFinite(Number(b.share)) ? Number(b.share) : 0); },0);
    el('scheduleRatioTotals').textContent = bands.length + '个区间 · 比例合计 ' + sum + '% / 100%';
    el('scheduleRatioPreview').innerHTML = issue ? '<span class="ratio-preview-empty">完成区间和比例配置后显示分配顺序</span>' : bands.slice().sort(function(a,b){return Number(b.min)-Number(a.min);}).map(function(b,index){return '<div class="ratio-preview-step"><span class="ratio-step-label">第' + (index+1) + '组</span><span>' + esc(b.min) + '% ≤ 转化率 ' + (Number(b.max)===100?'≤':'＜') + ' ' + esc(b.max) + '%</span><strong>' + Number(b.share)/10 + '个</strong></div>';}).join('');

  }
  function change() { el('scheduleRatioRules').hidden=!active(); }
  function update(index,key,value) {if(currentScheduleMode==='view'||!bands[index]||!['min','max','share'].includes(key))return;bands[index][key]=value;summary();}
  function add() {if(currentScheduleMode==='view')return;bands.push({min:'',max:'',share:''});render();}
  function remove(index) {if(currentScheduleMode==='view')return;bands.splice(index,1);render();}
  function validate() {if(!active())return '';summary();return error();}
  function config() {return {ratioBands:bands.map(function(b){return {min:b.min,max:b.max,share:b.share};}),cycleSize:10,ratioGroupOrder:'highFirst',ratioStoreSelection:'roundRobin',newStoreAllocation:'joinWithoutBackfill',conversionMetric:'independentStoreTable',missingConversion:'excludeFromAppend',emptyGroup:'fallbackToOtherAvailableGroup',emptyAllGroups:'skipAndAdvance',cycleProgress:'processedPlannedSlots',fallbackConsumes:'originalPlannedSlot',cycleCarryover:false};}
  window.ScheduleRatio={load:load,change:change,update:update,add:add,remove:remove,validate:validate,config:config};
})();

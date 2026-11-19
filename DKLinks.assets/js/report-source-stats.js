/* Additive report detail: legacy metrics and dimension rows remain untouched. */
(function () {
  'use strict';
  const metrics = [
    {key:'original', label:'供应商传输量', unit:'条'},
    {key:'derived', label:'平台派生量', unit:'条'},
    {key:'originalLocked', label:'原传有效锁单量', unit:'台'},
    {key:'derivedLocked', label:'派生有效锁单量', unit:'台'}
  ];
  const sampleRecords = [
    {id:'REPORT-SRC-001', originalId:'REPORT-SRC-001', origin:'original', store:'海口东风南方海鹏', supplier:'尊泽', locked:false},
    {id:'REPORT-SRC-010-1', originalId:'REPORT-SRC-010', origin:'derived', store:'海口东风南方海鹏', supplier:'尊泽', locked:true, lockId:'REPORT-ORDER-010'},
    {id:'REPORT-SRC-011-1', originalId:'REPORT-SRC-011', origin:'derived', store:'海口东风南方海鹏', supplier:'尊泽', locked:false},
    {id:'REPORT-SRC-012-1', originalId:'REPORT-SRC-012', origin:'derived', store:'海口东风南方海鹏', supplier:'尊泽', locked:false}
  ];
  // Complete source records for this one leaf only; never infer totals from partial children.
  const sample = reportRawData.find(row => row.id === 'r4' && row.store === '海口东风南方海鹏');
  if (sample) sample.sourceStats = {sample:true, records:sampleRecords};
  function esc(value) { return escapeHTML(String(value == null ? '—' : value)); }
  function recordsFor(row, key) {
    if (!row.sourceStats || !Array.isArray(row.sourceStats.records)) return null;
    const seen = new Set();
    return row.sourceStats.records.filter(record => {
      const derived = key === 'derived' || key === 'derivedLocked';
      const lockedMetric = key.endsWith('Locked');
      const identity = lockedMetric ? record.lockId : record.id;
      if (!identity || record.origin !== (derived ? 'derived' : 'original') ||
          (lockedMetric && record.locked !== true) || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }
  window.renderReportSourceStats = function (row) {
    return '<section class="schedule-report-detail-group report-source-stats"><div class="schedule-report-detail-title">原传与派生统计' +
      (row.sourceStats?.sample ? ' <span class="report-source-sample">样例</span>' : '') + '</div>' +
      '<p class="form-hint">按当前行的排期、账号、区域和门店范围统计。派生锁单不计入供应商达标量，派生记录不增加供应商传输量及成本。</p>' +
      '<div class="report-source-metrics">' + metrics.map(metric => {
        const records = recordsFor(row, metric.key);
        return '<div><span class="report-source-label">' + metric.label + '</span>' +
          (records === null ? '<span class="report-source-value">—</span>' :
            '<button type="button" class="report-source-value report-source-link" data-report-source-row="' + esc(row.id) +
            '" data-report-source-metric="' + metric.key + '" aria-label="查看' + metric.label + '对应记录">' + records.length + ' ' + metric.unit + '</button>') + '</div>';
      }).join('') + '</div>' + (row.sourceStats ? '' : '<p class="form-hint">该范围的来源统计尚未接入。</p>') + '</section>';
  };
  function leadCell(id) {
    const available = typeof leadDetailExamples !== 'undefined' && Object.values(leadDetailExamples).some(item=>item.code===id && item.canView!==false);
    return available ? '<button type="button" class="report-source-link" data-report-source-lead="'+esc(id)+'">'+esc(id)+'</button>' : esc(id);
  }
  window.openReportSourceRecords = function (id, key) {
    const row = getReportSource().find(item => item.id === id), metric = metrics.find(item => item.key === key);
    if (!row || !metric) return;
    const records = recordsFor(row, key);
    if (records === null) return;
    const derived = key === 'derived' || key === 'derivedLocked';
    const lockedMetric = key.endsWith('Locked');
    document.getElementById('reportSourceRecordsTitle').textContent = lockedMetric ?
      (derived ? '派生有效锁单明细' : '原传有效锁单明细') : (derived ? '平台派生线索' : '供应商传输线索');
    const lineage = [row], visited = new Set([row.id]);
    let parent = row.parent;
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      const ancestor = getReportSource().find(item => item.id === parent);
      if (!ancestor) break;
      lineage.unshift(ancestor); parent = ancestor.parent;
    }
    const dimensions = ['name', 'accountShort', 'area', 'subArea', 'store'].map(field => {
      const owner = [...lineage].reverse().find(item => item[field] && item[field] !== '-' && item[field] !== '—');
      return owner ? owner[field] : null;
    }).filter(Boolean);
    document.getElementById('reportSourceRecordsScope').textContent = dimensions.join(' ／ ');
    document.getElementById('reportSourceRecordsTotal').textContent = records.length;
    document.getElementById('reportSourceRecordsUnit').textContent = metric.unit;
    document.getElementById('reportSourceRecordsSample').hidden = !row.sourceStats.sample;
    document.getElementById('reportSourceRecordsNote').textContent = derived ?
      '派生锁单单独统计，不计入来源供应商的达标量。' : '仅统计供应商原传记录，不包含平台派生数据。';
    document.getElementById('reportSourceRecordsRows').innerHTML = records.length ? records.map(record =>
      '<tr><td class="report-source-code">' + leadCell(record.id) + '</td><td><span class="report-source-origin' +
      (record.origin === 'derived' ? ' is-derived' : '') + '">' + (record.origin === 'derived' ? '平台派生' : '供应商原传') +
      '</span></td><td class="report-source-code">' + leadCell(record.originalId) + '</td><td>' + esc(record.store) +
      '</td><td><span class="report-source-lock' + (record.locked ? ' is-locked' : '') + '">' +
      (record.locked ? '已记录' : '未记录') + '</span></td><td>' +
      (record.origin === 'derived' ? '平台派生统计' : esc(record.supplier) + '达标量') + '</td></tr>').join('') :
      '<tr><td colspan="6" class="report-source-empty"><div class="report-source-empty-symbol" aria-hidden="true">—</div><strong>暂无对应记录</strong><p>' +
      (lockedMetric ? '当前范围内尚未记录' + (derived ? '派生' : '原传') + '有效锁单。' : '当前统计范围内暂无' + (derived ? '平台派生' : '供应商原传') + '线索。') + '</p></td></tr>';
    document.getElementById('reportSourceRecordsCount').textContent = '共 ' + records.length + ' 条数据';
    openModal('reportSourceRecordsModal');
  };
  document.getElementById('reportDataTbody').addEventListener('click', function (event) {
    const button = event.target.closest('[data-report-source-metric]');
    if (button) openReportSourceRecords(button.dataset.reportSourceRow, button.dataset.reportSourceMetric);
  });
  document.getElementById('reportSourceRecordsRows').addEventListener('click', function(event) {
    const button=event.target.closest('[data-report-source-lead]');
    if(!button)return;
    closeModal('reportSourceRecordsModal');
    if(!openLeadDetailById(button.dataset.reportSourceLead))showToast('该线索详情尚未接入','warning');
  });
  window.ReportSourceStats = Object.freeze({recordsFor:recordsFor});
})();

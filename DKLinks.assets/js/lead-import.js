(function () {
  const get = (id) => document.getElementById(id);
  const dialog = get('leadImportDialog');
  const brand = get('leadImportBrand');
  const source = get('leadImportSource');
  const file = get('leadImportFile');
  const submit = get('leadImportSubmit');
  const status = get('leadImportStatus');
  const brands = [
    ['1', '理想汽车', 'LIXIANG', '理想'], ['2', '问界', 'WENJIE', '问界'],
    ['3', '小鹏', 'XIAOPENG', '小鹏'], ['5', '东风日产', 'DONGFENG_NISSAN', '东风日产']
  ];
  const demoSource = 'demo:nissan';
  const demoCode = 'DEMO-IMPORT-NISSAN';
  const demoDuplicate = 'DEMO-NISSAN-002';
  const limit = 1000;
  let rows = [];
  let submitted = false;
  let uploadToken = 0;
  const accepted = new Set();

  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = error;
  }

  function fieldList() {
    const brandCode = brands.find(([id]) => id === brand.value)?.[2];
    return window._customFieldData.filter((field) =>
      field.status === 1 && (field.scope === 'global' || field.brandCode === brandCode)
      && !['brand_id', 'api_key', 'smartcode'].includes(field.key)
    ).concat({ key: 'smartcode', name: 'SmartCode', typeName: '文本', required: false, description: '属于排期的线索填写原 SmartCode' });
  }

  function syncSources() {
    const selected = brands.find(([id]) => id === brand.value);
    source.replaceChildren(new Option('请选择原供应商', ''));
    if (!selected) return;
    const [brandId, , , supplierBrand] = selected;
    const accounts = new Map();
    for (const supplier of window._supplierData || []) {
      if (supplier.statusVal === 1 && supplier.typeVal === 3 && supplier.interfacePermissions?.lead_receive?.includes(supplierBrand)) {
        accounts.set(supplier.code, supplier.name);
      }
    }
    for (const schedule of window.scheduleData || []) {
      if (!schedule.baseSeries.some((series) => series.brandId === brandId)) continue;
      for (const account of schedule.suppliers) {
        accounts.set(account.accountId, account.accountName);
      }
    }
    for (const [id, name] of accounts) source.add(new Option(name + '（' + id + '）', id));
    if (brandId === '5') source.add(new Option('供应商 A（演示）', demoSource));
  }

  function render() {
    const ready = Boolean(brand.value && source.value);
    get('leadImportTemplate').disabled = !ready;
    file.disabled = !ready;
    get('leadImportResults').hidden = rows.length === 0;
    const valid = rows.filter((row) => row.state === '待提交').length;
    const failed = rows.filter((row) => row.state === '校验失败' || row.state === '接收拒绝').length;
    submit.disabled = submitted || valid === 0;
    get('leadImportErrors').hidden = failed === 0;
    get('leadImportResultTitle').textContent = submitted ? '统一接收结果（演示）' : '表格校验结果';
    const body = get('leadImportRows');
    body.replaceChildren(...rows.map((row) => {
      const tr = document.createElement('tr');
      tr.insertCell().textContent = row.number;
      tr.insertCell().textContent = row.values.source_lead_id || '—';
      const badge = document.createElement('span');
      badge.className = 'lead-import-result-state';
      badge.dataset.state = row.state;
      badge.textContent = row.state;
      tr.insertCell().appendChild(badge);
      tr.insertCell().textContent = row.reason || '—';
      return tr;
    }));
    if (rows.length) {
      message(submitted ? '模拟已接收 ' + rows.filter((row) => row.state === '已接收').length + ' 条，失败 ' + failed + ' 条。'
        : '可提交 ' + valid + ' 条，校验失败 ' + failed + ' 条。');
    }
  }

  function clearUpload() {
    uploadToken++;
    rows = [];
    submitted = false;
    file.value = '';
    message('');
    render();
  }

  function options(field) {
    return (field.enumValues || []).flatMap((value) => String(value).split('='));
  }

  function validate(field, value) {
    if (!value) return field.required ? '必填' : '';
    if ((field.type === 8 || field.key === 'customer_phone') && !/^1\d{10}$/.test(value)) return '请填写 11 位手机号';
    if (field.type === 2 && !/^-?(?:\d+|\d*\.\d+)$/.test(value)) return '请填写数字';
    if (field.type === 3) {
      const date = new Date(value + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) return '请填写有效日期（YYYY-MM-DD）';
    }
    const allowed = options(field);
    const values = field.type === 5 ? value.split(/[、,，]/).map((item) => item.trim()) : [value];
    if ([4, 5].includes(field.type) && allowed.length && values.some((item) => !allowed.includes(item))) return '可选值为 ' + allowed.join('、');
    return '';
  }

  function stage(records, firstRow = 3) {
    const fields = fieldList();
    rows = records.map((values, index) => {
      const reason = fields.flatMap((field) => {
        const issue = validate(field, values[field.key]);
        return issue ? [field.name + ' · ' + issue] : [];
      }).join('；');
      return { values, number: firstRow + index, reason, state: reason ? '校验失败' : '待提交' };
    }).filter((row) => Object.values(row.values).some(Boolean));
    submitted = false;
    render();
    if (!rows.length) message('模板中没有线索数据。', true);
  }

  function download(records, isErrorFile) {
    if (!window.XLSX) return message('Excel 组件未加载，请联网后刷新原型再试。', true);
    const fields = fieldList();
    const headers = [fields.map((field) => field.name), fields.map((field) => field.key)];
    const book = XLSX.utils.book_new();
    const data = XLSX.utils.aoa_to_sheet(headers.concat(records.map((row) => fields.map((field) => row.values[field.key] || ''))));
    const lastRow = Math.max(limit + 1, records.length + 1);
    fields.forEach((field, col) => {
      if (field.type === 2) return;
      for (let row = 2; row <= lastRow; row++) {
        const cell = XLSX.utils.encode_cell({ c: col, r: row });
        data[cell] = { t: 's', v: data[cell]?.v || '', z: '@' };
      }
    });
    data['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: fields.length - 1, r: lastRow } });
    data['!cols'] = fields.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(book, data, '线索数据');
    const label = brands.find(([id]) => id === brand.value)[1];
    const guide = XLSX.utils.aoa_to_sheet([
      ['品牌', label], ['原供应商', source.selectedOptions[0].text], [],
      ['字段', '是否必填', '类型', '填写说明'],
      ...fields.map((field) => [field.name, field.required ? '必填' : field.key === 'smartcode' ? '按排期规则填写' : '选填', field.typeName,
        options(field).join('、') || (field.key === 'store_id' ? '填写门店编码' : field.description || '')]),
      [], ['多选字段用逗号分隔。保留前两行列名和字段编码。']
    ]);
    guide['!cols'] = [{ wch: 24 }, { wch: 26 }, { wch: 12 }, { wch: 56 }];
    XLSX.utils.book_append_sheet(book, guide, '字段说明');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[brand.value, source.value]]), '模板信息');
    if (isErrorFile) {
      const errors = XLSX.utils.aoa_to_sheet([['原文件行号', '来源线索 ID', '失败原因'], ...records.map((row) =>
        [row.number, row.values.source_lead_id || '', row.reason])]);
      errors['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 64 }];
      XLSX.utils.book_append_sheet(book, errors, '失败原因');
    }
    XLSX.writeFile(book, label + (isErrorFile ? '-线索导入失败行.xlsx' : '-线索导入模板.xlsx'));
  }

  async function upload() {
    const selected = file.files[0];
    rows = [];
    submitted = false;
    message('');
    render();
    const token = ++uploadToken;
    if (!selected) return;
    if (!/\.xlsx$/i.test(selected.name) || selected.size > 5 * 1024 * 1024) return message('请选择 5 MB 以内的 .xlsx 文件。', true);
    if (!window.XLSX) return message('Excel 组件未加载，请联网后刷新原型再试。', true);
    try {
      const bytes = await selected.arrayBuffer();
      if (token !== uploadToken || !dialog.open) return;
      const book = XLSX.read(bytes, { cellNF: true });
      const meta = book.Sheets['模板信息'];
      const sheet = book.Sheets['线索数据'];
      if (!sheet || String(meta?.A1?.v) !== brand.value || meta?.B1?.v !== source.value) {
        return message('文件与当前品牌或原供应商不一致，请重新下载模板。', true);
      }
      const fields = fieldList();
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      if (range.e.r > limit + 1) return message('每批最多 1,000 条，请拆分文件后上传。', true);
      const columns = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1, raw: false, defval: '' })[0] || [];
      const keys = fields.map((field) => field.key);
      if (columns.length !== keys.length || new Set(columns).size !== keys.length || keys.some((key) => !columns.includes(key))) {
        return message('模板字段与当前配置不一致，请重新下载模板。', true);
      }
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 2, raw: false, defval: '', blankrows: true });
      stage(data.map((values) => Object.fromEntries(columns.map((key, col) => [key, String(values[col] || '').trim()]))));
    } catch {
      message('无法读取该文件，请使用下载的 Excel 模板。', true);
    }
  }

  function receive(row) {
    const { source_lead_id: id, store_id: store, smartcode } = row.values;
    const key = JSON.stringify([brand.value, source.value, id]);
    if (accepted.has(key) || (source.value === demoSource && id === demoDuplicate)) return '来源线索 ID 已接收，命中防重规则';
    if (source.value === demoSource) {
      if (smartcode !== demoCode) return 'SmartCode 未命中演示排期';
      if (!['DFN_GZ_PY_001', 'DFN_SH_PD_003'].includes(store)) return '意向门店超出供应商在排期内的关联范围';
    } else {
      const schedule = (window.scheduleData || []).find((item) => item.baseSeries.some((series) => series.brandId === brand.value)
        && item.suppliers.some((account) => account.accountId === source.value && account.smartcode === smartcode));
      const now = new Date();
      if (!schedule || schedule.status !== 1 || now < new Date(schedule.startTime) || now > new Date(schedule.endTime)) return '未命中有效排期，请核对供应商和 SmartCode';
      const account = schedule.suppliers.find((item) => item.accountId === source.value && item.smartcode === smartcode);
      if (!account.storeIds?.includes(store)) return '意向门店超出供应商在排期内的关联范围';
    }
    accepted.add(key);
    return '';
  }

  brand.add(new Option('请选择线索品牌', ''));
  for (const [id, name] of brands) brand.add(new Option(name, id));
  get('openLeadImport').addEventListener('click', () => {
    brand.value = brands.find(([, name]) => name === get('leadListBrand').value)?.[0] || '';
    syncSources();
    clearUpload();
    dialog.querySelector('details').open = false;
    dialog.showModal();
  });
  brand.addEventListener('change', () => { syncSources(); clearUpload(); });
  source.addEventListener('change', clearUpload);
  file.addEventListener('change', upload);
  get('leadImportTemplate').addEventListener('click', () => download([], false));
  get('leadImportErrors').addEventListener('click', () => download(rows.filter((row) => ['校验失败', '接收拒绝'].includes(row.state)), true));
  get('leadImportDemo').addEventListener('click', () => {
    brand.value = '5';
    syncSources();
    source.value = demoSource;
    clearUpload();
    stage(['DEMO-NISSAN-001', demoDuplicate, 'DEMO-NISSAN-003'].map((id, index) => ({
      source_lead_id: id, customer_name: '测试客户 ' + (index + 1),
      customer_phone: '1990000000' + (index + 1), smartcode: demoCode,
      store_id: index === 2 ? 'DFN_SZ_NS_002' : 'DFN_GZ_PY_001',
      finance_plan_intent: '低息分期'
    })));
  });
  submit.addEventListener('click', () => {
    for (const row of rows.filter((item) => item.state === '待提交')) {
      row.reason = receive(row);
      row.state = row.reason ? '接收拒绝' : '已接收';
    }
    submitted = true;
    render();
  });
})();

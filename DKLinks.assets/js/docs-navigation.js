(() => {
  'use strict';
  if (new URLSearchParams(window.location.search).get('standalone') === '1') return;
  if (document.getElementById('dkDocsHeader')) return;

  const tabs = [
    ['prototype', '产品原型', './DKLinks.html'],
    ['system-blueprint', '系统蓝图', 'DKLinks.assets/docs/核心文档/线索下发与防死循环技术规格方案.html?v=20261023-v121-appendix-notes'],
    ['function-doc', '功能文档', 'DKLinks.assets/docs/核心文档/DKLinks_功能文档.html?v=20261026-business-scenarios'],
    ['interaction', '页面交互图', 'DKLinks.assets/docs/核心文档/DKLinks_交互流程图.html?v=20261023-blueprint-hero'],
    ['business-flow', '业务流程图', 'DKLinks.assets/docs/核心文档/业务时序图.html?v=20261026-business-scenarios'],
    ['feature-list', '功能点清单', 'DKLinks.assets/docs/核心文档/DKLinks_功能清单.html?v=20261023-sidebar-controls'],
    ['version-log', '版本号日志', 'DKLinks.assets/docs/核心文档/DKLinks_版本日志.html?v=20261026-business-scenarios'],
    ['logic-flow', '逻辑流程图', 'DKLinks.assets/docs/核心文档/DKLinks_逻辑流程图.html?v=20261023-direct-page']
  ];
  const normalizeTabId = (id) => {
    if (id === 'blueprint') return 'system-blueprint';
    if (id === 'manual') return 'function-doc';
    if (id === 'sequence') return 'business-flow';
    if (id === 'features') return 'feature-list';
    if (id === 'versions') return 'version-log';
    if (id === 'logic') return 'logic-flow';
    return id;
  };

  const header = document.createElement('header');
  header.id = 'dkDocsHeader';
  header.className = 'dk-docs-header';
  header.innerHTML = `<div class="dk-docs-brand"><span class="dk-docs-logo" aria-hidden="true">D</span><strong>D客连 · SaaS平台</strong></div>
    <nav class="dk-docs-nav" aria-label="文档与产品导航">${tabs.map(([id,label]) => `<a class="dk-docs-tab" data-docs-tab="${id}" href="#dk-${id}">${label}</a>`).join('')}</nav>
    <div class="dk-docs-tools"><button class="dk-docs-tool dk-docs-refresh" type="button" title="重新加载当前内容">↻ 刷新内容</button><a class="dk-docs-tool" id="dkDocsNewWindow" target="_blank" rel="noopener" href="./DKLinks.html" title="在新窗口打开当前内容">↗ 新窗口</a></div>`;
  const view = document.createElement('section');
  view.className = 'dk-docs-view';
  view.hidden = true;
  view.setAttribute('aria-label','文档内容');
  const loading = document.createElement('div');
  loading.className = 'dk-docs-loading';
  loading.textContent = '正在加载文档…';
  loading.hidden = true;
  view.append(loading);
  document.body.prepend(header, view);
  document.body.classList.add('dk-docs-ready');
  const resize = () => document.documentElement.style.setProperty('--dk-docs-header-height', `${header.getBoundingClientRect().height}px`);
  new ResizeObserver(resize).observe(header);
  resize();

  const frames = new Map();
  const pendingAnchors = new Map();
  let current = 'prototype';
  let prototypeScroll = 0;
  function select(id) {
    const canonicalId = normalizeTabId(id);
    const entry = tabs.find(tab => tab[0] === canonicalId) || tabs[0];
    const [key,label,path] = entry;
    if (current === 'prototype' && key !== 'prototype') prototypeScroll = window.scrollY;
    current = key;
    header.querySelectorAll('[data-docs-tab]').forEach(link => {
      if (link.dataset.docsTab === key) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    view.hidden = key === 'prototype';
    document.body.classList.toggle('dk-docs-viewing', key !== 'prototype');
    frames.forEach(frame => { frame.hidden = true; });
    const newWindow = header.querySelector('#dkDocsNewWindow');
    newWindow.href = key === 'prototype' ? './DKLinks.html?standalone=1' : path;
    newWindow.title = '在新窗口打开当前内容';
    const refresh = header.querySelector('.dk-docs-refresh');
    refresh.disabled = false;
    refresh.title = '重新加载当前内容';
    if (key === 'prototype') { loading.hidden = true; window.scrollTo(0, prototypeScroll); return; }
    if (!frames.has(key)) {
      const frame = document.createElement('iframe');
      frame.className = 'dk-docs-frame';
      frame.title = label;
      frame.addEventListener('load', () => { if (current === key) loading.hidden = true; });
      frame.src = path + (pendingAnchors.has(key) ? '#' + encodeURIComponent(pendingAnchors.get(key)) : '');
      view.append(frame);
      frames.set(key,frame);
      loading.hidden = false;
    } else {
      frames.get(key).hidden = false;
      loading.hidden = false;
      // Hide the overlay after the already-loaded document is painted.
      requestAnimationFrame(() => { if (current === key) loading.hidden = true; });
    }
  }
  let hashInitialized = false;
  const fromHash = () => {
    let hash = location.hash.replace(/^#(?:dk|dcc)-/, '');
    if (!hash || hash === location.hash) {
      hash = location.hash.startsWith('#') ? location.hash.slice(1) : 'prototype';
    }
    const tab = normalizeTabId(hash || 'prototype');
    if (hashInitialized && current === tab) return;
    hashInitialized = true;
    select(tab);
  };
  header.addEventListener('click',event => {
    const link=event.target.closest('[data-docs-tab]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const hash=`#dk-${link.dataset.docsTab}`;
    if (location.hash!==hash) history.pushState(null,'',hash);
    select(link.dataset.docsTab);
  });
  header.querySelector('.dk-docs-refresh').addEventListener('click',() => {
    location.reload();
  });
  window.addEventListener('message', event => {
    if (!event.data || event.data.type !== 'dk-docs-open') return;
    const sourceIsDoc = Array.from(frames.values()).some(frame => frame.contentWindow === event.source);
    if (!sourceIsDoc) return;
    const tab = normalizeTabId(event.data.tab);
    if (!tabs.some(entry => entry[0] === tab) || typeof event.data.anchor !== 'string') return;
    pendingAnchors.set(tab, event.data.anchor);
    history.pushState(null, '', '#dk-' + tab);
    const existingFrame = frames.get(tab);
    select(tab);
    if (existingFrame) {
      existingFrame.contentWindow.postMessage({type:'dk-docs-anchor',anchor:event.data.anchor}, '*');
    }
  });
  window.addEventListener('popstate',fromHash);
  window.addEventListener('hashchange',fromHash);
  const navigationEntry = performance.getEntriesByType('navigation')[0];
  const isReload = navigationEntry ? navigationEntry.type === 'reload' : performance.navigation && performance.navigation.type === 1;
  if (isReload) {
    history.scrollRestoration = 'manual';
    history.replaceState(null, '', `${location.pathname}${location.search}#dk-prototype`);
    window.scrollTo(0, 0);
    window.addEventListener('load', () => window.scrollTo(0, 0), {once:true});
  } else if (!location.hash.startsWith('#dk-') && !location.hash.startsWith('#dcc-')) {
    history.replaceState(null,'',`${location.pathname}${location.search}#dk-prototype`);
  }
  fromHash();
})();

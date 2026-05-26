(function () {
  const Store = window.BrandStorePageHierarchyStore;
  if (!Store || !window.BRAND_STORE_PAGE_HIERARCHY_SEED) {
    document.body.innerHTML =
      '<p style="padding:40px;color:#f87171">请加载 page-hierarchy-seed.js 与 page-hierarchy-store.js</p>';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  let data = Store.get();
  let activeTab = 'pages';
  let modalCtx = null;

  $('storageKeyLabel').textContent = Store.STORAGE_KEY;

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = `toast ${type || 'ok'}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function persist() {
    const errs = Store.validate(data);
    if (errs.length) {
      toast(errs[0], 'err');
      return false;
    }
    data = Store.save(data);
    renderAll();
    toast('已保存', 'ok');
    return true;
  }

  function isComplete(p) {
    return !!(p.scene_category && p.content_category);
  }

  function filteredPages() {
    const q = ($('qSearch').value || '').trim().toLowerCase();
    const mp = $('qMarketplace').value;
    const scene = $('qScene').value;
    const content = $('qContent').value;
    const status = $('qStatus').value;

    return (data.pages || []).filter((p) => {
      if (mp && p.marketplace !== mp) return false;
      if (scene && p.scene_category !== scene) return false;
      if (content && p.content_category !== content) return false;
      if (status === 'incomplete' && isComplete(p)) return false;
      if (status === 'active' && (!isComplete(p) || p.status === 'archived')) return false;
      if (status === 'archived' && p.status !== 'archived') return false;
      if (q && !(p.page_name_export || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderLegend() {
    const scenes = (data.scene_categories || [])
      .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
      .map((c) => `<span class="chip scene">${esc(c.label_zh)}</span>`)
      .join('');
    const contents = (data.content_categories || [])
      .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
      .map((c) => `<span class="chip content">${esc(c.label_zh)}</span>`)
      .join('');
    $('taxonomyLegend').innerHTML = `
      <div class="col"><strong>页面场景分类（每页 1 个）</strong>${scenes}</div>
      <div class="col"><strong>页面内容分类（每页 1 个）</strong>${contents}</div>`;
  }

  function renderStats() {
    const s = Store.countStats(data);
    $('statsMeta').textContent =
      `共 ${s.pages} 页 · ${s.marketplaces} 站点 · 待补全双分类 ${s.incomplete} 条 · 内容字典 ${s.contentTypes} · 场景字典 ${s.sceneTypes}`;
  }

  function fillFilters() {
    const mpSel = $('qMarketplace');
    const prevMp = mpSel.value;
    mpSel.innerHTML =
      '<option value="">全部站点</option>' +
      (data.marketplaces || [])
        .map((m) => `<option value="${esc(m.code)}">${esc(m.code)} · ${esc(m.label)}</option>`)
        .join('');
    mpSel.value = prevMp;

    const fillDict = (sel, list) => {
      const prev = sel.value;
      sel.innerHTML =
        '<option value="">全部</option>' +
        list.map((c) => `<option value="${esc(c.label_zh)}">${esc(c.label_zh)}</option>`).join('');
      sel.value = prev;
    };
    fillDict($('qScene'), data.scene_categories || []);
    fillDict($('qContent'), data.content_categories || []);
  }

  function depthClass(p) {
    const n = (p.page_path || []).length;
    if (n <= 1) return '';
    if (n === 2) return 'l1';
    return 'l2';
  }

  function renderPages() {
    const rows = filteredPages().sort((a, b) => {
      const k = `${a.marketplace}|${a.page_name_export}`;
      const k2 = `${b.marketplace}|${b.page_name_export}`;
      return k.localeCompare(k2);
    });

    $('pagesTbody').innerHTML = rows
      .map((p) => {
        const incomplete = !isComplete(p);
        const archived = p.status === 'archived';
        const depth = (p.page_path || []).length;
        const indent = depth > 1 ? `<span class="path-muted">${esc(p.parent_page_name)} › </span>` : '';
        return `<tr class="${incomplete ? 'row-warn' : ''}${archived ? ' row-archived' : ''}">
          <td><strong>${esc(p.marketplace)}</strong></td>
          <td class="tree-indent ${depthClass(p)}">${indent}<span>${esc(p.page_title || p.page_name_export)}</span>
            <div class="path-muted" style="margin-top:2px">${esc(p.page_name_export)}</div></td>
          <td>${depth} 级</td>
          <td>${p.scene_category ? `<span class="chip scene">${esc(p.scene_category)}</span>` : '<span class="tag warn">未设置</span>'}</td>
          <td>${p.content_category ? `<span class="chip content">${esc(p.content_category)}</span>` : '<span class="tag warn">未设置</span>'}</td>
          <td>${archived ? '<span class="tag off">归档</span>' : incomplete ? '<span class="tag warn">待补全</span>' : '<span class="tag ok">已维护</span>'}</td>
          <td><button type="button" class="btn-link" data-edit="${esc(p.page_id)}">编辑</button></td>
        </tr>`;
      })
      .join('');
  }

  function renderTree() {
    const mp = $('qMarketplace').value || 'US';
    const pages = (data.pages || [])
      .filter((p) => p.marketplace === mp)
      .sort((a, b) => (a.page_name_export || '').localeCompare(b.page_name_export || ''));

    if (!pages.length) {
      $('treeView').innerHTML = `<p style="color:var(--muted)">站点 ${esc(mp)} 无页面，请切换站点筛选。</p>`;
      return;
    }

    const root = {};
    pages.forEach((p) => {
      const parts = p.page_path || [p.page_name_export];
      let node = root;
      parts.forEach((part, i) => {
        if (!node[part]) node[part] = { _children: {}, _pages: [] };
        if (i === parts.length - 1) node[part]._pages.push(p);
        node = node[part]._children;
      });
    });

    function walk(node, depth) {
      return Object.keys(node)
        .sort()
        .map((key) => {
          const n = node[key];
          const pad = depth * 16;
          const pageRows = (n._pages || [])
            .map(
              (p) =>
                `<div style="padding:4px 0 4px ${pad + 16}px;font-size:0.76rem;color:var(--muted)">
                  <span class="chip scene">${esc(p.scene_category || '—')}</span>
                  <span class="chip content">${esc(p.content_category || '—')}</span>
                  ${!isComplete(p) ? '<span class="tag warn">待补全</span>' : ''}
                </div>`
            )
            .join('');
          const childHtml = walk(n._children, depth + 1);
          return `<div style="margin:4px 0">
            <div style="padding:6px 0 6px ${pad}px;font-weight:600;font-size:0.84rem">${esc(key)}</div>
            ${pageRows}
            ${childHtml}
          </div>`;
        })
        .join('');
    }

    $('treeView').innerHTML = `<p style="font-size:0.78rem;color:var(--muted);margin:0 0 10px">当前树：站点 <strong>${esc(mp)}</strong>（${pages.length} 页）</p>${walk(root, 0)}`;
  }

  function renderDict() {
    $('sceneDictTbody').innerHTML = (data.scene_categories || [])
      .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
      .map(
        (c) => `<tr>
        <td>${esc(c.sort_order)}</td>
        <td><code>${esc(c.code)}</code></td>
        <td>${esc(c.label_zh)}</td>
        <td>${c.kind === 'campaign' ? '活动' : '基础'}</td>
        <td><button type="button" class="btn-link" data-edit-scene="${esc(c.code)}">编辑</button></td>
      </tr>`
      )
      .join('');

    $('contentDictTbody').innerHTML = (data.content_categories || [])
      .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
      .map(
        (c) => `<tr>
        <td>${esc(c.sort_order)}</td>
        <td><code>${esc(c.code)}</code></td>
        <td>${esc(c.label_zh)}</td>
        <td style="color:var(--muted);font-size:0.74rem">${esc(c.description || '')}</td>
        <td><button type="button" class="btn-link" data-edit-content="${esc(c.code)}">编辑</button></td>
      </tr>`
      )
      .join('');
  }

  function renderSnapshots() {
    const snaps = data.mapping_snapshots || [];
    $('snapshotsTbody').innerHTML =
      snaps.length === 0
        ? '<tr><td colspan="4" style="color:var(--muted)">暂无快照。每月由 SO 固化一次，供看板历史归属。</td></tr>'
        : snaps
            .map(
              (s) => `<tr>
            <td><strong>${esc(s.month)}</strong></td>
            <td style="font-size:0.74rem;color:var(--muted)">${esc((s.frozen_at || '').slice(0, 19).replace('T', ' '))}</td>
            <td>${esc(s.page_count)}</td>
            <td><button type="button" class="btn-link" data-view-snap="${esc(s.snapshot_id)}">查看</button></td>
          </tr>`
            )
            .join('');
  }

  function renderAll() {
    renderLegend();
    renderStats();
    fillFilters();
    renderPages();
    if (activeTab === 'tree') renderTree();
    renderDict();
    renderSnapshots();
  }

  function openModal(title, fields, onOk) {
    $('modalTitle').textContent = title;
    $('modalForm').innerHTML = fields
      .map(
        (f) => `<label>${esc(f.label)}
        ${f.type === 'select'
          ? `<select name="${esc(f.name)}" ${f.required ? 'required' : ''}>${(f.options || [])
              .map((o) => `<option value="${esc(o.value)}"${o.value === f.value ? ' selected' : ''}>${esc(o.label)}</option>`)
              .join('')}</select>`
          : f.type === 'textarea'
            ? `<textarea name="${esc(f.name)}" rows="3">${esc(f.value || '')}</textarea>`
            : `<input name="${esc(f.name)}" type="${f.type || 'text'}" value="${esc(f.value || '')}" ${f.required ? 'required' : ''} ${f.readonly ? 'readonly' : ''} />`}
      </label>`
      )
      .join('');
    modalCtx = { onOk };
    $('modalBackdrop').hidden = false;
  }

  function closeModal() {
    $('modalBackdrop').hidden = true;
    modalCtx = null;
  }

  function formValues() {
    const fd = new FormData($('modalForm'));
    const o = {};
    fd.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  }

  function sceneOptions(selected) {
    return (data.scene_categories || []).map((c) => ({
      value: c.label_zh,
      label: c.label_zh,
      selected: c.label_zh === selected,
    }));
  }

  function contentOptions(selected) {
    return (data.content_categories || []).map((c) => ({
      value: c.label_zh,
      label: c.label_zh,
      selected: c.label_zh === selected,
    }));
  }

  function editPage(pageId) {
    const p = data.pages.find((x) => x.page_id === pageId);
    if (!p) return;
    openModal('编辑页面 · 双分类', [
      { label: '站点', name: 'marketplace', value: p.marketplace, readonly: true },
      { label: '后台导出页面名称', name: 'page_name_export', value: p.page_name_export, readonly: true },
      {
        label: '页面场景分类 *',
        name: 'scene_category',
        type: 'select',
        required: true,
        value: p.scene_category,
        options: [{ value: '', label: '— 请选择 —' }, ...sceneOptions(p.scene_category)],
      },
      {
        label: '页面内容分类 *',
        name: 'content_category',
        type: 'select',
        required: true,
        value: p.content_category,
        options: [{ value: '', label: '— 请选择 —' }, ...contentOptions(p.content_category)],
      },
      {
        label: '状态',
        name: 'status',
        type: 'select',
        value: p.status || 'active',
        options: [
          { value: 'active', label: 'active · 在店' },
          { value: 'archived', label: 'archived · 已下线归档' },
        ],
      },
      { label: '备注', name: 'notes', type: 'textarea', value: p.notes || '' },
    ], () => {
      const v = formValues();
      p.scene_category = v.scene_category || null;
      p.content_category = v.content_category || null;
      p.status = v.status || 'active';
      p.notes = v.notes || '';
      p.updated_at = new Date().toISOString();
      closeModal();
      renderAll();
    });
  }

  function addPage() {
    const mp = $('qMarketplace').value || 'US';
    openModal('登记新页面（待 Amazon 同步 page_id）', [
      {
        label: '站点 *',
        name: 'marketplace',
        type: 'select',
        value: mp,
        options: (data.marketplaces || []).map((m) => ({ value: m.code, label: `${m.code} · ${m.label}` })),
      },
      { label: '后台导出页面名称 *', name: 'page_name_export', required: true, placeholder: 'Parent › Child' },
      {
        label: '页面场景分类 *',
        name: 'scene_category',
        type: 'select',
        required: true,
        options: [{ value: '', label: '— 请选择 —' }, ...sceneOptions()],
      },
      {
        label: '页面内容分类 *',
        name: 'content_category',
        type: 'select',
        required: true,
        options: [{ value: '', label: '— 请选择 —' }, ...contentOptions()],
      },
    ], () => {
      const v = formValues();
      const name = (v.page_name_export || '').trim();
      if (!name) {
        toast('请填写页面名称', 'err');
        return;
      }
      const pathInfo = Store.parsePagePath(name);
      const id = `${v.marketplace}_${Date.now().toString(36)}`;
      data.pages.push({
        page_id: id,
        marketplace: v.marketplace,
        page_name_export: name,
        ...pathInfo,
        scene_category: v.scene_category,
        content_category: v.content_category,
        status: 'active',
        source: 'manual',
        created_at: new Date().toISOString(),
      });
      closeModal();
      renderAll();
      toast('已添加页面（记得保存）', 'ok');
    });
  }

  function editDictEntry(kind, code) {
    const list = kind === 'scene' ? data.scene_categories : data.content_categories;
    const item = list.find((x) => x.code === code);
    if (!item) return;
    const fields =
      kind === 'scene'
        ? [
            { label: 'code', name: 'code', value: item.code, readonly: true },
            { label: '中文名 *', name: 'label_zh', value: item.label_zh, required: true },
            { label: '排序', name: 'sort_order', type: 'number', value: item.sort_order },
            {
              label: '类型',
              name: 'kind',
              type: 'select',
              value: item.kind || 'base',
              options: [
                { value: 'base', label: '基础场景' },
                { value: 'campaign', label: '活动场景' },
              ],
            },
          ]
        : [
            { label: 'code', name: 'code', value: item.code, readonly: true },
            { label: '中文名 *', name: 'label_zh', value: item.label_zh, required: true },
            { label: '排序', name: 'sort_order', type: 'number', value: item.sort_order },
            { label: '说明', name: 'description', type: 'textarea', value: item.description || '' },
          ];
    openModal(`编辑${kind === 'scene' ? '场景' : '内容'}分类`, fields, () => {
      const v = formValues();
      item.label_zh = v.label_zh;
      item.sort_order = Number(v.sort_order) || item.sort_order;
      if (kind === 'scene') item.kind = v.kind;
      else item.description = v.description;
      closeModal();
      renderAll();
    });
  }

  function bindEvents() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeTab = tab.getAttribute('data-tab');
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.tab-panel').forEach((p) => {
          const id = `tab-${activeTab}`;
          p.hidden = p.id !== id;
        });
        if (activeTab === 'tree') renderTree();
      });
    });

    ['qSearch', 'qMarketplace', 'qScene', 'qContent', 'qStatus'].forEach((id) => {
      $(id).addEventListener('input', () => {
        renderPages();
        if (activeTab === 'tree') renderTree();
      });
      $(id).addEventListener('change', () => {
        renderPages();
        if (activeTab === 'tree') renderTree();
      });
    });

    $('btnSave').addEventListener('click', persist);
    $('btnReset').addEventListener('click', () => {
      if (!confirm('重置为 xlsx 种子数据？将清除 localStorage 中的修改。')) return;
      data = Store.reset() || Store.get();
      renderAll();
      toast('已重置为种子', 'ok');
    });
    $('btnAddPage').addEventListener('click', addPage);

    $('pagesTbody').addEventListener('click', (e) => {
      const id = e.target.closest('[data-edit]')?.getAttribute('data-edit');
      if (id) editPage(id);
    });

    $('sceneDictTbody').addEventListener('click', (e) => {
      const code = e.target.closest('[data-edit-scene]')?.getAttribute('data-edit-scene');
      if (code) editDictEntry('scene', code);
    });
    $('contentDictTbody').addEventListener('click', (e) => {
      const code = e.target.closest('[data-edit-content]')?.getAttribute('data-edit-content');
      if (code) editDictEntry('content', code);
    });

    $('btnFreezeSnapshot').addEventListener('click', () => {
      const month = new Date().toISOString().slice(0, 7);
      const snap = Store.ensureSnapshot(data, month);
      if (!snap) {
        toast(`${month} 快照已存在`, 'err');
        return;
      }
      persist();
      toast(`已固化 ${month} 映射快照（${snap.page_count} 页）`, 'ok');
    });

    $('snapshotsTbody').addEventListener('click', (e) => {
      const id = e.target.closest('[data-view-snap]')?.getAttribute('data-view-snap');
      if (!id) return;
      const snap = (data.mapping_snapshots || []).find((s) => s.snapshot_id === id);
      if (snap) alert(`快照 ${snap.month}\n共 ${snap.page_count} 页\n\n正式环境可下钻对比当月 vs 当前映射差异。`);
    });

    $('modalCancel').addEventListener('click', closeModal);
    $('modalOk').addEventListener('click', () => modalCtx?.onOk?.());
    $('modalBackdrop').addEventListener('click', (e) => {
      if (e.target === $('modalBackdrop')) closeModal();
    });
  }

  bindEvents();
  renderAll();
})();

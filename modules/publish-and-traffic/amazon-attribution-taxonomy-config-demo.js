(function () {
  const Store = window.TaxonomyConfigStore;
  if (!Store || !window.ATTRIBUTION_WIZARD_DATA) {
    document.body.innerHTML =
      '<p style="padding:40px;color:#f87171">请加载 amazon-attribution-tag-wizard-data.js 与 amazon-attribution-taxonomy-config-store.js</p>';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  let config = Store.get();
  let activeTab = 'adtypes';
  let selectedChannel = config.amazon_channel_groups[0]?.amazon_channel || 'search';
  const expandedMajors = new Set();

  let modalCtx = null;

  function persist() {
    const errs = Store.validate(config);
    if (errs.length) {
      toast(errs[0], 'err');
      return false;
    }
    config = Store.save(config);
    renderAll();
    toast('已保存并同步至向导字典', 'ok');
    return true;
  }

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = `toast ${type || 'ok'}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function renderStats() {
    const s = Store.countStats(config);
    const v = config.taxonomy_version || '—';
    const ef = config.effective_from || '—';
    $('statsMeta').textContent =
      `v${v} · 生效 ${ef} · ${s.channels} 广告类型 · ${s.majors} 大类 · ${s.minors} 子类`;
  }

  function renderChannels() {
    const groups = [...config.amazon_channel_groups].sort(
      (a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99)
    );
    $('channelTbody').innerHTML = groups
      .map((ch, i) => {
        const disabled = ch.enabled === false;
        const majors = (ch.strategies || []).length;
        return `<tr class="${disabled ? 'disabled-row' : ''}">
          <td>${esc(ch.sort_order ?? i + 1)}</td>
          <td><code>${esc(ch.amazon_channel)}</code></td>
          <td>${esc(ch.console_label)}</td>
          <td>${esc(ch.label_zh)}</td>
          <td>${majors}</td>
          <td>${disabled ? '<span class="tag off">停用</span>' : '<span class="tag p0">启用</span>'}</td>
          <td class="actions">
            <button type="button" class="btn-link" data-act="edit-ch" data-ch="${esc(ch.amazon_channel)}">编辑</button>
            <button type="button" class="btn-link" data-act="del-ch" data-ch="${esc(ch.amazon_channel)}">删除</button>
          </td>
        </tr>`;
      })
      .join('');
  }

  function renderChannelPills() {
    $('channelPills').innerHTML = config.amazon_channel_groups
      .map((ch) => {
        const n = (ch.strategies || []).length;
        const active = ch.amazon_channel === selectedChannel;
        return `<button type="button" class="pill${active ? ' active' : ''}" data-ch="${esc(ch.amazon_channel)}">
          ${esc(ch.label_zh || ch.console_label)}<span class="cnt">${n}</span>
        </button>`;
      })
      .join('');
  }

  function renderStrategyTree() {
    const ch = Store.findChannel(config.amazon_channel_groups, selectedChannel);
    const tree = $('strategyTree');
    if (!ch) {
      tree.innerHTML = '<div class="empty">请选择广告类型</div>';
      return;
    }
    const majors = ch.strategies || [];
    if (!majors.length) {
      tree.innerHTML =
        '<div class="empty">该广告类型下暂无营销大类，点击「新增大类」</div>';
      return;
    }
    tree.innerHTML = majors
      .map((maj) => {
        const open = expandedMajors.has(maj.strategy_major_code);
        const minors = maj.minors || [];
        const tags = [
          maj.p0_wizard ? '<span class="tag p0">P0</span>' : '',
          maj.supports_bulk ? '<span class="tag bulk">Bulk</span>' : '',
        ].join('');
        const minorRows = minors
          .map((min) => {
            const mtags = min.p0_wizard ? '<span class="tag p0">P0</span>' : '';
            return `<tr>
              <td><code>${esc(min.strategy_minor_code)}</code></td>
              <td>${esc(min.label_zh)}</td>
              <td><code>${esc(min.name_short)}</code></td>
              <td><code>${esc(min.name_short_suffix)}</code></td>
              <td>${mtags}</td>
              <td class="actions">
                <button type="button" class="btn-link" data-act="edit-min" data-maj="${esc(maj.strategy_major_code)}" data-min="${esc(min.strategy_minor_code)}">编辑</button>
                <button type="button" class="btn-link" data-act="del-min" data-maj="${esc(maj.strategy_major_code)}" data-min="${esc(min.strategy_minor_code)}">删除</button>
              </td>
            </tr>`;
          })
          .join('');
        return `<div class="major-block">
          <div class="major-head" data-toggle="${esc(maj.strategy_major_code)}">
            <h3>${esc(maj.label_zh)} ${tags}</h3>
            <span class="codes"><code>${esc(maj.strategy_major_code)}</code> · ${esc(maj.name_short_major)} · ${minors.length} 子类</span>
            <span class="actions" data-stop>
              <button type="button" class="btn-link" data-act="add-min" data-maj="${esc(maj.strategy_major_code)}">+ 子类</button>
              <button type="button" class="btn-link" data-act="edit-maj" data-maj="${esc(maj.strategy_major_code)}">编辑</button>
              <button type="button" class="btn-link" data-act="del-maj" data-maj="${esc(maj.strategy_major_code)}">删除</button>
            </span>
          </div>
          ${open ? `<div class="minor-table"><table>
            <thead><tr>
              <th>子类代码</th><th>中文名</th><th>name_short</th><th>后缀</th><th></th><th>操作</th>
            </tr></thead>
            <tbody>${minorRows || '<tr><td colspan="6" class="empty">暂无子类</td></tr>'}</tbody>
          </table></div>` : ''}
        </div>`;
      })
      .join('');
  }

  function renderAll() {
    renderStats();
    renderChannels();
    renderChannelPills();
    renderStrategyTree();
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    $('panelAdtypes').hidden = tab !== 'adtypes';
    $('panelStrategy').hidden = tab !== 'strategy';
  }

  function openModal(title, fields, onSave) {
    modalCtx = { onSave };
    $('modalTitle').textContent = title;
    $('modalForm').innerHTML = fields
      .map((f) => {
        if (f.type === 'checkbox') {
          return `<label class="form-check">
            <input type="checkbox" name="${f.name}" ${f.checked ? 'checked' : ''} />
            ${esc(f.label)}
          </label>`;
        }
        if (f.type === 'textarea') {
          return `<label>${esc(f.label)}
            <textarea name="${f.name}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>
          </label>`;
        }
        const ro = f.readonly ? ' readonly' : '';
        return `<label>${esc(f.label)}
          <input type="${f.type || 'text'}" name="${f.name}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}"${ro} />
        </label>`;
      })
      .join('');
    $('modalBackdrop').hidden = false;
  }

  function closeModal() {
    $('modalBackdrop').hidden = true;
    modalCtx = null;
  }

  function formValues() {
    const out = {};
    $('modalForm').querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else out[el.name] = el.value.trim();
    });
    return out;
  }

  function slugCode(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  function openChannelModal(mode, channelCode) {
    const ch =
      mode === 'edit' ? Store.findChannel(config.amazon_channel_groups, channelCode) : null;
    openModal(mode === 'edit' ? '编辑广告类型' : '新增广告类型', [
      {
        name: 'amazon_channel',
        label: '代码 amazon_channel',
        value: ch?.amazon_channel || '',
        placeholder: 'search',
        readonly: mode === 'edit',
      },
      { name: 'console_label', label: 'Console 显示', value: ch?.console_label || '' },
      { name: 'label_zh', label: '中文名', value: ch?.label_zh || '' },
      { name: 'sort_order', label: '排序', value: ch?.sort_order ?? config.amazon_channel_groups.length + 1 },
      { name: 'enabled', label: '启用', type: 'checkbox', checked: ch?.enabled !== false },
    ], () => {
      const v = formValues();
      const code = slugCode(v.amazon_channel);
      if (!code) return toast('请填写代码', 'err');
      if (mode === 'add' && Store.findChannel(config.amazon_channel_groups, code)) {
        return toast('代码已存在', 'err');
      }
      const row = {
        amazon_channel: code,
        console_label: v.console_label || code,
        label_zh: v.label_zh || v.console_label,
        sort_order: parseInt(v.sort_order, 10) || 99,
        enabled: !!v.enabled,
        strategies: ch?.strategies || [],
      };
      if (mode === 'add') {
        config.amazon_channel_groups.push(row);
        selectedChannel = code;
      } else {
        const idx = config.amazon_channel_groups.findIndex((g) => g.amazon_channel === channelCode);
        if (idx >= 0) config.amazon_channel_groups[idx] = { ...config.amazon_channel_groups[idx], ...row };
      }
      closeModal();
      persist();
    });
  }

  function openMajorModal(mode, majorCode) {
    const ch = Store.findChannel(config.amazon_channel_groups, selectedChannel);
    if (!ch) return toast('请先选择广告类型', 'err');
    const maj = mode === 'edit' ? Store.findMajor(ch, majorCode) : null;
    openModal(mode === 'edit' ? '编辑营销大类' : '新增营销大类', [
      {
        name: 'strategy_major_code',
        label: '大类代码',
        value: maj?.strategy_major_code || '',
        readonly: mode === 'edit',
      },
      { name: 'label_zh', label: '中文名', value: maj?.label_zh || '' },
      { name: 'name_short_major', label: '大类短码 name_short_major', value: maj?.name_short_major || '' },
      { name: 'ga4_channel', label: 'GA4 渠道（可选）', value: maj?.ga4_channel || '' },
      { name: 'p0_wizard', label: 'P0 向导', type: 'checkbox', checked: maj?.p0_wizard !== false },
      { name: 'supports_bulk', label: '支持 Bulk', type: 'checkbox', checked: !!maj?.supports_bulk },
    ], () => {
      const v = formValues();
      const code = slugCode(v.strategy_major_code);
      if (!code) return toast('请填写大类代码', 'err');
      const dup = config.amazon_channel_groups.some((g) =>
        (g.strategies || []).some(
          (m) =>
            m.strategy_major_code === code &&
            !(mode === 'edit' && m.strategy_major_code === majorCode)
        )
      );
      if (dup) return toast('大类代码全局重复', 'err');
      const row = {
        strategy_major_code: code,
        label_zh: v.label_zh || code,
        name_short_major: (v.name_short_major || '').toUpperCase(),
        ga4_channel: v.ga4_channel || '',
        p0_wizard: !!v.p0_wizard,
        supports_bulk: !!v.supports_bulk,
        minors: maj?.minors || [],
      };
      if (!ch.strategies) ch.strategies = [];
      if (mode === 'add') ch.strategies.push(row);
      else {
        const idx = ch.strategies.findIndex((m) => m.strategy_major_code === majorCode);
        if (idx >= 0) ch.strategies[idx] = { ...ch.strategies[idx], ...row };
        (ch.strategies[idx]?.minors || []).forEach((min) => Store.syncMinorNameShort(ch.strategies[idx], min));
      }
      expandedMajors.add(code);
      closeModal();
      persist();
    });
  }

  function openMinorModal(mode, majorCode, minorCode) {
    const ch = Store.findChannel(config.amazon_channel_groups, selectedChannel);
    const maj = Store.findMajor(ch, majorCode);
    if (!maj) return;
    const min = mode === 'edit' ? Store.findMinor(maj, minorCode) : null;
    openModal(mode === 'edit' ? '编辑营销子类' : '新增营销子类', [
      {
        name: 'strategy_minor_code',
        label: '子类代码',
        value: min?.strategy_minor_code || '',
        readonly: mode === 'edit',
      },
      { name: 'label_zh', label: '中文名', value: min?.label_zh || '' },
      { name: 'name_short_suffix', label: '短码后缀', value: min?.name_short_suffix || '' },
      {
        name: 'typical_publishers',
        label: '典型 Publisher（逗号分隔）',
        type: 'textarea',
        value: (min?.typical_publishers || []).join(', '),
      },
      { name: 'p0_wizard', label: 'P0 向导', type: 'checkbox', checked: min?.p0_wizard !== false },
    ], () => {
      const v = formValues();
      const code = slugCode(v.strategy_minor_code);
      if (!code) return toast('请填写子类代码', 'err');
      let dup = false;
      config.amazon_channel_groups.forEach((g) => {
        (g.strategies || []).forEach((m) => {
          (m.minors || []).forEach((x) => {
            if (x.strategy_minor_code === code && x !== min) dup = true;
          });
        });
      });
      if (dup) return toast('子类代码全局重复', 'err');
      const suffix = (v.name_short_suffix || '').toUpperCase();
      const row = {
        strategy_minor_code: code,
        label_zh: v.label_zh || code,
        name_short_suffix: suffix,
        name_short: (maj.name_short_major || '') + suffix,
        p0_wizard: !!v.p0_wizard,
        typical_publishers: (v.typical_publishers || '')
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (!maj.minors) maj.minors = [];
      if (mode === 'add') maj.minors.push(row);
      else {
        const idx = maj.minors.findIndex((m) => m.strategy_minor_code === minorCode);
        if (idx >= 0) maj.minors[idx] = { ...maj.minors[idx], ...row };
      }
      expandedMajors.add(majorCode);
      closeModal();
      persist();
    });
  }

  function deleteChannel(code) {
    const ch = Store.findChannel(config.amazon_channel_groups, code);
    const n = (ch?.strategies || []).length;
    if (n && !confirm(`删除广告类型 ${code}？其下 ${n} 个大类将一并删除。`)) return;
    config.amazon_channel_groups = config.amazon_channel_groups.filter((g) => g.amazon_channel !== code);
    if (selectedChannel === code) {
      selectedChannel = config.amazon_channel_groups[0]?.amazon_channel || '';
    }
    persist();
  }

  function deleteMajor(majorCode) {
    const ch = Store.findChannel(config.amazon_channel_groups, selectedChannel);
    const maj = Store.findMajor(ch, majorCode);
    const n = (maj?.minors || []).length;
    const msg =
      n > 0
        ? `删除大类 ${majorCode}？其下 ${n} 个子类将一并删除。`
        : `确认删除大类 ${majorCode}？`;
    if (!confirm(msg)) return;
    ch.strategies = (ch.strategies || []).filter((m) => m.strategy_major_code !== majorCode);
    expandedMajors.delete(majorCode);
    persist();
  }

  function deleteMinor(majorCode, minorCode) {
    if (!confirm(`确认删除子类 ${minorCode}？`)) return;
    const ch = Store.findChannel(config.amazon_channel_groups, selectedChannel);
    const maj = Store.findMajor(ch, majorCode);
    maj.minors = (maj.minors || []).filter((m) => m.strategy_minor_code !== minorCode);
    persist();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attribution-taxonomy-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function bindEvents() {
    document.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => switchTab(t.dataset.tab));
    });

    $('btnAddChannel').addEventListener('click', () => openChannelModal('add'));
    $('btnAddMajor').addEventListener('click', () => openMajorModal('add'));
    $('btnReset').addEventListener('click', () => {
      if (!confirm('恢复为 wizard-data 种子？本地修改将丢失。')) return;
      config = Store.reset() || Store.get();
      expandedMajors.clear();
      renderAll();
      toast('已恢复种子', 'ok');
    });
    $('btnExport').addEventListener('click', exportJson);
    $('modalCancel').addEventListener('click', closeModal);
    $('modalBackdrop').addEventListener('click', (e) => {
      if (e.target === $('modalBackdrop')) closeModal();
    });
    $('modalSave').addEventListener('click', () => modalCtx?.onSave?.());

    $('channelTbody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const ch = btn.dataset.ch;
      if (btn.dataset.act === 'edit-ch') openChannelModal('edit', ch);
      if (btn.dataset.act === 'del-ch') deleteChannel(ch);
    });

    $('channelPills').addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      selectedChannel = pill.dataset.ch;
      renderChannelPills();
      renderStrategyTree();
    });

    $('strategyTree').addEventListener('click', (e) => {
      if (e.target.closest('[data-stop]')) e.stopPropagation();
      const btn = e.target.closest('[data-act]');
      if (btn) {
        const maj = btn.dataset.maj;
        const min = btn.dataset.min;
        const act = btn.dataset.act;
        if (act === 'edit-maj') openMajorModal('edit', maj);
        if (act === 'add-min') openMinorModal('add', maj);
        if (act === 'edit-min') openMinorModal('edit', maj, min);
        if (act === 'del-maj') deleteMajor(maj);
        if (act === 'del-min') deleteMinor(maj, min);
        return;
      }
      const head = e.target.closest('.major-head[data-toggle]');
      if (head) {
        const code = head.dataset.toggle;
        if (expandedMajors.has(code)) expandedMajors.delete(code);
        else expandedMajors.add(code);
        renderStrategyTree();
      }
    });
  }

  config.amazon_channel_groups.forEach((ch) => {
    if (ch.enabled === undefined) ch.enabled = true;
    if (ch.sort_order === undefined) ch.sort_order = 99;
  });
  expandedMajors.add(
    ...(Store.findChannel(config.amazon_channel_groups, selectedChannel)?.strategies || [])
      .slice(0, 2)
      .map((m) => m.strategy_major_code)
  );

  bindEvents();
  renderAll();
})();

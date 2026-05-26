(function () {
  const DATA = window.ATTRIBUTION_WIZARD_DATA;
  if (!DATA) {
    document.body.innerHTML =
      '<p style="padding:40px;color:#f87171">未加载字典数据，请确保同目录存在 amazon-attribution-tag-wizard-data.js</p>';
    return;
  }

  const TAX = DATA.taxonomy;
  const PUB = DATA.publishers;
  const ERP = PUB.erp_publisher_wizard;

  const DEMO_MSKUS = ['H6076113-US', 'H6062112-US', 'H61991A1-US', 'B08XXXX123-US'];

  const DEMO_SHOPS = [
    { brand: 'Govee', marketplace: 'US', label: 'Govee · 美国站 (US)' },
    { brand: 'Govee', marketplace: 'CA', label: 'Govee · 加拿大 (CA)' },
    { brand: 'Govee', marketplace: 'UK', label: 'Govee · 英国站 (UK)' },
    { brand: 'Govee', marketplace: 'DE', label: 'Govee · 德国站 (DE)' },
    { brand: 'Govee', marketplace: 'FR', label: 'Govee · 法国站 (FR)' },
    { brand: 'Govee', marketplace: 'IT', label: 'Govee · 意大利站 (IT)' },
    { brand: 'Govee', marketplace: 'ES', label: 'Govee · 西班牙站 (ES)' },
    { brand: 'GoveeLife', marketplace: 'US', label: 'GoveeLife · 美国站 (US)' },
    { brand: 'GoveeLife', marketplace: 'CA', label: 'GoveeLife · 加拿大 (CA)' },
  ];

  const state = {
    targeting: 'P',
    mskus: new Set(['H6076113-US']),
    amazon_channel: null,
    strategy_major: null,
    strategy_minor: null,
    name_short: null,
    publisher_category_kind: null,
    publisher_category_code: null,
    publisher_name: null,
    console_publisher_mode: null,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  function toPascalCase(raw) {
    return String(raw || '')
      .trim()
      .split(/[\s_\-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
  }

  function sanitizeSegment(raw) {
    return String(raw || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9\-_]/g, '');
  }

  function formatDateYmd() {
    const d = $('launchDate').value || new Date().toISOString().slice(0, 10);
    return d.replace(/-/g, '');
  }

  function getMskuSegment() {
    const n = state.mskus.size;
    if (n === 0) return '';
    if (n === 1) return [...state.mskus][0];
    return 'MultipleSKUs';
  }

  function getLandingSegment() {
    if (state.targeting === 'P') return 'PDP';
    const custom = ($('landingStoreCustom').value || '').trim();
    if (custom) return toPascalCase(custom);
    return $('landingStore').value || '';
  }

  function getAdTypeLabel() {
    if (!state.amazon_channel) return '';
    const g = TAX.amazon_channel_groups.find((x) => x.amazon_channel === state.amazon_channel);
    return g ? g.console_label : '';
  }

  function buildStrategyIndex() {
    const majors = new Map();
    TAX.amazon_channel_groups.forEach((ch) => {
      ch.strategies.forEach((m) => {
        if (!majors.has(m.strategy_major_code)) {
          majors.set(m.strategy_major_code, {
            strategy_major_code: m.strategy_major_code,
            label_zh: m.label_zh,
            name_short_major: m.name_short_major,
            channels: new Set(),
            minors: new Map(),
          });
        }
        const maj = majors.get(m.strategy_major_code);
        maj.channels.add(ch.amazon_channel);
        m.minors.forEach((min) => {
          if (!maj.minors.has(min.strategy_minor_code)) {
            maj.minors.set(min.strategy_minor_code, {
              ...min,
              channels: new Set(),
            });
          }
          maj.minors.get(min.strategy_minor_code).channels.add(ch.amazon_channel);
        });
      });
    });
    return majors;
  }

  const STRATEGY_INDEX = buildStrategyIndex();

  function getFilteredMajors() {
    const list = [...STRATEGY_INDEX.values()];
    if (!state.amazon_channel) return list;
    return list.filter((m) => m.channels.has(state.amazon_channel));
  }

  function getSelectedMajor() {
    return STRATEGY_INDEX.get(state.strategy_major) || null;
  }

  function getFilteredMinors() {
    const maj = getSelectedMajor();
    if (!maj) return [];
    let minors = [...maj.minors.values()];
    if (state.amazon_channel) {
      minors = minors.filter((x) => x.channels.has(state.amazon_channel));
    }
    return minors;
  }

  function getSelectedShop() {
    const el = $('shop');
    const opt = el.selectedOptions[0];
    if (!opt) return DEMO_SHOPS[0];
    return {
      brand: opt.dataset.brand,
      marketplace: opt.dataset.marketplace,
      label: opt.textContent,
    };
  }

  function buildUnifiedName() {
    const shop = getSelectedShop();
    const brand = shop.brand;
    const site = shop.marketplace;
    const target = state.targeting;
    const msku = getMskuSegment();
    const campaign = sanitizeSegment($('campaignName').value);
    const landing = getLandingSegment();
    const publisher =
      sanitizeSegment(state.publisher_name) ||
      String(state.publisher_name || '').trim().replace(/\s+/g, '');
    const adType = getAdTypeLabel();
    const shortcode = state.name_short || '';
    const date = formatDateYmd();

    const parts = [
      brand,
      site,
      target,
      msku,
      campaign,
      landing,
      adType,
      shortcode,
      publisher,
      date,
    ];
    return parts.filter((p) => p !== '').join('_');
  }

  function canPreview() {
    return (
      state.mskus.size > 0 &&
      sanitizeSegment($('campaignName').value) &&
      getLandingSegment() &&
      state.publisher_name &&
      state.name_short &&
      state.amazon_channel &&
      $('launchDate').value
    );
  }

  function updatePreview() {
    const name = canPreview() ? buildUnifiedName() : '—';
    $('canonicalPreview').textContent = name;
    $('ckName').textContent = name;
    $('ckChannel').textContent = getAdTypeLabel() || '—';
    $('ckPublisher').textContent = state.publisher_name || '—';

    const shop = getSelectedShop();
    const rows = [
      ['shop', `${shop.brand}_${shop.marketplace}`],
      ['shop_label', shop.label],
      ['targeting', state.targeting],
      ['msku', getMskuSegment() || '—'],
      ['campaign_name', sanitizeSegment($('campaignName').value) || '—'],
      ['landing_page', getLandingSegment() || '—'],
      ['ad_type', getAdTypeLabel() || '—'],
      ['name_short', state.name_short || '—'],
      ['publisher', state.publisher_name || '—'],
      ['publisher_category', state.publisher_category_code || '—'],
      ['console_mode', state.console_publisher_mode || '—'],
      ['strategy_major', state.strategy_major || '—'],
      ['strategy_minor', state.strategy_minor || '—'],
      ['launch_date', formatDateYmd()],
    ];
    $('kvPreview').innerHTML = rows
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`)
      .join('');
    renderConfirm();
  }

  function syncLandingUi() {
    const isProduct = state.targeting === 'P';
    $('landingProductWrap').hidden = !isProduct;
    $('landingStoreWrap').hidden = isProduct;
    updatePreview();
  }

  function renderMskuChips() {
    $('mskuChips').innerHTML = DEMO_MSKUS.map((sku) => {
      const sel = state.mskus.has(sku);
      return `<button type="button" class="chip${sel ? ' selected' : ''}" data-sku="${sku}">${esc(sku)}</button>`;
    }).join('');
    $('mskuChips').querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sku = btn.dataset.sku;
        if (state.mskus.has(sku)) state.mskus.delete(sku);
        else state.mskus.add(sku);
        if (state.mskus.size === 0) state.mskus.add(sku);
        renderMskuChips();
        updatePreview();
      });
    });
    const n = state.mskus.size;
    $('mskuHint').innerHTML =
      n >= 2
        ? '已选多个 MSKU，命名段为 <code>MultipleSKUs</code>'
        : '可多选；选 2 个及以上时命名段为 <code>MultipleSKUs</code>';
  }

  function renderAdTypes() {
    const items = TAX.amazon_channel_groups
      .filter((g) => g.enabled !== false)
      .map((g) => ({
      value: g.amazon_channel,
      label: g.console_label,
      sub: g.label_zh,
    }));
    if (!state.amazon_channel && items.length) {
      state.amazon_channel = items[0].value;
    }
    $('adTypeGrid').innerHTML = items
      .map((it) => {
        const sel = state.amazon_channel === it.value;
        return `<button type="button" class="pick-card${sel ? ' selected' : ''}" data-ch="${it.value}">
          ${esc(it.label || '—')}<div class="opt">${esc(it.sub || '')}</div>
        </button>`;
      })
      .join('');
    $('adTypeGrid').querySelectorAll('.pick-card').forEach((el) => {
      el.addEventListener('click', () => {
        state.amazon_channel = el.dataset.ch;
        if (state.strategy_major) {
          const maj = getSelectedMajor();
          if (maj && state.amazon_channel && !maj.channels.has(state.amazon_channel)) {
            state.strategy_major = null;
            state.strategy_minor = null;
            state.name_short = null;
          }
        }
        clearPublisherSelection();
        renderAdTypes();
        renderStrategies();
        renderPublisherSection();
        updatePreview();
      });
    });
  }

  function renderStrategies() {
    const majors = getFilteredMajors();
    if (!majors.length) {
      $('majorList').innerHTML = '<p style="color:var(--muted);font-size:0.85rem">暂无数据</p>';
      $('minorList').innerHTML = '';
      return;
    }
    $('majorList').innerHTML = majors
      .map((m) => {
        const sel = state.strategy_major === m.strategy_major_code;
        return `<div class="strategy-item${sel ? ' selected' : ''}" data-major="${m.strategy_major_code}">
          ${esc(m.label_zh)}<div class="code">${m.strategy_major_code}</div>
        </div>`;
      })
      .join('');

    $('majorList').querySelectorAll('.strategy-item').forEach((el) => {
      el.addEventListener('click', () => {
        state.strategy_major = el.dataset.major;
        state.strategy_minor = null;
        state.name_short = null;
        renderStrategies();
        updatePreview();
      });
    });

    const minors = getFilteredMinors();
    if (!state.strategy_major) {
      $('minorList').innerHTML =
        '<p style="color:var(--muted);font-size:0.85rem">请选择营销大类</p>';
      return;
    }
    $('minorList').innerHTML = minors
      .map((x) => {
        const sel = state.strategy_minor === x.strategy_minor_code;
        return `<div class="strategy-item${sel ? ' selected' : ''}" data-minor="${x.strategy_minor_code}" data-ns="${x.name_short}">
          ${esc(x.label_zh)}<div class="code">${x.name_short} · ${x.strategy_minor_code}</div>
        </div>`;
      })
      .join('');

    $('minorList').querySelectorAll('.strategy-item').forEach((el) => {
      el.addEventListener('click', () => {
        state.strategy_minor = el.dataset.minor;
        state.name_short = el.dataset.ns;
        renderStrategies();
        updatePreview();
      });
    });
  }

  function clearPublisherSelection() {
    state.publisher_category_kind = null;
    state.publisher_category_code = null;
    state.publisher_name = null;
    state.console_publisher_mode = null;
  }

  /** 其它自定义 / 泛化桶等兜底类固定排在最后 */
  const PUBLISHER_TAIL_CUSTOM = new Set(['other_custom']);
  const PUBLISHER_TAIL_PRESET = new Set(['generic_bucket', 'other']);

  function isPublisherTailCategory(cat) {
    if (cat.kind === 'custom') {
      return PUBLISHER_TAIL_CUSTOM.has(cat.code) || /其它自定义/.test(cat.label || '');
    }
    return (
      PUBLISHER_TAIL_PRESET.has(cat.code) ||
      /泛化桶|其它(?!搜索)/.test(cat.label || '')
    );
  }

  function sortPublisherCategories(cats, ch) {
    const ui = ERP.channel_ui_defaults[ch] || {};
    const customOrder = ui.custom_groups_order || [];
    const presetOrder = ui.preset_categories_order || [];
    const collapsed = new Set(ui.collapse_preset_categories || []);

    function tier(cat) {
      if (isPublisherTailCategory(cat)) return 3;
      if (cat.kind === 'custom') return 0;
      if (collapsed.has(cat.code)) return 2;
      return 1;
    }

    function orderInTier(cat) {
      if (tier(cat) === 3) {
        if (cat.kind === 'custom' && cat.code === 'other_custom') return 999;
        if (cat.code === 'generic_bucket') return 100;
        if (cat.code === 'other') return 110;
        return 200;
      }
      if (cat.kind === 'custom') {
        const i = customOrder.indexOf(cat.code);
        return i >= 0 ? i : cat.sort_order ?? 50;
      }
      const i = presetOrder.indexOf(cat.code);
      if (i >= 0) return i;
      const ci = (ui.collapse_preset_categories || []).indexOf(cat.code);
      if (ci >= 0) return 100 + ci;
      return cat.sort_order ?? 50;
    }

    return cats.sort((a, b) => {
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) return ta - tb;
      if (a.p0 !== b.p0) return a.p0 ? -1 : 1;
      const oa = orderInTier(a);
      const ob = orderInTier(b);
      if (oa !== ob) return oa - ob;
      return (a.label || '').localeCompare(b.label || '', 'zh-CN');
    });
  }

  function getPublisherCategories() {
    if (!state.amazon_channel) return [];
    const ch = state.amazon_channel;
    const ui = ERP.channel_ui_defaults[ch] || {};
    const collapsed = new Set(ui.collapse_preset_categories || []);
    const cats = [];

    ERP.custom_platform_groups
      .filter((g) => (g.visible_for_amazon_channels || []).includes(ch))
      .forEach((g) => {
        cats.push({
          kind: 'custom',
          code: g.group_code,
          label: g.label_zh,
          sub: g.subtitle_zh || 'Console 选 New',
          count: g.options.length,
          sort_order: g.sort_order ?? 50,
          p0: !!g.p0_highlight,
        });
      });

    const presetDone = new Set();
    const addPresetCat = (c) => {
      if (presetDone.has(c.category_code)) return;
      if (!(c.visible_for_amazon_channels || []).includes(ch)) return;
      presetDone.add(c.category_code);
      const n = PUB.presets.filter((p) => p.category === c.category_code).length;
      const isCol = collapsed.has(c.category_code);
      cats.push({
        kind: 'preset',
        code: c.category_code,
        label: c.label_zh,
        sub: `${isCol ? '长尾 · ' : ''}亚马逊预设 · ${n} 项`,
        count: n,
        sort_order: c.sort_order ?? 50,
        p0: !!c.p0_highlight,
      });
    };
    (ui.preset_categories_order || []).forEach((code) => {
      const c = PUB.preset_categories.find((x) => x.category_code === code);
      if (c) addPresetCat(c);
    });
    PUB.preset_categories.forEach((c) => addPresetCat(c));

    return sortPublisherCategories(cats, ch);
  }

  function updatePublisherSelectedLabel() {
    const el = $('publisherSelected');
    if (!state.publisher_name) {
      el.innerHTML = '已选：<strong>—</strong>';
      return;
    }
    const mode =
      state.console_publisher_mode === 'preset' ? 'Console 预设' : 'Console New';
    el.innerHTML = `已选：<strong>${esc(state.publisher_name)}</strong> <span style="color:var(--muted)">（${mode}）</span>`;
  }

  function renderPublisherCategories() {
    const grid = $('publisherCategoryGrid');
    const need = $('publisherNeedChannel');
    if (!state.amazon_channel) {
      need.hidden = false;
      grid.innerHTML = '';
      $('publisherDetail').hidden = true;
      return;
    }
    need.hidden = true;
    const cats = getPublisherCategories();
    grid.innerHTML = cats
      .map((c) => {
        const sel =
          state.publisher_category_kind === c.kind && state.publisher_category_code === c.code;
        return `<div class="cat-card${sel ? ' selected' : ''}" data-kind="${c.kind}" data-code="${c.code}">
          ${esc(c.label)}<div class="sub">${esc(c.sub)}</div>
        </div>`;
      })
      .join('');
    grid.querySelectorAll('.cat-card').forEach((el) => {
      el.addEventListener('click', () => {
        state.publisher_category_kind = el.dataset.kind;
        state.publisher_category_code = el.dataset.code;
        state.publisher_name = null;
        state.console_publisher_mode = null;
        $('publisherCustom').value = '';
        renderPublisherCategories();
        renderPublisherItems();
        updatePublisherSelectedLabel();
        updatePreview();
      });
    });
  }

  function renderPublisherItems() {
    const detail = $('publisherDetail');
    const list = $('publisherItemList');
    const searchWrap = $('publisherSearchWrap');
    const customWrap = $('publisherCustomWrap');

    if (!state.publisher_category_code) {
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
    list.innerHTML = '';
    searchWrap.hidden = true;
    customWrap.style.display = 'none';

    if (state.publisher_category_kind === 'custom') {
      const g = ERP.custom_platform_groups.find((x) => x.group_code === state.publisher_category_code);
      if (!g) return;
      state.console_publisher_mode = 'new_custom';
      list.innerHTML = g.options
        .map((o) => {
          const sel = state.publisher_name === o.publisher_name;
          return `<div class="pub-item${sel ? ' selected' : ''}" data-name="${esc(o.publisher_name)}">${esc(o.label_zh)}</div>`;
        })
        .join('');
      list.querySelectorAll('.pub-item').forEach((el) => {
        el.addEventListener('click', () => {
          state.publisher_name = el.dataset.name;
          renderPublisherItems();
          updatePublisherSelectedLabel();
          updatePreview();
        });
      });
      if (g.allow_free_text) {
        customWrap.style.display = 'block';
        const inp = $('publisherCustom');
        inp.placeholder = g.free_text_placeholder_zh || '自定义 Publisher name';
        const names = g.options.map((o) => o.publisher_name);
        inp.value =
          state.publisher_name && !names.includes(state.publisher_name)
            ? state.publisher_name
            : '';
        inp.oninput = () => {
          state.publisher_name = inp.value.trim();
          state.console_publisher_mode = 'new_custom';
          renderPublisherItems();
          updatePublisherSelectedLabel();
          updatePreview();
        };
      }
      return;
    }

    if (state.publisher_category_kind === 'preset') {
      state.console_publisher_mode = 'preset';
      searchWrap.hidden = false;
      const q = ($('publisherSearch').value || '').toLowerCase();
      PUB.presets
        .filter((p) => p.category === state.publisher_category_code)
        .filter(
          (p) =>
            !q ||
            p.console_label.toLowerCase().includes(q) ||
            (p.label_zh || '').toLowerCase().includes(q)
        )
        .forEach((p) => {
          const div = document.createElement('div');
          div.className =
            'pub-item' + (state.publisher_name === p.console_label ? ' selected' : '');
          div.innerHTML = `<strong>${esc(p.console_label)}</strong>${p.label_zh ? ` · ${esc(p.label_zh)}` : ''}`;
          div.addEventListener('click', () => {
            state.publisher_name = p.console_label;
            renderPublisherItems();
            updatePublisherSelectedLabel();
            updatePreview();
          });
          list.appendChild(div);
        });
      $('publisherSearch').oninput = () => renderPublisherItems();
    }
  }

  function renderPublisherSection() {
    renderPublisherCategories();
    renderPublisherItems();
    updatePublisherSelectedLabel();
  }

  function renderConfirm() {
    $('confirmSummary').innerHTML = `
      <dl class="kv">
        <div><dt>状态</dt><dd>pending_amazon</dd></div>
        <div><dt>统一规范名称</dt><dd style="max-width:100%;text-align:left">${esc(buildUnifiedName())}</dd></div>
        <div><dt>下一步</dt><dd>Amazon Console 创建 Campaign</dd></div>
      </dl>`;
  }

  function validateForm() {
    if (state.mskus.size === 0) return { msg: '请至少选择一个 MSKU', section: 'section-basic' };
    if (!sanitizeSegment($('campaignName').value)) {
      return { msg: '请填写活动名称（勿含空格）', section: 'section-basic' };
    }
    if (!$('launchDate').value) return { msg: '请选择预计投放日期', section: 'section-basic' };
    if (!getLandingSegment()) return { msg: '请填写落地页', section: 'section-landing' };
    if (!state.amazon_channel) {
      return { msg: '请选择广告类型（Console Channel）', section: 'section-strategy' };
    }
    if (!state.strategy_major || !state.strategy_minor) {
      return { msg: '请选择营销大类和子类', section: 'section-strategy' };
    }
    if (!state.publisher_name) {
      return { msg: '请选择 Publisher 分类及具体项', section: 'section-publisher' };
    }
    return null;
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  function buildTagRecord() {
    const shop = getSelectedShop();
    const shopCode = `${shop.brand}_${shop.marketplace}`;
    return {
      canonical_name: buildUnifiedName(),
      shop_code: shopCode,
      brand: shop.brand,
      marketplace: shop.marketplace,
      targeting: state.targeting,
      msku: getMskuSegment(),
      campaign_name: sanitizeSegment($('campaignName').value),
      landing_page: getLandingSegment(),
      ad_type: getAdTypeLabel(),
      amazon_channel: state.amazon_channel,
      name_short: state.name_short,
      publisher_name: state.publisher_name,
      launch_date: formatDateYmd(),
      strategy_major: state.strategy_major,
      strategy_minor: state.strategy_minor,
      console_mode: state.console_publisher_mode || 'preset',
      erp_status: 'pending_amazon',
      console_created: false,
      attribution_tag_raw: null,
      amazon_campaign_id: null,
      amazon_ad_group_id: null,
      requester: { name: '当前用户（Demo）', avatar_url: '' },
      requested_at: new Date().toISOString(),
      console_creator: null,
      console_created_at: null,
      metrics: null,
    };
  }

  function init() {
    $('launchDate').value = new Date().toISOString().slice(0, 10);

    $('targetingToggle').querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('targetingToggle').querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.targeting = btn.dataset.target;
        syncLandingUi();
        updatePreview();
      });
    });

    ['shop', 'campaignName', 'launchDate', 'landingStore', 'landingStoreCustom'].forEach(
      (id) => {
        $(id).addEventListener('input', updatePreview);
        $(id).addEventListener('change', updatePreview);
      }
    );

    $('landingStoreCustom').addEventListener('input', () => {
      if ($('landingStoreCustom').value.trim()) $('landingStore').value = '';
      updatePreview();
    });
    $('landingStore').addEventListener('change', () => {
      $('landingStoreCustom').value = '';
      updatePreview();
    });

    $('btnSubmit').addEventListener('click', () => {
      const err = validateForm();
      if (err) {
        showToast(err.msg);
        scrollToSection(err.section);
        return;
      }
      const Store = window.AttributionTagStore;
      if (!Store) {
        showToast('存储模块未加载');
        return;
      }
      const saved = Store.save(buildTagRecord());
      showToast('已登记 pending_amazon · 可在管理页完成 Console 配对');
      scrollToSection('section-submit');
      setTimeout(() => {
        if (confirm('是否跳转到 Tag 管理页继续配对？')) {
          location.href = `./amazon-attribution-tag-manage-demo.html?id=${encodeURIComponent(saved.tag_request_id)}`;
        }
      }, 400);
    });

    $('shop').innerHTML = DEMO_SHOPS.map(
      (s) =>
        `<option value="${s.brand}_${s.marketplace}" data-brand="${s.brand}" data-marketplace="${s.marketplace}">${esc(s.label)}</option>`
    ).join('');

    renderMskuChips();
    syncLandingUi();
    state.amazon_channel = 'social';
    state.strategy_major = 'paid_social';
    state.strategy_minor = 'psoc_performance';
    state.name_short = 'PSoPF';
    renderAdTypes();
    renderStrategies();
    renderPublisherSection();
    updatePreview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

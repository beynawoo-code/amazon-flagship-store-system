(function () {
  const Store = window.AttributionTagStore;
  if (!Store) {
    document.body.innerHTML =
      '<p style="padding:40px;color:#f87171">未加载 AttributionTagStore</p>';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  let kpiFilter = '';
  let selectedId = null;
  let strategyLabelIndex = null;
  /** @type {{ key: string, dir: 'asc' | 'desc' } | null} */
  let metricSort = null;

  const MP_CURRENCY = {
    US: 'USD',
    CA: 'CAD',
    UK: 'GBP',
    DE: 'EUR',
    FR: 'EUR',
    IT: 'EUR',
    ES: 'EUR',
    JP: 'JPY',
    MX: 'MXN',
  };

  /** 与 Amazon Attribution Campaigns 报表 CSV 列一致（Campaigns 对应统一规范名称） */
  const ATTRIBUTION_REPORT_METRICS = [
    { key: 'click_throughs', label: 'Click-throughs', type: 'count' },
    { key: 'dpv', label: 'DPV', type: 'count' },
    { key: 'dpv_clicks', label: 'DPV clicks', type: 'count' },
    { key: 'total_dpv', label: 'Total DPV', type: 'count' },
    { key: 'atc', label: 'ATC', type: 'count' },
    { key: 'atc_clicks', label: 'ATC clicks', type: 'count' },
    { key: 'total_atc', label: 'Total ATC', type: 'count' },
    { key: 'purchases', label: 'Purchases', type: 'count' },
    { key: 'purchases_clicks', label: 'Purchases clicks', type: 'count' },
    { key: 'total_purchases', label: 'Total purchases', type: 'count' },
    { key: 'product_sales', label: 'Product sales', type: 'money' },
    { key: 'product_sales_clicks', label: 'Product sales clicks', type: 'money' },
    { key: 'total_product_sales', label: 'Total product sales', type: 'money' },
    { key: 'units_sold', label: 'Units sold', type: 'count' },
    { key: 'units_sold_clicks', label: 'Units sold clicks', type: 'count' },
    { key: 'total_units_sold', label: 'Total units sold', type: 'count' },
    { key: 'brand_referral_bonus', label: 'Brand Referral Bonus', type: 'money' },
  ];

  const CURRENCY_META = {
    USD: { symbol: '$', label: 'USD ($)' },
    CAD: { symbol: 'C$', label: 'CAD (C$)' },
    GBP: { symbol: '£', label: 'GBP (£)' },
    EUR: { symbol: '€', label: 'EUR (€)' },
    JPY: { symbol: '¥', label: 'JPY (¥)' },
    MXN: { symbol: 'MX$', label: 'MXN (MX$)' },
  };

  function getStrategyLabelIndex() {
    if (strategyLabelIndex) return strategyLabelIndex;
    const index = { major: new Map(), minor: new Map() };
    const tax = window.ATTRIBUTION_WIZARD_DATA?.taxonomy;
    if (tax?.amazon_channel_groups) {
      tax.amazon_channel_groups.forEach((ch) => {
        ch.strategies.forEach((m) => {
          index.major.set(m.strategy_major_code, m.label_zh);
          m.minors.forEach((min) => {
            index.minor.set(min.strategy_minor_code, min.label_zh);
          });
        });
      });
    }
    strategyLabelIndex = index;
    return index;
  }

  function formatTargeting(t) {
    if (t === 'P') return 'P · 单品';
    if (t === 'S') return 'S · 店铺';
    return t || '—';
  }

  function formatStrategyCell(code, kind) {
    if (!code) return '—';
    const idx = getStrategyLabelIndex();
    const zh = kind === 'major' ? idx.major.get(code) : idx.minor.get(code);
    if (zh) {
      return `<span class="cell-compact" title="${esc(code)}">${esc(zh)}</span>`;
    }
    return `<span class="mono cell-compact">${esc(code)}</span>`;
  }

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  function seed() {
    if (window.ATTRIBUTION_TAG_SEED) {
      Store.seedIfEmpty(window.ATTRIBUTION_TAG_SEED);
    }
  }

  function resetSeed() {
    if (!confirm('将清空本地记录并重新注入 Demo 种子数据，确定？')) return;
    localStorage.removeItem(Store.STORAGE_KEY);
    seed();
    renderAll();
    showToast('已重置 Demo 数据');
  }

  function getMarketplaceFromShopCode(shopCode) {
    if (!shopCode) return 'US';
    const i = shopCode.lastIndexOf('_');
    return i >= 0 ? shopCode.slice(i + 1) : 'US';
  }

  function getRecordMarketplace(r) {
    return r.marketplace || getMarketplaceFromShopCode(r.shop_code);
  }

  function marketplaceToCurrency(mp) {
    return MP_CURRENCY[mp] || 'USD';
  }

  function getSelectedShop() {
    return $('filterShop').value || '';
  }

  function getDisplayCurrency() {
    return $('filterCurrency').value || 'USD';
  }

  function syncCurrencyFilter() {
    const sel = $('filterCurrency');
    const shop = getSelectedShop();
    const allowed = ['USD'];
    if (shop) {
      const native = marketplaceToCurrency(getMarketplaceFromShopCode(shop));
      if (native !== 'USD' && CURRENCY_META[native]) allowed.push(native);
    }
    const prev = sel.value;
    sel.innerHTML = allowed
      .map((c) => `<option value="${c}">${CURRENCY_META[c].label}</option>`)
      .join('');
    sel.value = allowed.includes(prev) ? prev : 'USD';
    const lockUsd = !shop;
    sel.disabled = lockUsd;
    if (lockUsd) sel.value = 'USD';
  }

  function uniqueFieldValues(list, getter) {
    const set = new Set();
    list.forEach((r) => {
      const v = getter(r);
      if (v != null && v !== '' && v !== '—') set.add(String(v));
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }

  function populateSelectOptions(selectId, values, labelForValue) {
    const sel = $(selectId);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML =
      '<option value="">全部</option>' +
      values
        .map((v) => {
          const label = labelForValue ? labelForValue(v) : v;
          return `<option value="${esc(v)}">${esc(label)}</option>`;
        })
        .join('');
    sel.value = [...sel.options].some((o) => o.value === prev) ? prev : '';
  }

  function populateStrategyMinorFilter(list) {
    const major = $('filterStrategyMajor').value;
    let source = list;
    if (major) source = list.filter((r) => r.strategy_major === major);
    const minors = uniqueFieldValues(source, (r) => r.strategy_minor);
    const idx = getStrategyLabelIndex();
    populateSelectOptions('filterStrategyMinor', minors, (code) => idx.minor.get(code) || code);
  }

  const SEARCHABLE_FILTER_IDS = [
    'filterCanonical',
    'filterMsku',
    'filterCampaign',
    'filterLanding',
    'filterPublisher',
  ];

  function populateSearchableFilters(list) {
    const Combo = window.AttributionFilterCombo;
    if (!Combo) return;
    Combo.setOptions('filterCanonical', uniqueFieldValues(list, (r) => r.canonical_name));
    Combo.setOptions('filterMsku', uniqueFieldValues(list, (r) => r.msku));
    Combo.setOptions('filterCampaign', uniqueFieldValues(list, (r) => r.campaign_name));
    Combo.setOptions('filterLanding', uniqueFieldValues(list, (r) => r.landing_page));
    Combo.setOptions('filterPublisher', uniqueFieldValues(list, (r) => r.publisher_name));
  }

  function populateFacetFilters(list) {
    const idx = getStrategyLabelIndex();
    populateSelectOptions('filterShop', uniqueFieldValues(list, (r) => r.shop_code));
    populateSearchableFilters(list);
    populateSelectOptions('filterAdType', uniqueFieldValues(list, (r) => r.ad_type));
    populateSelectOptions(
      'filterStrategyMajor',
      uniqueFieldValues(list, (r) => r.strategy_major),
      (code) => idx.major.get(code) || code
    );
    populateStrategyMinorFilter(list);
    populateSelectOptions('filterRequester', uniqueFieldValues(list, (r) => r.requester?.name));
    populateSelectOptions(
      'filterConsoleCreator',
      uniqueFieldValues(list, (r) => r.console_creator?.name)
    );
    syncCurrencyFilter();
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  function toYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseYmdToStart(ymd) {
    if (!ymd) return null;
    const s = String(ymd);
    const iso =
      s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s.slice(0, 10);
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }

  function parseYmdToEnd(ymd) {
    if (!ymd) return null;
    const s = String(ymd);
    const iso =
      s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s.slice(0, 10);
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : endOfDay(d);
  }

  function getRecordDataPeriod(r) {
    const m = r.metrics;
    if (m?.period_start && m?.period_end) {
      return {
        start: parseYmdToStart(m.period_start),
        end: parseYmdToEnd(m.period_end),
      };
    }
    const launchStart = parseYmdToStart(r.launch_date);
    if (launchStart) {
      return { start: launchStart, end: endOfDay(launchStart) };
    }
    return null;
  }

  function periodsOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
  }

  function formatDateRangeLabel(range) {
    if (!range?.start || !range?.end) return '';
    return `${toYmd(range.start)} ~ ${toYmd(range.end)}`;
  }

  function syncDateRangeUi() {
    const preset = $('filterDatePreset').value;
    const isCustom = preset === 'custom';
    const display = $('filterDateRangeDisplay');
    const custom = $('filterDateCustom');

    custom.hidden = !isCustom;

    if (!preset || isCustom) {
      display.hidden = true;
      display.textContent = '';
      return;
    }

    const range = getDateRangeFilter();
    if (range) {
      display.hidden = false;
      display.textContent = formatDateRangeLabel(range);
      return;
    }

    display.hidden = true;
    display.textContent = '';
  }

  function getDateRangeFilter() {
    const preset = $('filterDatePreset').value;
    if (!preset) return null;

    const today = startOfDay(new Date());

    if (preset === '7d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start, end: endOfDay(new Date()) };
    }
    if (preset === '30d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start, end: endOfDay(new Date()) };
    }
    if (preset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start, end: endOfDay(new Date()) };
    }
    if (preset === 'custom') {
      const from = $('filterDateFrom').value;
      const to = $('filterDateTo').value;
      if (!from || !to) return null;
      const start = parseYmdToStart(from);
      const end = parseYmdToEnd(to);
      if (!start || !end || start > end) return null;
      return { start, end };
    }
    return null;
  }

  function getFilters() {
    return {
      shop: getSelectedShop(),
      targeting: $('filterTargeting').value,
      canonical: $('filterCanonical').value,
      msku: $('filterMsku').value,
      campaign: $('filterCampaign').value,
      landing: $('filterLanding').value,
      adType: $('filterAdType').value,
      strategyMajor: $('filterStrategyMajor').value,
      strategyMinor: $('filterStrategyMinor').value,
      publisher: $('filterPublisher').value,
      requester: $('filterRequester').value,
      consoleCreator: $('filterConsoleCreator').value,
      currency: getDisplayCurrency(),
      erp: $('filterErp').value,
      console: $('filterConsole').value,
      link: $('filterLink').value,
      kpi: kpiFilter,
      dateRange: getDateRangeFilter(),
    };
  }

  function matchRecord(r, f) {
    if (f.shop && r.shop_code !== f.shop) return false;
    if (f.targeting && r.targeting !== f.targeting) return false;
    if (f.canonical && r.canonical_name !== f.canonical) return false;
    if (f.msku && r.msku !== f.msku) return false;
    if (f.campaign && r.campaign_name !== f.campaign) return false;
    if (f.landing && r.landing_page !== f.landing) return false;
    if (f.adType && r.ad_type !== f.adType) return false;
    if (f.strategyMajor && r.strategy_major !== f.strategyMajor) return false;
    if (f.strategyMinor && r.strategy_minor !== f.strategyMinor) return false;
    if (f.publisher && r.publisher_name !== f.publisher) return false;
    if (f.requester && r.requester?.name !== f.requester) return false;
    if (f.consoleCreator && r.console_creator?.name !== f.consoleCreator) return false;
    if (f.erp && r.erp_status !== f.erp) return false;
    if (f.console === 'yes' && !r.console_created) return false;
    if (f.console === 'no' && r.console_created) return false;
    if (f.link && r.link_status !== f.link) return false;
    if (f.kpi === 'pending_console' && r.console_created) return false;
    if (f.kpi === 'pending_link' && r.link_status === 'linked') return false;
    if (f.kpi === 'active' && r.erp_status !== 'active') return false;
    if (f.dateRange) {
      const period = getRecordDataPeriod(r);
      if (!period) return false;
      if (!periodsOverlap(period.start, period.end, f.dateRange.start, f.dateRange.end)) {
        return false;
      }
    }
    return true;
  }

  function filterList(list) {
    const f = getFilters();
    return list.filter((r) => matchRecord(r, f));
  }

  function erpPill(status) {
    const map = {
      pending_amazon: ['pill-pending', 'pending_amazon'],
      active: ['pill-active', 'active'],
      archived: ['pill-archived', 'archived'],
    };
    const [cls, label] = map[status] || ['pill-archived', status];
    return `<span class="pill ${cls}">${esc(label)}</span>`;
  }

  function linkPill(status) {
    const map = {
      unlinked: ['pill-no', '未回写'],
      tag_only: ['pill-tag', '仅 Tag'],
      linked: ['pill-link', '已配对'],
    };
    const [cls, label] = map[status] || ['pill-no', status];
    return `<span class="pill ${cls}">${label}</span>`;
  }

  function formatLaunchDate(ymd) {
    if (!ymd || ymd === '—') return '—';
    const s = String(ymd);
    if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return s;
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function userAvatarHue(name) {
    return [...String(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  }

  function renderUserChip(user) {
    if (!user?.name) return '<span class="cell-muted">—</span>';
    const name = user.name;
    const url = (user.avatar_url || '').trim();
    if (url) {
      return `<span class="user-chip" title="${esc(name)}"><img class="user-avatar" src="${esc(url)}" alt="" /><span>${esc(name)}</span></span>`;
    }
    const initials = name.length >= 2 ? name.slice(-2) : name.slice(0, 1);
    const hue = userAvatarHue(name);
    return `<span class="user-chip" title="${esc(name)}"><span class="user-avatar user-avatar--initials" style="background:hsl(${hue},48%,40%)">${esc(initials)}</span><span>${esc(name)}</span></span>`;
  }

  function getMetricsRow(r, currency) {
    if (!r.metrics?.by_currency) return null;
    return r.metrics.by_currency[currency] || r.metrics.by_currency.USD || null;
  }

  function formatMetricCount(n) {
    if (n == null || n === '') return '—';
    return Number(n).toLocaleString();
  }

  function formatMetricAmount(n) {
    if (n == null || n === '') return '—';
    return Number(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatMetricValue(row, col) {
    const v = row[col.key];
    if (col.type === 'money') return formatMetricAmount(v);
    return formatMetricCount(v);
  }

  function getMetricSortValue(r, currency, key) {
    if (!(r.erp_status === 'active' || r.erp_status === 'archived') || !r.metrics?.by_currency) {
      return null;
    }
    const row = getMetricsRow(r, currency);
    if (!row) return null;
    const v = row[key];
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  }

  function sortRowsByMetric(rows, currency, key, dir) {
    const mult = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = getMetricSortValue(a, currency, key);
      const vb = getMetricSortValue(b, currency, key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va === vb) return 0;
      return (va - vb) * mult;
    });
  }

  function syncMetricColumnHeaders() {
    const cur = getDisplayCurrency();
    const curLabel = CURRENCY_META[cur]?.label || cur;
    document.querySelectorAll('.th-metric-sortable').forEach((th) => {
      const key = th.dataset.metricKey;
      const col = ATTRIBUTION_REPORT_METRICS.find((m) => m.key === key);
      if (!col) return;
      const label = col.type === 'money' ? `${col.label} (${curLabel})` : col.label;
      const active = metricSort?.key === key;
      const icon = !active ? '↕' : metricSort.dir === 'asc' ? '↑' : '↓';
      th.classList.toggle('sorted', active);
      th.setAttribute('aria-sort', active ? (metricSort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      th.innerHTML = `<span class="th-sort-wrap">${esc(label)}<span class="th-sort-icon">${icon}</span></span>`;
    });
  }

  function bindMetricSortHeaders() {
    const thead = document.querySelector('.table-wrap thead');
    if (!thead || thead.dataset.sortBound) return;
    thead.dataset.sortBound = '1';
    thead.addEventListener('click', (e) => {
      const th = e.target.closest('.th-metric-sortable');
      if (!th) return;
      const key = th.dataset.metricKey;
      if (!key) return;
      if (metricSort?.key !== key) metricSort = { key, dir: 'desc' };
      else if (metricSort.dir === 'desc') metricSort = { key, dir: 'asc' };
      else metricSort = null;
      renderTable();
    });
  }

  function renderMetricCells(r, currency) {
    const n = ATTRIBUTION_REPORT_METRICS.length;
    const empty = '<td class="cell-muted cell-num">—</td>'.repeat(n);
    const hasData =
      (r.erp_status === 'active' || r.erp_status === 'archived') && r.metrics?.by_currency;
    if (!hasData) return empty;
    const row = getMetricsRow(r, currency);
    if (!row) return empty;
    return ATTRIBUTION_REPORT_METRICS.map(
      (col) =>
        `<td class="cell-compact cell-num">${formatMetricValue(row, col)}</td>`
    ).join('');
  }

  function mockSampleMetrics(marketplace) {
    const click_throughs = Math.floor(Math.random() * 800) + 100;
    const dpv = Math.floor(click_throughs * 0.9);
    const dpv_clicks = dpv;
    const total_dpv = Math.floor(dpv * 1.2);
    const atc = Math.floor(total_dpv * 0.15);
    const atc_clicks = atc;
    const total_atc = Math.floor(atc * 1.1);
    const purchases = Math.floor(total_atc * 0.2);
    const purchases_clicks = purchases;
    const total_purchases = Math.floor(purchases * 1.05);
    const product_sales = Math.round((Math.random() * 200 + 50) * 100) / 100;
    const product_sales_clicks = product_sales;
    const total_product_sales = Math.round((Math.random() * 8000 + 500) * 100) / 100;
    const units_sold = total_purchases;
    const units_sold_clicks = units_sold;
    const total_units_sold = Math.floor(units_sold * 1.1);
    const brand_referral_bonus = Math.round(total_product_sales * 0.03 * 100) / 100;
    const row = {
      click_throughs,
      dpv,
      dpv_clicks,
      total_dpv,
      atc,
      atc_clicks,
      total_atc,
      purchases,
      purchases_clicks,
      total_purchases,
      product_sales,
      product_sales_clicks,
      total_product_sales,
      units_sold,
      units_sold_clicks,
      total_units_sold,
      brand_referral_bonus,
    };
    const native = marketplaceToCurrency(marketplace);
    const by_currency = { [native]: { ...row } };
    if (native !== 'USD') {
      const rate = 0.74;
      by_currency.USD = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k,
          typeof v === 'number' &&
          (k.includes('sales') || k === 'brand_referral_bonus')
            ? Math.round(v * rate * 100) / 100
            : Math.round(v * rate),
        ])
      );
    }
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return {
      last_sync_at: end.toISOString(),
      period_start: toYmd(start),
      period_end: toYmd(end),
      by_currency,
    };
  }

  function computeKpis(list) {
    return {
      all: list.length,
      pending_console: list.filter((r) => !r.console_created).length,
      pending_link: list.filter((r) => r.link_status !== 'linked').length,
      active: list.filter((r) => r.erp_status === 'active').length,
    };
  }

  function renderKpis(list) {
    const k = computeKpis(list);
    const items = [
      { key: '', num: k.all, lbl: '全部 Tag' },
      { key: 'pending_console', num: k.pending_console, lbl: '待 Console 创建' },
      { key: 'pending_link', num: k.pending_link, lbl: '待配对回写' },
      { key: 'active', num: k.active, lbl: '已激活 · 可看数据' },
    ];
    $('kpiRow').innerHTML = items
      .map(
        (it) => `
      <div class="kpi${kpiFilter === it.key ? ' active' : ''}" data-kpi="${it.key}">
        <div class="num">${it.num}</div>
        <div class="lbl">${esc(it.lbl)}</div>
      </div>`
      )
      .join('');
    $('kpiRow').querySelectorAll('.kpi').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.kpi;
        kpiFilter = kpiFilter === key ? '' : key;
        renderTable();
        renderKpis(list);
      });
    });
  }

  function renderTable() {
    syncMetricColumnHeaders();
    const all = Store.list();
    const currency = getDisplayCurrency();
    let rows = filterList(all);
    if (metricSort) rows = sortRowsByMetric(rows, currency, metricSort.key, metricSort.dir);
    const tbody = $('tableBody');
    const empty = $('emptyState');

    if (rows.length === 0) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr data-id="${esc(r.tag_request_id)}">
        <td class="mono col-name col-sticky col-sticky-1" title="${esc(r.canonical_name)}">${esc(r.canonical_name)}</td>
        <td class="cell-compact col-sticky col-sticky-2">${esc(r.shop_code)}</td>
        <td class="cell-compact col-sticky col-sticky-3">${esc(formatTargeting(r.targeting))}</td>
        <td class="mono cell-compact">${esc(r.msku || '—')}</td>
        <td class="cell-compact">${esc(r.campaign_name || '—')}</td>
        <td class="cell-compact">${esc(r.landing_page || '—')}</td>
        <td class="cell-compact">${esc(r.ad_type || r.amazon_channel || '—')}</td>
        <td>${formatStrategyCell(r.strategy_major, 'major')}</td>
        <td>${formatStrategyCell(r.strategy_minor, 'minor')}</td>
        <td class="cell-compact">${esc(r.publisher_name || '—')}</td>
        <td class="cell-compact">${esc(formatLaunchDate(r.launch_date))}</td>
        <td>${erpPill(r.erp_status)}</td>
        <td><span class="pill ${r.console_created ? 'pill-yes' : 'pill-no'}">${r.console_created ? '已创建' : '未创建'}</span></td>
        <td>${linkPill(r.link_status)}</td>
        <td>${renderUserChip(r.requester)}</td>
        <td class="cell-time">${esc(formatDateTime(r.requested_at))}</td>
        <td>${renderUserChip(r.console_creator)}</td>
        <td class="cell-time">${esc(formatDateTime(r.console_created_at))}</td>
        ${renderMetricCells(r, currency)}
        <td><button type="button" class="btn-secondary btn-sm btn-open" data-id="${esc(r.tag_request_id)}">详情</button></td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.btn-open')) return;
        openDrawer(tr.dataset.id);
      });
    });
    tbody.querySelectorAll('.btn-open').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDrawer(btn.dataset.id);
      });
    });
  }

  function getStepState(r) {
    const erpDone = ['pending_amazon', 'active', 'archived'].includes(r.erp_status);
    const consoleDone = !!r.console_created;
    const linkDone = r.link_status === 'linked';
    const dataDone = r.erp_status === 'active' && linkDone;
    let current = 'erp';
    if (!consoleDone) current = 'console';
    else if (!linkDone) current = 'link';
    else if (!dataDone) current = 'data';
    else current = 'done';
    return { erpDone, consoleDone, linkDone, dataDone, current };
  }

  function renderSteps(r) {
    const s = getStepState(r);
    const steps = [
      {
        id: 'erp',
        title: 'ERP 登记',
        desc: '品牌/渠道推广在 ERP 提交需求后即 pending_amazon，待渠道同学在 Console 创建',
        done: s.erpDone,
      },
      {
        id: 'console',
        title: 'Console 创建 Campaign / Ad Group',
        desc: 'Ad group name = 统一规范名称',
        done: s.consoleDone,
      },
      {
        id: 'link',
        title: '回写 Attribution Tag 并配对 ID',
        desc: '粘贴 Tag URL，填写 Campaign / Ad Group ID',
        done: s.linkDone,
      },
      {
        id: 'data',
        title: '激活并同步归因数据',
        desc: '配对完成后标记 active，可查看点击/销售额',
        done: s.dataDone,
      },
    ];
    return `<div class="steps">${steps
      .map((st) => {
        let cls = '';
        if (st.done) cls = 'done';
        else if (s.current === st.id) cls = 'current';
        return `
        <div class="step ${cls}">
          <div class="step-dot">${st.done ? '✓' : ''}</div>
          <div class="step-body">
            <div class="title">${esc(st.title)}</div>
            <div class="desc">${esc(st.desc)}</div>
          </div>
        </div>`;
      })
      .join('')}</div>`;
  }

  function renderMetricsDetailBlock(r, currency, title, archived) {
    const row = getMetricsRow(r, currency);
    if (!row) return '';
    const curLabel = CURRENCY_META[currency]?.label || currency;
    const sync = r.metrics.last_sync_at
      ? new Date(r.metrics.last_sync_at).toLocaleString('zh-CN')
      : '—';
    const periodLabel =
      r.metrics.period_start && r.metrics.period_end
        ? `${r.metrics.period_start} ~ ${r.metrics.period_end}`
        : '';
    const panelStyle = archived
      ? 'opacity:0.85;border-color:rgba(139,156,179,0.35)'
      : '';
    return `
      <div class="data-panel" style="${panelStyle}">
        <h3>${esc(title)} <span style="font-weight:400;color:var(--muted)">· ${esc(curLabel)}</span></h3>
        <div class="data-grid" style="grid-template-columns:repeat(3,1fr);gap:8px">
          ${ATTRIBUTION_REPORT_METRICS.map((col) => {
            const keyLabel = col.type === 'money' ? `${col.label} (${curLabel})` : col.label;
            return `
          <div class="item"><div class="val">${formatMetricValue(row, col)}</div><div class="key">${esc(keyLabel)}</div></div>`;
          }).join('')}
        </div>
        <p style="font-size:0.72rem;color:var(--muted);margin:10px 0 0">${periodLabel ? `统计区间：${esc(periodLabel)} · ` : ''}最近同步：${esc(sync)}${archived ? ' · 活动已归档' : ''}</p>
      </div>`;
  }

  function renderDataPanel(r) {
    const currency = getDisplayCurrency();
    if (r.erp_status === 'archived' && r.metrics?.by_currency) {
      return renderMetricsDetailBlock(r, currency, '归档前快照（只读）', true);
    }
    if (r.erp_status !== 'active' || !r.metrics?.by_currency) {
      return `<p style="font-size:0.78rem;color:var(--muted)">完成配对并标记为 active 后，此处展示 Attribution 报表数据（Demo 为模拟值）。</p>`;
    }
    return renderMetricsDetailBlock(r, currency, '归因数据预览（Demo）', false);
  }

  function renderDrawer(r) {
    $('drawerContent').innerHTML = `
      <h2>Tag 详情与配对</h2>
      <p class="sub mono">${esc(r.canonical_name)}</p>
      ${renderSteps(r)}
      <dl class="kv" style="font-size:0.78rem;margin-bottom:16px;display:grid;gap:6px">
        <div><dt style="color:var(--muted)">店铺 / 投放日</dt><dd style="margin:0">${esc(r.shop_code)} · ${esc(formatLaunchDate(r.launch_date))}</dd></div>
        <div><dt style="color:var(--muted)">MSKU / 活动</dt><dd style="margin:0">${esc(r.msku)} · ${esc(r.campaign_name)}</dd></div>
        <div><dt style="color:var(--muted)">需求方 / 提出时间</dt><dd style="margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">${renderUserChip(r.requester)} <span class="cell-time">${esc(formatDateTime(r.requested_at))}</span></dd></div>
        <div><dt style="color:var(--muted)">Console 创建方 / 时间</dt><dd style="margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">${renderUserChip(r.console_creator)} <span class="cell-time">${esc(formatDateTime(r.console_created_at))}</span></dd></div>
      </dl>

      <div class="field">
        <label><input type="checkbox" id="fConsoleCreated" ${r.console_created ? 'checked' : ''} /> 已在 Amazon Console 创建 Campaign / Ad Group</label>
      </div>
      <div class="field">
        <label>Attribution Tag（粘贴 Console 生成的完整 URL）</label>
        <textarea id="fTagRaw" placeholder="https://www.amazon.com/dp/...?maas=...">${esc(r.attribution_tag_raw || '')}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Amazon Campaign ID</label>
          <input type="text" id="fCampaignId" value="${esc(r.amazon_campaign_id || '')}" placeholder="cmp_xxx" />
        </div>
        <div class="field">
          <label>Amazon Ad Group ID</label>
          <input type="text" id="fAdGroupId" value="${esc(r.amazon_ad_group_id || '')}" placeholder="ag_xxx" />
        </div>
      </div>

      ${renderDataPanel(r)}

      <div class="drawer-actions">
        <button type="button" class="btn-primary" id="btnSavePairing">保存配对</button>
        <button type="button" class="btn-secondary" id="btnMarkActive">标记 active</button>
        <button type="button" class="btn-secondary" id="btnArchive">归档</button>
      </div>`;

    $('btnSavePairing').addEventListener('click', () => savePairing(r.tag_request_id, false));
    $('btnMarkActive').addEventListener('click', () => savePairing(r.tag_request_id, true));
    $('btnArchive').addEventListener('click', () => {
      Store.update(r.tag_request_id, { erp_status: 'archived' });
      showToast('已归档');
      closeDrawer();
      renderAll();
    });
  }

  function savePairing(id, markActive) {
    const console_created = $('fConsoleCreated').checked;
    const attribution_tag_raw = ($('fTagRaw').value || '').trim() || null;
    const amazon_campaign_id = ($('fCampaignId').value || '').trim() || null;
    const amazon_ad_group_id = ($('fAdGroupId').value || '').trim() || null;

    const existing = Store.get(id);
    const patch = {
      console_created,
      attribution_tag_raw,
      amazon_campaign_id,
      amazon_ad_group_id,
    };

    if (console_created && !existing?.console_creator) {
      patch.console_creator = { name: 'Console 操作员（Demo）', avatar_url: '' };
      patch.console_created_at = new Date().toISOString();
    }
    if (!console_created) {
      patch.console_creator = null;
      patch.console_created_at = null;
    }

    const link = Store.getLinkStatus({ ...existing, ...patch });
    if (markActive) {
      if (!console_created) {
        showToast('请先确认已在 Console 创建');
        return;
      }
      if (link !== 'linked') {
        showToast('请完整填写 Tag URL 与 Campaign / Ad Group ID');
        return;
      }
      patch.erp_status = 'active';
      patch.metrics =
        existing?.metrics?.by_currency
          ? existing.metrics
          : mockSampleMetrics(getRecordMarketplace(existing || {}));
    }

    Store.update(id, patch);
    showToast(markActive ? '已激活，可查看数据' : '配对信息已保存');
    selectedId = id;
    renderAll();
    openDrawer(id);
  }

  function openDrawer(id) {
    const r = Store.get(id);
    if (!r) return;
    selectedId = id;
    renderDrawer(r);
    $('drawer').classList.add('open');
    $('drawerBackdrop').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    $('drawer').classList.remove('open');
    $('drawerBackdrop').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    selectedId = null;
  }

  function renderAll() {
    const list = Store.list();
    populateFacetFilters(list);
    renderKpis(list);
    renderTable();
    if (selectedId) {
      const r = Store.get(selectedId);
      if (r) renderDrawer(r);
    }
  }

  function init() {
    const Combo = window.AttributionFilterCombo;
    if (Combo) {
      SEARCHABLE_FILTER_IDS.forEach((id) => {
        Combo.mount(id, { onChange: renderTable });
      });
    }

    seed();
    bindMetricSortHeaders();
    renderAll();

    const facetFilterIds = [
      'filterShop',
      'filterTargeting',
      'filterAdType',
      'filterStrategyMajor',
      'filterStrategyMinor',
      'filterRequester',
      'filterConsoleCreator',
      'filterErp',
      'filterConsole',
      'filterLink',
    ];
    facetFilterIds.forEach((id) => {
      $(id).addEventListener('change', () => {
        if (id === 'filterStrategyMajor') {
          populateStrategyMinorFilter(Store.list());
        }
        renderTable();
      });
    });
    $('filterCurrency').addEventListener('change', () => {
      renderTable();
      if (selectedId) {
        const r = Store.get(selectedId);
        if (r) renderDrawer(r);
      }
    });
    syncCurrencyFilter();
    syncDateRangeUi();
    $('filterDatePreset').addEventListener('change', () => {
      if ($('filterDatePreset').value === 'custom' && !$('filterDateFrom').value) {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 29);
        $('filterDateFrom').value = toYmd(start);
        $('filterDateTo').value = toYmd(end);
      }
      syncDateRangeUi();
      renderTable();
    });
    ['filterDateFrom', 'filterDateTo'].forEach((id) => {
      $(id).addEventListener('change', () => {
        if ($('filterDatePreset').value === 'custom') {
          syncDateRangeUi();
          renderTable();
        }
      });
    });
    $('btnResetSeed').addEventListener('click', resetSeed);
    $('drawerClose').addEventListener('click', closeDrawer);
    $('drawerBackdrop').addEventListener('click', closeDrawer);

    const params = new URLSearchParams(location.search);
    const openId = params.get('id');
    if (openId) setTimeout(() => openDrawer(openId), 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

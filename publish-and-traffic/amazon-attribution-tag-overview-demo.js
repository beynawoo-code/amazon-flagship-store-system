(function () {
  const Store = window.AttributionTagStore;
  const A = window.AttributionTagAnalytics;
  if (!Store || !A) {
    const missing = [
      !Store && 'amazon-attribution-tag-store.js（AttributionTagStore）',
      !A && 'amazon-attribution-tag-analytics.js（AttributionTagAnalytics）',
    ].filter(Boolean);
    document.body.innerHTML = `<div style="padding:40px;color:#f87171;font-family:system-ui">
      <p><strong>依赖脚本未加载</strong></p>
      <ul>${missing.map((m) => `<li>${m}</li>`).join('')}</ul>
      <p style="color:#8b9cb3;font-size:0.9rem">请用浏览器打开本 HTML，并确保与脚本在同一目录 <code>modules/publish-and-traffic/</code>。若用 IDE 预览，请对 demo 目录启动本地静态服务。</p>
    </div>`;
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const CURRENCY_META = {
    USD: { symbol: '$' },
    CAD: { symbol: 'C$' },
    GBP: { symbol: '£' },
    EUR: { symbol: '€' },
    JPY: { symbol: '¥' },
    MXN: { symbol: 'MX$' },
  };

  let strategyIndex = null;
  let charts = {};
  let expandedMajor = null;
  let selectedPublisher = null;
  let publisherData = [];
  let trendData = null;
  const MAX_TREND_METRICS = 4;
  const TREND_PALETTE = [
    { color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)' },
    { color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.1)' },
    { color: '#d946ef', bg: 'rgba(217, 70, 239, 0.1)' },
    { color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
  ];
  const TREND_AXIS_IDS = ['y', 'y1', 'y2', 'y3'];
  let trendSelectedKeys = [
    'click_throughs',
    'total_dpv',
    'total_atc',
    'total_product_sales',
  ];
  /** @type {Record<string, { key: string, dir: 'asc' | 'desc' }>} */
  const tableSort = {};
  let lastOverview = null;
  let lastTrendTotals = null;

  function isCompareEnabled() {
    return !!$('compareEnabled')?.checked;
  }

  function showCompareValues() {
    return isCompareEnabled() && !!$('showCompareValues')?.checked;
  }

  function showChangePct() {
    return isCompareEnabled() && !!$('showChangePct')?.checked;
  }

  function getCompareDateRange() {
    if (!isCompareEnabled()) return null;
    const preset = $('compareDatePreset')?.value;
    if (preset === 'prev_period') {
      const primary = getDateRange();
      if (!primary) return null;
      return A.getPreviousPeriodRange(primary);
    }
    return A.getDateRangeFromPreset(
      preset,
      $('compareDateFrom')?.value,
      $('compareDateTo')?.value
    );
  }

  function syncCompareRangeUi() {
    const on = isCompareEnabled();
    $('compareRangeWrap').hidden = !on;
    $('compareDisplayOpts').hidden = !on;
    if (!on) return;
    const preset = $('compareDatePreset')?.value;
    const isCustom = preset === 'custom';
    $('compareDateCustom').hidden = !isCustom;
    const display = $('compareDateRangeDisplay');
    if (!preset || preset === 'custom' || preset === 'prev_period') {
      if (preset === 'prev_period') {
        const primary = getDateRange();
        const cmp = primary ? A.getPreviousPeriodRange(primary) : null;
        if (cmp) {
          display.hidden = false;
          display.textContent = A.formatDateRangeLabel(cmp);
        } else {
          display.hidden = false;
          display.textContent = '请先选择本期数据时间（不可为「全部」）';
        }
      } else {
        display.hidden = true;
        display.textContent = '';
      }
      return;
    }
    const range = getCompareDateRange();
    if (range) {
      display.hidden = false;
      display.textContent = A.formatDateRangeLabel(range);
    } else {
      display.hidden = true;
    }
  }

  function getRecordsForRange(dateRange) {
    return A.filterRecordsWithMetrics(Store.list(), {
      dateRange,
      shop: $('filterShop').value,
      currency: getCurrency(),
      requireMetrics: true,
    });
  }

  function calcPctChange(current, previous) {
    const cur = typeof current === 'number' && !Number.isNaN(current) ? current : 0;
    const prev =
      typeof previous === 'number' && !Number.isNaN(previous) ? previous : null;
    if (prev == null) return null;
    if (prev === 0) return cur > 0 ? Infinity : 0;
    return ((cur - prev) / prev) * 100;
  }

  function fmtPct(pct) {
    if (pct == null || Number.isNaN(pct)) return '—';
    if (pct === Infinity) return '新增';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  }

  function pctClass(pct) {
    if (pct == null || Number.isNaN(pct)) return 'flat';
    if (pct === Infinity) return 'new';
    if (pct > 0.05) return 'up';
    if (pct < -0.05) return 'down';
    return 'flat';
  }

  function attachCompareToRow(row, cmpRow) {
    const compare = {};
    const change_pct = {};
    A.REPORT_METRICS.forEach((m) => {
      const cur = row[m.key] ?? 0;
      if (cmpRow) {
        const prev = cmpRow[m.key] ?? 0;
        compare[m.key] = prev;
        change_pct[m.key] = calcPctChange(cur, prev);
      } else {
        compare[m.key] = 0;
        change_pct[m.key] = cur > 0 ? Infinity : 0;
      }
    });
    const curTags = row.tag_count ?? 0;
    const prevTags = cmpRow?.tag_count ?? 0;
    return {
      ...row,
      compare_tag_count: prevTags,
      tag_change_pct: cmpRow ? calcPctChange(curTags, prevTags) : curTags > 0 ? Infinity : 0,
      compare,
      change_pct,
    };
  }

  function attachCompareToRows(primaryRows, compareRows, getKey) {
    if (!isCompareEnabled()) return primaryRows;
    const cmpMap = new Map(compareRows.map((r) => [getKey(r), r]));
    return primaryRows.map((row) => attachCompareToRow(row, cmpMap.get(getKey(row))));
  }

  function attachCompareToMajors(majors, compareMajors) {
    if (!isCompareEnabled()) return majors;
    const cmpMap = new Map(compareMajors.map((m) => [m.key, m]));
    return majors.map((m) => {
      const cmp = cmpMap.get(m.key);
      const minors = attachCompareToRows(
        m.minors,
        cmp?.minors || [],
        (min) => min.key
      );
      return { ...attachCompareToRow(m, cmp), minors };
    });
  }

  function mergePublisherCompare(primary, compare) {
    if (!isCompareEnabled()) return primary;
    const cmpMap = new Map(compare.map((p) => [p.key, p]));
    return primary.map((p) => {
      const cmp = cmpMap.get(p.key);
      const detail_rows = attachCompareToRows(
        p.detail_rows || [],
        cmp?.detail_rows || [],
        (r) => r.key
      );
      return { ...attachCompareToRow(p, cmp), detail_rows };
    });
  }

  function metricStackHtml(current, compareVal, pct, type) {
    let html = `<div class="metric-primary">${esc(fmtNum(current, type))}</div>`;
    if (showCompareValues() && compareVal != null) {
      html += `<div class="metric-compare">${esc(fmtNum(compareVal, type))}</div>`;
    }
    if (showChangePct() && pct != null) {
      html += `<div class="metric-pct ${pctClass(pct)}">${esc(fmtPct(pct))}</div>`;
    }
    return html;
  }

  function metricStackHtmlDetail(current, compareVal, pct, type) {
    let html = `<div class="metric-primary">${esc(fmtNum(current, type))}</div>`;
    if (!isCompareEnabled()) return html;
    html += `<div class="metric-compare">${esc(fmtNum(compareVal ?? 0, type))}</div>`;
    html += `<div class="metric-pct ${pctClass(pct)}">${esc(fmtPct(pct))}</div>`;
    return html;
  }

  function renderStackedCountCell(row, forDetail) {
    if (!isCompareEnabled()) {
      return `<td class="num">${row.tag_count}</td>`;
    }
    const stackFn = forDetail ? metricStackHtmlDetail : metricStackHtml;
    return `<td class="num cell-metric-stack">${stackFn(
      row.tag_count,
      row.compare_tag_count,
      row.tag_change_pct,
      'count'
    )}</td>`;
  }

  function getStrategyIndex() {
    if (strategyIndex) return strategyIndex;
    const index = { major: new Map(), minor: new Map() };
    const tax = window.ATTRIBUTION_WIZARD_DATA?.taxonomy;
    tax?.amazon_channel_groups?.forEach((ch) => {
      ch.strategies.forEach((m) => {
        index.major.set(m.strategy_major_code, m.label_zh);
        m.minors.forEach((min) => index.minor.set(min.strategy_minor_code, min.label_zh));
      });
    });
    strategyIndex = index;
    return index;
  }

  function majorLabel(code) {
    return getStrategyIndex().major.get(code) || code;
  }

  function minorLabel(code) {
    return getStrategyIndex().minor.get(code) || code;
  }

  function formatTargeting(t) {
    if (t === 'P') return 'P · 单品';
    if (t === 'S') return 'S · 店铺';
    return t || '—';
  }

  function getCurrency() {
    return $('filterCurrency').value || 'USD';
  }

  function getDateRange() {
    return A.getDateRangeFromPreset(
      $('filterDatePreset').value,
      $('filterDateFrom').value,
      $('filterDateTo').value
    );
  }

  function syncDateRangeUi() {
    const preset = $('filterDatePreset').value;
    const isCustom = preset === 'custom';
    $('filterDateCustom').hidden = !isCustom;
    const display = $('filterDateRangeDisplay');
    if (!preset || isCustom) {
      display.hidden = true;
      display.textContent = '';
      return;
    }
    const range = getDateRange();
    if (range) {
      display.hidden = false;
      display.textContent = A.formatDateRangeLabel(range);
    } else {
      display.hidden = true;
    }
  }

  function getScopedRecords() {
    const currency = getCurrency();
    const dateRange = getDateRange();
    const shop = $('filterShop').value;
    return A.filterRecordsWithMetrics(Store.list(), {
      dateRange,
      shop,
      currency,
      requireMetrics: true,
    });
  }

  function fmtNum(n, type) {
    if (n == null || Number.isNaN(n)) return '—';
    if (type === 'money') {
      const sym = CURRENCY_META[getCurrency()]?.symbol || '$';
      return `${sym}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return Number(n).toLocaleString('en-US');
  }

  function seed() {
    if (window.ATTRIBUTION_TAG_SEED) Store.seedIfEmpty(window.ATTRIBUTION_TAG_SEED);
  }

  function populateShopFilter(list) {
    const shops = [...new Set(list.map((r) => r.shop_code).filter(Boolean))].sort();
    const sel = $('filterShop');
    const prev = sel.value;
    sel.innerHTML =
      '<option value="">全部店铺</option>' +
      shops.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    sel.value = shops.includes(prev) ? prev : '';
  }

  function populateCurrencyFilter(list) {
    const set = new Set(['USD']);
    list.forEach((r) => {
      const mp = A.marketplaceFromRecord(r);
      set.add(A.marketplaceToCurrency(mp));
      Object.keys(r.metrics?.by_currency || {}).forEach((c) => set.add(c));
    });
    const sel = $('filterCurrency');
    const prev = sel.value;
    sel.innerHTML = [...set]
      .sort()
      .map((c) => {
        const sym = CURRENCY_META[c]?.symbol || c;
        return `<option value="${c}">${c} (${sym})</option>`;
      })
      .join('');
    sel.value = [...set].includes(prev) ? prev : 'USD';
  }

  function metricColSpan() {
    return 2 + A.REPORT_METRICS.length;
  }

  function publisherDetailColSpan() {
    return 4 + A.REPORT_METRICS.length;
  }

  function getTableSort(tableId) {
    return tableSort[tableId] || null;
  }

  function cycleTableSort(tableId, metricKey) {
    const cur = tableSort[tableId];
    if (!cur || cur.key !== metricKey) tableSort[tableId] = { key: metricKey, dir: 'desc' };
    else if (cur.dir === 'desc') tableSort[tableId] = { key: metricKey, dir: 'asc' };
    else delete tableSort[tableId];
  }

  function sortMetricRows(rows, key, dir) {
    const mult = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      const na = typeof va === 'number' && !Number.isNaN(va) ? va : null;
      const nb = typeof vb === 'number' && !Number.isNaN(vb) ? vb : null;
      if (na == null && nb == null) return 0;
      if (na == null) return 1;
      if (nb == null) return -1;
      if (na === nb) return 0;
      return (na - nb) * mult;
    });
  }

  function applyTableSort(tableId, rows) {
    const sort = getTableSort(tableId);
    if (!sort || !rows?.length) return rows;
    return sortMetricRows(rows, sort.key, sort.dir);
  }

  function metricHeaderLabel(m) {
    if (m.type !== 'money') return m.label;
    return `${m.label} (${getCurrency()})`;
  }

  function metricSortableTh(tableId, m) {
    const sort = getTableSort(tableId);
    const active = sort?.key === m.key;
    const icon = !active ? '↕' : sort.dir === 'asc' ? '↑' : '↓';
    return `<th class="num th-metric th-metric-sortable${m.type === 'money' ? ' th-money' : ''}${
      active ? ' sorted' : ''
    }"
      data-table-id="${esc(tableId)}"
      data-metric-key="${esc(m.key)}"
      scope="col"
      title="点击排序：降序 → 升序 → 取消"
      aria-sort="${active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
      <span class="th-sort-wrap">${esc(metricHeaderLabel(m))}<span class="th-sort-icon">${icon}</span></span>
    </th>`;
  }

  function bindTableSort() {
    const app = document.querySelector('.app');
    if (!app || app.dataset.sortBound) return;
    app.dataset.sortBound = '1';
    app.addEventListener('click', (e) => {
      const th = e.target.closest('.th-metric-sortable');
      if (!th) return;
      const tableId = th.dataset.tableId;
      const key = th.dataset.metricKey;
      if (!tableId || !key) return;
      e.stopPropagation();
      cycleTableSort(tableId, key);
      rerenderOverviewTable(tableId);
    });
  }

  function rerenderOverviewTable(tableId) {
    if (!lastOverview) {
      renderAll();
      return;
    }
    const actions = {
      tableShop: () => renderSimpleTable('tableShop', lastOverview.byShop, 'label'),
      tableTargeting: () => renderSimpleTable('tableTargeting', lastOverview.byTargeting, 'label'),
      tableAdType: () => renderSimpleTable('tableAdType', lastOverview.byAdType, 'label'),
      tableStrategy: () => renderStrategyTable(lastOverview.byStrategy),
      tablePublisher: () => renderPublisherTable(),
      publisherDetail: () => renderPublisherDetail(),
    };
    actions[tableId]?.();
  }

  function renderSummaryKpis(records, totals, compareTotals) {
    const currency = getCurrency();
    const range = getDateRange();
    const rangeTxt = range ? A.formatDateRangeLabel(range) : '全部时间';
    const compareRange = getCompareDateRange();
    const compareTxt = compareRange ? A.formatDateRangeLabel(compareRange) : '';
    let highlightExtra = '';
    if (isCompareEnabled() && compareTotals) {
      if (showCompareValues()) {
        highlightExtra += `<div class="kpi-compare">对比期 Tag ${compareTotals.tag_count}</div>`;
      }
      const tp = calcPctChange(totals.tag_count, compareTotals.tag_count);
      highlightExtra += `<div class="kpi-pct metric-pct ${pctClass(tp)}">${esc(fmtPct(tp))}</div>`;
    }
    let lbl = `本期 · ${esc(rangeTxt)} · ${esc(currency)} · ${records.length} 条纳入`;
    if (isCompareEnabled() && compareTxt) lbl += ` · 对比 ${esc(compareTxt)}`;
    lastTrendTotals = totals;
    const atMax = trendSelectedKeys.length >= MAX_TREND_METRICS;
    const metricCards = A.REPORT_METRICS.map((m) => {
      let extra = '';
      if (isCompareEnabled() && compareTotals) {
        if (showCompareValues()) {
          extra += `<div class="kpi-compare">${esc(fmtNum(compareTotals[m.key], m.type))}</div>`;
        }
        const pct = calcPctChange(totals[m.key], compareTotals[m.key]);
        extra += `<div class="kpi-pct metric-pct ${pctClass(pct)}">${esc(fmtPct(pct))}</div>`;
      }
      const selIdx = trendSelectedKeys.indexOf(m.key);
      const active = selIdx >= 0;
      const pal = active ? getTrendPalette(selIdx) : { color: '#4b5563' };
      const disabled = !active && atMax;
      return `<button type="button" class="kpi kpi-trend-pick${active ? ' active' : ''}"
        data-metric="${esc(m.key)}"
        style="--metric-color:${pal.color}"
        ${disabled ? 'disabled' : ''}
        aria-pressed="${active}"
        title="${active ? '点击取消趋势图' : atMax ? '最多 4 个指标' : '点击加入趋势图'}">
        <div class="kpi-head">
          <span class="kpi-trend-tag" aria-hidden="true"></span>
          <div class="lbl">${esc(m.label)}</div>
        </div>
        <div class="num">${esc(fmtNum(totals[m.key], m.type))}</div>
        ${extra}
      </button>`;
    }).join('');
    $('summaryKpis').innerHTML =
      `<div class="kpi highlight" style="grid-column:1/-1;max-width:none">
        <div class="lbl">${lbl}</div>
        <div class="num">${totals.tag_count}</div>
        ${highlightExtra}
      </div>` +
      metricCards;
  }

  function tableHeader(dimLabel, tableId) {
    const metricThs = A.REPORT_METRICS.map((m) => metricSortableTh(tableId, m)).join('');
    return `<thead><tr>
      <th class="col-dim">${esc(dimLabel || '维度')}</th>
      <th>Tag 数</th>
      ${metricThs}
    </tr></thead>`;
  }

  function rowCells(label, row, forDetail) {
    const metricTds = A.REPORT_METRICS.map((m) => {
      if (!isCompareEnabled()) {
        return `<td class="num">${fmtNum(row[m.key], m.type)}</td>`;
      }
      const stackFn = forDetail ? metricStackHtmlDetail : metricStackHtml;
      return `<td class="num cell-metric-stack">${stackFn(
        row[m.key],
        row.compare?.[m.key],
        row.change_pct?.[m.key],
        m.type
      )}</td>`;
    }).join('');
    return `<td class="col-dim">${esc(label)}</td>
      ${renderStackedCountCell(row, forDetail)}
      ${metricTds}`;
  }

  function renderSimpleTable(tableId, rows, labelKey) {
    const el = $(tableId);
    if (!rows.length) {
      el.innerHTML = `<tbody><tr><td colspan="${metricColSpan()}" class="empty-hint">当前筛选下无归因数据</td></tr></tbody>`;
      return;
    }
    const sorted = applyTableSort(tableId, rows);
    el.innerHTML =
      tableHeader('', tableId) +
      '<tbody>' +
      sorted.map((r) => `<tr>${rowCells(r[labelKey] ?? r.label, r, true)}</tr>`).join('') +
      '</tbody>';
  }

  function destroyChart(id) {
    if (charts[id]) {
      charts[id].destroy();
      charts[id] = null;
    }
  }

  function getTrendPalette(index) {
    return TREND_PALETTE[index % TREND_PALETTE.length];
  }

  function getSelectedTrendMetrics() {
    return trendSelectedKeys
      .map((k) => A.REPORT_METRICS.find((m) => m.key === k))
      .filter(Boolean)
      .slice(0, MAX_TREND_METRICS);
  }

  function toggleTrendMetric(key) {
    const idx = trendSelectedKeys.indexOf(key);
    if (idx >= 0) {
      if (trendSelectedKeys.length <= 1) return false;
      trendSelectedKeys.splice(idx, 1);
    } else if (trendSelectedKeys.length < MAX_TREND_METRICS) {
      trendSelectedKeys.push(key);
    } else {
      return false;
    }
    return true;
  }

  function refreshSummaryTrendPickState() {
    const atMax = trendSelectedKeys.length >= MAX_TREND_METRICS;
    document.querySelectorAll('#summaryKpis .kpi-trend-pick').forEach((btn) => {
      const key = btn.dataset.metric;
      if (!key) return;
      const selIdx = trendSelectedKeys.indexOf(key);
      const active = selIdx >= 0;
      const pal = active ? getTrendPalette(selIdx) : { color: '#4b5563' };
      btn.classList.toggle('active', active);
      btn.disabled = !active && atMax;
      btn.style.setProperty('--metric-color', pal.color);
      btn.setAttribute('aria-pressed', String(active));
      btn.title = active
        ? '点击取消趋势图显示'
        : atMax
          ? '最多选择 4 个指标'
          : '点击加入趋势图';
    });
  }

  function handleTrendMetricToggle(key) {
    if (!toggleTrendMetric(key)) return;
    refreshSummaryTrendPickState();
    const records = getScopedRecords();
    if (!records.length || !lastTrendTotals) return;
    renderTrendChart(records, lastTrendTotals);
  }

  function buildTrendScales(selected) {
    const scales = {
      x: {
        ticks: { color: '#8b9cb3', maxRotation: 0, autoSkip: true, maxTicksLimit: 14 },
        grid: { color: 'rgba(45, 48, 68, 0.35)' },
      },
    };
    selected.forEach((metric, i) => {
      const pal = getTrendPalette(i);
      const axisId = TREND_AXIS_IDS[i];
      const position = i % 2 === 0 ? 'left' : 'right';
      scales[axisId] = {
        type: 'linear',
        position,
        display: true,
        grid: {
          drawOnChartArea: i === 0,
          color: 'rgba(45, 48, 68, 0.35)',
        },
        ticks: {
          color: pal.color,
          maxTicksLimit: 6,
          callback: (v) =>
            metric.type === 'money'
              ? fmtNum(v, 'money')
              : Number(v).toLocaleString('en-US', { notation: 'compact', compactDisplay: 'short' }),
        },
        border: { color: pal.color, dash: [4, 4] },
      };
    });
    return scales;
  }

  function renderTrendChart(records, totals) {
    destroyChart('chartTrend');
    const canvas = $('chartTrend');
    const emptyEl = $('trendChartEmpty');
    if (!canvas) return;

    if (!records.length) {
      trendData = null;
      if (emptyEl) emptyEl.hidden = true;
      return;
    }

    trendData = A.buildDailyTrend(records, getCurrency(), getDateRange());
    const selected = getSelectedTrendMetrics();
    const labels = trendData.labels.map((ymd) => {
      const d = new Date(ymd + 'T12:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    if (!selected.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    const datasets = selected.map((metric, i) => {
      const pal = getTrendPalette(i);
      return {
        label: metric.label,
        data: trendData.valuesByMetric[metric.key] || [],
        borderColor: pal.color,
        backgroundColor: pal.bg,
        borderWidth: 2,
        fill: false,
        tension: 0,
        pointRadius: trendData.labels.length > 24 ? 0 : 2,
        pointHoverRadius: 4,
        pointBackgroundColor: pal.color,
        yAxisID: TREND_AXIS_IDS[i],
        metricType: metric.type,
      };
    });

    charts.chartTrend = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const i = items[0]?.dataIndex;
                return i != null ? trendData.labels[i] : '';
              },
              label: (ctx) => {
                const ds = ctx.dataset;
                const v = ctx.parsed.y;
                return `${ds.label}: ${fmtNum(v, ds.metricType)}`;
              },
            },
          },
        },
        scales: buildTrendScales(selected),
      },
    });
  }

  function renderBarChart(canvasId, rows, labelKey) {
    destroyChart(canvasId);
    const ctx = $(canvasId);
    if (!ctx || !rows.length) return;
    const labels = rows.map((r) => r[labelKey] ?? r.label);
    charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Total product sales',
            data: rows.map((r) => r.total_product_sales),
            backgroundColor: 'rgba(168, 85, 247, 0.55)',
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: '#8b9cb3' },
            grid: { color: 'rgba(45, 48, 68, 0.5)' },
          },
          y: { ticks: { color: '#e8eef5', font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  function renderStrategyTable(majors) {
    const el = $('tableStrategy');
    const tableId = 'tableStrategy';
    if (!majors.length) {
      el.innerHTML = `<tbody><tr><td colspan="${metricColSpan()}" class="empty-hint">无数据</td></tr></tbody>`;
      return;
    }
    const sortedMajors = applyTableSort(tableId, majors);
    let html = tableHeader('营销大类 / 小类', tableId) + '<tbody>';
    sortedMajors.forEach((m) => {
      const open = expandedMajor === m.key;
      html += `<tr class="clickable${open ? ' active' : ''}" data-major="${esc(m.key)}">${rowCells(`▸ ${m.label}`, m, true)}</tr>`;
      if (open) {
        applyTableSort(tableId, m.minors).forEach((min) => {
          html += `<tr class="drill-row">${rowCells(`　└ ${min.label}`, min, true)}</tr>`;
        });
      }
    });
    html += '</tbody>';
    el.innerHTML = html;
    el.querySelectorAll('tr.clickable').forEach((tr) => {
      tr.addEventListener('click', () => {
        const key = tr.dataset.major;
        expandedMajor = expandedMajor === key ? null : key;
        renderStrategyTable(majors);
      });
    });
  }

  function publisherDetailTableHeader() {
    const tableId = 'publisherDetail';
    const metricThs = A.REPORT_METRICS.map((m) => metricSortableTh(tableId, m)).join('');
    return `<thead><tr>
      <th class="col-dim">广告类型</th>
      <th class="col-dim">营销大类</th>
      <th class="col-dim">营销小类</th>
      <th>Tag 数</th>
      ${metricThs}
    </tr></thead>`;
  }

  function publisherDetailRowCells(row) {
    const metricTds = A.REPORT_METRICS.map((m) => {
      if (!isCompareEnabled()) {
        return `<td class="num">${fmtNum(row[m.key], m.type)}</td>`;
      }
      return `<td class="num cell-metric-stack">${metricStackHtmlDetail(
        row[m.key],
        row.compare?.[m.key],
        row.change_pct?.[m.key],
        m.type
      )}</td>`;
    }).join('');
    return `<td class="col-dim">${esc(row.ad_type)}</td>
      <td class="col-dim">${esc(row.strategy_major_label)}</td>
      <td class="col-dim">${esc(row.strategy_minor_label)}</td>
      ${renderStackedCountCell(row, true)}
      ${metricTds}`;
  }

  function renderPublisherTable() {
    const el = $('tablePublisher');
    if (!publisherData.length) {
      el.innerHTML = `<tbody><tr><td colspan="${metricColSpan()}" class="empty-hint">无数据</td></tr></tbody>`;
      $('publisherDetail').hidden = true;
      return;
    }
    const sortedPubs = applyTableSort('tablePublisher', publisherData);
    el.innerHTML =
      tableHeader('Publisher', 'tablePublisher') +
      '<tbody>' +
      sortedPubs
        .map((p) => {
          const active = selectedPublisher === p.key;
          return `<tr class="clickable${active ? ' active' : ''}" data-pub="${esc(p.key)}">${rowCells(p.label, p)}</tr>`;
        })
        .join('') +
      '</tbody>';
    el.querySelectorAll('tr.clickable').forEach((tr) => {
      tr.addEventListener('click', () => {
        const key = tr.dataset.pub;
        selectedPublisher = selectedPublisher === key ? null : key;
        renderPublisherTable();
        renderPublisherDetail();
      });
    });
    renderPublisherDetail();
  }

  function renderPublisherDetail() {
    const box = $('publisherDetail');
    const p = publisherData.find((x) => x.key === selectedPublisher);
    if (!p) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const rows = applyTableSort('publisherDetail', p.detail_rows || []);
    const body = rows.length
      ? rows.map((r) => `<tr>${publisherDetailRowCells(r)}</tr>`).join('')
      : `<tr><td colspan="${publisherDetailColSpan()}" class="empty-hint">该 Publisher 下无颗粒明细</td></tr>`;
    box.innerHTML = `<h3>${esc(p.label)} · 营销小类颗粒明细</h3>
      <p class="hint">每行 = 广告类型 + 营销大类 + 营销小类 组合；同一组合下 Tag 指标已汇总${
        isCompareEnabled() ? '；启用对比时按区间折算，蓝字为对比期、绿/红为涨跌' : ''
      }</p>
      <div class="table-scroll mini-scroll">
        <table>${publisherDetailTableHeader()}<tbody>${body}</tbody></table>
      </div>`;
  }

  function renderAll() {
    const all = Store.list();
    populateShopFilter(all);
    populateCurrencyFilter(all);
    syncDateRangeUi();
    syncCompareRangeUi();

    const primaryRange = getDateRange();
    const compareRange = getCompareDateRange();
    const records = getRecordsForRange(primaryRange);
    const currency = getCurrency();
    const aggRange = isCompareEnabled() && primaryRange ? primaryRange : null;
    const totals =
      aggRange != null
        ? A.summarize(records, currency, aggRange)
        : A.summarize(records, currency);
    let compareTotals = null;
    let compareRecords = [];
    if (isCompareEnabled() && compareRange) {
      compareRecords = getRecordsForRange(compareRange);
      compareTotals = A.summarize(compareRecords, currency, compareRange);
    }

    if (!records.length) {
      $('summaryKpis').innerHTML =
        '<div class="kpi highlight" style="grid-column:1/-1"><div class="lbl">当前筛选下没有可归因的 Tag 数据，请调整时间或先在管理页确认 active Tag 已同步 metrics</div></div>';
      ['tableShop', 'tableTargeting', 'tableAdType', 'tableStrategy', 'tablePublisher'].forEach(
        (id) => {
          $(id).innerHTML =
            `<tbody><tr><td colspan="${metricColSpan()}" class="empty-hint">无数据</td></tr></tbody>`;
        }
      );
      ['chartShop', 'chartTargeting', 'chartAdType', 'chartTrend'].forEach(destroyChart);
      $('publisherDetail').hidden = true;
      trendData = null;
      lastOverview = null;
      if ($('trendChartEmpty')) $('trendChartEmpty').hidden = true;
      return;
    }

    renderSummaryKpis(records, totals, compareTotals);
    renderTrendChart(records, totals);

    const byShop = A.groupBy(records, (r) => r.shop_code, null, currency, aggRange);
    const byTargeting = A.groupBy(
      records,
      (r) => r.targeting || '—',
      (k) => formatTargeting(k),
      currency,
      aggRange
    );
    const byAdType = A.groupBy(records, (r) => r.ad_type || '—', null, currency, aggRange);
    let byStrategy = A.groupByMajorMinor(
      records,
      currency,
      majorLabel,
      minorLabel,
      aggRange
    );
    publisherData = A.publisherBreakdown(
      records,
      currency,
      majorLabel,
      minorLabel,
      aggRange
    );

    if (isCompareEnabled() && compareRange) {
      const cmpRange = compareRange;
      const byShopCmp = A.groupBy(
        compareRecords,
        (r) => r.shop_code,
        null,
        currency,
        cmpRange
      );
      const byTargetingCmp = A.groupBy(
        compareRecords,
        (r) => r.targeting || '—',
        (k) => formatTargeting(k),
        currency,
        cmpRange
      );
      const byAdTypeCmp = A.groupBy(
        compareRecords,
        (r) => r.ad_type || '—',
        null,
        currency,
        cmpRange
      );
      const byStrategyCmp = A.groupByMajorMinor(
        compareRecords,
        currency,
        majorLabel,
        minorLabel,
        cmpRange
      );
      const pubCmp = A.publisherBreakdown(
        compareRecords,
        currency,
        majorLabel,
        minorLabel,
        cmpRange
      );
      publisherData = mergePublisherCompare(publisherData, pubCmp);
      lastOverview = {
        byShop: attachCompareToRows(byShop, byShopCmp, (r) => r.key),
        byTargeting: attachCompareToRows(byTargeting, byTargetingCmp, (r) => r.key),
        byAdType: attachCompareToRows(byAdType, byAdTypeCmp, (r) => r.key),
        byStrategy: attachCompareToMajors(byStrategy, byStrategyCmp),
      };
    } else if (isCompareEnabled()) {
      lastOverview = {
        byShop: attachCompareToRows(byShop, [], (r) => r.key),
        byTargeting: attachCompareToRows(byTargeting, [], (r) => r.key),
        byAdType: attachCompareToRows(byAdType, [], (r) => r.key),
        byStrategy: attachCompareToMajors(byStrategy, []),
      };
    } else {
      lastOverview = { byShop, byTargeting, byAdType, byStrategy };
    }

    const dimShop = lastOverview.byShop;
    const dimTargeting = lastOverview.byTargeting;
    const dimAdType = lastOverview.byAdType;
    const dimStrategy = lastOverview.byStrategy;

    renderSimpleTable('tableShop', dimShop, 'label');
    renderSimpleTable('tableTargeting', dimTargeting, 'label');
    renderSimpleTable('tableAdType', dimAdType, 'label');
    renderBarChart('chartShop', dimShop.slice(0, 8), 'label');
    renderBarChart('chartTargeting', dimTargeting, 'label');
    renderBarChart('chartAdType', dimAdType, 'label');
    renderStrategyTable(dimStrategy);
    renderPublisherTable();
  }

  function init() {
    seed();
    bindTableSort();
    renderAll();

    $('summaryKpis')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.kpi-trend-pick');
      if (!btn || btn.disabled) return;
      const key = btn.dataset.metric;
      if (!key) return;
      handleTrendMetricToggle(key);
    });

    $('compareEnabled').addEventListener('change', renderAll);
    $('compareDatePreset').addEventListener('change', () => {
      if ($('compareDatePreset').value === 'custom' && !$('compareDateFrom').value) {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 29);
        $('compareDateFrom').value = A.toYmd(start);
        $('compareDateTo').value = A.toYmd(end);
      }
      syncCompareRangeUi();
      renderAll();
    });
    ['compareDateFrom', 'compareDateTo'].forEach((id) => {
      $(id).addEventListener('change', () => {
        if ($('compareDatePreset').value === 'custom') {
          syncCompareRangeUi();
          renderAll();
        }
      });
    });
    $('showCompareValues').addEventListener('change', renderAll);
    $('showChangePct').addEventListener('change', renderAll);

    $('filterShop').addEventListener('change', renderAll);
    $('filterCurrency').addEventListener('change', renderAll);
    $('filterDatePreset').addEventListener('change', () => {
      if ($('filterDatePreset').value === 'custom' && !$('filterDateFrom').value) {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 29);
        $('filterDateFrom').value = A.toYmd(start);
        $('filterDateTo').value = A.toYmd(end);
      }
      syncDateRangeUi();
      syncCompareRangeUi();
      renderAll();
    });
    ['filterDateFrom', 'filterDateTo'].forEach((id) => {
      $(id).addEventListener('change', () => {
        if ($('filterDatePreset').value === 'custom') {
          syncDateRangeUi();
          syncCompareRangeUi();
          renderAll();
        }
      });
    });
    $('btnResetSeed').addEventListener('click', () => {
      if (!confirm('清空并重新注入 Demo 数据？')) return;
      localStorage.removeItem(Store.STORAGE_KEY);
      seed();
      expandedMajor = null;
      selectedPublisher = null;
      renderAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

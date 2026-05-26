/**
 * Amazon Attribution Tag 指标聚合（Demo 共用）
 */
(function (global) {
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

  /** 与 Amazon Attribution Campaigns 报表 / 管理页列表列一致 */
  const REPORT_METRICS = [
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

  const SUMMARY_METRICS = REPORT_METRICS;

  const ALL_METRIC_KEYS = REPORT_METRICS.map((m) => m.key);

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

  function periodsOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
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

  function getDateRangeFromPreset(preset, dateFrom, dateTo) {
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
      if (!dateFrom || !dateTo) return null;
      const start = parseYmdToStart(dateFrom);
      const end = parseYmdToEnd(dateTo);
      if (!start || !end || start > end) return null;
      return { start, end };
    }
    return null;
  }

  function formatDateRangeLabel(range) {
    if (!range?.start || !range?.end) return '';
    return `${toYmd(range.start)} ~ ${toYmd(range.end)}`;
  }

  function marketplaceFromRecord(r) {
    if (r.marketplace) return r.marketplace;
    const code = r.shop_code || '';
    const i = code.lastIndexOf('_');
    return i >= 0 ? code.slice(i + 1) : 'US';
  }

  function marketplaceToCurrency(mp) {
    return MP_CURRENCY[mp] || 'USD';
  }

  function getMetricsRow(r, currency) {
    const m = r.metrics;
    if (!m?.by_currency) return null;
    const row = m.by_currency[currency];
    if (!row) return null;
    return row;
  }

  /** 将 Tag 指标按「记录周期 ∩ 筛选区间」天数比例折算（与 buildDailyTrend 均摊逻辑一致） */
  function metricsRowForRange(r, currency, filterRange) {
    const row = getMetricsRow(r, currency);
    if (!row) return null;
    if (!filterRange) return row;
    const period = getRecordDataPeriod(r);
    if (!period) return null;
    const slice = intersectPeriod(
      period.start,
      period.end,
      filterRange.start,
      filterRange.end
    );
    if (!slice) return null;
    const periodDays = eachDayInRange(period.start, period.end).length;
    const sliceDays = eachDayInRange(slice.start, slice.end).length;
    if (!periodDays || !sliceDays) return null;
    const ratio = sliceDays / periodDays;
    const scaled = {};
    ALL_METRIC_KEYS.forEach((k) => {
      const v = row[k];
      scaled[k] =
        typeof v === 'number' && !Number.isNaN(v) ? Math.round(v * ratio * 100) / 100 : 0;
    });
    return scaled;
  }

  /** 与当前区间等长的上一段连续日期（环比上期） */
  function getPreviousPeriodRange(range) {
    if (!range?.start || !range?.end) return null;
    const n = eachDayInRange(range.start, range.end).length;
    if (!n) return null;
    const prevEnd = endOfDay(new Date(range.start));
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = startOfDay(new Date(prevEnd));
    prevStart.setDate(prevStart.getDate() - (n - 1));
    return { start: prevStart, end: prevEnd };
  }

  function recordInDateRange(r, dateRange) {
    if (!dateRange) return true;
    const period = getRecordDataPeriod(r);
    if (!period) return false;
    return periodsOverlap(period.start, period.end, dateRange.start, dateRange.end);
  }

  function filterRecordsWithMetrics(records, opts) {
    const { dateRange, shop, currency, requireMetrics = true } = opts;
    return records.filter((r) => {
      if (shop && r.shop_code !== shop) return false;
      if (!recordInDateRange(r, dateRange)) return false;
      if (requireMetrics && !getMetricsRow(r, currency)) return false;
      return true;
    });
  }

  function emptyTotals() {
    const o = { tag_count: 0 };
    ALL_METRIC_KEYS.forEach((k) => {
      o[k] = 0;
    });
    return o;
  }

  function addMetrics(totals, row) {
    if (!row) return;
    ALL_METRIC_KEYS.forEach((k) => {
      const v = row[k];
      if (typeof v === 'number' && !Number.isNaN(v)) totals[k] += v;
    });
  }

  function summarize(records, currency, range) {
    const totals = emptyTotals();
    records.forEach((r) => {
      const row = range ? metricsRowForRange(r, currency, range) : getMetricsRow(r, currency);
      if (!row) return;
      totals.tag_count += 1;
      addMetrics(totals, row);
    });
    return totals;
  }

  function groupBy(records, keyFn, labelFn, currency, range) {
    const map = new Map();
    records.forEach((r) => {
      const key = keyFn(r);
      const row = range ? metricsRowForRange(r, currency, range) : getMetricsRow(r, currency);
      if (!row) return;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: labelFn ? labelFn(key, r) : key,
          ...emptyTotals(),
        });
      }
      const bucket = map.get(key);
      bucket.tag_count += 1;
      addMetrics(bucket, row);
    });
    return [...map.values()].sort((a, b) => b.total_product_sales - a.total_product_sales);
  }

  function groupByMajorMinor(records, currency, majorLabel, minorLabel, range) {
    const majors = new Map();
    records.forEach((r) => {
      const row = range ? metricsRowForRange(r, currency, range) : getMetricsRow(r, currency);
      if (!row) return;
      const major = r.strategy_major || '—';
      const minor = r.strategy_minor || '—';
      if (!majors.has(major)) {
        majors.set(major, {
          key: major,
          label: majorLabel(major) || major,
          ...emptyTotals(),
          minors: new Map(),
        });
      }
      const mBucket = majors.get(major);
      mBucket.tag_count += 1;
      addMetrics(mBucket, row);
      if (!mBucket.minors.has(minor)) {
        mBucket.minors.set(minor, {
          key: minor,
          label: minorLabel(minor) || minor,
          ...emptyTotals(),
        });
      }
      const minBucket = mBucket.minors.get(minor);
      minBucket.tag_count += 1;
      addMetrics(minBucket, row);
    });
    return [...majors.values()]
      .map((m) => ({
        ...m,
        minors: [...m.minors.values()].sort((a, b) => b.total_product_sales - a.total_product_sales),
      }))
      .sort((a, b) => b.total_product_sales - a.total_product_sales);
  }

  function eachDayInRange(start, end) {
    const days = [];
    const cursor = startOfDay(start);
    const last = startOfDay(end);
    while (cursor <= last) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  function intersectPeriod(aStart, aEnd, bStart, bEnd) {
    const start = aStart > bStart ? aStart : bStart;
    const end = aEnd < bEnd ? aEnd : bEnd;
    if (start > end) return null;
    return { start, end };
  }

  function resolveTrendRange(records, filterRange) {
    if (filterRange) return filterRange;
    let start = null;
    let end = null;
    records.forEach((r) => {
      const p = getRecordDataPeriod(r);
      if (!p) return;
      if (!start || p.start < start) start = p.start;
      if (!end || p.end > end) end = p.end;
    });
    if (start && end) return { start, end };
    const today = startOfDay(new Date());
    const fallback = new Date(today);
    fallback.setDate(fallback.getDate() - 29);
    return { start: fallback, end: endOfDay(new Date()) };
  }

  /**
   * 按日趋势：各 Tag 在「筛选区间 ∩ 自身 period」内将指标均摊到每日后求和（Demo 估算，非亚马逊日粒度原数）
   */
  function buildDailyTrend(records, currency, filterRange) {
    const range = resolveTrendRange(records, filterRange);
    const days = eachDayInRange(range.start, range.end);
    const buckets = days.map((d) => {
      const date = toYmd(d);
      const values = Object.fromEntries(ALL_METRIC_KEYS.map((k) => [k, 0]));
      return { date, values };
    });
    const idxByDate = new Map(buckets.map((b, i) => [b.date, i]));

    records.forEach((r) => {
      const row = getMetricsRow(r, currency);
      if (!row) return;
      const period = getRecordDataPeriod(r);
      if (!period) return;
      const slice = intersectPeriod(
        period.start,
        period.end,
        range.start,
        range.end
      );
      if (!slice) return;
      const sliceDays = eachDayInRange(slice.start, slice.end);
      const n = sliceDays.length;
      if (!n) return;
      sliceDays.forEach((day) => {
        const date = toYmd(day);
        const idx = idxByDate.get(date);
        if (idx == null) return;
        ALL_METRIC_KEYS.forEach((k) => {
          const v = row[k];
          if (typeof v === 'number' && !Number.isNaN(v)) {
            buckets[idx].values[k] += v / n;
          }
        });
      });
    });

    return {
      range,
      labels: buckets.map((b) => b.date),
      valuesByMetric: Object.fromEntries(
        ALL_METRIC_KEYS.map((k) => [k, buckets.map((b) => b.values[k])])
      ),
    };
  }

  /** Publisher 下钻：广告类型 × 营销大类 × 营销小类 组合颗粒 */
  function publisherGranularRows(records, currency, majorLabel, minorLabel, range) {
    const map = new Map();
    records.forEach((r) => {
      const row = range ? metricsRowForRange(r, currency, range) : getMetricsRow(r, currency);
      if (!row) return;
      const adType = r.ad_type || '—';
      const major = r.strategy_major || '—';
      const minor = r.strategy_minor || '—';
      const key = `${adType}\0${major}\0${minor}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          ad_type: adType,
          strategy_major: major,
          strategy_major_label: majorLabel(major) || major,
          strategy_minor: minor,
          strategy_minor_label: minorLabel(minor) || minor,
          ...emptyTotals(),
        });
      }
      const bucket = map.get(key);
      bucket.tag_count += 1;
      addMetrics(bucket, row);
    });
    return [...map.values()].sort((a, b) => b.total_product_sales - a.total_product_sales);
  }

  function publisherBreakdown(records, currency, majorLabel, minorLabel, range) {
    const pubs = groupBy(
      records,
      (r) => r.publisher_name || '—',
      (k) => k,
      currency,
      range
    );
    return pubs.map((p) => {
      const subset = records.filter((r) => (r.publisher_name || '—') === p.key);
      return {
        ...p,
        detail_rows: publisherGranularRows(
          subset,
          currency,
          majorLabel,
          minorLabel,
          range
        ),
      };
    });
  }

  global.AttributionTagAnalytics = {
    MP_CURRENCY,
    REPORT_METRICS,
    SUMMARY_METRICS,
    ALL_METRIC_KEYS,
    startOfDay,
    endOfDay,
    toYmd,
    getDateRangeFromPreset,
    formatDateRangeLabel,
    getRecordDataPeriod,
    recordInDateRange,
    marketplaceFromRecord,
    marketplaceToCurrency,
    getMetricsRow,
    metricsRowForRange,
    getPreviousPeriodRange,
    filterRecordsWithMetrics,
    summarize,
    groupBy,
    groupByMajorMinor,
    publisherBreakdown,
    publisherGranularRows,
    buildDailyTrend,
    resolveTrendRange,
    emptyTotals,
  };
})(typeof window !== 'undefined' ? window : globalThis);

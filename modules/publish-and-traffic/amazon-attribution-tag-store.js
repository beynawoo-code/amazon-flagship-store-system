/**
 * Demo 本地存储：Amazon Attribution Tag 申请单
 * 创建页写入 · 管理页读取/更新配对
 */
(function (global) {
  const STORAGE_KEY = 'erp_attribution_tag_requests_v1';

  function readAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function writeAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function generateId() {
    return `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function getLinkStatus(record) {
    if (record.amazon_campaign_id && record.amazon_ad_group_id && record.attribution_tag_raw) {
      return 'linked';
    }
    if (record.attribution_tag_raw) return 'tag_only';
    return 'unlinked';
  }

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

  function marketplaceFromRecord(record) {
    if (record.marketplace) return record.marketplace;
    const code = record.shop_code || '';
    const i = code.lastIndexOf('_');
    return i >= 0 ? code.slice(i + 1) : 'US';
  }

  function normalizeMetrics(metrics, marketplace) {
    if (!metrics) return null;
    if (metrics.by_currency) return metrics;
    const native = MP_CURRENCY[marketplace] || 'USD';
    const row = {
      click_throughs: metrics.click_throughs ?? metrics.clicks ?? 0,
      dpv: metrics.dpv ?? 0,
      dpv_clicks: metrics.dpv_clicks ?? 0,
      total_dpv: metrics.total_dpv ?? metrics.dpv ?? 0,
      atc: metrics.atc ?? 0,
      atc_clicks: metrics.atc_clicks ?? 0,
      total_atc: metrics.total_atc ?? 0,
      purchases: metrics.purchases ?? 0,
      purchases_clicks: metrics.purchases_clicks ?? 0,
      total_purchases: metrics.total_purchases ?? 0,
      product_sales: metrics.product_sales ?? 0,
      product_sales_clicks: metrics.product_sales_clicks ?? 0,
      total_product_sales: metrics.total_product_sales ?? metrics.sales ?? 0,
      units_sold: metrics.units_sold ?? 0,
      units_sold_clicks: metrics.units_sold_clicks ?? 0,
      total_units_sold: metrics.total_units_sold ?? 0,
      brand_referral_bonus: metrics.brand_referral_bonus ?? 0,
    };
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
    const out = { last_sync_at: metrics.last_sync_at || null, by_currency };
    if (metrics.period_start) out.period_start = metrics.period_start;
    if (metrics.period_end) out.period_end = metrics.period_end;
    return out;
  }

  function ymdFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function ensureMetricsPeriod(metrics, launchDateYmd) {
    if (!metrics) return metrics;
    if (metrics.period_start && metrics.period_end) return metrics;
    const end = metrics.last_sync_at ? new Date(metrics.last_sync_at) : new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    if (launchDateYmd) {
      const s = String(launchDateYmd);
      const iso =
        s.length === 8
          ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
          : s.slice(0, 10);
      const launch = new Date(`${iso}T00:00:00`);
      if (!Number.isNaN(launch.getTime()) && launch > start) start.setTime(launch.getTime());
    }
    return { ...metrics, period_start: ymdFromDate(start), period_end: ymdFromDate(end) };
  }

  function normalizeUser(user) {
    if (!user) return null;
    if (typeof user === 'string') return { name: user, avatar_url: '' };
    return { name: user.name || '—', avatar_url: user.avatar_url || '' };
  }

  function normalize(record) {
    const r = { ...record };
    r.link_status = getLinkStatus(r);
    const mp = marketplaceFromRecord(r);
    if (!r.marketplace) r.marketplace = mp;
    r.requester = normalizeUser(r.requester);
    r.console_creator = normalizeUser(r.console_creator);
    if (!r.requested_at && r.created_at) r.requested_at = r.created_at;
    if (!r.console_created) {
      r.console_creator = null;
      r.console_created_at = null;
    }
    if (r.metrics) {
      r.metrics = normalizeMetrics(r.metrics, mp);
      r.metrics = ensureMetricsPeriod(r.metrics, r.launch_date);
    }
    if (r.erp_status === 'active' && !r.metrics) {
      r.metrics = normalizeMetrics(
        {
          click_throughs: 0,
          total_dpv: 0,
          total_atc: 0,
          total_purchases: 0,
          total_product_sales: 0,
          brand_referral_bonus: 0,
          last_sync_at: null,
        },
        mp
      );
    }
    return r;
  }

  global.AttributionTagStore = {
    STORAGE_KEY,

    list() {
      return readAll()
        .map(normalize)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    },

    get(id) {
      return readAll().map(normalize).find((r) => r.tag_request_id === id) || null;
    },

    save(record) {
      const list = readAll();
      const now = new Date().toISOString();
      const item = normalize({
        ...record,
        tag_request_id: record.tag_request_id || generateId(),
        created_at: record.created_at || now,
        updated_at: now,
      });
      list.unshift(item);
      writeAll(list);
      return item;
    },

    update(id, patch) {
      const list = readAll();
      const idx = list.findIndex((r) => r.tag_request_id === id);
      if (idx < 0) return null;
      const now = new Date().toISOString();
      list[idx] = normalize({
        ...list[idx],
        ...patch,
        updated_at: now,
      });
      writeAll(list);
      return list[idx];
    },

    seedIfEmpty(seedRecords) {
      if (readAll().length > 0) return false;
      writeAll(seedRecords.map((r) => normalize({ ...r })));
      return true;
    },

    replaceAll(seedRecords) {
      writeAll(seedRecords.map((r) => normalize({ ...r })));
      return readAll().length;
    },

    getLinkStatus,
  };
})(window);

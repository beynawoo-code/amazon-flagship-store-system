/**
 * Flagship Store Insights · 演示数据引擎（可替换为 Ads API / 数仓）
 */
(function (global) {
  const MARKETS = [
    { id: 'US', label: 'US', region: 'NA', seed: 11 },
    { id: 'CA', label: 'CA', region: 'NA', seed: 17 },
    { id: 'UK', label: 'UK', region: 'EU', seed: 23 },
    { id: 'DE', label: 'DE', region: 'EU', seed: 29 },
    { id: 'ES', label: 'ES', region: 'EU', seed: 31 },
    { id: 'IT', label: 'IT', region: 'EU', seed: 37 },
    { id: 'FR', label: 'FR', region: 'EU', seed: 41 },
  ];

  const SCENES = ['公共', '居家', '户外', '观影', '新潮', '季节'];
  const PRODUCT_LINES = ['居家', '户外', '季节', '观影', '新潮'];
  const CAMPAIGN_SCENES = [
    { id: 'bfcm', name: 'BFCM 2025', scene: '季节' },
    { id: 'prime', name: 'Prime Day 2025', scene: '公共' },
    { id: 'spring', name: 'Spring Sale', scene: '户外' },
  ];

  const ORGANIC_SPLIT = [
    { key: 'brand_link', label: '详情页品牌链' },
    { key: 'direct', label: '直接访问' },
    { key: 'search', label: '自然搜索' },
  ];

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function periodLength(grain) {
    return { week: 7, month: 30, quarter: 90, year: 365 }[grain] || 30;
  }

  function getPagesFromSeed() {
    const seed = global.BRAND_STORE_PAGE_HIERARCHY_SEED;
    if (!seed?.pages?.length) return null;
    return seed.pages.map((p) => ({
      page_id: p.page_id,
      marketplace: p.marketplace,
      page_name_export: p.page_name_export,
      page_title: p.page_title || p.page_name_export,
      scene_category: p.scene_category || '公共',
      content_category: p.content_category || '公共',
      status: p.status || 'active',
    }));
  }

  function fallbackPages() {
    const names = [
      'Home',
      'Lighting Space',
      'Lighting Space › Bedroom',
      'Lighting Categories › Smart Bulbs',
      'Lighting Categories › TV Backlights',
      'New Releases',
      'Inspiration Studio',
    ];
    const scenes = ['公共', '居家', '居家', '居家', '观影', '公共', '公共'];
    const contents = ['公共', '空间', '空间', '品类', '品类', '公共', '公共'];
    return MARKETS.flatMap((m) =>
      names.map((name, i) => ({
        page_id: `${m.id}_p${i}`,
        marketplace: m.id,
        page_name_export: name,
        page_title: name.split(' › ').pop(),
        scene_category: scenes[i],
        content_category: contents[i],
        status: 'active',
      }))
    );
  }

  function allPages() {
    return getPagesFromSeed() || fallbackPages();
  }

  function heroSkus() {
    return [
      { sku: 'H6076', asin: 'B0DEMO6076', name: 'Floor Lamp Pro', line: '居家', hero: true },
      { sku: 'H6199', asin: 'B0DEMO6199', name: 'TV Backlight 3 Lite', line: '观影', hero: true },
      { sku: 'H705ABC', asin: 'B0DEMO705A', name: 'Outdoor Permanent', line: '户外', hero: true },
      { sku: 'H6601', asin: 'B0DEMO6601', name: 'Gaming Wall Light', line: '新潮', hero: true },
      { sku: 'H6001', asin: 'B0DEMO6001', name: 'Bulb RGBIC', line: '居家', hero: false },
      { sku: 'H6013', asin: 'B0DEMO6013', name: 'Strip M1', line: '居家', hero: false },
      { sku: 'H7020', asin: 'B0DEMO7020', name: 'Holiday String', line: '季节', hero: false },
      { sku: 'H7038', asin: 'B0DEMO7038', name: 'Garden Path', line: '户外', hero: false },
    ];
  }

  function baseMetrics(rnd, scale) {
    const visits = Math.round((800 + rnd() * 4200) * scale);
    const views = Math.round(visits * (1.6 + rnd() * 0.5));
    const visitors = Math.round(visits * (0.68 + rnd() * 0.12));
    const newToStore = Math.round(visitors * (0.22 + rnd() * 0.15));
    const orders = Math.round(visits * (0.038 + rnd() * 0.025));
    const units = Math.round(orders * (1.15 + rnd() * 0.45));
    const sales = Math.round(orders * (42 + rnd() * 28) * 100) / 100;
    const asp = orders ? sales / orders : 0;
    const upt = orders ? units / orders : 0;
    const cvr = visits ? (orders / visits) * 100 : 0;
    const ntsPct = visitors ? (newToStore / visitors) * 100 : 0;
    const dwell = Math.round(45 + rnd() * 120);
    const bounce = Math.round((28 + rnd() * 22) * 10) / 10;
    const ads = Math.round(visits * (0.35 + rnd() * 0.2));
    const organic = Math.round(visits * (0.4 + rnd() * 0.15));
    const other = Math.max(0, visits - ads - organic);
    return {
      visits,
      views,
      visitors,
      newToStore,
      orders,
      units,
      sales,
      asp,
      upt,
      cvr,
      ntsPct,
      dwell,
      bounce,
      adsVisits: ads,
      organicVisits: organic,
      otherVisits: other,
    };
  }

  function withCompare(cur, prev) {
    const out = { ...cur };
    Object.keys(cur).forEach((k) => {
      if (typeof cur[k] !== 'number') return;
      const p = prev?.[k];
      out[`${k}_prev`] = p;
      out[`${k}_pct`] = p ? ((cur[k] - p) / p) * 100 : null;
    });
    return out;
  }

  function aggregate(rows, keys) {
    const sum = {};
    keys.forEach((k) => {
      sum[k] = rows.reduce((a, r) => a + (r[k] || 0), 0);
    });
    if (sum.orders && sum.visits) sum.cvr = (sum.orders / sum.visits) * 100;
    if (sum.orders && sum.sales) sum.asp = sum.sales / sum.orders;
    if (sum.orders && sum.units) sum.upt = sum.units / sum.orders;
    if (sum.visitors && sum.newToStore) sum.ntsPct = (sum.newToStore / sum.visitors) * 100;
    return sum;
  }

  function marketMetrics(marketIds, grain, offsetDays) {
    const len = periodLength(grain);
    const daily = [];
    for (let d = 0; d < len; d++) {
      const dayRows = [];
      marketIds.forEach((mid) => {
        const m = MARKETS.find((x) => x.id === mid);
        const rnd = mulberry32(m.seed + offsetDays * 13 + d * 97);
        dayRows.push(baseMetrics(rnd, 1 + len / 30));
      });
      daily.push(aggregate(dayRows, [
        'visits',
        'views',
        'visitors',
        'newToStore',
        'orders',
        'units',
        'sales',
        'adsVisits',
        'organicVisits',
        'otherVisits',
      ]));
    }
    const total = aggregate(daily, [
      'visits',
      'views',
      'visitors',
      'newToStore',
      'orders',
      'units',
      'sales',
      'adsVisits',
      'organicVisits',
      'otherVisits',
    ]);
    if (total.orders && total.visits) total.cvr = (total.orders / total.visits) * 100;
    if (total.orders && total.sales) total.asp = total.sales / total.orders;
    if (total.orders && total.units) total.upt = total.units / total.orders;
    if (total.visitors && total.newToStore) total.ntsPct = (total.newToStore / total.visitors) * 100;
    return { daily, total };
  }

  function sceneRows(marketIds, grain, offsetDays) {
    return SCENES.map((scene) => {
      const rnd = mulberry32(hashStr(scene + marketIds.join('')) + offsetDays);
      const cur = baseMetrics(rnd, 0.85 + SCENES.indexOf(scene) * 0.05);
      const prev = baseMetrics(mulberry32(rnd() * 1e6), 0.8);
      return withCompare({ scene, ...cur }, prev);
    });
  }

  function monthlyTrend(scene, marketIds, months) {
    return Array.from({ length: months }, (_, i) => {
      const rnd = mulberry32(hashStr(scene + i) + marketIds.length);
      const m = baseMetrics(rnd, 0.7 + i * 0.03);
      const d = new Date();
      d.setMonth(d.getMonth() - (months - 1 - i));
      return {
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        ...m,
      };
    });
  }

  function pageRows(marketIds, scene, grain, offsetDays) {
    const pages = allPages().filter(
      (p) => marketIds.includes(p.marketplace) && (!scene || p.scene_category === scene)
    );
    return pages.map((p) => {
      const rnd = mulberry32(hashStr(p.page_id) + offsetDays);
      const cur = baseMetrics(rnd, 0.15 + rnd() * 0.25);
      const prev = baseMetrics(mulberry32(hashStr(p.page_id) + 999), 0.14);
      return withCompare(
        {
          ...p,
          ...cur,
        },
        prev
      );
    });
  }

  function channelByPage(marketIds, grain, offsetDays) {
    return pageRows(marketIds, null, grain, offsetDays).slice(0, 25).map((p) => {
      const total = p.visits || 1;
      return {
        page: p.page_title,
        marketplace: p.marketplace,
        ads: p.adsVisits,
        organic: p.organicVisits,
        other: p.otherVisits,
        adsPct: (p.adsVisits / total) * 100,
        organicPct: (p.organicVisits / total) * 100,
        otherPct: (p.otherVisits / total) * 100,
        adsYoY: p.visits_pct != null ? p.visits_pct * 0.6 : 5 + hashStr(p.page_id) % 12,
      };
    });
  }

  function sbDetail(marketIds) {
    const rnd = mulberry32(marketIds.join('sb'));
    return {
      spend: Math.round(12000 + rnd() * 8000),
      clicks: Math.round(8000 + rnd() * 5000),
      impressions: Math.round(400000 + rnd() * 200000),
      storeVisits: Math.round(5000 + rnd() * 3000),
      orders: Math.round(400 + rnd() * 200),
      sales: Math.round(18000 + rnd() * 12000),
      cpc: 0,
    };
  }

  function tagOtherDetail(marketIds) {
    const tags = ['Facebook_PSoPF', 'Google_Brand', 'TikTok_Influencer', 'Newsletter_Q1'];
    return tags.map((t, i) => {
      const rnd = mulberry32(hashStr(t + marketIds.join('')));
      return {
        tag: t,
        visits: Math.round(200 + rnd() * 800),
        orders: Math.round(10 + rnd() * 60),
        sales: Math.round(500 + rnd() * 3000),
      };
    });
  }

  function organicDetail(marketIds) {
    const rnd = mulberry32(marketIds.join('org'));
    const total = Math.round(5000 + rnd() * 8000);
    return ORGANIC_SPLIT.map((s, i) => ({
      ...s,
      visits: Math.round(total * (0.35 - i * 0.08 + rnd() * 0.1)),
    }));
  }

  function lineRows(marketIds, grain, offsetDays) {
    return PRODUCT_LINES.map((line) => {
      const rnd = mulberry32(hashStr(line) + offsetDays);
      const cur = baseMetrics(rnd, 0.9);
      const prev = baseMetrics(mulberry32(rnd() * 1e5), 0.85);
      return withCompare({ line, ...cur }, prev);
    });
  }

  function skuRows(marketIds, line, limit) {
    const skus = heroSkus().filter((s) => !line || s.line === line);
    return skus.slice(0, limit || 20).map((s) => {
      const rnd = mulberry32(hashStr(s.asin + marketIds.join('')));
      const cur = baseMetrics(rnd, 0.2 + rnd() * 0.3);
      const prev = baseMetrics(mulberry32(hashStr(s.asin)), 0.18);
      return withCompare({ ...s, ...cur }, prev);
    });
  }

  function storeShare(marketIds) {
    const rnd = mulberry32(marketIds.join('share'));
    const storeOrders = Math.round(800 + rnd() * 1200);
    const totalOrders = Math.round(storeOrders / (0.12 + rnd() * 0.08));
    return {
      storeOrders,
      totalOrders,
      sharePct: (storeOrders / totalOrders) * 100,
      storeSales: Math.round(storeOrders * (55 + rnd() * 15)),
      totalSales: Math.round(totalOrders * (52 + rnd() * 10)),
    };
  }

  function dataHealth() {
    return [
      { system: 'ASIN-SKU 主数据', status: 'ok', detail: '昨日 06:00 同步完成' },
      { system: '销售明细 (ERP)', status: 'ok', detail: 'T-1 已就绪' },
      { system: 'Store Insights API', status: 'warn', detail: 'FR 站点延迟约 4h' },
      { system: 'SB 广告报表', status: 'ok', detail: '与 Ads Console 对齐' },
      { system: 'Attribution Tag', status: 'ok', detail: '126 条活跃 Tag' },
    ];
  }

  function siteBreakdown(marketIds, grain, offsetDays) {
    return marketIds.map((id) => {
      const cur = marketMetrics([id], grain, offsetDays).total;
      return { marketplace: id, ...cur };
    });
  }

  global.FlagshipInsightsData = {
    MARKETS,
    SCENES,
    PRODUCT_LINES,
    CAMPAIGN_SCENES,
    periodLength,
    marketMetrics,
    siteBreakdown,
    sceneRows,
    monthlyTrend,
    pageRows,
    channelByPage,
    sbDetail,
    tagOtherDetail,
    organicDetail,
    lineRows,
    skuRows,
    heroSkus,
    storeShare,
    dataHealth,
    allPages,
  };
})(window);

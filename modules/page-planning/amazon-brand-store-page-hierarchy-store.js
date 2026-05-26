/**
 * Demo：旗舰店页面层级 · 页面内容分类 + 页面场景分类 · localStorage
 * 种子：amazon-brand-store-page-hierarchy-seed.json（来自 旗舰店页面层级.xlsx）
 */
(function (global) {
  const STORAGE_KEY = 'erp_brand_store_page_hierarchy_v1';

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  let seedCache = null;

  function getSeed() {
    if (seedCache) return seedCache;
    if (global.BRAND_STORE_PAGE_HIERARCHY_SEED) {
      seedCache = deepClone(global.BRAND_STORE_PAGE_HIERARCHY_SEED);
      return seedCache;
    }
    return null;
  }

  function readRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data?.pages?.length ? data : null;
    } catch {
      return null;
    }
  }

  function get() {
    return readRaw() || (getSeed() ? deepClone(getSeed()) : null);
  }

  function save(data) {
    const payload = {
      schema_version: data.schema_version || '1.0',
      seed_from: data.seed_from,
      effective_from: data.effective_from || new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
      marketplaces: data.marketplaces || [],
      content_categories: data.content_categories || [],
      scene_categories: data.scene_categories || [],
      pages: data.pages || [],
      mapping_snapshots: data.mapping_snapshots || [],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    return getSeed() ? deepClone(getSeed()) : null;
  }

  function labelByZh(list, zh) {
    if (!zh) return null;
    const hit = (list || []).find((x) => x.label_zh === zh);
    return hit?.code || null;
  }

  function validate(data) {
    const errors = [];
    const contentLabels = new Set((data.content_categories || []).map((c) => c.label_zh));
    const sceneLabels = new Set((data.scene_categories || []).map((c) => c.label_zh));

    (data.pages || []).forEach((p, i) => {
      const label = p.page_name_export || p.page_id || `#${i + 1}`;
      if (!p.marketplace) errors.push(`${label}：缺少站点`);
      if (!p.page_name_export?.trim()) errors.push(`第 ${i + 1} 行：缺少后台导出页面名称`);
      if (!p.scene_category) errors.push(`${label}：未设置页面场景分类`);
      else if (!sceneLabels.has(p.scene_category)) {
        errors.push(`${label}：场景分类「${p.scene_category}」不在字典中`);
      }
      if (!p.content_category) errors.push(`${label}：未设置页面内容分类`);
      else if (!contentLabels.has(p.content_category)) {
        errors.push(`${label}：内容分类「${p.content_category}」不在字典中`);
      }
    });

    const contentCodes = new Set();
    (data.content_categories || []).forEach((c) => {
      const code = (c.code || '').trim();
      if (!code) errors.push('内容分类存在空 code');
      if (contentCodes.has(code)) errors.push(`内容分类 code 重复：${code}`);
      contentCodes.add(code);
      if (!(c.label_zh || '').trim()) errors.push(`内容分类 ${code}：缺少中文名`);
    });

    const sceneCodes = new Set();
    (data.scene_categories || []).forEach((c) => {
      const code = (c.code || '').trim();
      if (!code) errors.push('场景分类存在空 code');
      if (sceneCodes.has(code)) errors.push(`场景分类 code 重复：${code}`);
      sceneCodes.add(code);
      if (!(c.label_zh || '').trim()) errors.push(`场景分类 ${code}：缺少中文名`);
    });

    return errors;
  }

  function parsePagePath(name) {
    const parts = String(name || '')
      .split(/\s*›\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      page_path: parts,
      page_title: parts[parts.length - 1] || name,
      parent_page_name: parts.length > 1 ? parts.slice(0, -1).join(' › ') : null,
    };
  }

  function countStats(data) {
    const pages = data?.pages || [];
    const incomplete = pages.filter((p) => !p.content_category || !p.scene_category);
    const byMp = {};
    pages.forEach((p) => {
      byMp[p.marketplace] = (byMp[p.marketplace] || 0) + 1;
    });
    return {
      pages: pages.length,
      marketplaces: Object.keys(byMp).length,
      incomplete: incomplete.length,
      contentTypes: (data.content_categories || []).length,
      sceneTypes: (data.scene_categories || []).length,
      byMp,
    };
  }

  function ensureSnapshot(data, month) {
    if (!data.mapping_snapshots) data.mapping_snapshots = [];
    const exists = data.mapping_snapshots.some((s) => s.month === month);
    if (exists) return null;
    const snap = {
      snapshot_id: `snap_${month.replace('-', '')}`,
      month,
      frozen_at: new Date().toISOString(),
      page_count: data.pages.length,
      rows: data.pages.map((p) => ({
        page_id: p.page_id,
        marketplace: p.marketplace,
        page_name_export: p.page_name_export,
        scene_category: p.scene_category,
        content_category: p.content_category,
      })),
    };
    data.mapping_snapshots.unshift(snap);
    return snap;
  }

  global.BrandStorePageHierarchyStore = {
    STORAGE_KEY,
    get,
    save,
    reset,
    getSeed,
    deepClone,
    validate,
    countStats,
    parsePagePath,
    labelByZh,
    ensureSnapshot,
  };
})(window);

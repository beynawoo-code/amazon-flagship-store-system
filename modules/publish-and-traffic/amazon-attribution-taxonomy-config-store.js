/**
 * Demo：广告类型（Amazon Channel）与营销大小类字典 · localStorage 持久化
 * 种子来源：amazon-attribution-tag-wizard-data.js（channel-taxonomy-v1）
 */
(function (global) {
  const STORAGE_KEY = 'erp_attribution_taxonomy_config_v1';

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function seedFromWizard() {
    const tax = global.ATTRIBUTION_WIZARD_DATA?.taxonomy;
    if (!tax?.amazon_channel_groups?.length) return null;
    return {
      taxonomy_version: tax.taxonomy_version || 'v1.2',
      effective_from: tax.effective_from || new Date().toISOString().slice(0, 10),
      amazon_channel_groups: deepClone(tax.amazon_channel_groups),
    };
  }

  function readRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data?.amazon_channel_groups?.length ? data : null;
    } catch {
      return null;
    }
  }

  function get() {
    return readRaw() || seedFromWizard();
  }

  function save(data) {
    const payload = {
      taxonomy_version: data.taxonomy_version || 'v1.2',
      effective_from: data.effective_from || new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
      amazon_channel_groups: data.amazon_channel_groups,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    applyToWizard(payload);
    return payload;
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    const seed = seedFromWizard();
    if (seed) applyToWizard(seed);
    return seed;
  }

  function applyToWizard(data) {
    const payload = data || get();
    if (!payload) return;
    if (!global.ATTRIBUTION_WIZARD_DATA) global.ATTRIBUTION_WIZARD_DATA = {};
    global.ATTRIBUTION_WIZARD_DATA.taxonomy = {
      ...(global.ATTRIBUTION_WIZARD_DATA.taxonomy || {}),
      taxonomy_version: payload.taxonomy_version,
      effective_from: payload.effective_from,
      amazon_channel_groups: payload.amazon_channel_groups,
    };
  }

  function findChannel(groups, code) {
    return groups.find((g) => g.amazon_channel === code);
  }

  function findMajor(channel, code) {
    return (channel?.strategies || []).find((m) => m.strategy_major_code === code);
  }

  function findMinor(major, code) {
    return (major?.minors || []).find((m) => m.strategy_minor_code === code);
  }

  function syncMinorNameShort(major, minor) {
    const maj = (major?.name_short_major || '').trim();
    const suf = (minor?.name_short_suffix || '').trim();
    minor.name_short = maj + suf;
  }

  function validate(data) {
    const errors = [];
    const groups = data.amazon_channel_groups || [];
    const channelCodes = new Set();
    const majorCodes = new Set();
    const minorCodes = new Set();

    groups.forEach((ch, ci) => {
      const cc = (ch.amazon_channel || '').trim();
      if (!cc) errors.push(`第 ${ci + 1} 个广告类型缺少 amazon_channel`);
      if (channelCodes.has(cc)) errors.push(`广告类型代码重复：${cc}`);
      channelCodes.add(cc);
      if (!(ch.console_label || '').trim()) errors.push(`${cc}：缺少 Console 显示名`);
      if (!(ch.label_zh || '').trim()) errors.push(`${cc}：缺少中文名`);

      (ch.strategies || []).forEach((maj) => {
        const mc = (maj.strategy_major_code || '').trim();
        if (!mc) errors.push(`${cc}：存在空的大类代码`);
        if (majorCodes.has(mc)) errors.push(`营销大类代码全局重复：${mc}`);
        majorCodes.add(mc);
        if (!(maj.label_zh || '').trim()) errors.push(`大类 ${mc}：缺少中文名`);
        if (!(maj.name_short_major || '').trim()) errors.push(`大类 ${mc}：缺少 name_short_major`);

        (maj.minors || []).forEach((min) => {
          const mnc = (min.strategy_minor_code || '').trim();
          if (!mnc) errors.push(`大类 ${mc}：存在空的子类代码`);
          if (minorCodes.has(mnc)) errors.push(`营销子类代码全局重复：${mnc}`);
          minorCodes.add(mnc);
          if (!(min.label_zh || '').trim()) errors.push(`子类 ${mnc}：缺少中文名`);
          if (!(min.name_short_suffix || '').trim()) errors.push(`子类 ${mnc}：缺少 name_short_suffix`);
          const ns = (maj.name_short_major || '') + (min.name_short_suffix || '');
          if (min.name_short && min.name_short !== ns) {
            errors.push(`子类 ${mnc}：name_short 应为 ${ns}（当前 ${min.name_short}）`);
          }
        });
      });
    });

    return errors;
  }

  function countStats(data) {
    const groups = data?.amazon_channel_groups || [];
    let majors = 0;
    let minors = 0;
    groups.forEach((ch) => {
      (ch.strategies || []).forEach((m) => {
        majors += 1;
        minors += (m.minors || []).length;
      });
    });
    return { channels: groups.length, majors, minors };
  }

  global.TaxonomyConfigStore = {
    STORAGE_KEY,
    get,
    save,
    reset,
    applyToWizard,
    seedFromWizard,
    deepClone,
    findChannel,
    findMajor,
    findMinor,
    syncMinorNameShort,
    validate,
    countStats,
  };
})(window);

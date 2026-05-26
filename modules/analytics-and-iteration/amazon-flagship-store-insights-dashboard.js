(function () {
  const D = window.FlagshipInsightsData;
  if (!D) {
    document.body.innerHTML = '<p style="padding:40px;color:#f87171">缺少 amazon-flagship-store-insights-data.js</p>';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const TABS = [
    { id: 't1', code: 'T1', name: '站点总览' },
    { id: 't2', code: 'T2', name: '场景维度' },
    { id: 't3', code: 'T3', name: '场景-页面' },
    { id: 't4', code: 'T4', name: '流量组成' },
    { id: 't5', code: 'T5', name: '品线维度' },
    { id: 't6', code: 'T6', name: '重点品/Top SKU' },
    { id: 't7', code: 'T7', name: '旗舰店占比', p1: true },
  ];

  const state = {
    selected: new Set(D.MARKETS.map((m) => m.id)),
    preset: 'all',
    grain: 'month',
    compare: 'wow',
    activeTab: 't1',
    t3Scene: '公共',
    t3PageId: null,
    t4Sub: 'bucket',
    t5Line: '居家',
    t2TrendScene: '公共',
  };

  const charts = {};

  function fmtInt(n) {
    return Math.round(n || 0).toLocaleString('en-US');
  }
  function fmtMoney(n) {
    return (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function fmtPct(n, digits) {
    if (n == null || Number.isNaN(n)) return '—';
    return `${n >= 0 ? '+' : ''}${n.toFixed(digits ?? 1)}%`;
  }
  function deltaHtml(pct) {
    if (pct == null) return '<span class="sub" style="color:var(--muted)">—</span>';
    const cls = pct >= 0 ? 'up' : 'down';
    const arrow = pct >= 0 ? '↑' : '↓';
    return `<span class="sub ${cls}">${arrow} ${fmtPct(pct)}</span>`;
  }
  function compareOffset() {
    return state.compare === 'yoy' ? 365 : state.compare === 'wow' ? D.periodLength(state.grain) : 0;
  }
  function marketIds() {
    return [...state.selected];
  }
  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }
  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#cbd5e1', boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: '#8b9cb3' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#8b9cb3' }, grid: { color: 'rgba(255,255,255,0.06)' } },
      },
    };
  }

  function currentMetrics() {
    const ids = marketIds();
    const off = compareOffset();
    const cur = D.marketMetrics(ids, state.grain, 0).total;
    const prev = off ? D.marketMetrics(ids, state.grain, off).total : null;
    return { cur, prev, ids };
  }

  function renderToolbar() {
    $('marketChips').innerHTML = D.MARKETS.map((m) => {
      const on = state.selected.has(m.id);
      return `<label class="chip${on ? ' on' : ''}"><input type="checkbox" value="${m.id}" ${on ? 'checked' : ''}/> ${m.label}</label>`;
    }).join('');
    $('marketChips').querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', () => {
        state.preset = 'custom';
        document.querySelectorAll('.preset-btn').forEach((b) => b.classList.toggle('on', b.dataset.preset === 'custom'));
        if (inp.checked) state.selected.add(inp.value);
        else state.selected.delete(inp.value);
        if (!state.selected.size) {
          state.selected.add(inp.value);
          inp.checked = true;
        }
        refresh();
      });
    });

    const len = D.periodLength(state.grain);
    const labels = { week: '周', month: '月', quarter: '季', year: '年' };
    $('periodHint').textContent = `最近 ${len} 天 · 粒度 ${labels[state.grain] || state.grain}`;
  }

  function renderTabs() {
    $('tabBar').innerHTML = TABS.map((t) => {
      const active = state.activeTab === t.id ? ' active' : '';
      const p1 = t.p1 ? ' p1-tab' : '';
      return `<button type="button" class="tab-btn${active}${p1}" data-tab="${t.id}">
        <span class="code">${t.code}${t.p1 ? ' · P1' : ''}</span>
        <span class="name">${t.name}</span>
      </button>`;
    }).join('');
    $('tabBar').querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-panel').forEach((p) => {
          p.classList.toggle('active', p.dataset.tab === state.activeTab);
        });
        refreshActiveTab();
      });
    });
  }

  function renderT1() {
    const { cur, prev, ids } = currentMetrics();
    const kpis = [
      { key: 'sales', label: 'Sales', fmt: fmtMoney, hero: true },
      { key: 'orders', label: 'Orders', fmt: fmtInt, hero: true },
      { key: 'visitors', label: 'Visitors', fmt: fmtInt, hero: true },
      { key: 'cvr', label: 'CVR', fmt: (v) => `${(v || 0).toFixed(2)}%`, hero: true },
      { key: 'asp', label: 'ASP', fmt: (v) => `$${(v || 0).toFixed(2)}`, hero: true },
      { key: 'upt', label: 'UPT', fmt: (v) => (v || 0).toFixed(2), hero: true },
      { key: 'ntsPct', label: 'NTS%', fmt: (v) => `${(v || 0).toFixed(1)}%`, hero: true },
      { key: 'visits', label: 'Visits', fmt: fmtInt },
      { key: 'views', label: 'Views', fmt: fmtInt },
    ];
    $('t1Kpis').innerHTML = kpis
      .map(({ key, label, fmt, hero }) => {
        const v = cur[key];
        const p = prev?.[key];
        const pct = p ? ((v - p) / p) * 100 : null;
        return `<div class="kpi${hero ? ' hero' : ''}">
          <div class="lbl">${label}</div>
          <div class="num">${fmt(v)}</div>
          ${deltaHtml(pct)}
        </div>`;
      })
      .join('');

    const funnel = [
      ['获客', 'VISITS', cur.visits, prev?.visits],
      ['获客', 'VIEWS', cur.views, prev?.views],
      ['获客', 'VISITORS', cur.visitors, prev?.visitors],
      ['互动', 'NTS (count)', cur.newToStore, prev?.newToStore],
      ['互动', 'NTS%', cur.ntsPct, prev?.ntsPct],
      ['转化', 'ORDERS', cur.orders, prev?.orders],
      ['转化', 'UNITS', cur.units, prev?.units],
      ['转化', 'SALES', cur.sales, prev?.sales],
      ['转化', 'CVR', cur.cvr, prev?.cvr],
      ['转化', 'ASP', cur.asp, prev?.asp],
      ['转化', 'UPT', cur.upt, prev?.upt],
    ];
    $('t1FunnelBody').innerHTML = funnel
      .map(([stage, metric, c, p]) => {
        const pct = p ? ((c - p) / p) * 100 : null;
        const fmt = metric.includes('%') || metric === 'CVR' || metric === 'ASP' || metric === 'UPT'
          ? (v) => (typeof v === 'number' ? (metric === 'CVR' || metric === 'NTS%' ? v.toFixed(2) + '%' : v.toFixed(2)) : '—')
          : fmtInt;
        return `<tr>
          <td>${stage}</td><td>${metric}</td>
          <td class="num">${typeof c === 'number' ? (metric === 'SALES' ? fmtMoney(c) : fmt(c)) : '—'}</td>
          <td class="num">${p != null ? (metric === 'SALES' ? fmtMoney(p) : fmt(p)) : '—'}</td>
          <td class="num">${pct != null ? fmtPct(pct) : '—'}</td>
        </tr>`;
      })
      .join('');

    if (ids.length > 1) {
      const breakdown = D.siteBreakdown(ids, state.grain, 0);
      destroyChart('t1share');
      charts.t1share = new Chart($('t1SiteShare'), {
        type: 'doughnut',
        data: {
          labels: breakdown.map((b) => b.marketplace),
          datasets: [{
            data: breakdown.map((b) => b.sales),
            backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#94a3b8'],
          }],
        },
        options: { ...chartDefaults(), plugins: { legend: { position: 'right', labels: { color: '#cbd5e1' } } } },
      });
      destroyChart('t1bar');
      charts.t1bar = new Chart($('t1SiteBar'), {
        type: 'bar',
        data: {
          labels: breakdown.map((b) => b.marketplace),
          datasets: [
            { label: 'Sales', data: breakdown.map((b) => b.sales), backgroundColor: '#3b82f6' },
            { label: 'Visits', data: breakdown.map((b) => b.visits), backgroundColor: '#22c55e' },
          ],
        },
        options: chartDefaults(),
      });
    } else {
      destroyChart('t1share');
      destroyChart('t1bar');
      const ctx = $('t1SiteShare').getContext('2d');
      ctx.clearRect(0, 0, 400, 200);
    }
  }

  function renderT2() {
    const ids = marketIds();
    const off = compareOffset();
    const rows = D.sceneRows(ids, state.grain, off);
    $('t2SceneTable').innerHTML = rows
      .map((r) => `<tr>
        <td><strong>${esc(r.scene)}</strong></td>
        <td class="num">${fmtInt(r.visits)}</td>
        <td class="num">${fmtInt(r.orders)}</td>
        <td class="num">${fmtMoney(r.sales)}</td>
        <td class="num">${(r.cvr || 0).toFixed(2)}%</td>
        <td class="num">${fmtPct(r.sales_pct)}</td>
      </tr>`)
      .join('');

    destroyChart('t2bar');
    charts.t2bar = new Chart($('t2SceneBar'), {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.scene),
        datasets: [
          { label: 'Sales', data: rows.map((r) => r.sales), backgroundColor: '#3b82f6', borderRadius: 4 },
          { label: 'Visits', data: rows.map((r) => r.visits), backgroundColor: '#334155', borderRadius: 4 },
        ],
      },
      options: chartDefaults(),
    });

    const sel = $('t2TrendScene');
    if (!sel.options.length) {
      D.SCENES.forEach((s) => {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = s;
        sel.appendChild(o);
      });
    }
    state.t2TrendScene = sel.value || state.t2TrendScene;
    const trend = D.monthlyTrend(state.t2TrendScene, ids, 6);
    destroyChart('t2trend');
    charts.t2trend = new Chart($('t2SceneTrend'), {
      type: 'line',
      data: {
        labels: trend.map((t) => t.month),
        datasets: [{
          label: 'Sales',
          data: trend.map((t) => t.sales),
          borderColor: '#ff9900',
          backgroundColor: 'rgba(255,153,0,0.1)',
          fill: true,
          tension: 0.35,
        }],
      },
      options: chartDefaults(),
    });

    $('t2CampaignBody').innerHTML = D.CAMPAIGN_SCENES.map((c) => {
      const rnd = D.sceneRows(ids, state.grain, 0).find((r) => r.scene === c.scene) || { visits: 0, sales: 0 };
      return `<tr>
        <td>${esc(c.name)}</td><td>${esc(c.scene)}</td>
        <td class="num">${fmtInt(rnd.visits * 0.35)}</td>
        <td class="num">${fmtMoney(rnd.sales * 0.28)}</td>
      </tr>`;
    }).join('');
  }

  function renderT3() {
    const ids = marketIds();
    const off = compareOffset();
    const sceneSel = $('t3SceneFilter');
    if (!sceneSel.options.length) {
      sceneSel.innerHTML =
        '<option value="">全部场景</option>' + D.SCENES.map((s) => `<option value="${s}">${s}</option>`).join('');
    }
    const scene = sceneSel.value || null;
    state.t3Scene = scene || state.t3Scene;
    const pages = D.pageRows(ids, scene, state.grain, off).sort((a, b) => b.sales - a.sales);

    $('t3PageList').innerHTML = pages
      .map((p) => {
        const active = p.page_id === state.t3PageId ? ' active' : '';
        return `<tr class="clickable${active}" data-pid="${esc(p.page_id)}">
          <td>${esc(p.marketplace)}</td>
          <td title="${esc(p.page_name_export)}">${esc(p.page_title)}</td>
          <td>${esc(p.scene_category)}</td>
          <td>${esc(p.content_category || '—')}</td>
          <td class="num">${fmtInt(p.visits)}</td>
          <td class="num">${fmtMoney(p.sales)}</td>
          <td class="num">${fmtPct(p.sales_pct)}</td>
        </tr>`;
      })
      .join('');

    $('t3PageList').querySelectorAll('tr.clickable').forEach((tr) => {
      tr.addEventListener('click', () => {
        state.t3PageId = tr.dataset.pid;
        renderT3PageCompare(pages.find((p) => p.page_id === state.t3PageId));
        $('t3PageList').querySelectorAll('tr').forEach((r) => r.classList.toggle('active', r === tr));
      });
    });

    const snap = $('t3SnapshotMonth').value;
    if (snap !== 'current') {
      $('t3PageHint').textContent = `映射快照 ${snap}：历史数据按该月页面↔场景归属（演示）`;
    } else {
      $('t3PageHint').textContent = '点击左侧页面行查看同比环比';
    }

    if (state.t3PageId) {
      renderT3PageCompare(pages.find((p) => p.page_id === state.t3PageId));
    } else if (pages[0]) {
      state.t3PageId = pages[0].page_id;
      renderT3PageCompare(pages[0]);
    }
  }

  function renderT3PageCompare(p) {
    if (!p) {
      $('t3PageCompare').innerHTML = '<p style="color:var(--muted)">无页面数据</p>';
      return;
    }
    $('t3PageCompare').innerHTML = `
      <h3 style="margin:0 0 8px;font-size:0.88rem">${esc(p.page_name_export)}</h3>
      <div class="kpi-row">
        ${['visits', 'views', 'orders', 'sales', 'cvr', 'bounce']
          .map((k) => {
            const labels = { visits: 'Visits', views: 'Views', orders: 'Orders', sales: 'Sales', cvr: 'CVR', bounce: 'Bounce' };
            const v = p[k];
            const pv = p[`${k}_prev`];
            const pct = p[`${k}_pct`];
            const fmt = k === 'sales' ? fmtMoney : k === 'cvr' || k === 'bounce' ? (x) => `${(x || 0).toFixed(1)}%` : fmtInt;
            return `<div class="kpi"><div class="lbl">${labels[k]}</div><div class="num">${fmt(v)}</div>${deltaHtml(pct)}</div>`;
          })
          .join('')}
      </div>
      <p style="font-size:0.72rem;color:var(--muted)">含已下线页面：status=${esc(p.status)} · 内容分类 ${esc(p.content_category || '待补全')}</p>`;
  }

  function renderT4() {
    const ids = marketIds();
    const off = compareOffset();
    const sub = state.t4Sub;
    document.querySelectorAll('#t4SubTabs .sub-tab').forEach((b) => b.classList.toggle('on', b.dataset.t4 === sub));

    if (sub === 'bucket') {
      const rows = D.channelByPage(ids, state.grain, off);
      $('t4Content').innerHTML = `
        <div class="section">
          <h2>渠道三分桶 · 按页面</h2>
          <p class="hint">ADS (SB) / ORGANIC / OTHER · 含占比与 ADS 同比示意</p>
          <div class="chart-box sm"><canvas id="t4BucketChart"></canvas></div>
          <div class="table-scroll" style="margin-top:12px">
            <table>
              <thead><tr><th>页面</th><th>站点</th><th class="num">ADS</th><th class="num">ORG</th><th class="num">OTHER</th><th class="num">ADS%</th><th class="num">ADS YoY</th></tr></thead>
              <tbody>${rows
                .map(
                  (r) => `<tr>
                <td>${esc(r.page)}</td><td>${esc(r.marketplace)}</td>
                <td class="num">${fmtInt(r.ads)}</td><td class="num">${fmtInt(r.organic)}</td><td class="num">${fmtInt(r.other)}</td>
                <td class="num">${r.adsPct.toFixed(1)}%</td>
                <td class="num">${fmtPct(r.adsYoY)}</td>
              </tr>`
                )
                .join('')}</tbody>
            </table>
          </div>
        </div>`;
      destroyChart('t4bucket');
      charts.t4bucket = new Chart($('t4BucketChart'), {
        type: 'bar',
        data: {
          labels: rows.slice(0, 8).map((r) => r.page.slice(0, 18)),
          datasets: [
            { label: 'ADS', data: rows.slice(0, 8).map((r) => r.ads), backgroundColor: '#3b82f6' },
            { label: 'ORGANIC', data: rows.slice(0, 8).map((r) => r.organic), backgroundColor: '#22c55e' },
            { label: 'OTHER', data: rows.slice(0, 8).map((r) => r.other), backgroundColor: '#a78bfa' },
          ],
        },
        options: { ...chartDefaults(), scales: { x: { stacked: true }, y: { stacked: true } } },
      });
    } else if (sub === 'sb') {
      const sb = D.sbDetail(ids);
      sb.cpc = sb.clicks ? sb.spend / sb.clicks : 0;
      $('t4Content').innerHTML = `
        <div class="section">
          <h2>SB 渠道明细</h2>
          <p class="hint">消费 amazon-ads 数据 · 落地 Brand Store 的 SB 活动</p>
          <div class="kpi-row">
            <div class="kpi"><div class="lbl">Spend</div><div class="num">$${fmtMoney(sb.spend)}</div></div>
            <div class="kpi"><div class="lbl">Clicks</div><div class="num">${fmtInt(sb.clicks)}</div></div>
            <div class="kpi"><div class="lbl">Impressions</div><div class="num">${fmtInt(sb.impressions)}</div></div>
            <div class="kpi"><div class="lbl">Store Visits</div><div class="num">${fmtInt(sb.storeVisits)}</div></div>
            <div class="kpi"><div class="lbl">Orders</div><div class="num">${fmtInt(sb.orders)}</div></div>
            <div class="kpi"><div class="lbl">Sales</div><div class="num">$${fmtMoney(sb.sales)}</div></div>
            <div class="kpi"><div class="lbl">CPC</div><div class="num">$${sb.cpc.toFixed(2)}</div></div>
          </div>
        </div>`;
    } else if (sub === 'other') {
      const tags = D.tagOtherDetail(ids);
      $('t4Content').innerHTML = `
        <div class="section">
          <h2>Other · 站外回流（Tag / 联盟）</h2>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Tag / 来源</th><th class="num">Store Visits</th><th class="num">Orders</th><th class="num">Sales</th></tr></thead>
              <tbody>${tags
                .map(
                  (t) => `<tr><td>${esc(t.tag)}</td><td class="num">${fmtInt(t.visits)}</td><td class="num">${fmtInt(t.orders)}</td><td class="num">${fmtMoney(t.sales)}</td></tr>`
                )
                .join('')}</tbody>
            </table>
          </div>
        </div>`;
    } else {
      const org = D.organicDetail(ids);
      $('t4Content').innerHTML = `
        <div class="section">
          <h2>Organic 自然流量拆分</h2>
          <div class="chart-box sm"><canvas id="t4OrgChart"></canvas></div>
        </div>`;
      destroyChart('t4org');
      charts.t4org = new Chart($('t4OrgChart'), {
        type: 'pie',
        data: {
          labels: org.map((o) => o.label),
          datasets: [{ data: org.map((o) => o.visits), backgroundColor: ['#22c55e', '#16a34a', '#15803d'] }],
        },
        options: chartDefaults(),
      });
    }
  }

  function renderT5() {
    const ids = marketIds();
    const off = compareOffset();
    const lines = D.lineRows(ids, state.grain, off);
    $('t5LineTable').innerHTML = lines
      .map(
        (r) => `<tr class="clickable" data-line="${esc(r.line)}">
        <td><strong>${esc(r.line)}</strong></td>
        <td class="num">${fmtMoney(r.sales)}</td>
        <td class="num">${fmtInt(r.orders)}</td>
        <td class="num">${fmtInt(r.units)}</td>
        <td class="num">${fmtPct(r.sales_pct)}</td>
      </tr>`
      )
      .join('');

    destroyChart('t5line');
    charts.t5line = new Chart($('t5LineChart'), {
      type: 'bar',
      data: {
        labels: lines.map((l) => l.line),
        datasets: [{ label: 'Sales', data: lines.map((l) => l.sales), backgroundColor: '#a855f7', borderRadius: 6 }],
      },
      options: { ...chartDefaults(), indexAxis: 'y' },
    });

    const lineSel = $('t5LineSelect');
    if (!lineSel.options.length) {
      D.PRODUCT_LINES.forEach((l) => {
        const o = document.createElement('option');
        o.value = l;
        o.textContent = l;
        lineSel.appendChild(o);
      });
    }
    state.t5Line = lineSel.value || state.t5Line;
    $('t5SkuTable').innerHTML = D.skuRows(ids, state.t5Line, 12)
      .map(
        (s) => `<tr>
        <td>${esc(s.sku)}</td><td><code>${esc(s.asin)}</code></td>
        <td class="num">${fmtInt(s.views)}</td><td class="num">${fmtInt(s.orders)}</td><td class="num">${fmtMoney(s.sales)}</td>
      </tr>`
      )
      .join('');
  }

  function renderT6() {
    const ids = marketIds();
    const heroes = D.skuRows(ids, null, 20).filter((s) => s.hero);
    const totalSales = heroes.reduce((a, h) => a + h.sales, 0);
    $('t6HeroKpis').innerHTML = `
      <div class="kpi hero"><div class="lbl">Hero SKU 数</div><div class="num">${heroes.length}</div></div>
      <div class="kpi hero"><div class="lbl">Hero Sales</div><div class="num">${fmtMoney(totalSales)}</div></div>
    `;
    $('t6HeroTable').innerHTML = heroes
      .map(
        (h) => `<tr>
        <td>${esc(h.sku)} · ${esc(h.name)}</td><td>${esc(h.line)}</td>
        <td class="num">${fmtMoney(h.sales)}</td><td class="num">${fmtInt(h.orders)}</td>
        <td class="num">${fmtPct(h.sales_pct)}</td>
      </tr>`
      )
      .join('');

    const rankBy = $('t6RankBy').value || 'sales';
    const top = [...D.skuRows(ids, null, 20)].sort((a, b) => (b[rankBy] || 0) - (a[rankBy] || 0));
    $('t6TopTable').innerHTML = top
      .map(
        (s, i) => `<tr>
        <td>${i + 1}</td><td>${esc(s.sku)}</td>
        <td class="num">${fmtMoney(s.sales)}</td><td class="num">${fmtInt(s.orders)}</td>
      </tr>`
      )
      .join('');

    renderT6SkuCompare();
  }

  function renderT6SkuCompare() {
    const raw = ($('t6SkuInput')?.value || '').trim();
    const skus = raw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
    const ids = marketIds();
    const all = D.skuRows(ids, null, 30);
    const picked = skus.length
      ? all.filter((s) => skus.some((q) => s.sku.toLowerCase().includes(q.toLowerCase())))
      : all.slice(0, 3);
    destroyChart('t6sku');
    if (!$('t6SkuChart')) return;
    charts.t6sku = new Chart($('t6SkuChart'), {
      type: 'bar',
      data: {
        labels: picked.map((s) => s.sku),
        datasets: [
          { label: 'Sales', data: picked.map((s) => s.sales), backgroundColor: '#3b82f6' },
          { label: 'Orders', data: picked.map((s) => s.orders), backgroundColor: '#22c55e' },
        ],
      },
      options: chartDefaults(),
    });
  }

  function renderT7() {
    const ids = marketIds();
    const share = D.storeShare(ids);
    $('t7Kpis').innerHTML = `
      <div class="kpi hero"><div class="lbl">旗舰店占比</div><div class="num">${share.sharePct.toFixed(1)}%</div></div>
      <div class="kpi"><div class="lbl">旗舰店 Orders</div><div class="num">${fmtInt(share.storeOrders)}</div></div>
      <div class="kpi"><div class="lbl">全店 Orders</div><div class="num">${fmtInt(share.totalOrders)}</div></div>
      <div class="kpi"><div class="lbl">旗舰店 Sales</div><div class="num">${fmtMoney(share.storeSales)}</div></div>
    `;
    destroyChart('t7share');
    charts.t7share = new Chart($('t7ShareChart'), {
      type: 'doughnut',
      data: {
        labels: ['旗舰店归因', '全店其他'],
        datasets: [{
          data: [share.storeOrders, share.totalOrders - share.storeOrders],
          backgroundColor: ['#ff9900', '#334155'],
        }],
      },
      options: chartDefaults(),
    });
    $('t7HealthBody').innerHTML = D.dataHealth()
      .map((h) => {
        const cls = h.status === 'ok' ? 'health-ok' : h.status === 'warn' ? 'health-warn' : 'health-bad';
        const label = h.status === 'ok' ? '正常' : h.status === 'warn' ? '延迟' : '异常';
        return `<tr><td>${esc(h.system)}</td><td class="${cls}">${label}</td><td style="color:var(--muted)">${esc(h.detail)}</td></tr>`;
      })
      .join('');
  }

  function refreshActiveTab() {
    Object.keys(charts).forEach(destroyChart);
    if (state.activeTab === 't1') renderT1();
    else if (state.activeTab === 't2') renderT2();
    else if (state.activeTab === 't3') renderT3();
    else if (state.activeTab === 't4') renderT4();
    else if (state.activeTab === 't5') renderT5();
    else if (state.activeTab === 't6') renderT6();
    else if (state.activeTab === 't7') renderT7();
  }

  function refresh() {
    renderToolbar();
    refreshActiveTab();
  }

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      state.preset = p;
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.toggle('on', b === btn));
      if (p === 'all') state.selected = new Set(D.MARKETS.map((m) => m.id));
      else if (p === 'na') state.selected = new Set(D.MARKETS.filter((m) => m.region === 'NA').map((m) => m.id));
      else if (p === 'eu') state.selected = new Set(D.MARKETS.filter((m) => m.region === 'EU').map((m) => m.id));
      refresh();
    });
  });

  $('timeGrain').addEventListener('change', (e) => {
    state.grain = e.target.value;
    refresh();
  });
  $('compareMode').addEventListener('change', (e) => {
    state.compare = e.target.value;
    refresh();
  });
  $('t2TrendScene')?.addEventListener('change', () => renderT2());
  $('t3SceneFilter')?.addEventListener('change', () => {
    state.t3PageId = null;
    renderT3();
  });
  $('t3SnapshotMonth')?.addEventListener('change', renderT3);
  $('t5LineSelect')?.addEventListener('change', renderT5);
  $('t6RankBy')?.addEventListener('change', renderT6);
  $('t6SkuSearch')?.addEventListener('click', renderT6SkuCompare);

  document.querySelectorAll('#t4SubTabs .sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.t4Sub = btn.dataset.t4;
      renderT4();
    });
  });

  renderTabs();
  refresh();
})();

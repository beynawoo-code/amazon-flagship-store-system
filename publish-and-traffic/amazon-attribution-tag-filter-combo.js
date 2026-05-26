/**
 * 可搜索下拉：点击 ▾ 或输入框展开全部选项，输入关键词模糊筛选后点选。
 */
(function (global) {
  const registry = new Map();

  function fuzzyMatch(text, query) {
    if (!query) return true;
    const t = String(text).toLowerCase();
    const q = String(query).toLowerCase().trim();
    if (!q) return true;
    if (t.includes(q)) return true;
    let ti = 0;
    for (let i = 0; i < q.length; i += 1) {
      const idx = t.indexOf(q[i], ti);
      if (idx === -1) return false;
      ti = idx + 1;
    }
    return true;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function displayLabel(state) {
    if (!state.hidden.value) return '';
    const opt = state.allOptions.find((o) => o.value === state.hidden.value);
    return opt ? opt.label : state.hidden.value;
  }

  function mount(hiddenId, options = {}) {
    const hidden = document.getElementById(hiddenId);
    if (!hidden) return;
    const root = hidden.closest('.filter-combo');
    if (!root) return;

    const field = root.querySelector('.filter-combo-field');
    const input = root.querySelector('.filter-combo-input');
    const toggle = root.querySelector('.filter-combo-toggle');
    const list = root.querySelector('.filter-combo-list');
    const onChange = options.onChange || (() => {});

    const state = {
      hiddenId,
      root,
      field,
      input,
      toggle,
      list,
      hidden,
      allOptions: [],
      filteredItems: [],
      filterQuery: '',
      open: false,
      highlight: -1,
    };
    registry.set(hiddenId, state);

    function close() {
      state.open = false;
      state.filterQuery = '';
      state.highlight = -1;
      list.hidden = true;
      root.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      input.readOnly = true;
      input.value = displayLabel(state);
      input.placeholder = displayLabel(state) || '全部 · 点击选择或搜索';
    }

    function openList() {
      if (state.open) return;
      state.open = true;
      state.filterQuery = '';
      state.highlight = -1;
      list.hidden = false;
      root.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      input.readOnly = false;
      input.value = '';
      input.placeholder = '输入关键词筛选…';
      renderOptions();
      input.focus();
    }

    function toggleList(e) {
      e.preventDefault();
      e.stopPropagation();
      if (state.open) close();
      else openList();
    }

    function commit(value, label) {
      hidden.value = value || '';
      close();
      input.title = hidden.value ? label || value : '';
      onChange();
    }

    function renderOptions() {
      const q = state.filterQuery.trim();
      const filtered = state.allOptions.filter(
        (o) => fuzzyMatch(o.label, q) || fuzzyMatch(o.value, q)
      );
      state.filteredItems = [{ value: '', label: '全部' }, ...filtered];

      if (q && filtered.length === 0) {
        list.innerHTML = '<li class="filter-combo-empty">无匹配项</li>';
        return;
      }

      list.innerHTML = state.filteredItems
        .map((o, i) => {
          const active = o.value === hidden.value ? ' is-selected' : '';
          const hi = i === state.highlight ? ' is-highlight' : '';
          return `<li class="filter-combo-option${active}${hi}" role="option" data-idx="${i}">${esc(o.label)}</li>`;
        })
        .join('');
    }

    function pickByIndex(idx) {
      const item = state.filteredItems[idx];
      if (!item) return;
      commit(item.value, item.label);
    }

    function pickHighlighted() {
      if (state.highlight >= 0) {
        pickByIndex(state.highlight);
        return true;
      }
      return false;
    }

    function pickFirstMatch() {
      const q = state.filterQuery.trim();
      if (!q) {
        commit('', '');
        return true;
      }
      const match = state.filteredItems.find((o) => o.value);
      if (match) {
        commit(match.value, match.label);
        return true;
      }
      return false;
    }

    input.readOnly = true;
    input.value = displayLabel(state);
    input.placeholder = displayLabel(state) || '全部 · 点击选择或搜索';

    field.addEventListener('click', (e) => {
      if (e.target === toggle) return;
      if (!state.open) openList();
    });

    toggle.addEventListener('mousedown', (e) => e.preventDefault());
    toggle.addEventListener('click', toggleList);

    input.addEventListener('input', () => {
      if (!state.open) openList();
      state.filterQuery = input.value;
      state.highlight = -1;
      renderOptions();
    });

    input.addEventListener('keydown', (e) => {
      const n = state.filteredItems.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!state.open) openList();
        state.highlight = n ? (state.highlight + 1) % n : -1;
        renderOptions();
        list.querySelector('.is-highlight')?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.highlight = n ? (state.highlight <= 0 ? n - 1 : state.highlight - 1) : -1;
        renderOptions();
        list.querySelector('.is-highlight')?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pickHighlighted()) return;
        const q = state.filterQuery.trim();
        if (!q) {
          commit('', '');
          return;
        }
        const exact = state.allOptions.find(
          (o) => o.value === q || o.label === q || o.label.toLowerCase() === q.toLowerCase()
        );
        if (exact) commit(exact.value, exact.label);
        else pickFirstMatch();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });

    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('.filter-combo-option[data-idx]');
      if (!li) return;
      e.preventDefault();
      pickByIndex(Number(li.dataset.idx));
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (root.contains(document.activeElement)) return;
        if (state.open) close();
      }, 160);
    });

    document.addEventListener('click', (e) => {
      if (!root.contains(e.target) && state.open) close();
    });

    state.renderOptions = renderOptions;
    state.syncDisplay = () => {
      if (!state.open) {
        input.value = displayLabel(state);
        input.placeholder = displayLabel(state) || '全部 · 点击选择或搜索';
        input.title = input.value;
      }
    };
    state.close = close;
  }

  function setOptions(hiddenId, values, labelForValue) {
    const state = registry.get(hiddenId);
    if (!state) return;
    const prev = state.hidden.value;
    state.allOptions = values.map((v) => {
      const value = String(v);
      const label = labelForValue ? String(labelForValue(v)) : value;
      return { value, label };
    });
    if (prev && !state.allOptions.some((o) => o.value === prev)) {
      state.hidden.value = '';
    }
    if (state.open) state.renderOptions();
    else state.syncDisplay();
  }

  function getValue(hiddenId) {
    const el = document.getElementById(hiddenId);
    return el ? el.value : '';
  }

  global.AttributionFilterCombo = { mount, setOptions, getValue, fuzzyMatch };
})(typeof window !== 'undefined' ? window : globalThis);

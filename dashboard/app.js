// Token Launch Radar — the dashboard page.
//
// Reads window.RADAR (written beside this page as data.js) and renders three
// tabs: the ranked board of pre-token protocols, the live-token table that
// calibrates the board's multiples, and the set-aside table with the reason
// each protocol is not a launch. Everything on the page — sorting, filters,
// the detail drawer's model breakdown — is computed from the same figures
// board.json carries, so the page and the board can never disagree.
//
// The page works with no network: no fetches, no external files, no URLs.

(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  // ------------------------------------------------------------ formatting

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** $403.9M, $190K, $1.2B — the short money form the board uses. */
  function money(v) {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }

  /** $214,934,379 — the full form the detail drawer uses. */
  function moneyFull(v) {
    return '$' + Math.round(v).toLocaleString('en-US');
  }

  function pct(v) {
    if (v === null || v === undefined) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  function mult(v) {
    return v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0') + 'x';
  }

  function ageText(days) {
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    if (days >= 30) return Math.round(days / 30) + 'mo';
    return days + 'd';
  }

  // ------------------------------------------------------------ state

  var state = {
    tab: 'board',
    q: '',
    category: '',
    chain: '',
    watchOnly: false,
    sortKey: 'rank',
    sortDir: 1,
    selected: null,
  };

  var COLUMNS = {
    board: [
      { key: 'rank', label: 'Rank', cls: 'num', sort: true },
      { key: 'name', label: 'Protocol', cls: '', sort: false },
      { key: 'category', label: 'Category', cls: '', sort: false },
      { key: 'chains', label: 'Chains', cls: '', sort: false },
      { key: 'tvl_usd', label: 'TVL', cls: 'num', sort: true },
      { key: 'change_7d', label: '7d', cls: 'num', sort: true },
      { key: 'age_days', label: 'Age', cls: 'num', sort: true },
      { key: 'category_multiple', label: 'Multiple', cls: 'num', sort: true },
      { key: 'implied_value_usd', label: 'Implied', cls: 'num', sort: true },
    ],
    live: [
      { key: 'rank', label: 'Rank', cls: 'num', sort: false },
      { key: 'name', label: 'Protocol', cls: '', sort: false },
      { key: 'category', label: 'Category', cls: '', sort: false },
      { key: 'chains', label: 'Chains', cls: '', sort: false },
      { key: 'tvl_usd', label: 'TVL', cls: 'num', sort: true },
      { key: 'mcap_usd', label: 'Market cap', cls: 'num', sort: true },
      { key: 'ratio', label: 'mcap/TVL', cls: 'num', sort: true },
      { key: 'age_days', label: 'Age', cls: 'num', sort: true },
    ],
    setaside: [
      { key: 'rank', label: 'Rank', cls: 'num', sort: false },
      { key: 'name', label: 'Protocol', cls: '', sort: false },
      { key: 'category', label: 'Category', cls: '', sort: false },
      { key: 'chains', label: 'Chains', cls: '', sort: false },
      { key: 'tvl_usd', label: 'TVL', cls: 'num', sort: true },
      { key: 'reason', label: 'Why it is set aside', cls: '', sort: false },
    ],
  };

  // ------------------------------------------------------------ data

  function allRows() {
    if (state.tab === 'live') {
      return DATA.live.map(function (r, i) {
        return Object.assign({}, r, { rank: i + 1 });
      });
    }
    if (state.tab === 'setaside') {
      return DATA.setAside.map(function (r, i) {
        return Object.assign({}, r, { rank: i + 1 });
      });
    }
    return DATA.board;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = allRows().filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      if (state.category && (r.category || '') !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.watchOnly && state.tab === 'board' && !r.watchlist) return false;
      return true;
    });
    var key = state.sortKey;
    var dir = state.sortDir;
    rows.sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      var cmp = typeof av === 'string' ? (av < bv ? -1 : av > bv ? 1 : 0) : av - bv;
      if (cmp === 0) cmp = a.slug < b.slug ? -1 : 1;
      return cmp * dir;
    });
    return rows;
  }

  // ------------------------------------------------------------ render

  var headRow = document.getElementById('head-row');
  var tbody = document.getElementById('rows');
  var emptyBox = document.getElementById('empty');
  var countEl = document.getElementById('count');

  function renderHead() {
    headRow.innerHTML = COLUMNS[state.tab]
      .map(function (c) {
        var arrow = state.sortKey === c.key ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '';
        var inner = c.sort
          ? '<button type="button" data-sort="' + c.key + '">' + esc(c.label) + arrow + '</button>'
          : esc(c.label);
        return '<th class="' + c.cls + '">' + inner + '</th>';
      })
      .join('');
  }

  function changeCell(v) {
    if (v === null || v === undefined) return '<td class="num">—</td>';
    var cls = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
    return '<td class="num ' + cls + '">' + pct(v) + '</td>';
  }

  function rowHtml(r) {
    var cells = '';
    if (state.tab === 'board') {
      var maxImplied = DATA.board.length ? DATA.board[0].implied_value_usd : 1;
      cells =
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.slug) + '</span></span>' +
        (r.watchlist ? ' <span class="badge">Watchlist</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="sub">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        changeCell(r.change_7d) +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num">' + mult(r.category_multiple) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b><div class="bar"><i style="width:' +
        Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100)) + '%"></i></div></td>';
    } else if (state.tab === 'live') {
      cells =
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.slug) + '</span></span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="sub">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num">' + r.ratio.toFixed(3) + 'x</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>';
    } else {
      cells =
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.slug) + '</span></span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="sub">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="sub">' + esc(r.reason) + '</td>';
    }
    return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '">' + cells + '</tr>';
  }

  function renderTable() {
    renderHead();
    var rows = filteredRows();
    var total = allRows().length;
    tbody.innerHTML = rows.map(rowHtml).join('');
    emptyBox.hidden = rows.length > 0;
    countEl.textContent = rows.length === total
      ? total + ' rows'
      : rows.length + ' of ' + total + ' rows';
  }

  function renderFacts() {
    document.getElementById('meta-asof').textContent = 'Snapshot ' + DATA.asOf;
    document.getElementById('meta-counts').textContent =
      DATA.board.length + ' candidates · ' + DATA.live.length + ' live · ' + DATA.setAside.length + ' set aside';
    var watchCount = DATA.board.filter(function (r) { return r.watchlist; }).length;
    document.getElementById('facts').innerHTML =
      '<div class="fact"><span>Launch candidates</span><b>' + DATA.board.length + '</b></div>' +
      '<div class="fact"><span>Watchlist covered</span><b>' + watchCount + ' / ' + watchCount + '</b></div>' +
      '<div class="fact"><span>Watchlist floor</span><b>' + money(DATA.floorUsd) + '</b></div>' +
      '<div class="fact"><span>Top implied value</span><b>' + (DATA.board.length ? money(DATA.board[0].implied_value_usd) : '—') + '</b></div>' +
      '<div class="fact"><span>Global median mcap/TVL</span><b>' + DATA.globalMedian.toFixed(3) + 'x</b></div>';
  }

  function renderCalibration() {
    document.getElementById('calibration').innerHTML = DATA.calibration
      .map(function (c) {
        return '<tr><td>' + esc(c.category) + '</td>' +
          '<td class="num">' + c.samples + '</td>' +
          '<td class="num">' + (c.median === null ? '—' : c.median.toFixed(3) + 'x') + '</td>' +
          '<td class="num">' + mult(c.multiple) + '</td>' +
          '<td class="sub">' + (c.source === 'category' ? 'category median' : 'global median') + '</td></tr>';
      })
      .join('');
  }

  // ------------------------------------------------------------ detail drawer

  var detail = document.getElementById('detail');

  function findRow(slug) {
    var all = DATA.board.concat(DATA.live, DATA.setAside);
    for (var i = 0; i < all.length; i++) if (all[i].slug === slug) return all[i];
    return null;
  }

  function openDetail(slug) {
    var r = findRow(slug);
    if (!r) return;
    state.selected = slug;
    document.getElementById('d-sub').textContent = (r.category || 'No category') + ' · ' + r.chains.join(', ');
    document.getElementById('d-name').textContent = r.name;
    document.getElementById('d-slug').textContent = r.slug + (r.watchlist ? ' · on the watchlist' : '');
    var facts =
      '<div class="fact"><span>TVL</span><b>' + moneyFull(r.tvl_usd) + '</b></div>' +
      '<div class="fact"><span>7-day TVL change</span><b>' + pct(r.change_7d) + '</b></div>' +
      '<div class="fact"><span>Age (listed ' + (r.age_days >= 365 ? (r.age_days / 365).toFixed(1) + ' years' : r.age_days + ' days') + ')</span><b>' + ageText(r.age_days) + '</b></div>';
    if (r.mcap_usd !== undefined) {
      facts += '<div class="fact"><span>Market cap</span><b>' + moneyFull(r.mcap_usd) + '</b></div>' +
        '<div class="fact"><span>mcap / TVL</span><b>' + r.ratio.toFixed(3) + 'x</b></div>';
    }
    document.getElementById('d-facts').innerHTML = facts;

    var modelEl = document.getElementById('d-model');
    var recomputeEl = document.getElementById('d-recompute');
    var stepsEl = document.getElementById('d-steps');
    if (r.implied_value_usd !== undefined) {
      // Recompute from the row's own figures, at full precision: the page
      // and the board must agree on every row.
      var recomputed = Math.round(r.tvl_usd * r.category_multiple * r.growth_multiplier * r.maturity_multiplier);
      modelEl.innerHTML =
        '<div><span>TVL</span><b>' + moneyFull(r.tvl_usd) + '</b></div>' +
        '<div><span>Category multiple (' + (r.multiple_source === 'category'
          ? 'median of ' + r.multiple_samples + ' live tokens'
          : 'global median over ' + DATA.globalSamples + ' priced live tokens') + ')</span><b>' + mult(r.category_multiple) + '</b></div>' +
        '<div><span>Growth (7d ' + pct(r.change_7d) + ')</span><b>' + r.growth_multiplier.toFixed(4) + 'x</b></div>' +
        '<div><span>Maturity (' + r.age_days + ' days)</span><b>' + r.maturity_multiplier.toFixed(4) + 'x</b></div>' +
        '<div><span>Implied value</span><b>' + moneyFull(r.implied_value_usd) + '</b></div>';
      recomputeEl.textContent = recomputed === r.implied_value_usd
        ? 'Recomputes as ' + moneyFull(recomputed) + ' — the same number board.json carries.'
        : 'Recomputes as ' + moneyFull(recomputed) + ', which differs from the board — please report this.';
      stepsEl.innerHTML = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    } else if (r.reason) {
      modelEl.innerHTML = '<div><span>Set aside</span><b>not a launch</b></div>';
      recomputeEl.textContent = r.reason;
      stepsEl.innerHTML = '<li>This protocol is set aside, so it carries no farm plan: its token, or the token it wraps, already trades.</li>';
    } else {
      modelEl.innerHTML = '<div><span>mcap / TVL</span><b>' + r.ratio.toFixed(3) + 'x</b></div>' +
        '<div><span>Role</span><b>calibration</b></div>';
      recomputeEl.textContent = 'This protocol already has a token. Its mcap/TVL ratio is one of the priced samples that calibrate the board — see the calibration table below the board.';
      stepsEl.innerHTML = '<li>This protocol already has a token, so it carries no farm plan: there is no launch left to farm.</li>';
    }
    detail.hidden = false;
    renderTable();
  }

  function closeDetail() {
    state.selected = null;
    detail.hidden = true;
    renderTable();
  }

  // ------------------------------------------------------------ controls

  function fillSelect(el, values) {
    var keep = el.value;
    el.innerHTML = '<option value="">' + (el.id === 'category' ? 'All categories' : 'All chains') + '</option>' +
      values.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
    el.value = values.indexOf(keep) === -1 ? '' : keep;
  }

  function refreshFilterOptions() {
    var rows = allRows();
    var cats = [];
    var chains = [];
    rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) === -1) chains.push(c); });
    });
    cats.sort();
    chains.sort();
    fillSelect(document.getElementById('category'), cats);
    fillSelect(document.getElementById('chain'), chains);
    document.getElementById('watchonly').disabled = state.tab !== 'board';
  }

  function setTab(tab, keepHash) {
    state.tab = tab;
    state.sortKey = tab === 'board' ? 'rank' : tab === 'live' ? 'mcap_usd' : 'tvl_usd';
    state.sortDir = tab === 'board' ? 1 : -1;
    if (tab !== 'board') state.watchOnly = false;
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    });
    refreshFilterOptions();
    renderTable();
    if (!keepHash) syncHash();
  }

  function syncHash() {
    var parts = [];
    if (state.tab !== 'board') parts.push('tab=' + state.tab);
    if (state.category) parts.push('category=' + encodeURIComponent(state.category));
    if (state.selected) parts.push('p=' + encodeURIComponent(state.selected));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : '#');
  }

  function readHash() {
    var hash = location.hash.replace(/^#/, '');
    var params = {};
    hash.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    });
    if (params.tab && COLUMNS[params.tab]) setTab(params.tab, true);
    if (params.category) {
      state.category = params.category;
      document.getElementById('category').value = params.category;
    }
    if (params.p) openDetail(params.p);
  }

  // ------------------------------------------------------------ wire up

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.dataset.tab); });
  });

  document.getElementById('q').addEventListener('input', function (e) {
    state.q = e.target.value;
    renderTable();
  });
  document.getElementById('category').addEventListener('change', function (e) {
    state.category = e.target.value;
    renderTable();
    syncHash();
  });
  document.getElementById('chain').addEventListener('change', function (e) {
    state.chain = e.target.value;
    renderTable();
  });
  document.getElementById('watchonly').addEventListener('change', function (e) {
    state.watchOnly = e.target.checked;
    renderTable();
  });
  document.getElementById('clear-filters').addEventListener('click', function () {
    state.q = '';
    state.category = '';
    state.chain = '';
    state.watchOnly = false;
    document.getElementById('q').value = '';
    document.getElementById('category').value = '';
    document.getElementById('chain').value = '';
    document.getElementById('watchonly').checked = false;
    renderTable();
    syncHash();
  });

  headRow.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-sort]');
    if (!btn) return;
    var key = btn.dataset.sort;
    if (state.sortKey === key) state.sortDir = -state.sortDir;
    else {
      state.sortKey = key;
      state.sortDir = key === 'rank' ? 1 : -1;
    }
    renderTable();
  });

  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) {
      openDetail(tr.dataset.slug);
      syncHash();
    }
  });

  document.getElementById('d-close').addEventListener('click', function () {
    closeDetail();
    syncHash();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !detail.hidden) {
      closeDetail();
      syncHash();
    }
  });

  // ------------------------------------------------------------ boot

  renderFacts();
  renderCalibration();
  refreshFilterOptions();
  setTab('board', true);
  readHash();
  renderTable();
})();

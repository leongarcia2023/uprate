(function (root) {
  "use strict";

  function PyRandom(seed) {
    var N = 624, M = 397;
    var mt = new Uint32Array(N);
    var mti = N + 1;

    function initGenrand(s) {
      mt[0] = s >>> 0;
      for (mti = 1; mti < N; mti++) {
        var prev = mt[mti - 1] ^ (mt[mti - 1] >>> 30);
        mt[mti] = (Math.imul(1812433253, prev) + mti) >>> 0;
      }
    }

    function initByArray(key) {
      initGenrand(19650218);
      var i = 1, j = 0, k = Math.max(N, key.length), prev;
      for (; k; k--) {
        prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
        mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) >>> 0) + key[j] + j >>> 0;
        i++; j++;
        if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
        if (j >= key.length) j = 0;
      }
      for (k = N - 1; k; k--) {
        prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
        mt[i] = (((mt[i] ^ Math.imul(prev, 1566083941)) >>> 0) - i) >>> 0;
        i++;
        if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      }
      mt[0] = 0x80000000;
    }

    function next32() {
      var y, kk;
      if (mti >= N) {
        for (kk = 0; kk < N - M; kk++) {
          y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
          mt[kk] = mt[kk + M] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
        }
        for (; kk < N - 1; kk++) {
          y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
          mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
        }
        y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff);
        mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
        mti = 0;
      }
      y = mt[mti++];
      y ^= y >>> 11;
      y ^= (y << 7) & 0x9d2c5680;
      y ^= (y << 15) & 0xefc60000;
      y ^= y >>> 18;
      return y >>> 0;
    }

    var key = [];
    var n = Math.abs(Math.floor(seed));
    if (n === 0) key.push(0);
    while (n > 0) { key.push(n % 4294967296); n = Math.floor(n / 4294967296); }
    initByArray(key);

    function random() {
      var a = next32() >>> 5, b = next32() >>> 6;
      return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
    }

    function getrandbits(k) {
      return k === 32 ? next32() : next32() >>> (32 - k);
    }

    function randbelow(n) {
      var k = 32 - Math.clz32(n);
      var r = getrandbits(k);
      while (r >= n) r = getrandbits(k);
      return r;
    }

    return {
      random: random,
      uniform: function (a, b) { return a + (b - a) * random(); },
      choice: function (seq) { return seq[randbelow(seq.length)]; }
    };
  }

  var TYPES = ["MUR", "Stretch", "EPU"];
  var US_PER_DAY = 86400000000;
  var MS_PER_DAY = 86400000;

  function wholeDays(d) {
    var ip = Math.trunc(d);
    var us = (d - ip) * US_PER_DAY;
    var ip2 = Math.trunc(us);
    var left = us - ip2;
    var w = Math.round(left);
    if (Math.abs(w - left) === 0.5) w = 2 * Math.round(left / 2);
    return ip + Math.floor((ip2 + w) / US_PER_DAY);
  }

  function allocate(data, opts) {
    opts = opts || {};
    var p = data.params;
    var sizes = { MUR: opts.murMwe != null ? opts.murMwe : p.typical_mwe.MUR,
                  Stretch: opts.stretchMwe != null ? opts.stretchMwe : p.typical_mwe.Stretch };
    var totals = {};
    data.expected_by_year.forEach(function (r) { totals[r.filing_year] = r.mwe; });
    var named = data.expected.slice().sort(function (a, b) { return a.order - b.order; });
    var years = Array.from(new Set(named.map(function (n) { return n.year; }))).sort(function (a, b) { return a - b; });
    var apps = [];
    years.forEach(function (year) {
      var rows = named.filter(function (n) { return n.year === year; });
      var each;
      if (opts.split === "even") {
        var v = totals[year] / rows.length;
        each = { MUR: v, Stretch: v, EPU: v };
      } else {
        var fixed = 0, nEpu = 0;
        rows.forEach(function (n) { if (n.type in sizes) fixed += sizes[n.type]; else if (n.type === "EPU") nEpu++; });
        each = { MUR: sizes.MUR, Stretch: sizes.Stretch, EPU: nEpu ? (totals[year] - fixed) / nEpu : 0 };
      }
      rows.forEach(function (n) {
        var mid = p.quarter_mid[String(n.q)];
        apps.push(Object.assign({}, n, { mwe: each[n.type], filedMs: Date.UTC(year, mid[0] - 1, mid[1]) }));
      });
    });
    return apps;
  }

  function reviewPools(data, since) {
    var pools = {};
    var rows = data.approvals.slice().sort(function (a, b) { return a.no - b.no; });
    TYPES.forEach(function (t) {
      var timed = rows.filter(function (a) { return a.type === t && a.months != null; });
      var recent = since == null ? [] : timed.filter(function (a) { return +a.approved.slice(0, 4) >= since; });
      pools[t] = (recent.length ? recent : timed).map(function (a) { return a.months; });
    });
    return pools;
  }

  function percentile(sorted, q) {
    return sorted[Math.floor(q * (sorted.length - 1))];
  }

  function median(values) {
    var s = Float64Array.from(values).sort();
    var n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  function simulate(data, apps, opts) {
    var p = data.params;
    var years = p.years;
    var y0 = years[0], ny = years.length;
    var runs = opts.runs || data.runs;
    var rng = PyRandom(opts.seed != null ? opts.seed : data.seed);
    var pools = opts.pools || reviewPools(data, p.modern_since);
    var shift = opts.shift || 0;
    var scale = opts.scale != null ? opts.scale : 1.0;
    var targets = opts.review === "targets";
    var spread = p.target_spread;
    var cum = [];
    for (var c = 0; c < ny; c++) cum.push(new Float64Array(runs));
    var counts = apps.map(function () { return new Float64Array(ny + 1); });
    var windows = apps.map(function (a) {
      var w = p.install_window[a.type];
      return [Math.max(w[0] + shift, 1), Math.max(w[1] + shift, 2)];
    });
    var target = apps.map(function (a) { return p.target_months[a.type] + p.acceptance_months; });
    var pool = apps.map(function (a) { return pools[a.type]; });
    var leads = { MUR: [], Stretch: [], EPU: [] };
    var keepLeads = opts.leads !== false;
    for (var r = 0; r < runs; r++) {
      var added = new Float64Array(ny);
      for (var i = 0; i < apps.length; i++) {
        var a = apps[i];
        var review = targets ? target[i] * rng.uniform(spread[0], spread[1]) : scale * rng.choice(pool[i]);
        var install = rng.uniform(windows[i][0], windows[i][1]);
        var total = review + install;
        var year = new Date(a.filedMs + wholeDays(total * p.days_per_month) * MS_PER_DAY).getUTCFullYear();
        var slot = year - y0;
        if (slot >= 0 && slot < ny) added[slot] += a.mwe;
        counts[i][slot < 0 ? 0 : slot >= ny ? ny : slot] += 1;
        if (keepLeads) leads[a.type].push(total);
      }
      var running = 0.0;
      for (var k = 0; k < ny; k++) { running += added[k]; cum[k][r] = running; }
    }
    var bands = {};
    years.forEach(function (y, k) {
      var s = cum[k].slice().sort();
      bands[y] = { p10: percentile(s, 0.1), p50: percentile(s, 0.5), p90: percentile(s, 0.9) };
    });
    var byEndOf = counts.map(function (cnt) {
      var out = {}, acc = 0;
      years.forEach(function (y, k) { acc += cnt[k]; out[y] = acc / runs; });
      return out;
    });
    var leadMedian = {};
    if (keepLeads) TYPES.forEach(function (t) { if (leads[t].length) leadMedian[t] = median(leads[t]); });
    return { bands: bands, byEndOf: byEndOf, leadMedian: leadMedian };
  }

  function drawLeads(data, type, opts) {
    var p = data.params;
    var rng = PyRandom(opts.seed != null ? opts.seed : data.seed);
    var pools = opts.pools || reviewPools(data, p.modern_since);
    var w = p.install_window[type];
    var lo = Math.max(w[0] + (opts.shift || 0), 1), hi = Math.max(w[1] + (opts.shift || 0), 2);
    var n = opts.runs || 5000, out = new Float64Array(n), rev = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var review = opts.review === "targets"
        ? (p.target_months[type] + p.acceptance_months) * rng.uniform(p.target_spread[0], p.target_spread[1])
        : (opts.scale != null ? opts.scale : 1) * rng.choice(pools[type]);
      rev[i] = review;
      out[i] = review + rng.uniform(lo, hi);
    }
    return { total: out, review: rev };
  }

  function restartsIn(data, year, on) {
    var p = data.params;
    var share = (String(year) in p.restart_share) ? p.restart_share[String(year)] : (year > 2027 ? 1 : 0);
    var sum = 0;
    Object.keys(p.restarts).forEach(function (k) { if (!on || on[k] !== false) sum += p.restarts[k]; });
    return share * sum;
  }

  root.UprateModel = {
    PyRandom: PyRandom, allocate: allocate, reviewPools: reviewPools, simulate: simulate,
    drawLeads: drawLeads, restartsIn: restartsIn, percentile: percentile, median: median, wholeDays: wholeDays
  };
})(typeof window !== "undefined" ? window : globalThis);

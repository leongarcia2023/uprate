// Headline animation: one extended power uprate, from filing to first electrons.
// Drawn in SVG and looped while it is on screen. Visitors who ask for reduced motion see the finished frame.
(function () {
  "use strict";
  var host = document.getElementById("hero");
  if (!host || !document.createElementNS) return;

  var C = { teal: "#1FA89C", terra: "#C65A2E", steel: "#3D6B9E", rust: "#8F3B1E", saffron: "#E0A23C", slate: "#56648A",
            navy: "#1A2A4A", ink: "#22222A", muted: "#5A5C6B", tealText: "#0d6e66", saffronText: "#8a5a00" };
  var NS = "http://www.w3.org/2000/svg", D = 17, STILL = 14.5;
  var LABEL = "Animation of a nuclear plant getting an extended power uprate. The application is filed, the NRC reviews it for 23 months, " +
    "the plant installs bigger feedwater pumps, a new high-pressure turbine, a rewound generator and a larger transformer during a refueling outage, " +
    "and its output rises from 1,000 to 1,200 megawatts.";

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, s, attrs) {
    var t = el("text", Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function ease(u) { u = clamp(u, 0, 1); return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function prog(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function mix(a, b, u) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.slice(i, i + 2), 16); });
    var pb = [1, 3, 5].map(function (i) { return parseInt(b.slice(i, i + 2), 16); });
    return "rgb(" + pa.map(function (v, i) { return Math.round(lerp(v, pb[i], clamp(u, 0, 1))); }).join(",") + ")";
  }
  function vis(e, o) { e.setAttribute("opacity", clamp(o, 0, 1).toFixed(3)); }

  // the story: reactor power (1 = 100%) and the date on the timeline, as functions of time in the loop
  function power(t) {
    if (t < 6.9) return 1;
    if (t < 7.7) return 1 - ease(prog(t, 6.9, 7.7));
    if (t < 10.7) return 0;
    if (t < 12.9) return 1.2 * ease(prog(t, 10.7, 12.9));
    return 1.2;
  }
  function spin(t) { return Math.min(1, power(t) / 0.25); }
  function date(t) {
    if (t < 1.2) return lerp(2027.0, 2027.4, t / 1.2);
    if (t < 6.2) return lerp(2027.4, 2029.3, ease(prog(t, 1.2, 6.2)));
    if (t < 7.7) return lerp(2029.3, 2029.45, prog(t, 6.2, 7.7));
    if (t < 10.7) return lerp(2029.45, 2030.1, prog(t, 7.7, 10.7));
    if (t < 12.9) return lerp(2030.1, 2030.25, prog(t, 10.7, 12.9));
    return lerp(2030.25, 2031.0, prog(t, 12.9, 16.6));
  }
  function statusText(t) {
    return t < 6.9 ? "Running at 100%" : t < 10.7 ? "Refueling outage" : t < 12.9 ? "Raising power" : "Uprated to 120%";
  }
  // motion that depends on how fast things have been moving: integrals of power and turbine speed
  function table(f, dt) {
    var n = Math.ceil(D / dt) + 1, out = new Float64Array(n), acc = 0;
    for (var i = 1; i < n; i++) { acc += 0.5 * (f((i - 1) * dt) + f(i * dt)) * dt; out[i] = acc; }
    return function (t) { var x = clamp(t, 0, D) / dt, i = Math.floor(x), r = x - i; return i + 1 < n ? out[i] + (out[i + 1] - out[i]) * r : out[n - 1]; };
  }
  var flowInt = table(power, 0.01), spinInt = table(spin, 0.01);
  var WORK = [["Bigger feedwater pumps", 7.9], ["New high-pressure turbine", 8.6], ["Rewound generator", 9.3], ["Larger main transformer", 10.0]];

  // Layouts. The plant is drawn in the wide coordinates and scaled into the narrow layout.
  var LAYOUTS = {
    wide: {
      w: 1000, h: 466, plant: { x: 0, y: 40, k: 1 }, sw: 1, plantLabels: true, labelFs: 20, labelDy: 27,
      gauge: { lx: 40, ly: 28, lfs: 20, x: 40, y: 40, w: 204, h: 16, px: 256, py: 54, fs: 20 },
      out: { lx: 980, ly: 30, lfs: 20, vx: 980, vy: 80, vfs: 44, dx: 980, dy: 110, dfs: 24, sx: 980, sy: 138, sfs: 20, anchor: "end" },
      work: { x: 322, y: 10, w: 340, h: 144, fs: 19, tfs: 21, cols: 1, row0: 44, rowGap: 24 },
      tl: { x0: 60, x1: 940, y: 432, fs: 20, yfs: 18, labDy: 34, yDy: 22, single: false }
    },
    narrow: {
      w: 600, h: 580, plant: { x: 4, y: 116, k: 0.6 }, sw: 1.6, plantLabels: false, labelFs: 22, labelDy: 29,
      gauge: { lx: 16, ly: 126, lfs: 22, x: 166, y: 112, w: 284, h: 16, px: 462, py: 126, fs: 22 },
      out: { lx: 16, ly: 28, lfs: 22, vx: 16, vy: 84, vfs: 54, dx: 584, dy: 52, dfs: 26, sx: 584, sy: 84, sfs: 22, anchor: "start" },
      work: { x: 16, y: 452, w: 568, h: 118, fs: 21, tfs: 24, cols: 2, colW: 270, row0: 54, rowGap: 31 },
      tl: { x0: 30, x1: 570, y: 406, fs: 24, yfs: 22, labDy: 35, yDy: 24, single: true }
    }
  };

  function build(mode) {
    var L = LAYOUTS[mode];
    var svg = el("svg", { viewBox: "0 0 " + L.w + " " + L.h, role: "img", "aria-label": LABEL, focusable: "false" });
    var defs = el("defs", {}, svg);
    var grad = el("radialGradient", { id: "hero-glow" }, defs);
    el("stop", { offset: "0", "stop-color": C.saffron, "stop-opacity": "0.95" }, grad);
    el("stop", { offset: "0.55", "stop-color": C.saffron, "stop-opacity": "0.35" }, grad);
    el("stop", { offset: "1", "stop-color": C.saffron, "stop-opacity": "0" }, grad);
    var root = el("g", {}, svg);
    var S = function (w) { return w * L.sw; };
    var H = {};

    // ---- the plant, in wide coordinates
    var plant = el("g", { transform: "translate(" + L.plant.x + " " + L.plant.y + ") scale(" + L.plant.k + ")" }, root);
    el("line", { x1: 20, y1: 300, x2: 980, y2: 300, stroke: C.ink, "stroke-width": S(2.5) }, plant);
    // plume: a stroked layer under a white layer, so the puffs merge into one outlined cloud
    var plume = el("g", {}, plant), plumeLine = el("g", {}, plume), plumeFill = el("g", {}, plume);
    H.puffs = [];
    for (var i = 0; i < 12; i++) H.puffs.push([el("circle", { cx: 730, cy: 140, r: 0, fill: C.ink, stroke: C.ink, "stroke-width": S(4) }, plumeLine), el("circle", { cx: 730, cy: 140, r: 0, fill: "#fff" }, plumeFill)]);
    el("path", { d: "M672 300 Q706 214 684 146 L776 146 Q754 214 788 300 Z", fill: "#fff", stroke: C.ink, "stroke-width": S(2.5), "stroke-linejoin": "round" }, plant);
    el("path", { d: "M684 146 Q730 156 776 146", fill: "none", stroke: C.ink, "stroke-width": S(1.5) }, plant);
    function pipe(d, color, dash) {
      el("path", { d: d, fill: "none", stroke: C.ink, "stroke-width": S(2.2) + 8.8, "stroke-linejoin": "round" }, plant);
      el("path", { d: d, fill: "none", stroke: "#fff", "stroke-width": 6.5, "stroke-linejoin": "round" }, plant);
      return el("path", { d: d, fill: "none", stroke: color, "stroke-width": 3.4, "stroke-dasharray": dash, "stroke-linecap": "round" }, plant);
    }
    H.steam = pipe("M190 196 H354", C.steel, "8 9");
    H.feed = pipe("M354 274 H190", C.slate, "5 9");
    H.cool = pipe("M512 280 H686", C.slate, "5 9");
    el("path", { d: "M60 300 V152 A90 90 0 0 1 240 152 V300", fill: "#fff", stroke: C.ink, "stroke-width": S(2.5) }, plant);
    H.halo = el("circle", { cx: 150, cy: 240, r: 34, fill: "url(#hero-glow)" }, plant);
    el("rect", { x: 112, y: 168, width: 76, height: 122, rx: 24, fill: "none", stroke: C.ink, "stroke-width": S(2.2) }, plant);
    H.rods = [];
    for (i = 0; i < 5; i++) H.rods.push(el("rect", { x: 125 + i * 11.5, y: 208, width: 7, height: 62, fill: C.saffron, stroke: C.ink, "stroke-width": S(1.2) }, plant));
    el("rect", { x: 320, y: 150, width: 290, height: 150, fill: "#fff", stroke: C.ink, "stroke-width": S(2.5) }, plant);
    el("line", { x1: 352, y1: 205, x2: 592, y2: 205, stroke: C.ink, "stroke-width": S(2) }, plant);
    H.hp = el("polygon", { points: "354,191 394,183 394,227 354,219", fill: "#fff", stroke: C.ink, "stroke-width": S(2.2), "stroke-linejoin": "round" }, plant);
    el("polygon", { points: "406,183 454,167 454,243 406,227", fill: "#fff", stroke: C.ink, "stroke-width": S(2.2), "stroke-linejoin": "round" }, plant);
    el("polygon", { points: "464,183 512,167 512,243 464,227", fill: "#fff", stroke: C.ink, "stroke-width": S(2.2), "stroke-linejoin": "round" }, plant);
    H.gen = el("rect", { x: 528, y: 180, width: 64, height: 50, rx: 7, fill: "#fff", stroke: C.ink, "stroke-width": S(2.2) }, plant);
    var rotor = el("g", { transform: "translate(560 205)" }, plant);
    el("circle", { cx: 0, cy: 0, r: 15, fill: "none", stroke: C.ink, "stroke-width": S(2) }, rotor);
    H.spokes = el("g", {}, rotor);
    for (i = 0; i < 3; i++) el("line", { x1: 0, y1: 0, x2: 0, y2: -13, stroke: C.ink, "stroke-width": S(2), transform: "rotate(" + i * 120 + ")" }, H.spokes);
    el("rect", { x: 406, y: 254, width: 106, height: 36, fill: "#fff", stroke: C.ink, "stroke-width": S(2.2) }, plant);
    for (i = 0; i < 3; i++) el("path", { d: "M414 " + (264 + i * 9) + " q12 -5 24 0 t24 0 t24 0 t24 0", fill: "none", stroke: C.slate, "stroke-width": S(1.4) }, plant);
    var pump = el("g", { transform: "translate(368 274)" }, plant);
    H.pump = el("circle", { cx: 0, cy: 0, r: 13, fill: "#fff", stroke: C.ink, "stroke-width": S(2.2) }, pump);
    H.imp = el("g", {}, pump);
    for (i = 0; i < 4; i++) el("line", { x1: 0, y1: 0, x2: 9, y2: 0, stroke: C.ink, "stroke-width": S(1.8), transform: "rotate(" + i * 90 + ")" }, H.imp);
    el("line", { x1: 381, y1: 274, x2: 406, y2: 274, stroke: C.ink, "stroke-width": S(2) }, plant);
    H.xf = el("rect", { x: 620, y: 246, width: 36, height: 54, fill: "#fff", stroke: C.ink, "stroke-width": S(2.2) }, plant);
    for (i = 0; i < 3; i++) el("line", { x1: 626 + i * 10, y1: 254, x2: 626 + i * 10, y2: 292, stroke: C.ink, "stroke-width": S(1.4) }, plant);
    el("line", { x1: 592, y1: 210, x2: 620, y2: 258, stroke: C.ink, "stroke-width": S(2) }, plant);
    el("path", { d: "M864 300 L876 150 L884 150 L896 300 M869 240 L891 240 M866 270 L894 270 M873 196 L887 196 M870 238 L888 198 M867 268 L890 242 M846 166 H914 M840 190 H920 M876 150 L846 166 M884 150 L914 166",
                 fill: "none", stroke: C.ink, "stroke-width": S(2), "stroke-linejoin": "round" }, plant);
    H.lineA = el("path", { d: "M656 250 Q760 214 846 166", fill: "none", stroke: C.ink, "stroke-width": S(1.8) }, plant);
    H.lineB = el("path", { d: "M914 166 Q958 182 1000 174", fill: "none", stroke: C.ink, "stroke-width": S(1.8) }, plant);
    H.pulses = [];
    for (i = 0; i < 9; i++) H.pulses.push(el("circle", { r: 3.8, fill: C.saffron, stroke: C.ink, "stroke-width": S(1.1) }, plant));
    var names = [["Reactor", 150], ["Turbine and generator", 465], ["Cooling tower", 730], ["Grid", 935]];
    if (L.plantLabels) {
      names.forEach(function (n) { text(plant, n[1], 300 + L.labelDy, n[0], { "font-size": L.labelFs, fill: C.muted, "text-anchor": "middle" }); });
    } else {
      names.forEach(function (n) {
        if (n[0] === "Turbine and generator") n = ["Turbine hall", n[1]];
        // the two right-hand labels sit a little apart so they do not read as one phrase
        var x = n[0] === "Cooling tower" ? 436 : n[0] === "Grid" ? L.w - 24 : L.plant.x + n[1] * L.plant.k;
        text(root, x, L.plant.y + 300 * L.plant.k + L.labelDy, n[0], { "font-size": L.labelFs, fill: C.muted, "text-anchor": n[0] === "Grid" ? "end" : "middle" });
      });
    }

    // ---- reactor power gauge (the frame runs to 120%, so 100% sits at five sixths of it)
    var G = L.gauge;
    text(root, G.lx, G.ly, "Reactor power", { "font-size": G.lfs, fill: C.muted });
    el("rect", { x: G.x, y: G.y, width: G.w, height: G.h, fill: "#fff", stroke: C.ink, "stroke-width": 2 }, root);
    H.gBase = el("rect", { x: G.x + 1, y: G.y + 1, width: 0, height: G.h - 2, fill: C.ink }, root);
    H.gExtra = el("rect", { x: G.x + G.w * 5 / 6, y: G.y + 1, width: 0, height: G.h - 2, fill: C.terra }, root);
    el("line", { x1: G.x + G.w * 5 / 6, y1: G.y - 4, x2: G.x + G.w * 5 / 6, y2: G.y + G.h + 4, stroke: C.rust, "stroke-width": 2, "stroke-dasharray": "3 2" }, root);
    H.gText = text(root, G.px, G.py, "100%", { "font-size": G.fs, fill: C.ink });

    // ---- output readout
    var O = L.out;
    text(root, O.lx, O.ly, "Electric output", { "font-size": O.lfs, fill: C.muted, "text-anchor": O.anchor });
    H.outVal = text(root, O.vx, O.vy, "1,000 MWe", { "font-size": O.vfs, fill: C.ink, "text-anchor": O.anchor });
    H.outDelta = text(root, O.dx, O.dy, "+200 MWe", { "font-size": O.dfs, fill: C.terra, "text-anchor": "end" });
    H.status = text(root, O.sx, O.sy, "", { "font-size": O.sfs, fill: C.rust, "text-anchor": "end" });

    // ---- the EPU work list
    var W = L.work;
    el("rect", { x: W.x, y: W.y, width: W.w, height: W.h, fill: "#fff", stroke: C.terra, "stroke-width": 2 }, root);
    text(root, W.x + 14, W.y + W.tfs + 7, "EPU work at the outage", { "font-size": W.tfs, fill: C.terra });
    H.items = WORK.map(function (it, k) {
      var col = W.cols === 2 ? k % 2 : 0, row = W.cols === 2 ? Math.floor(k / 2) : k;
      var x = W.x + 14 + col * (W.colW || W.w / 2), y = W.y + W.row0 + row * W.rowGap, bs = W.fs - 4;
      el("rect", { x: x, y: y, width: bs, height: bs, fill: "#fff", stroke: C.ink, "stroke-width": 1.5 }, root);
      var tick = el("path", { d: "M" + (x + 2) + " " + (y + bs * 0.55) + " l" + (bs * 0.28) + " " + (bs * 0.28) + " l" + (bs * 0.55) + " " + (-bs * 0.65), fill: "none", stroke: C.terra, "stroke-width": 2.2 }, root);
      var lab = text(root, x + bs + 7, y + bs - 1, it[0], { "font-size": W.fs, fill: C.ink });
      return { tick: tick, lab: lab, at: it[1] };
    });

    // ---- timeline
    var T = L.tl;
    function tx(d) { return T.x0 + (d - 2027) / 4 * (T.x1 - T.x0); }
    H.tx = tx;
    el("line", { x1: T.x0, y1: T.y, x2: T.x1, y2: T.y, stroke: C.ink, "stroke-width": 2 }, root);
    for (var yv = 2027; yv <= 2031; yv++) {
      el("line", { x1: tx(yv), y1: T.y, x2: tx(yv), y2: T.y - 7, stroke: C.ink, "stroke-width": 2 }, root);
      text(root, tx(yv), T.y + T.yDy, String(yv), { "font-size": T.yfs, fill: C.ink, "text-anchor": yv === 2027 ? "start" : yv === 2031 ? "end" : "middle" });
    }
    H.bars = {
      review: el("rect", { x: tx(2027.4), y: T.y - 22, width: 0, height: 12, fill: C.terra }, root),
      install: el("rect", { x: tx(2029.3), y: T.y - 22, width: 0, height: 12, fill: C.saffron }, root),
      grid: el("rect", { x: tx(2030.25), y: T.y - 22, width: 0, height: 12, fill: C.teal }, root)
    };
    H.filedMark = el("circle", { cx: tx(2027.4), cy: T.y - 16, r: 7, fill: C.steel, stroke: C.ink, "stroke-width": 1.5 }, root);
    H.apprMark = el("rect", { x: tx(2029.3) - 6, y: T.y - 22, width: 12, height: 12, fill: C.slate, stroke: C.ink, "stroke-width": 1.5 }, root);
    function lab(x, s, color) { return text(root, x, T.y - T.labDy, s, { "font-size": T.fs, fill: color, "text-anchor": "middle" }); }
    if (T.single) {
      H.phase = text(root, L.w / 2, T.y - T.labDy, "", { "font-size": T.fs, fill: C.ink, "text-anchor": "middle" });
    } else {
      H.labFiled = lab(tx(2027.4), "Filed", C.steel);
      H.labReview = lab(tx(2028.35), "NRC review", C.terra);
      H.labAppr = lab(tx(2029.3), "Approved", C.slate);
      H.labInst = lab(tx(2029.775), "Installed at an outage", C.saffronText);
      H.labGrid = lab(tx(2030.62), "+200 MWe on the grid", C.tealText);
    }
    H.marker = el("line", { x1: 0, y1: T.y - 25, x2: 0, y2: T.y + 4, stroke: C.rust, "stroke-width": 2.4 }, root);
    H.lenA = 0;
    return { svg: svg, root: root, H: H, L: L };
  }

  function render(V, t) {
    var H = V.H, L = V.L, G = L.gauge, P = power(t), dt = date(t), F = flowInt(t);
    V.root.setAttribute("opacity", Math.min(prog(t, 0, 0.35), 1 - prog(t, D - 0.45, D)).toFixed(3));
    if (!H.lenA) { H.lenA = H.lineA.getTotalLength(); H.lenB = H.lineB.getTotalLength(); }
    // gauge
    H.gBase.setAttribute("width", Math.max(0, Math.min(P, 1) * G.w * 5 / 6 - 1).toFixed(1));
    H.gExtra.setAttribute("width", Math.max(0, Math.min(P - 1, 0.2) * G.w * 5 / 6 - 1).toFixed(1));
    H.gText.textContent = Math.round(P * 100) + "%";
    H.gText.setAttribute("fill", P > 1.001 ? C.terra : C.ink);
    // core
    H.halo.setAttribute("r", (24 + 16 * P).toFixed(1));
    vis(H.halo, 0.15 + 0.7 * Math.min(P, 1.2) / 1.2);
    H.rods.forEach(function (r) { r.setAttribute("fill", P > 1 ? mix(C.saffron, C.terra, (P - 1) / 0.2 * 0.6) : mix("#FFFFFF", C.saffron, P)); });
    // steam and water move with the integral of power
    H.steam.setAttribute("stroke-dashoffset", (-F * 60).toFixed(1));
    H.feed.setAttribute("stroke-dashoffset", (-F * 36).toFixed(1));
    H.cool.setAttribute("stroke-dashoffset", (-F * 36).toFixed(1));
    [H.steam, H.feed, H.cool].forEach(function (f) { vis(f, Math.min(1, P * 1.4)); });
    H.steam.setAttribute("stroke-width", (3 + Math.max(0, P - 1) * 6).toFixed(2));
    // the turbine turns at a fixed synchronous speed whenever it is on line
    var ang = spinInt(t) * 300;
    H.spokes.setAttribute("transform", "rotate(" + (ang % 360).toFixed(1) + ")");
    H.imp.setAttribute("transform", "rotate(" + ((ang * 1.4) % 360).toFixed(1) + ")");
    // plume: a puff every 0.32 s, sized by the power when it left the tower
    var spawn = 0.32, life = 3.2, nowK = Math.floor(t / spawn);
    H.puffs.forEach(function (pp, k) {
      var idx = nowK - k, born = idx * spawn, age = t - born, r = 0, cx = 730, cy = 140;
      if (idx >= 0 && age >= 0 && age <= life) {
        var pw = power(born), a = age / life;
        if (pw >= 0.05) {
          cx = 728 + Math.sin(idx * 1.7) * 7 - a * 34;
          cy = 138 - a * 82 * (0.7 + 0.3 * pw);
          r = (8 + a * 17) * (0.6 + 0.4 * pw) * (a > 0.72 ? 1 - (a - 0.72) / 0.28 : 1);
        }
      }
      pp.forEach(function (c) { c.setAttribute("cx", cx.toFixed(1)); c.setAttribute("cy", cy.toFixed(1)); c.setAttribute("r", Math.max(0, r).toFixed(1)); });
    });
    // power on the line
    H.pulses.forEach(function (c, k) {
      var u = ((F * 0.16 + k / H.pulses.length) % 1 + 1) % 1, s = u * (H.lenA + H.lenB);
      var pt = s < H.lenA ? H.lineA.getPointAtLength(s) : H.lineB.getPointAtLength(s - H.lenA);
      c.setAttribute("cx", pt.x.toFixed(1));
      c.setAttribute("cy", pt.y.toFixed(1));
      vis(c, Math.min(1, P * 1.3));
      c.setAttribute("r", (3 + Math.max(0, P - 1) * 6).toFixed(2));
    });
    // readout
    var mwe = Math.round(P * 1000 / 10) * 10;
    H.outVal.textContent = fmt(mwe) + " MWe";
    H.outDelta.textContent = "+" + fmt(Math.max(0, mwe - 1000)) + " MWe";
    vis(H.outDelta, P > 1.005 ? 1 : 0);
    H.status.textContent = statusText(t);
    // the EPU work and the upgraded parts
    var done = WORK.map(function (w) { return prog(t, w[1], w[1] + 0.35); });
    H.items.forEach(function (it, k) { vis(it.tick, done[k]); it.lab.setAttribute("fill", done[k] > 0.5 ? C.terra : C.ink); });
    var flash = function (k) { return Math.max(0, 1 - Math.abs(t - WORK[k][1] - 0.2) / 0.35); };
    var sw = V.L.sw;
    H.pump.setAttribute("stroke", mix(C.ink, C.terra, done[0]));
    H.pump.setAttribute("r", (13 + 3 * done[0]).toFixed(1));
    H.pump.setAttribute("stroke-width", ((2.2 + 2 * flash(0)) * sw).toFixed(2));
    H.hp.setAttribute("stroke", mix(C.ink, C.terra, done[1]));
    H.hp.setAttribute("stroke-width", ((2.2 + 2 * flash(1)) * sw).toFixed(2));
    H.hp.setAttribute("points", done[1] > 0.5 ? "352,189 396,180 396,230 352,221" : "354,191 394,183 394,227 354,219");
    H.gen.setAttribute("stroke", mix(C.ink, C.terra, done[2]));
    H.gen.setAttribute("stroke-width", ((2.2 + 2 * flash(2)) * sw).toFixed(2));
    H.xf.setAttribute("stroke", mix(C.ink, C.terra, done[3]));
    H.xf.setAttribute("stroke-width", ((2.2 + 2 * flash(3)) * sw).toFixed(2));
    H.xf.setAttribute("y", (246 - 6 * done[3]).toFixed(1));
    H.xf.setAttribute("height", (54 + 6 * done[3]).toFixed(1));
    // timeline
    var tx = H.tx;
    H.marker.setAttribute("x1", tx(dt));
    H.marker.setAttribute("x2", tx(dt));
    vis(H.marker, 1 - prog(t, 13.1, 13.6));
    H.bars.review.setAttribute("width", Math.max(0, tx(Math.min(dt, 2029.3)) - tx(2027.4)).toFixed(1));
    H.bars.install.setAttribute("width", Math.max(0, tx(Math.min(dt, 2030.25)) - tx(2029.3)).toFixed(1));
    H.bars.grid.setAttribute("width", Math.max(0, tx(dt) - tx(2030.25)).toFixed(1));
    vis(H.filedMark, prog(dt, 2027.38, 2027.42));
    vis(H.apprMark, prog(dt, 2029.28, 2029.31));
    var months = Math.max(1, Math.round((Math.min(dt, 2029.3) - 2027.4) * 12));
    var review = dt < 2029.3 ? "NRC review, month " + months : "NRC review, 23 months";
    if (H.phase) {
      var ph = dt < 2027.38 ? ["", C.ink, 2027.2] : dt < 2027.55 ? ["Application filed", C.steel, 2027.4] : dt < 2029.3 ? [review, C.terra, 2028.35]
        : dt < 2029.48 ? ["Approved by the NRC", C.slate, 2029.3] : dt < 2030.25 ? ["Installed at an outage", C.saffronText, 2029.775] : ["+200 MWe on the grid", C.tealText, 2030.62];
      H.phase.textContent = ph[0];
      H.phase.setAttribute("fill", ph[1]);
      var half = ph[0].length * L.tl.fs * 0.26;
      H.phase.setAttribute("x", clamp(tx(ph[2]), half + 8, L.w - half - 8).toFixed(1));
    } else {
      vis(H.labFiled, prog(dt, 2027.38, 2027.45));
      H.labReview.textContent = review;
      vis(H.labReview, prog(dt, 2027.45, 2027.55));
      vis(H.labAppr, prog(dt, 2029.28, 2029.33) * (1 - prog(dt, 2029.42, 2029.48)));
      vis(H.labInst, prog(dt, 2029.49, 2029.56) * (1 - prog(dt, 2030.19, 2030.24)));
      vis(H.labGrid, prog(dt, 2030.24, 2030.3));
    }
  }

  // ---- player: loops while on screen, rebuilds when the layout changes, holds still for reduced motion
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var view = null, mode = null, t = reduce ? STILL : 0, last = null, visible = true, paused = reduce;
  function layoutFor() { return host.clientWidth < 640 ? "narrow" : "wide"; }
  function mount() {
    var m = layoutFor();
    if (m === mode && view) return;
    mode = m;
    view = build(m);
    host.textContent = "";
    host.appendChild(view.svg);
    host.style.aspectRatio = view.L.w + " / " + view.L.h;
    render(view, t);
  }
  function frame(now) {
    if (!paused && visible && view) {
      if (last != null) t = (t + Math.min(0.1, (now - last) / 1000)) % D;
      last = now;
      render(view, t);
    } else {
      last = null;
    }
    window.requestAnimationFrame(frame);
  }
  mount();
  if (window.ResizeObserver) new ResizeObserver(function () { mount(); }).observe(host);
  else window.addEventListener("resize", mount);
  if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(host);
  if (!reduce) {
    host.title = "Click to pause";
    host.addEventListener("click", function () {
      paused = !paused;
      host.title = paused ? "Click to play" : "Click to pause";
    });
    window.requestAnimationFrame(frame);
  }
  window.UPRATE_HERO = { render: function (time) { t = time; render(view, t); }, pause: function () { paused = true; }, duration: D, mode: function () { return mode; } };
})();

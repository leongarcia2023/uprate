(function () {
  "use strict";
  var U = window.UPRATE, M = window.UprateModel, P = window.Plotly;
  if (!U || !M || !P) return;

  var C = {
    teal: "#1FA89C", terra: "#C65A2E", plum: "#6A4C93", steel: "#3D6B9E", rust: "#8F3B1E", saffron: "#E0A23C",
    slate: "#56648A", straw: "#A8946A", navy: "#1A2A4A", ink: "#22222A", grid: "#D9D9DE", muted: "#5E6070"
  };
  var TYPE_COLOR = { MUR: C.saffron, Stretch: C.teal, EPU: C.terra };
  var TYPE_SYMBOL = { MUR: "circle", Stretch: "square", EPU: "diamond" };
  var TYPE_LONG = { MUR: "Measurement uncertainty recapture (MUR)", Stretch: "Stretch", EPU: "Extended power uprate (EPU)" };
  var FONT = "'CMU Serif', 'Latin Modern Roman', Georgia, serif";
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SCEN_ORDER = ["historical", "fast", "slow", "targets", "targets_fast"];
  var SCEN_SHORT = {
    historical: "Historical reviews, typical installation",
    fast: "Historical reviews, installation 6 months sooner",
    slow: "Historical reviews, installation 6 months later",
    targets: "NRC targets met, typical installation",
    targets_fast: "NRC targets met, installation 6 months sooner"
  };
  var APPLICANT_SHORT = {
    "Constellation Energy Generation, LLC": "Constellation", "Wolf Creek Nuclear Operating Corp.": "Wolf Creek NOC",
    "Vistra Operating Company, LLC": "Vistra", "Proprietary": "Applicant withheld"
  };
  var CONFIG = { displayModeBar: false, responsive: false, scrollZoom: false, doubleClick: false, showTips: false, editable: false };

  var state = {
    pipelineMode: "mwe", historyMode: "year", reviewHighlight: "all", reviewHidden: { MUR: false, Stretch: false, EPU: false },
    targetMode: "stated", leadType: "MUR", leadReview: "modern", leadShift: "0", leadQuarter: "2027-1",
    scenario: "historical", showTargets: true, restarts: { "Palisades": true, "Crane": true, "Duane Arnold": true },
    insideYear: "2029", roomView: "most", scenRestarts: true, simSplit: "type", parserExample: "0",
    tblType: "all", tblSource: "all", tblSearch: "", tblSortKey: "no", tblSortDir: 1, sitePlot: "history"
  };

  var apps = M.allocate(U);
  var pools = { modern: M.reviewPools(U, U.params.modern_since), whole: M.reviewPools(U, null) };
  var marks = U.params.marks;

  function $(id) { return document.getElementById(id); }
  function n0(x) { return Math.round(x).toLocaleString("en-US"); }
  function yr(a) { return +a.approved.slice(0, 4); }
  function range(a, b) { var out = []; for (var i = a; i <= b; i++) out.push(i); return out; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "none";
    var p = iso.split("-");
    return MON[+p[1] - 1] + " " + (+p[2]) + ", " + p[0];
  }
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
  function shortApplicant(a) { return APPLICANT_SHORT[a] || a; }
  function plantName(a) {
    if (a.plant !== "Proprietary") return a.plant;
    return a.applicant === "Proprietary" ? "Applicant withheld" : shortApplicant(a.applicant) + ", plant withheld";
  }
  function smartQuotes(t) {
    return String(t)
      .replace(/'(?=\d\d\b)/g, "\u2019")
      .replace(/([A-Za-z0-9])'(?=[A-Za-z])/g, "$1\u2019")
      .replace(/(^|[\s(\[\u201c])'(?=\S)/g, "$1\u2018")
      .replace(/'/g, "\u2019")
      .replace(/(^|[\s(\[\u2018])"(?=\S)/g, "$1\u201c")
      .replace(/"/g, "\u201d");
  }

  function textEl(tag, text, cls) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function chartWidth(id) { return Math.max(240, Math.floor($(id).getBoundingClientRect().width)); }
  function tierOf(w) { return w < 560 ? "s" : w < 980 ? "m" : "l"; }
  function fsz(t, s, m, l) { return t === "s" ? s : t === "m" ? m : l; }

  function axis(t, o) {
    o = o || {};
    var a = {
      showline: true, linecolor: C.ink, linewidth: 2, ticks: "inside", ticklen: 7, tickwidth: 2, tickcolor: C.ink,
      mirror: false, showgrid: false, zeroline: false, automargin: true, fixedrange: true,
      tickfont: { family: FONT, size: fsz(t, 11.5, 13, 14), color: C.ink }
    };
    Object.keys(o).forEach(function (k) { if (k !== "title" && k !== "showgrid" && k !== "gridcolor") a[k] = o[k]; });
    if (o.title) a.title = { text: o.title, font: { family: FONT, size: fsz(t, 12.5, 14, 15), color: C.ink }, standoff: 8 };
    return a;
  }

  function layout(t, o) {
    var L = {
      font: { family: FONT, color: C.ink, size: fsz(t, 12, 13, 14) },
      paper_bgcolor: "#fff", plot_bgcolor: "#fff",
      margin: { l: 6, r: 10, t: 10, b: 6, pad: 0 },
      showlegend: false, dragmode: false, hovermode: "closest", hoverdistance: 24,
      hoverlabel: { bgcolor: "#fff", bordercolor: C.ink, font: { family: FONT, color: C.ink, size: fsz(t, 12, 13, 13) }, align: "left" },
      xaxis: axis(t), yaxis: axis(t)
    };
    Object.keys(o || {}).forEach(function (k) { L[k] = o[k]; });
    return L;
  }

  var FS = 1.22;

  function grow(font) { if (font && font.size) font.size = Math.round(font.size * FS * 2) / 2; }

  function draw(id, data, lay) {
    lay.width = chartWidth(id);
    lay.autosize = false;
    grow(lay.font);
    if (lay.hoverlabel) grow(lay.hoverlabel.font);
    ["xaxis", "yaxis"].forEach(function (k) {
      var ax = lay[k];
      if (!ax) return;
      grow(ax.tickfont);
      if (ax.title) grow(ax.title.font);
    });
    (lay.annotations || []).forEach(function (a) { grow(a.font); });
    data.forEach(function (tr) { grow(tr.textfont); });
    return P.react($(id), data, lay, CONFIG);
  }

  function markerSvg(sym, c, cx, cy, r) {
    var stroke = " stroke=\"" + C.ink + "\" stroke-width=\"1.3\"";
    if (sym === "square") return "<rect x=\"" + (cx - r) + "\" y=\"" + (cy - r) + "\" width=\"" + 2 * r + "\" height=\"" + 2 * r + "\" fill=\"" + c + "\"" + stroke + "/>";
    if (sym === "diamond") return "<path d=\"M" + cx + " " + (cy - r - 1.5) + " L" + (cx + r + 1.5) + " " + cy + " L" + cx + " " + (cy + r + 1.5) + " L" + (cx - r - 1.5) + " " + cy + " Z\" fill=\"" + c + "\"" + stroke + "/>";
    if (sym === "star") {
      var pts = [];
      for (var i = 0; i < 10; i++) {
        var ang = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r + 1.5;
        pts.push((cx + rad * Math.cos(ang)).toFixed(2) + "," + (cy + rad * Math.sin(ang)).toFixed(2));
      }
      return "<polygon points=\"" + pts.join(" ") + "\" fill=\"" + c + "\"" + stroke + "/>";
    }
    return "<circle cx=\"" + cx + "\" cy=\"" + cy + "\" r=\"" + r + "\" fill=\"" + c + "\"" + stroke + "/>";
  }

  function swatchSvg(it) {
    var c = it.color || C.ink, s;
    if (it.kind === "bar") s = "<rect x=\"3\" y=\"2\" width=\"16\" height=\"10\" fill=\"" + c + "\" stroke=\"" + C.ink + "\" stroke-width=\"1.5\"/>";
    else if (it.kind === "area") s = "<rect x=\"3\" y=\"2\" width=\"16\" height=\"10\" fill=\"" + c + "\"/>";
    else if (it.kind === "band") s = "<rect x=\"2\" y=\"2\" width=\"18\" height=\"10\" fill=\"" + c + "\" opacity=\"" + (it.opacity || 0.3) + "\"/>";
    else if (it.kind === "hatch") s = "<rect x=\"3\" y=\"2\" width=\"16\" height=\"10\" fill=\"#fff\" stroke=\"" + C.rust + "\" stroke-width=\"1.6\"/><path d=\"M4 12 L12 2 M10 12 L18 2 M16 12 L19 8.3\" stroke=\"" + C.rust + "\" stroke-width=\"1.4\"/>";
    else if (it.kind === "whisker") s = "<path d=\"M3 7 H19 M3 3 V11 M19 3 V11\" stroke=\"" + C.ink + "\" stroke-width=\"2.4\" fill=\"none\"/>";
    else if (it.kind === "marker") s = markerSvg(it.symbol || "circle", c, 11, 7, 4.5);
    else {
      s = "<line x1=\"1\" y1=\"7\" x2=\"21\" y2=\"7\" stroke=\"" + c + "\" stroke-width=\"" + (it.width || 3) + "\"" + (it.dash ? " stroke-dasharray=\"" + it.dash + "\"" : "") + "/>";
      if (it.symbol) s += markerSvg(it.symbol, c, 11, 7, 3.6);
    }
    return "<svg width=\"27\" height=\"17\" viewBox=\"0 0 22 14\" aria-hidden=\"true\" focusable=\"false\">" + s + "</svg>";
  }

  function setKey(id, items) {
    var box = $(id);
    if (!box) return;
    box.textContent = "";
    items.forEach(function (it) {
      var el = document.createElement(it.toggle ? "button" : "span");
      el.className = "key-item";
      if (it.toggle) {
        el.type = "button";
        el.setAttribute("aria-pressed", it.pressed ? "true" : "false");
        el.addEventListener("click", it.toggle);
      }
      var sw = document.createElement("span");
      sw.className = "sw";
      sw.innerHTML = swatchSvg(it);
      el.appendChild(sw);
      el.appendChild(textEl("span", it.label));
      box.appendChild(el);
    });
  }

  var TYPE_KEY = function (kind) {
    return ["MUR", "Stretch", "EPU"].map(function (t) { return { kind: kind || "bar", color: TYPE_COLOR[t], label: t }; });
  };

  var PIPE_YEARS = range(2026, 2032);

  function drawPipeline() {
    var id = "fig-pipeline", W = chartWidth(id), t = tierOf(W), mode = state.pipelineMode;
    var byYear = {};
    U.expected_by_year.forEach(function (r) { byYear[r.filing_year] = r; });
    var key = { MUR: "mur", Stretch: "stretch", EPU: "epu" };
    var traces = ["EPU", "Stretch", "MUR"].map(function (ty) {
      var ys = [], hov = [];
      PIPE_YEARS.forEach(function (y) {
        var rows = apps.filter(function (a) { return a.year === y && a.type === ty; });
        var mwe = rows.reduce(function (s, a) { return s + a.mwe; }, 0);
        var cnt = byYear[y][key[ty]];
        ys.push(mode === "mwe" ? mwe : cnt);
        var lines = rows.map(function (a) { return "Q" + a.q + "  " + esc(plantName(a)) + (a.plant !== "Proprietary" ? " (" + esc(shortApplicant(a.applicant)) + ")" : ""); });
        hov.push("<b>" + y + " " + ty + "</b><br>" + (mode === "mwe" ? n0(mwe) + " MWe by my split" : cnt + (cnt === 1 ? " filing" : " filings") + " in the NRC summary") +
          (lines.length ? "<br>Named on the list:<br>" + lines.join("<br>") : ""));
      });
      return { type: "bar", name: ty, x: PIPE_YEARS, y: ys, width: 0.64, marker: { color: TYPE_COLOR[ty], line: { color: C.ink, width: 1.5 } },
               hovertext: hov, hoverinfo: "text" };
    });
    var run = 0;
    var cum = PIPE_YEARS.map(function (y) { run += mode === "mwe" ? byYear[y].mwe : byYear[y].applications; return run; });
    traces.push({ type: "scatter", mode: "lines+markers", x: PIPE_YEARS, y: cum, line: { color: C.navy, width: 3 },
                  marker: { size: t === "s" ? 8 : 10, color: C.navy, line: { color: C.ink, width: 1.4 } },
                  hovertemplate: "Through %{x}: %{y:,.0f} " + (mode === "mwe" ? "MWe" : "filings") + "<extra></extra>" });
    var shapes = [], ann = [], f = fsz(t, 11.5, 13, 14);
    if (mode === "mwe") {
      [[2500, "UPRISE goal: 2.5 GWe by 2027"], [5000, "UPRISE goal: 5 GWe by 2029"]].forEach(function (m) {
        shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: m[0], y1: m[0], line: { color: C.rust, width: 2.6, dash: "dash" } });
        ann.push({ xref: "paper", x: t === "s" ? 0.01 : 0.995, y: m[0], text: m[1], showarrow: false, xanchor: t === "s" ? "left" : "right", yanchor: "bottom",
                   font: { family: FONT, color: C.rust, size: f } });
      });
      if (t !== "s") {
        ann.push({ xref: "paper", x: 0.995, y: 3600, text: "31 filings, 2,421 MWe through 2032<br>17 of them in 2027", showarrow: false,
                   xanchor: "right", yanchor: "middle", align: "right", font: { family: FONT, color: C.slate, size: f } });
      }
    } else {
      ann.push({ x: 2027, y: 17, text: "17 filings in 2027", showarrow: false, yanchor: "bottom", yshift: 3, font: { family: FONT, color: C.ink, size: f } });
    }
    draw(id, traces, layout(t, {
      barmode: "stack", height: clamp(Math.round(W * 0.54), 330, 510), shapes: shapes, annotations: ann,
      xaxis: axis(t, { title: "Planned filing year", tickmode: "array", tickvals: PIPE_YEARS, ticktext: PIPE_YEARS.map(String), range: [2025.4, 2032.6] }),
      yaxis: axis(t, { title: mode === "mwe" ? "Megawatts electric (MWe)" : "Filings",
                       range: mode === "mwe" ? [0, 5600] : [0, 34], tickformat: "," })
    }));
    var keyItems = TYPE_KEY("bar").concat([{ kind: "line", symbol: "circle", color: C.navy, label: mode === "mwe" ? "Running total applied for" : "Running total of filings" }]);
    if (mode === "mwe") keyItems.push({ kind: "line", color: C.rust, dash: "5,3", width: 2.6, label: "UPRISE goals" });
    setKey("key-pipeline", keyItems);
  }

  function buildExpectedTable() {
    var tb = $("tbl-expected").querySelector("tbody");
    apps.forEach(function (a) {
      var tr = document.createElement("tr");
      tr.appendChild(textEl("td", "Q" + a.q + " " + a.year));
      tr.appendChild(textEl("td", shortApplicant(a.applicant)));
      var tdPlant = document.createElement("td");
      tdPlant.appendChild(a.plant === "Proprietary" ? document.createTextNode("Withheld") : plantLink(a.plant, UNIT_SITE[a.unit]));
      tr.appendChild(tdPlant);
      var td = document.createElement("td");
      td.appendChild(textEl("span", a.type, "tag " + a.type));
      tr.appendChild(td);
      tr.appendChild(textEl("td", a.mwe.toFixed(a.type === "EPU" ? 1 : 0), "num"));
      tb.appendChild(tr);
    });
  }

  var HIST_YEARS = range(1977, 2021);

  function historyCells() {
    var by = {};
    ["MUR", "Stretch", "EPU"].forEach(function (t) { by[t] = HIST_YEARS.map(function () { return { mwt: 0, rows: [] }; }); });
    U.approvals.forEach(function (a) {
      var c = by[a.type][yr(a) - HIST_YEARS[0]];
      c.mwt += a.mwt;
      c.rows.push(a);
    });
    return by;
  }

  function historyHover(y, ty, c) {
    if (!c.rows.length) return "";
    var names = c.rows.map(function (a) { return esc(a.plant) + " " + a.pct + "%"; });
    var lines = [];
    for (var i = 0; i < names.length; i += 3) lines.push(names.slice(i, i + 3).join(", "));
    return "<b>" + y + " " + ty + "</b><br>" + c.rows.length + (c.rows.length === 1 ? " approval, " : " approvals, ") + n0(c.mwt) + " MWt<br>" + lines.join("<br>");
  }

  function drawHistory() {
    var id = "fig-history", W = chartWidth(id), t = tierOf(W), mode = state.historyMode, by = historyCells();
    var order = ["Stretch", "EPU", "MUR"], traces = [], ann = [], f = fsz(t, 11.5, 13, 13.5), yMax = 0;
    var shapes = [{ type: "rect", xref: "x", yref: "paper", x0: 2000.5, x1: 2002.5, y0: 0, y1: 1, fillcolor: C.terra, opacity: 0.09, line: { width: 0 }, layer: "below" }];
    if (t === "l") {
      [[1988.5, "Stretch uprates"], [2001.5, "EPU wave"], [2012, "Heavier review"]].forEach(function (e) {
        ann.push({ x: e[0], y: 1, yref: "paper", text: e[1], showarrow: false, yanchor: "bottom", yshift: 4, font: { family: FONT, size: 13.5, color: C.slate } });
      });
    }
    if (mode === "year") {
      order.forEach(function (ty) {
        traces.push({ type: "bar", x: HIST_YEARS, y: by[ty].map(function (c) { return c.mwt; }), width: 0.8,
                      marker: { color: TYPE_COLOR[ty], line: { color: C.ink, width: fsz(t, 0, 1.2, 1.5) } },
                      hovertext: by[ty].map(function (c, i) { return historyHover(HIST_YEARS[i], ty, c); }), hoverinfo: "text" });
      });
      HIST_YEARS.forEach(function (y, i) { yMax = Math.max(yMax, by.MUR[i].mwt + by.Stretch[i].mwt + by.EPU[i].mwt); });
      if (W >= 760) {
        ann.push({ xref: "paper", x: 0.995, yref: "paper", y: 0.98, showarrow: false, xanchor: "right", yanchor: "top", align: "right",
                   bgcolor: "rgba(255,255,255,0.92)", font: { family: FONT, size: f, color: C.slate },
                   text: t === "l" ? "Last EPU: Browns Ferry, Aug 2017<br>Last approval: Millstone 3 MUR, Nov 2021<br>Nothing approved since"
                                   : "Last EPU: Browns Ferry, 2017<br>Last approval: Millstone 3, 2021" });
      }
    } else {
      var total = 0;
      order.forEach(function (ty) {
        var run = 0;
        var ys = by[ty].map(function (c) { run += c.mwt; return run; });
        total += run;
        traces.push({ type: "scatter", mode: "lines", x: HIST_YEARS, y: ys, stackgroup: "one", line: { color: TYPE_COLOR[ty], width: 1.6 },
                      fillcolor: TYPE_COLOR[ty], hovertemplate: ty + ": %{y:,.0f} MWt<extra></extra>" });
      });
      ann.push({ x: 2021, y: total, text: t === "s" ? n0(total) + " MWt" : n0(total) + " MWt, about 8 GWe", showarrow: false, xanchor: "right", yanchor: "bottom", yshift: 4,
                 font: { family: FONT, size: f, color: C.navy } });
    }
    var L = layout(t, {
      barmode: "stack", height: clamp(Math.round(W * 0.52), 330, 510), shapes: shapes, annotations: ann,
      hovermode: mode === "year" ? "closest" : "x unified",
      xaxis: axis(t, { title: "NRC approval year", range: [1976, 2022], dtick: t === "s" ? 10 : 5 }),
      yaxis: axis(t, { title: mode === "year" ? "Approved per year (MWt)" : "Approved, running total (MWt)",
                       tickformat: ",", range: mode === "year" ? [0, Math.ceil(yMax * 1.08 / 500) * 500] : [0, 28500] })
    });
    if (t === "l") L.margin.t = 38;
    draw(id, traces, L);
    setKey("key-history", [
      { kind: mode === "year" ? "bar" : "area", color: TYPE_COLOR.MUR, label: TYPE_LONG.MUR },
      { kind: mode === "year" ? "bar" : "area", color: TYPE_COLOR.EPU, label: TYPE_LONG.EPU },
      { kind: mode === "year" ? "bar" : "area", color: TYPE_COLOR.Stretch, label: "Stretch" },
      { kind: "band", color: C.terra, opacity: 0.18, label: "EPU wave, 2001 and 2002" }
    ]);
  }

  var provenanceBound = false;

  function drawProvenance() {
    var id = "fig-provenance", W = chartWidth(id), t = tierOf(W);
    var counts = { parser: 0, hand: 0, none: 0 };
    U.approvals.forEach(function (a) { counts[a.source] += 1; });
    var segs = [
      ["parser", "Read by the parser", C.teal, "The parser found the citing sentence and read the date."],
      ["hand", "Read by hand", C.saffron, "Poor scans, bundled requests or wording outside the eight variants.<br>Each row carries a note."],
      ["none", "No letter to read", C.straw, "Microfiche era accession numbers from before 1997."]
    ];
    var traces = segs.map(function (s) {
      return { type: "bar", orientation: "h", y: ["Approvals"], x: [counts[s[0]]], width: 0.62, customdata: [s[0]],
               marker: { color: s[2], line: { color: C.ink, width: 2 } },
               text: [String(counts[s[0]])], textposition: "inside", insidetextanchor: "middle", textfont: { family: FONT, size: fsz(t, 13, 15, 16), color: C.ink },
               hovertemplate: "<b>" + s[1] + ": " + counts[s[0]] + "</b><br>" + s[3] + "<br>Click to show these rows in the table<extra></extra>" };
    });
    draw(id, traces, layout(t, {
      barmode: "stack", height: t === "s" ? 110 : 132,
      margin: { l: 6, r: 24, t: 10, b: 6, pad: 0 },
      xaxis: axis(t, { range: [-172 * 2 / Math.max(200, W - 50), 172 * (1 + 2 / Math.max(200, W - 50))], tickvals: [0, 25, 50, 75, 100, 125, 150, 172], title: t === "s" ? null : "Approvals, 1977 to 2021" }),
      yaxis: axis(t, { visible: false })
    })).then(function () {
      if (provenanceBound) return;
      provenanceBound = true;
      $(id).on("plotly_click", function (ev) {
        var p = ev.points && ev.points[0];
        if (!p) return;
        setSeg("tblSource", p.data.customdata[0]);
        $("data").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    setKey("key-provenance", segs.map(function (s) { return { kind: "bar", color: s[2], label: s[1] + " (" + counts[s[0]] + ")" }; }));
  }

  var MONTH_RE = "January|February|March|April|May|June|July|August|September|October|November|December";
  var DATE_RE = "(" + MONTH_RE + ")\\s+\\d{1,2},?\\s+\\d{4}";
  var VARIANTS = [
    ["in\\s+response\\s+to\\s+[^.]{0,100}?application\\s+dated\\s+(" + DATE_RE + ")", "in response to ... application dated DATE (up to 100 characters between, no period)"],
    ["in\\s+response\\s+to\\s+your\\s+application\\s+of\\s+(" + DATE_RE + ")", "in response to your application of DATE"],
    ["by\\s+application\\s+dated\\s+(" + DATE_RE + ")", "by application dated DATE"],
    ["pursuant\\s+to\\s+your\\s+application\\s+dated\\s+(" + DATE_RE + ")", "pursuant to your application dated DATE"],
    ["your\\s+application\\s+dated\\s+(" + DATE_RE + ")", "your application dated DATE"],
    ["application\\s+for\\s+amendment\\s+dated\\s+(" + DATE_RE + ")", "application for amendment dated DATE"],
    ["license\\s+amendment\\s+request(?:\\s*\\(LAR\\))?\\s+dated\\s+(" + DATE_RE + ")", "license amendment request (LAR) dated DATE"],
    ["letter\\s+dated\\s+(" + DATE_RE + ")\\s*,?\\s+as\\s+supplemented", "letter dated DATE, as supplemented"]
  ];
  var MONTH_FULL = MONTH_RE.split("|").map(function (s) { return s.toLowerCase(); });
  var EXAMPLES = [
    "The amendment revises the Technical Specifications to raise the licensed thermal power level. The amendment is in response to your application dated June 4, 2019, as supplemented by letters dated October 2, 2019, and January 15, 2020.",
    "The amendment is in response to Northern Power Company\u2019s (the licensee\u2019s) application dated March 3, 2011, as supplemented by letter dated May 9, 2011.",
    "1.0 INTRODUCTION By application dated September 28, 2012, the licensee requested changes to the Technical Specifications to increase the maximum licensed thermal power.",
    "This is in response to your letters dated May 2, 1985, and January 10, 1986, requesting an increase in the authorized power level.",
    "The amendment is in response to your application dated September 8,2010, as supplemented by letters dated December 2, 2010, and March 1, 2011."
  ];

  function parseDate(raw) {
    raw = raw.replace(/(\d{1,2})\s+(\d{4})$/, "$1, $2");
    var m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(raw);
    if (!m) return null;
    var mi = MONTH_FULL.indexOf(m[1].toLowerCase()), d = +m[2], y = +m[3];
    if (mi < 0) return null;
    var dt = new Date(Date.UTC(y, mi, d));
    if (dt.getUTCMonth() !== mi || dt.getUTCDate() !== d) return null;
    return y + "-" + String(mi + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  function runParser(text) {
    var flat = text.replace(/\s+/g, " ");
    for (var i = 0; i < VARIANTS.length; i++) {
      var m = new RegExp(VARIANTS[i][0], "i").exec(flat);
      if (m) {
        var iso = parseDate(m[1]);
        if (iso) return { variant: i + 1, iso: iso, match: m[0] };
      }
    }
    return null;
  }

  function showParser() {
    var out = $("parser-out");
    out.textContent = "";
    var r = runParser($("parser-text").value);
    if (!r) {
      out.appendChild(textEl("b", "No match. "));
      out.appendChild(document.createTextNode("This letter would go to hand reading, like 17 letters in the dataset."));
      return;
    }
    out.appendChild(document.createTextNode("Variant " + r.variant + " matched. Application date: "));
    out.appendChild(textEl("b", fmtDate(r.iso)));
    out.appendChild(document.createTextNode(". Matched text: \u201c"));
    out.appendChild(textEl("span", r.match, "match"));
    out.appendChild(document.createTextNode("\u201d"));
  }

  function buildVariantTable() {
    var counts = {};
    U.approvals.forEach(function (a) { if (a.source === "parser") counts[a.variant] = (counts[a.variant] || 0) + 1; });
    var tb = $("tbl-variants").querySelector("tbody");
    VARIANTS.forEach(function (v, i) {
      var tr = document.createElement("tr");
      tr.appendChild(textEl("td", String(i + 1), "num"));
      tr.appendChild(textEl("td", v[1], "pattern"));
      tr.appendChild(textEl("td", String(counts[i + 1] || 0), "num"));
      tb.appendChild(tr);
    });
  }

  function loadExample() {
    $("parser-text").value = EXAMPLES[+state.parserExample];
    showParser();
  }

  var reviewBound = false, reviewAnnSites = [];

  function reviewHover(a) {
    return "<b>" + esc(a.plant) + "</b>  " + a.type + ", " + a.pct + "% (" + n0(a.mwt) + " MWt)<br>Applied " + fmtDate(a.applied) +
      "<br>Approved " + fmtDate(a.approved) + "<br><b>" + a.months.toFixed(1) + " months</b><br>Date read " +
      (a.source === "hand" ? "by hand" : "by the parser") + ". Click to open the letter.";
  }

  function drawReviews() {
    var id = "fig-reviews", W = chartWidth(id), t = tierOf(W), hl = state.reviewHighlight;
    var rows = U.approvals.filter(function (a) { return a.months != null; });
    var pick = {
      all: null,
      wave: function (a) { return a.type === "EPU" && yr(a) >= 2001 && yr(a) <= 2002; },
      epu05: function (a) { return a.type === "EPU" && yr(a) >= 2005; },
      bwr05: function (a) { return a.type === "EPU" && yr(a) >= 2005 && a.rx === "BWR"; },
      mur10: function (a) { return a.type === "MUR" && yr(a) >= 2010; }
    }[hl];
    var traces = ["Stretch", "MUR", "EPU"].map(function (ty) {
      var d = rows.filter(function (a) { return a.type === ty; });
      var tr = {
        type: "scatter", mode: "markers", visible: !state.reviewHidden[ty],
        x: d.map(function (a) { return a.approved; }), y: d.map(function (a) { return a.months; }),
        marker: { color: TYPE_COLOR[ty], symbol: TYPE_SYMBOL[ty], size: ty === "EPU" ? fsz(t, 9, 11, 12) : fsz(t, 7.5, 9, 10), line: { color: C.ink, width: 1.2 }, opacity: 0.92 },
        customdata: d.map(function (a) { return a.url; }), hovertext: d.map(reviewHover), hoverinfo: "text"
      };
      if (pick) {
        tr.selectedpoints = d.map(function (a, i) { return pick(a) ? i : -1; }).filter(function (i) { return i >= 0; });
        tr.selected = { marker: { opacity: 1 } };
        tr.unselected = { marker: { opacity: 0.12 } };
      }
      return tr;
    });
    var shapes = [
      { type: "rect", xref: "x", yref: "paper", x0: "2000-10-01", x1: "2002-08-01", y0: 0, y1: 1, fillcolor: C.terra, opacity: 0.12, line: { width: 0 }, layer: "below" },
      { type: "line", xref: "x", yref: "paper", x0: "2005-01-01", x1: "2005-01-01", y0: 0, y1: 1, line: { color: C.rust, width: 2.4, dash: "dash" } }
    ];
    var ink = function (size) { return { family: FONT, size: size, color: C.ink }; };
    var rust = function (size) { return { family: FONT, size: size, color: C.rust }; };
    var ann = [];
    reviewAnnSites = [];
    if (t === "s") {
      ann.push({ x: "1977-01-01", y: 64, text: "EPUs since 2005:<br>21 of 22 took<br>17 to 61 months", showarrow: false, xanchor: "left", yanchor: "top", align: "left", font: rust(10.5) });
    } else if (t === "m") {
      ann.push({ x: "2000-09-01", y: 41, text: "EPU wave<br>2001 and 2002<br>9.6 to 16.1 months", showarrow: false, xanchor: "right", yanchor: "top", align: "right", font: ink(12) });
      ann.push({ x: "2005-07-01", y: 52, text: "EPUs since 2005:<br>21 of 22 took<br>17 to 61 months", showarrow: false, xanchor: "left", yanchor: "top", align: "left", font: rust(12) });
    } else {
      ann.push({ x: "2001-04-01", y: 39, text: "First EPU wave<br>2001 and 2002<br>9.6 to 16.1 months<br>(n = 9)", showarrow: false, xanchor: "center", yanchor: "top", font: ink(13) });
      ann.push({ x: "2005-07-01", y: 51, text: "EPUs approved since 2005:<br>21 of 22 took 17 to 61 months<br>(median 22.8, one at 12.1)", showarrow: false, xanchor: "left", yanchor: "top", align: "left", font: rust(13) });
      [["Monticello, 61 mo", "2013-12-09", 61.1, 14, 0, "left", "monticello"],
       ["Nine Mile Point 2, 57 mo", "2011-12-22", 56.8, 14, 0, "left", "nine-mile-point"],
       ["Ginna EPU, 12 mo (2006)", "2006-07-11", 12.1, -4, 72, "left", "ginna"],
       ["St. Lucie 2 stretch, 39 mo", "1985-03-01", 39.2, 46, -18, "center", "st-lucie"],
       ["Byron, Braidwood MUR, 31.5 mo", "2014-02-07", 31.5, 34, -26, "center", "byron"]].forEach(function (c) {
        reviewAnnSites[ann.length] = c[6];
        ann.push({ x: c[1], y: c[2], text: c[0], showarrow: true, arrowhead: 0, arrowwidth: 1.6, arrowcolor: C.ink, ax: c[3], ay: c[4], xanchor: c[5], font: ink(13), captureevents: true });
      });
    }
    draw(id, traces, layout(t, {
      height: clamp(Math.round(W * 0.6), 370, 580), shapes: shapes, annotations: ann,
      xaxis: axis(t, { title: "NRC approval date", type: "date", range: ["1976-06-01", "2022-08-01"], dtick: t === "s" ? "M120" : "M60", tickformat: "%Y" }),
      yaxis: axis(t, { title: W < 760 ? "Review time (months)" : "Review time, application to approval (months)", range: [0, 66], dtick: 10 })
    })).then(function () {
      document.querySelectorAll("#" + id + " g.annotation").forEach(function (g) {
        if (reviewAnnSites[+g.getAttribute("data-index")]) g.style.cursor = "pointer";
      });
      if (reviewBound) return;
      reviewBound = true;
      $(id).on("plotly_click", function (ev) {
        var p = ev.points && ev.points[0];
        if (p && p.customdata) window.open(p.customdata, "_blank", "noopener");
      });
      $(id).on("plotly_clickannotation", function (ev) {
        var sid = reviewAnnSites[ev.index];
        if (sid) openOnMap(sid, null);
      });
    });
    var keyItems = ["Stretch", "MUR", "EPU"].map(function (ty) {
      return { kind: "marker", symbol: TYPE_SYMBOL[ty], color: TYPE_COLOR[ty], label: ty, pressed: !state.reviewHidden[ty],
               toggle: function () { state.reviewHidden[ty] = !state.reviewHidden[ty]; drawReviews(); } };
    });
    keyItems.push({ kind: "band", color: C.terra, opacity: 0.22, label: "EPU wave, 2001 and 2002" });
    keyItems.push({ kind: "line", color: C.rust, dash: "5,3", width: 2.4, label: "January 2005" });
    setKey("key-reviews", keyItems);
  }

  function drawEras() {
    var id = "fig-eras", W = chartWidth(id), t = tierOf(W), plus = state.targetMode === "plus2" ? 2 : 0;
    var timed = U.approvals.filter(function (a) { return a.months != null; });
    var groups = [
      { name: ["EPU wave", "2001 and 2002"], ty: "EPU", f: function (a) { return a.type === "EPU" && yr(a) >= 2001 && yr(a) <= 2002; }, target: 12 },
      { name: ["EPU", "2005 to 2017"], ty: "EPU", f: function (a) { return a.type === "EPU" && yr(a) >= 2005; }, target: 12 },
      { name: ["MUR", "1999 to 2009"], ty: "MUR", f: function (a) { return a.type === "MUR" && yr(a) < 2010; }, target: 6 },
      { name: ["MUR", "2010 to 2021"], ty: "MUR", f: function (a) { return a.type === "MUR" && yr(a) >= 2010; }, target: 6 }
    ];
    var rng = M.PyRandom(3), traces = [], shapes = [], labels = [];
    groups.forEach(function (g, i) {
      var d = timed.filter(g.f);
      var xs = d.map(function () { return i + rng.uniform(-0.16, 0.16); });
      traces.push({
        type: "scatter", mode: "markers", x: xs, y: d.map(function (a) { return a.months; }),
        marker: { color: TYPE_COLOR[g.ty], symbol: TYPE_SYMBOL[g.ty], size: fsz(t, 7.5, 9, 10), line: { color: C.ink, width: 1.2 }, opacity: 0.88 },
        customdata: d.map(function (a) { return UNIT_SITE[a.unit] || ""; }),
        hovertext: d.map(function (a) { return "<b>" + esc(a.plant) + "</b> " + a.type + ", approved " + fmtDate(a.approved) + "<br>" + a.months.toFixed(1) + " months" + (UNIT_SITE[a.unit] ? "<br>Click to see the plant on the map" : ""); }),
        hoverinfo: "text"
      });
      var med = M.median(d.map(function (a) { return a.months; }));
      shapes.push({ type: "line", x0: i - 0.3, x1: i + 0.3, y0: med, y1: med, line: { color: C.ink, width: 4.5 } });
      shapes.push({ type: "line", x0: i - 0.24, x1: i + 0.24, y0: g.target + plus, y1: g.target + plus, line: { color: C.rust, width: 3, dash: "dash" } });
      labels.push(g.name.concat(["median " + med.toFixed(1)]).concat(t === "s" ? [] : ["n = " + d.length]).join("<br>"));
    });
    draw(id, traces, layout(t, {
      height: clamp(Math.round(W * 0.54), 380, 520), shapes: shapes,
      xaxis: axis(t, { tickmode: "array", tickvals: [0, 1, 2, 3], ticktext: labels, range: [-0.6, 3.6], ticks: "" }),
      yaxis: axis(t, { title: "Review time (months)", range: [0, 66], dtick: 10 })
    })).then(function () {
      if (erasBound) return;
      erasBound = true;
      $(id).on("plotly_click", function (ev) {
        var p = ev.points && ev.points[0], sid = p && p.customdata;
        if (sid && SITE_BY_ID[sid]) openOnMap(sid, null);
      });
    });
    setKey("key-eras", [
      { kind: "line", color: C.ink, width: 4.5, label: "Median review time" },
      { kind: "line", color: C.rust, dash: "5,3", width: 3, label: plus ? "NRC target plus 2 month acceptance review" : "NRC review target (May 2024 letter)" },
      { kind: "marker", symbol: "diamond", color: TYPE_COLOR.EPU, label: "EPU" },
      { kind: "marker", symbol: "circle", color: TYPE_COLOR.MUR, label: "MUR" }
    ]);
  }

  function quarterOptions() {
    var sel = $("lead-quarter");
    for (var y = 2026; y <= 2032; y++) {
      for (var q = 1; q <= 4; q++) {
        if (y === 2026 && q < 4) continue;
        var o = document.createElement("option");
        o.value = y + "-" + q;
        o.textContent = "Q" + q + " " + y;
        if (o.value === state.leadQuarter) o.selected = true;
        sel.appendChild(o);
      }
    }
    sel.addEventListener("change", function () { state.leadQuarter = sel.value; drawLead(); });
  }

  function poolFor(kind) { return kind === "whole" ? pools.whole : pools.modern; }

  function drawLead() {
    var id = "fig-lead", W = chartWidth(id), t = tierOf(W), ty = state.leadType, shift = +state.leadShift, review = state.leadReview, p = U.params;
    var res = M.drawLeads(U, ty, { review: review === "targets" ? "targets" : "historical", pools: poolFor(review), shift: shift, runs: 5000, seed: U.seed });
    var total = Array.from(res.total).sort(function (a, b) { return a - b; });
    var med = M.median(total), lo = M.percentile(total, 0.1), hi = M.percentile(total, 0.9);
    var reviewMed = M.median(Array.from(res.review));
    var bin = 3, nb = Math.ceil((total[total.length - 1] + 0.001) / bin);
    var counts = new Array(nb).fill(0);
    total.forEach(function (v) { counts[Math.min(nb - 1, Math.floor(v / bin))] += 1; });
    var keep = counts.map(function (c, i) { return c > 0 ? i : -1; }).filter(function (i) { return i >= 0; });
    var xs = keep.map(function (i) { return i * bin + bin / 2; });
    var shares = keep.map(function (i) { return 100 * counts[i] / total.length; });
    var qv = state.leadQuarter.split("-"), fy = +qv[0], fq = +qv[1];
    var mid = p.quarter_mid[String(fq)];
    var filed = Date.UTC(fy, mid[0] - 1, mid[1]);
    var years = {};
    total.forEach(function (v) {
      var y = new Date(filed + M.wholeDays(v * p.days_per_month) * 86400000).getUTCFullYear();
      years[y] = (years[y] || 0) + 1;
    });
    var by = function (y) { var s = 0; Object.keys(years).forEach(function (k) { if (+k <= y) s += years[k]; }); return Math.round(100 * s / total.length); };
    var medDate = new Date(filed + M.wholeDays(med * p.days_per_month) * 86400000);
    var ymax = Math.max.apply(null, shares) * 1.28;
    var xmax = Math.max(60, Math.ceil(total[Math.floor(0.995 * (total.length - 1))] / 6) * 6);
    draw(id, [{
      type: "bar", x: xs, y: shares, width: bin * 0.92, marker: { color: TYPE_COLOR[ty], line: { color: C.ink, width: fsz(t, 1, 1.5, 1.5) } },
      customdata: xs.map(function (x) { return [x - bin / 2, x + bin / 2]; }),
      hovertemplate: "%{customdata[0]:.0f} to %{customdata[1]:.0f} months<br>%{y:.1f}% of runs<extra></extra>"
    }], layout(t, {
      height: clamp(Math.round(W * 0.4), 270, 380), bargap: 0,
      shapes: [{ type: "line", x0: med, x1: med, y0: 0, y1: ymax * 0.88, line: { color: C.navy, width: 2.6, dash: "dot" } }],
      annotations: [{ x: med, y: ymax * 0.88, text: "median " + med.toFixed(0) + " months", showarrow: false, yanchor: "bottom", font: { family: FONT, size: fsz(t, 12, 13, 14), color: C.navy } }],
      xaxis: axis(t, { title: t === "s" ? "Months, filing to power" : "Months from filing to power on the grid", range: [0, xmax], dtick: t === "s" ? 12 : 6 }),
      yaxis: axis(t, { title: "Share of runs (%)", range: [0, ymax], ticksuffix: "%" })
    }));
    var w = p.install_window[ty], ilo = Math.max(w[0] + shift, 1), ihi = Math.max(w[1] + shift, 2);
    var reviewText;
    if (review === "targets") {
      reviewText = "NRC target of " + p.target_months[ty] + " months plus 2 for acceptance, times 0.75 to 1.25. Median " + reviewMed.toFixed(1) + " months.";
    } else {
      var n = poolFor(review)[ty].length;
      var since = review === "whole" || ty === "Stretch" ? "all " + n + " " + ty + " reviews since 1977" : n + " " + ty + " reviews approved since 2010";
      reviewText = "Random draw from " + since + ". Median " + reviewMed.toFixed(1) + " months.";
    }
    $("chain-2").textContent = reviewText;
    $("chain-4").textContent = "At a refueling outage, " + ilo + " to " + ihi + " months after approval" + (ty === "EPU" ? ", often across two outages." : ".");
    $("chain-5").textContent = "Median " + med.toFixed(0) + " months after filing, and the middle 80% of runs take " + lo.toFixed(0) + " to " + hi.toFixed(0) + ".";
    var cap = $("lead-caption"), codeLink = textEl("a", "Python code"), simLink = textEl("a", "simulator below");
    codeLink.href = "code/uprate_baseline.py";
    codeLink.setAttribute("download", "");
    simLink.href = "#simulator";
    cap.textContent = "";
    cap.appendChild(document.createTextNode("5,000 runs of one " + ty + " filing, in 3 month bins. Seed " + U.seed + " is not an assumption about uprates. It is the starting point for the random number generator, and fixing it makes every run repeatable, so this chart matches the "));
    cap.appendChild(codeLink);
    cap.appendChild(document.createTextNode(" exactly. Other seeds move the results a little, and you can try one in the "));
    cap.appendChild(simLink);
    cap.appendChild(document.createTextNode("."));
    var ro = $("lead-readout");
    ro.textContent = "";
    ro.appendChild(document.createTextNode("Filed Q" + fq + " " + fy + ": median power date "));
    ro.appendChild(textEl("strong", MON[medDate.getUTCMonth()] + " " + medDate.getUTCFullYear()));
    ro.appendChild(document.createTextNode(". On the grid by the end of " + (fy + 1) + " in " + by(fy + 1) + "% of runs, by the end of " + (fy + 2) + " in " +
      by(fy + 2) + "%, and by the end of " + (fy + 3) + " in " + by(fy + 3) + "%."));
  }

  var FAN_YEARS = range(2026, 2033);

  function updateTiles(prefix, bands) {
    var r27 = M.restartsIn(U, 2027, state.restarts), r29 = M.restartsIn(U, 2029, state.restarts);
    var b27 = bands[2027] || bands["2027"], b29 = bands[2029] || bands["2029"];
    var t27 = b27.p50 + r27, t29 = b29.p50 + r29;
    $(prefix + "27").textContent = n0(t27) + " MWe";
    $(prefix + "27s").textContent = Math.round(100 * t27 / marks["2027"]) + "% of the 2.5 GWe goal. Uprates " + n0(b27.p50) + " MWe (middle 80%: " + n0(b27.p10) + " to " + n0(b27.p90) + "), restarts " + n0(r27) + ".";
    $(prefix + "29").textContent = n0(t29) + " MWe";
    $(prefix + "29s").textContent = Math.round(100 * t29 / marks["2029"]) + "% of the 5 GWe goal. Uprates " + n0(b29.p50) + " MWe (middle 80%: " + n0(b29.p10) + " to " + n0(b29.p90) + "), restarts " + n0(r29) + ".";
  }

  function drawFan() {
    var id = "fig-fan", W = chartWidth(id), t = tierOf(W), key = state.scenario, sc = U.scenarios[key];
    var b = function (y) { return sc.bands[String(y)]; };
    var p10 = FAN_YEARS.map(function (y) { return b(y).p10; });
    var p50 = FAN_YEARS.map(function (y) { return b(y).p50; });
    var p90 = FAN_YEARS.map(function (y) { return b(y).p90; });
    var rs = FAN_YEARS.map(function (y) { return M.restartsIn(U, y, state.restarts); });
    var stacked = p50.map(function (v, i) { return v + rs[i]; });
    var isTargets = sc.review === "targets";
    var col = isTargets ? C.plum : C.terra;
    var traces = [
      { type: "scatter", mode: "lines", x: FAN_YEARS, y: p10, line: { width: 0, color: col }, hoverinfo: "skip" },
      { type: "scatter", mode: "lines", x: FAN_YEARS, y: p90, line: { width: 0, color: col }, fill: "tonexty", fillcolor: isTargets ? "rgba(106,76,147,0.20)" : "rgba(198,90,46,0.22)", hoverinfo: "skip" },
      { type: "scatter", mode: "lines+markers", x: FAN_YEARS, y: p50, line: { color: col, width: 3.5 }, marker: { size: fsz(t, 7, 8, 9), color: col, line: { color: C.ink, width: 1.4 } },
        customdata: FAN_YEARS.map(function (y, i) { return [p10[i], p90[i]]; }),
        hovertemplate: "Uprates: %{y:,.0f} MWe (middle 80%: %{customdata[0]:,.0f} to %{customdata[1]:,.0f})<extra></extra>" },
      { type: "scatter", mode: "lines", x: FAN_YEARS, y: p50, line: { width: 0, color: C.steel }, hoverinfo: "skip" },
      { type: "scatter", mode: "lines", x: FAN_YEARS, y: stacked, line: { color: C.steel, width: 3 }, fill: "tonexty", fillcolor: "rgba(61,107,158,0.28)",
        hovertemplate: "With restarts: %{y:,.0f} MWe<extra></extra>" }
    ];
    var showTg = state.showTargets && !isTargets;
    if (showTg) {
      traces.push({ type: "scatter", mode: "lines+markers", x: FAN_YEARS, y: FAN_YEARS.map(function (y) { return U.scenarios.targets.bands[String(y)].p50; }),
                    line: { color: C.plum, width: 2.8, dash: "dash" }, marker: { size: fsz(t, 6, 7, 8), symbol: "square", color: C.plum, line: { color: C.ink, width: 1.4 } },
                    hovertemplate: "Uprates if targets met: %{y:,.0f} MWe<extra></extra>" });
    }
    traces.push({ type: "scatter", mode: "markers", x: [2027, 2029], y: [marks["2027"], marks["2029"]], marker: { symbol: "diamond", size: fsz(t, 12, 14, 16), color: C.rust, line: { color: C.ink, width: 1.5 } },
                  hovertemplate: "UPRISE goal: %{y:,.0f} MWe<extra></extra>" });
    var ann = W < 700 ? [] : [
      { x: 2027, y: marks["2027"], text: "2.5 GWe by 2027", showarrow: false, xanchor: "right", xshift: -12, font: { family: FONT, size: fsz(t, 12, 13, 14), color: C.rust } },
      { x: 2029, y: marks["2029"], text: "5 GWe by 2029", showarrow: false, xanchor: "left", xshift: 12, font: { family: FONT, size: fsz(t, 12, 13, 14), color: C.rust } }
    ];
    draw(id, traces, layout(t, {
      height: clamp(Math.round(W * 0.56), 350, 560), annotations: ann, hovermode: "x unified",
      xaxis: axis(t, { title: "End of year", tickmode: "array", tickvals: FAN_YEARS, ticktext: FAN_YEARS.map(function (y) { return t === "s" ? "\u2019" + String(y).slice(2) : String(y); }), range: [2025.7, 2033.3] }),
      yaxis: axis(t, { title: W < 760 ? "On the grid (MWe)" : "Capacity on the grid, cumulative (MWe)", range: [0, 5600], tickformat: "," })
    }));
    var keyItems = [
      { kind: "line", symbol: "circle", color: col, label: isTargets ? "Uprates, median (NRC targets met)" : "Uprates, median" },
      { kind: "band", color: col, opacity: 0.3, label: "Uprates, middle 80% of runs" }
    ];
    if (showTg) keyItems.push({ kind: "line", symbol: "square", dash: "5,3", width: 2.8, color: C.plum, label: "Uprates, median if NRC targets are met" });
    keyItems.push({ kind: "band", color: C.steel, opacity: 0.4, label: "Plus announced restarts" });
    keyItems.push({ kind: "marker", symbol: "diamond", color: C.rust, label: "UPRISE goals" });
    setKey("key-fan", keyItems);
    updateTiles("tile", sc.bands);
  }

  var insideBound = false, roomBound = false, erasBound = false;

  function drawInside() {
    var id = "fig-inside", W = chartWidth(id), t = tierOf(W), sc = U.scenarios[state.scenario], year = state.insideYear;
    var labels = apps.map(function (a) {
      var nm = a.plant !== "Proprietary" ? a.plant : (a.applicant === "Proprietary" ? "Applicant withheld" : shortApplicant(a.applicant));
      return t === "s" ? a.order + ". \u2019" + String(a.year).slice(2) + " " + nm + " " + a.type : a.order + ". Q" + a.q + " " + a.year + " " + nm + " " + a.type;
    });
    var traces = ["MUR", "Stretch", "EPU"].map(function (ty) {
      var idx = apps.map(function (a, i) { return a.type === ty ? i : -1; }).filter(function (i) { return i >= 0; });
      return {
        type: "bar", orientation: "h", y: idx.map(function (i) { return labels[i]; }), x: idx.map(function (i) { return 100 * sc.by_end_of[i][year]; }),
        marker: { color: TYPE_COLOR[ty], line: { color: C.ink, width: fsz(t, 1.2, 1.5, 1.5) } },
        text: idx.map(function (i) { var v = 100 * sc.by_end_of[i][year]; return v > 0 && v < 0.5 ? "<1%" : Math.round(v) + "%"; }),
        textposition: "outside", cliponaxis: false, textfont: { family: FONT, size: fsz(t, 10.5, 12, 12.5), color: C.ink },
        customdata: idx.map(function (i) { return [apps[i].mwe, shortApplicant(apps[i].applicant), apps[i].unit || "", apps[i].unit && UNIT_SITE[apps[i].unit] ? "<br>Click to see the plant on the map" : ""]; }),
        hovertemplate: "%{y}<br>%{customdata[1]}, %{customdata[0]:.0f} MWe in my split<br><b>%{x:.1f}%</b> of runs online by the end of " + year + "%{customdata[3]}<extra></extra>"
      };
    });
    draw(id, traces, layout(t, {
      barmode: "overlay", bargap: 0.28, height: apps.length * fsz(t, 23, 26, 27) + 80,
      xaxis: axis(t, { title: W < 340 ? null : t === "s" ? "By end of " + year : "Share of runs online by the end of " + year, range: [0, t === "s" ? 130 : 116], tickvals: [0, 20, 40, 60, 80, 100],
                       ticktext: ["0%", "20%", "40%", "60%", "80%", "100%"] }),
      yaxis: axis(t, { categoryorder: "array", categoryarray: labels, autorange: "reversed", ticks: "", tickfont: { family: FONT, size: fsz(t, 10.5, 12, 12.5), color: C.ink } })
    })).then(function () {
      var ticks = {};
      apps.forEach(function (a, i) {
        if (a.plant !== "Proprietary" && a.unit && UNIT_SITE[a.unit]) ticks[labels[i]] = { site: UNIT_SITE[a.unit], part: a.plant };
      });
      linkTicks(id, ticks);
      if (insideBound) return;
      insideBound = true;
      $(id).on("plotly_click", function (ev) {
        var p = ev.points && ev.points[0], u = p && p.customdata && p.customdata[2];
        if (u && UNIT_SITE[u]) openOnMap(UNIT_SITE[u], null);
      });
    });
    setKey("key-inside", TYPE_KEY("bar"));
  }

  function roomRows() {
    var all = U.headroom;
    var op = all.filter(function (h) { return h.status === "operating"; });
    var byRoom = function (a, b) { return b.headroom_pct - a.headroom_pct || a.unit.localeCompare(b.unit); };
    var v = state.roomView;
    if (v === "most") return op.slice().sort(byRoom).slice(0, 12);
    if (v === "least") return op.slice().sort(function (a, b) { return a.headroom_pct - b.headroom_pct || b.cumulative_pct - a.cumulative_pct; }).slice(0, 10);
    if (v === "listed") return all.filter(function (h) { return h.nrc_expected.length; }).sort(byRoom);
    return op.filter(function (h) { return h.reactor_type === v; }).sort(byRoom);
  }

  function drawRoom() {
    var id = "fig-room", W = chartWidth(id), t = tierOf(W), rows = roomRows();
    var labels = rows.map(function (h) { return h.unit + " (" + h.reactor_type + ")"; });
    var hov = rows.map(function (h) {
      var hist = h.history.map(function (e) { return e.approved.slice(0, 4) + " " + e.type + " " + e.pct + "%"; });
      return "<b>" + esc(h.unit) + "</b> " + h.reactor_type + "<br>Approved so far: " + h.cumulative_pct.toFixed(1) + "% across " + h.uprates +
        (h.uprates === 1 ? " uprate" : " uprates") + "<br>" + hist.join("<br>") + "<br>Room under the " + h.reactor_type + " line: <b>" + h.headroom_pct.toFixed(1) + "%</b>" +
        (h.nrc_expected.length ? "<br>On the NRC list: " + h.nrc_expected.join(", ") : "") + "<br>Click to see the plant on the map";
    });
    var traces = [];
    ["BWR", "PWR"].forEach(function (rt) {
      var idx = rows.map(function (h, i) { return h.reactor_type === rt ? i : -1; }).filter(function (i) { return i >= 0; });
      if (!idx.length) return;
      traces.push({ type: "bar", orientation: "h", y: idx.map(function (i) { return labels[i]; }), x: idx.map(function (i) { return rows[i].cumulative_pct; }),
                    marker: { color: rt === "BWR" ? C.teal : C.steel, line: { color: C.ink, width: 1.5 } }, hovertext: idx.map(function (i) { return hov[i]; }), hoverinfo: "text",
                    customdata: idx.map(function (i) { return rows[i].unit; }) });
    });
    traces.push({ type: "bar", orientation: "h", y: labels, x: rows.map(function (h) { return h.headroom_pct; }),
                  marker: { color: "#fff", line: { color: C.rust, width: 1.8 }, pattern: { shape: "/", fgcolor: C.rust, size: 7, solidity: 0.32 } },
                  hovertext: hov, hoverinfo: "text", customdata: rows.map(function (h) { return h.unit; }) });
    var listed = rows.map(function (h, i) { return h.nrc_expected.length ? i : -1; }).filter(function (i) { return i >= 0; });
    if (listed.length) {
      traces.push({ type: "scatter", mode: "markers", y: listed.map(function (i) { return labels[i]; }), x: listed.map(function (i) { return rows[i].cumulative_pct + rows[i].headroom_pct + 1.0; }),
                    marker: { symbol: "star", size: fsz(t, 12, 14, 15), color: C.navy, line: { color: C.ink, width: 1.2 } },
                    hovertext: listed.map(function (i) { return "<b>" + esc(rows[i].unit) + "</b><br>On the NRC list: " + rows[i].nrc_expected.join(", ") + "<br>Click to see the plant on the map"; }), hoverinfo: "text",
                    customdata: listed.map(function (i) { return rows[i].unit; }) });
    }
    var shapes = [], ann = [], ceilings = {};
    rows.forEach(function (h) { ceilings[h.reactor_type] = h.ceiling_pct; });
    Object.keys(ceilings).forEach(function (rt) {
      shapes.push({ type: "line", x0: ceilings[rt], x1: ceilings[rt], yref: "paper", y0: 0, y1: 1, line: { color: C.rust, width: 2.4, dash: "dash" } });
      if (t !== "s") {
        ann.push({ x: ceilings[rt], y: 1, yref: "paper", text: rt + " line " + ceilings[rt].toFixed(1) + "%", showarrow: false, yanchor: "bottom", xanchor: "right",
                   yshift: 2, font: { family: FONT, size: fsz(t, 11, 12.5, 13), color: C.rust } });
      }
    });
    var L = layout(t, {
      barmode: "stack", bargap: 0.3, shapes: shapes, annotations: ann, height: rows.length * fsz(t, 27, 29, 30) + 100,
      xaxis: axis(t, { title: t === "s" ? "Uprates, summed (%)" : W < 760 ? "Approved uprates, summed (%)" : "Approved uprates, summed (% of thermal power)", range: [0, 24], ticksuffix: "%", dtick: t === "s" ? 8 : 4 }),
      yaxis: axis(t, { categoryorder: "array", categoryarray: labels, autorange: "reversed", ticks: "", tickfont: { family: FONT, size: fsz(t, 11, 12.5, 13), color: C.ink } })
    });
    L.margin.t = t === "s" ? 10 : 32;
    draw(id, traces, L).then(function () {
      var ticks = {};
      rows.forEach(function (h, i) { if (UNIT_SITE[h.unit]) ticks[labels[i]] = { site: UNIT_SITE[h.unit], part: h.unit }; });
      linkTicks(id, ticks);
      if (roomBound) return;
      roomBound = true;
      $(id).on("plotly_click", function (ev) {
        var p = ev.points && ev.points[0], u = p && p.customdata;
        if (u && UNIT_SITE[u]) openOnMap(UNIT_SITE[u], null);
      });
    });
    var keyItems = [];
    if (rows.some(function (h) { return h.reactor_type === "BWR"; })) keyItems.push({ kind: "bar", color: C.teal, label: "BWR, approved so far" });
    if (rows.some(function (h) { return h.reactor_type === "PWR"; })) keyItems.push({ kind: "bar", color: C.steel, label: "PWR, approved so far" });
    keyItems.push({ kind: "hatch", label: "Room under the line" });
    if (t === "s") Object.keys(ceilings).forEach(function (rt) { keyItems.push({ kind: "line", color: C.rust, dash: "5,3", width: 2.4, label: rt + " line, " + ceilings[rt].toFixed(1) + "%" }); });
    if (listed.length) keyItems.push({ kind: "marker", symbol: "star", color: C.navy, label: "On the NRC\u2019s expected list" });
    setKey("key-room", keyItems);
  }

  var SCEN_ROWS = [
    ["slow", "Installation 6 months later", "Install 6 mo later"], ["historical", "Typical installation", "Typical install"],
    ["fast", "Installation 6 months sooner", "Install 6 mo sooner"], ["targets", "NRC targets met", "NRC targets met"],
    ["targets_fast", "Targets met, installation sooner", "Targets, sooner"]
  ];

  function drawScenarios() {
    var id = "fig-scenarios", W = chartWidth(id), t = tierOf(W), withR = state.scenRestarts;
    var r29 = withR ? M.restartsIn(U, 2029, state.restarts) : 0;
    var labels = SCEN_ROWS.map(function (s) { return t === "s" ? s[2] : s[1]; });
    var b = SCEN_ROWS.map(function (s) { return U.scenarios[s[0]].bands["2029"]; });
    var traces = [["historical", C.terra], ["targets", C.plum]].map(function (g) {
      var idx = SCEN_ROWS.map(function (s, i) { return U.scenarios[s[0]].review === g[0] ? i : -1; }).filter(function (i) { return i >= 0; });
      return { type: "bar", orientation: "h", y: idx.map(function (i) { return labels[i]; }), x: idx.map(function (i) { return b[i].p50; }), width: 0.58,
               marker: { color: g[1], line: { color: C.ink, width: 1.5 } }, customdata: idx.map(function (i) { return [b[i].p10, b[i].p90]; }),
               hovertemplate: "%{y}<br>Uprates: <b>%{x:,.0f} MWe</b> (middle 80%: %{customdata[0]:,.0f} to %{customdata[1]:,.0f})<extra></extra>" };
    });
    if (withR) {
      traces.push({ type: "bar", orientation: "h", y: labels, x: labels.map(function () { return r29; }), width: 0.58,
                    marker: { color: "rgba(61,107,158,0.85)", line: { color: C.ink, width: 1.5 } }, hovertemplate: "Restarts: %{x:,.0f} MWe<extra></extra>" });
    }
    traces.push({ type: "scatter", mode: "markers", y: labels, x: b.map(function (v) { return v.p50; }), hoverinfo: "skip", marker: { size: 1, color: "rgba(0,0,0,0)" },
                  error_x: { type: "data", symmetric: false, array: b.map(function (v) { return v.p90 - v.p50; }), arrayminus: b.map(function (v) { return v.p50 - v.p10; }), color: C.ink, thickness: 2.4, width: fsz(t, 5, 6, 7) } });
    var f = fsz(t, 11.5, 13, 14);
    var ann = b.map(function (v, i) {
      var tot = v.p50 + r29;
      var pc = Math.round(100 * tot / marks["2029"]) + "%";
      var txt = withR ? (t === "s" ? pc : t === "m" ? n0(tot) + " (" + pc + ")" : n0(tot) + " MWe, " + pc) : n0(tot) + " MWe";
      return { x: Math.max(tot, v.p90), xshift: 6, y: labels[i], text: txt,
               showarrow: false, xanchor: "left", font: { family: FONT, size: f, color: C.ink } };
    });
    var shapes = [];
    if (withR) {
      shapes.push({ type: "line", x0: marks["2029"], x1: marks["2029"], yref: "paper", y0: 0, y1: 1, line: { color: C.rust, width: 2.6, dash: "dash" } });
      ann.push({ x: marks["2029"], y: 1, yref: "paper", yshift: 2, text: "5 GWe goal", showarrow: false, xanchor: "right", yanchor: "bottom", font: { family: FONT, size: f, color: C.rust } });
    }
    var L = layout(t, {
      barmode: "stack", height: t === "s" ? 340 : 410, shapes: shapes, annotations: ann,
      xaxis: axis(t, { title: t === "s" ? "MWe by end of 2029" : W < 760 ? "MWe on the grid, end of 2029" : "Capacity on the grid by the end of 2029 (MWe)", range: [0, withR ? (t === "s" ? 6800 : 6600) : 2400], tickformat: ",",
                       dtick: withR ? (t === "s" ? 2000 : 1000) : 500 }),
      yaxis: axis(t, { categoryorder: "array", categoryarray: labels, autorange: "reversed", ticks: "", tickfont: { family: FONT, size: fsz(t, 11, 13, 14), color: C.ink } })
    });
    L.margin.t = 30;
    draw(id, traces, L);
    var keyItems = [{ kind: "bar", color: C.terra, label: "Uprates, historical reviews (median)" }, { kind: "bar", color: C.plum, label: "Uprates, NRC targets met (median)" }];
    if (withR) keyItems.push({ kind: "bar", color: C.steel, label: "Announced restarts" });
    keyItems.push({ kind: "whisker", label: "Middle 80% of runs, uprates" });
    setKey("key-scenarios", keyItems);
  }

  function drawArrivals() {
    var id = "fig-arrivals", W = chartWidth(id), t = tierOf(W), years = range(2026, 2035);
    var series = [["historical", "Historical review times", C.terra], ["targets", "NRC targets met", C.plum]];
    var traces = series.map(function (s) {
      var sc = U.scenarios[s[0]];
      var ys = years.map(function (y, j) {
        return apps.reduce(function (acc, a, i) {
          var now = sc.by_end_of[i][String(y)], before = j ? sc.by_end_of[i][String(years[j - 1])] : 0;
          return acc + (now - before) * a.mwe;
        }, 0);
      });
      return { type: "bar", x: years, y: ys, marker: { color: s[2], line: { color: C.ink, width: fsz(t, 1.2, 1.5, 1.5) } },
               hovertemplate: "%{x}: <b>%{y:,.0f} MWe</b> expected<br>" + s[1] + "<extra></extra>" };
    });
    draw(id, traces, layout(t, {
      barmode: "group", bargap: 0.25, bargroupgap: 0.06, height: clamp(Math.round(W * 0.42), 290, 420),
      xaxis: axis(t, { title: W < 330 ? "Year online" : "Year the megawatts reach the grid", tickmode: "array", tickvals: years, ticktext: years.map(function (y) { return t === "s" ? "\u2019" + String(y).slice(2) : String(y); }) }),
      yaxis: axis(t, { title: t === "s" ? "Expected MWe" : "Expected MWe reaching the grid", rangemode: "tozero", tickformat: "," })
    }));
    setKey("key-arrivals", series.map(function (s) { return { kind: "bar", color: s[2], label: s[1] }; }));
  }

  var sim = { result: null, timer: null };

  function simInputs() {
    return {
      review: $("sim-review").value, scale: +$("sim-scale").value / 100, shift: +$("sim-shift").value,
      mur: +$("sim-mur").value, stretch: +$("sim-stretch").value, split: state.simSplit,
      seed: Math.max(0, Math.floor(+$("sim-seed").value || 0)), runs: +$("sim-runs").value
    };
  }

  function syncSimOutputs() {
    var v = simInputs();
    $("sim-scale-out").textContent = Math.round(v.scale * 100) + "%";
    $("sim-shift-out").textContent = (v.shift > 0 ? "+" : "") + v.shift + " mo";
    $("sim-mur-out").textContent = String(v.mur);
    $("sim-stretch-out").textContent = String(v.stretch);
    $("sim-scale").disabled = v.review === "targets";
    $("sim-mur").disabled = v.split === "even";
    $("sim-stretch").disabled = v.split === "even";
  }

  function scheduleSim() {
    syncSimOutputs();
    $("sim-status").textContent = "Running...";
    clearTimeout(sim.timer);
    sim.timer = setTimeout(runSim, 120);
  }

  function runSim() {
    var v = simInputs();
    syncSimOutputs();
    var t0 = performance.now();
    var custom = M.allocate(U, { murMwe: v.mur, stretchMwe: v.stretch, split: v.split });
    sim.result = M.simulate(U, custom, {
      review: v.review === "targets" ? "targets" : "historical", pools: v.review === "whole" ? pools.whole : pools.modern,
      scale: v.scale, shift: v.shift, runs: v.runs, seed: v.seed, leads: false
    });
    $("sim-status").textContent = n0(v.runs) + " runs in " + Math.max(1, Math.round(performance.now() - t0)) + " ms.";
    updateTiles("sim", sim.result.bands);
    drawSim();
  }

  function drawSim() {
    if (!sim.result) return;
    var id = "fig-sim", W = chartWidth(id), t = tierOf(W), years = range(2026, 2035), bands = sim.result.bands, base = U.scenarios.historical.bands;
    draw(id, [
      { type: "scatter", mode: "lines", x: years, y: years.map(function (y) { return bands[y].p10; }), line: { width: 0, color: C.navy }, hoverinfo: "skip" },
      { type: "scatter", mode: "lines", x: years, y: years.map(function (y) { return bands[y].p90; }), line: { width: 0, color: C.navy }, fill: "tonexty", fillcolor: "rgba(26,42,74,0.16)", hoverinfo: "skip" },
      { type: "scatter", mode: "lines+markers", x: years, y: years.map(function (y) { return bands[y].p50; }), line: { color: C.navy, width: 3.5 },
        marker: { size: fsz(t, 7, 8, 9), color: C.navy, line: { color: C.ink, width: 1.4 } }, customdata: years.map(function (y) { return [bands[y].p10, bands[y].p90]; }),
        hovertemplate: "Your run: %{y:,.0f} MWe (middle 80%: %{customdata[0]:,.0f} to %{customdata[1]:,.0f})<extra></extra>" },
      { type: "scatter", mode: "lines", x: years, y: years.map(function (y) { return base[String(y)].p50; }), line: { color: C.terra, width: 2.8, dash: "dash" },
        hovertemplate: "Base case: %{y:,.0f} MWe<extra></extra>" }
    ], layout(t, {
      height: clamp(Math.round(W * 0.46), 310, 460), hovermode: "x unified",
      xaxis: axis(t, { title: "End of year", tickmode: "array", tickvals: years, ticktext: years.map(function (y) { return t === "s" ? "\u2019" + String(y).slice(2) : String(y); }), range: [2025.7, 2035.3] }),
      yaxis: axis(t, { title: t === "s" ? "Uprates (MWe)" : "Uprate capacity on the grid (MWe)", range: [0, 2600], tickformat: "," })
    }));
    setKey("key-sim", [
      { kind: "line", symbol: "circle", color: C.navy, label: "Your run, median" },
      { kind: "band", color: C.navy, opacity: 0.25, label: "Your run, middle 80%" },
      { kind: "line", dash: "5,3", width: 2.8, color: C.terra, label: "Talk base case, median" }
    ]);
  }

  function bindSim() {
    ["sim-review", "sim-scale", "sim-shift", "sim-mur", "sim-stretch", "sim-runs"].forEach(function (id) {
      $(id).addEventListener("input", syncSimOutputs);
      $(id).addEventListener("change", scheduleSim);
    });
    $("sim-seed").addEventListener("change", scheduleSim);
    $("sim-reset").addEventListener("click", function () {
      $("sim-review").value = "modern"; $("sim-scale").value = 100; $("sim-shift").value = 0; $("sim-mur").value = 17; $("sim-stretch").value = 50;
      $("sim-seed").value = U.seed; $("sim-runs").value = String(U.runs);
      syncDropdowns();
      setSeg("simSplit", "type", true);
      ["Palisades", "Crane", "Duane Arnold"].forEach(function (k) { state.restarts[k] = true; });
      syncRestartBoxes();
      drawFan(); drawScenarios();
      scheduleSim();
    });
  }

  function buildSensitivity() {
    var s = U.summary, r = s.restarts.total, mark = marks["2029"], base = s.uprates_2029.historical.p50, sens = s.sensitivity;
    var share = function (up, rest) { return Math.round(100 * (up + rest) / mark) + "%"; };
    var rows = [
      ["Base case: reviews since 2010, typical installation, seed 7", n0(base), share(base, r)],
      ["Draw reviews from the whole 1977 to 2021 record", n0(sens.whole_record_reviews.p50), share(sens.whole_record_reviews.p50, r)],
      ["Split each year\u2019s megawatts evenly across its filings", n0(sens.even_mwe_split.historical), share(sens.even_mwe_split.historical, r)],
      ["Seeds 1 to 20 instead of 7", n0(sens.seeds_1_to_20.min) + " to " + n0(sens.seeds_1_to_20.max), share(sens.seeds_1_to_20.min, r) + " to " + share(sens.seeds_1_to_20.max, r)],
      ["20,000 runs instead of 5,000", n0(sens.runs_20000), share(sens.runs_20000, r)],
      ["Palisades or Crane misses 2029", n0(base), share(base, r - s.restarts.Palisades) + " or " + share(base, r - s.restarts.Crane)],
      ["Duane Arnold misses 2029", n0(base), share(base, r - s.restarts["Duane Arnold"])],
      ["Palisades and Duane Arnold both miss", n0(base), share(base, r - s.restarts.Palisades - s.restarts["Duane Arnold"])]
    ];
    var tb = $("tbl-sens").querySelector("tbody");
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(linkifyInto(document.createElement("td"), row[0]));
      tr.appendChild(textEl("td", row[1] + " MWe", "num"));
      tr.appendChild(textEl("td", row[2], "num"));
      tb.appendChild(tr);
    });
  }

  function renderTable() {
    var q = state.tblSearch.trim().toLowerCase();
    var rows = U.approvals.filter(function (a) {
      if (state.tblType !== "all" && a.type !== state.tblType) return false;
      if (state.tblSource !== "all" && a.source !== state.tblSource) return false;
      if (q && (a.plant + " " + a.unit + " " + a.acc + " " + (a.letter || "")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var k = state.tblSortKey, dir = state.tblSortDir;
    rows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x == null && y == null) return a.no - b.no;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "number") return dir * (x - y) || a.no - b.no;
      return dir * String(x).localeCompare(String(y)) || a.no - b.no;
    });
    var frag = document.createDocumentFragment();
    rows.forEach(function (a) {
      var tr = document.createElement("tr");
      tr.appendChild(textEl("td", String(a.no), "num"));
      var tdp = document.createElement("td");
      tdp.appendChild(plantLink(a.plant, UNIT_SITE[a.unit]));
      if (a.note && a.source !== "parser") tdp.appendChild(textEl("div", smartQuotes(a.note), "rownote"));
      tr.appendChild(tdp);
      var tdt = document.createElement("td");
      tdt.appendChild(textEl("span", a.type, "tag " + a.type));
      tr.appendChild(tdt);
      tr.appendChild(textEl("td", String(a.pct), "num"));
      tr.appendChild(textEl("td", n0(a.mwt), "num"));
      tr.appendChild(textEl("td", a.applied || "", "date"));
      tr.appendChild(textEl("td", a.approved, "date"));
      tr.appendChild(textEl("td", a.months != null ? a.months.toFixed(1) : "", "num"));
      var tds = document.createElement("td");
      tds.appendChild(textEl("span", { parser: "Parser", hand: "Hand", none: "No letter" }[a.source], "tag " + a.source));
      tr.appendChild(tds);
      var tdl = document.createElement("td");
      if (a.url) {
        var link = textEl("a", a.letter);
        link.href = a.url;
        link.target = "_blank";
        link.rel = "noopener";
        tdl.appendChild(link);
        if (a.letter !== a.acc) tdl.appendChild(textEl("div", "in package " + a.acc, "rownote"));
      } else {
        tdl.appendChild(textEl("span", a.acc, "rownote"));
      }
      tr.appendChild(tdl);
      frag.appendChild(tr);
    });
    var tb = $("tbl-data").querySelector("tbody");
    tb.textContent = "";
    tb.appendChild(frag);
    $("tbl-count").textContent = "Showing " + rows.length + " of " + U.approvals.length + " approvals." + (state.tblSource === "hand" ? " Each hand read row says why the parser missed it." : "");
    document.querySelectorAll("#tbl-data th[data-key]").forEach(function (th) {
      th.setAttribute("aria-sort", th.dataset.key === k ? (dir > 0 ? "ascending" : "descending") : "none");
    });
  }

  function bindTable() {
    $("tbl-search").addEventListener("input", debounce(function () { state.tblSearch = $("tbl-search").value; renderTable(); }, 120));
    document.querySelectorAll("#tbl-data th[data-key]").forEach(function (th) {
      th.tabIndex = 0;
      var go = function () {
        var key = th.dataset.key;
        if (state.tblSortKey === key) state.tblSortDir = -state.tblSortDir;
        else { state.tblSortKey = key; state.tblSortDir = 1; }
        renderTable();
      };
      th.addEventListener("click", go);
      th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  var handlers = {
    pipelineMode: drawPipeline, historyMode: drawHistory, reviewHighlight: drawReviews, targetMode: drawEras,
    leadType: drawLead, leadReview: drawLead, leadShift: drawLead, insideYear: drawInside, roomView: drawRoom,
    simSplit: scheduleSim, parserExample: loadExample, tblType: renderTable, tblSource: renderTable, sitePlot: drawSitePlot
  };

  function setSeg(name, value, silent) {
    state[name] = value;
    document.querySelectorAll(".seg[data-control=\"" + name + "\"] button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.value === value ? "true" : "false");
    });
    if (!silent && handlers[name]) handlers[name]();
  }

  function bindSegs() {
    document.querySelectorAll(".seg[data-control]").forEach(function (seg) {
      seg.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b || !seg.contains(b)) return;
        setSeg(seg.dataset.control, b.dataset.value);
      });
    });
  }

  function bindScenario() {
    document.querySelectorAll("select[data-shared=\"scenario\"]").forEach(function (sel) {
      SCEN_ORDER.forEach(function (k) {
        var o = document.createElement("option");
        o.value = k;
        o.textContent = SCEN_SHORT[k];
        if (k === state.scenario) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () {
        state.scenario = sel.value;
        document.querySelectorAll("select[data-shared=\"scenario\"]").forEach(function (s) { s.value = state.scenario; });
        syncDropdowns();
        drawFan();
        drawInside();
      });
    });
    $("fan-targets").addEventListener("change", function () { state.showTargets = $("fan-targets").checked; drawFan(); });
    $("scen-restarts").addEventListener("change", function () { state.scenRestarts = $("scen-restarts").checked; drawScenarios(); });
  }

  var dropdowns = [];
  var CARET = "<svg width=\"12\" height=\"8\" viewBox=\"0 0 12 8\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M1 1.5 L6 6.5 L11 1.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\"/></svg>";

  function enhanceSelect(sel) {
    if (sel.dataset.enhanced || !sel.options.length) return null;
    sel.dataset.enhanced = "1";
    var uid = "dd-" + sel.id, wrap = textEl("div", null, "dd");
    if (Array.prototype.some.call(sel.options, function (o) { return o.textContent.length > 24; })) wrap.classList.add("dd-wide");
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add("dd-native");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");
    var btn = textEl("button", null, "dd-btn");
    btn.type = "button";
    btn.id = uid + "-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    var lab = document.querySelector("label[for=\"" + sel.id + "\"]");
    if (lab) {
      lab.id = lab.id || uid + "-label";
      lab.htmlFor = btn.id;
      btn.setAttribute("aria-labelledby", lab.id + " " + btn.id);
    } else if (sel.getAttribute("aria-label")) {
      btn.setAttribute("aria-label", sel.getAttribute("aria-label"));
    }
    var val = textEl("span", null, "dd-val");
    var faces = Array.prototype.map.call(sel.options, function (o) { return val.appendChild(textEl("span", o.textContent)); });
    btn.appendChild(val);
    var caret = textEl("span", null, "dd-caret");
    caret.innerHTML = CARET;
    btn.appendChild(caret);
    wrap.appendChild(btn);
    var list = textEl("ul", null, "dd-list");
    list.id = uid + "-list";
    list.setAttribute("role", "listbox");
    list.tabIndex = -1;
    if (lab) list.setAttribute("aria-labelledby", lab.id);
    list.hidden = true;
    var items = Array.prototype.map.call(sel.options, function (o, i) {
      var li = textEl("li", o.textContent, "dd-opt");
      li.id = uid + "-opt-" + i;
      li.setAttribute("role", "option");
      return list.appendChild(li);
    });
    wrap.appendChild(list);
    var active = -1, dd;

    function sync() {
      var idx = sel.selectedIndex;
      faces.forEach(function (f, i) { f.className = i === idx ? "on" : ""; });
      items.forEach(function (li, i) { li.setAttribute("aria-selected", i === idx ? "true" : "false"); });
    }
    function setActive(i) {
      active = clamp(i, 0, items.length - 1);
      items.forEach(function (li, j) { li.classList.toggle("active", j === active); });
      list.setAttribute("aria-activedescendant", items[active].id);
      var li = items[active];
      if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
    }
    function place() {
      list.style.left = "0px";
      wrap.classList.remove("up");
      var r = list.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      if (r.right > vw - 8) list.style.left = Math.max(8 - r.left, vw - 8 - r.right) + "px";
      var b = btn.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8 && b.top - r.height - 12 > 0) wrap.classList.add("up");
    }
    function open() {
      if (!list.hidden) return;
      closeDropdowns(dd);
      list.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      wrap.classList.add("open");
      place();
      setActive(Math.max(0, sel.selectedIndex));
      list.focus({ preventScroll: true });
    }
    function close(refocus) {
      if (list.hidden) return;
      list.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      wrap.classList.remove("open", "up");
      if (refocus) btn.focus({ preventScroll: true });
    }
    function choose(i) {
      var changed = sel.selectedIndex !== i;
      sel.selectedIndex = i;
      sync();
      close(true);
      if (changed) sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    btn.addEventListener("click", function () { if (list.hidden) open(); else close(true); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
    list.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
      else if (e.key === "Home") { e.preventDefault(); setActive(0); }
      else if (e.key === "End") { e.preventDefault(); setActive(items.length - 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") close(false);
    });
    list.addEventListener("mousemove", function (e) {
      var li = e.target.closest(".dd-opt");
      if (li && items.indexOf(li) !== active) setActive(items.indexOf(li));
    });
    list.addEventListener("click", function (e) {
      var li = e.target.closest(".dd-opt");
      if (li) choose(items.indexOf(li));
    });
    sel.addEventListener("change", sync);
    dd = { wrap: wrap, close: close, sync: sync };
    dropdowns.push(dd);
    sync();
    return dd;
  }

  function closeDropdowns(except) { dropdowns.forEach(function (d) { if (d !== except) d.close(false); }); }
  function syncDropdowns() { dropdowns.forEach(function (d) { d.sync(); }); }

  document.addEventListener("pointerdown", function (e) {
    dropdowns.forEach(function (d) { if (!d.wrap.contains(e.target)) d.close(false); });
  });
  window.addEventListener("resize", function () { closeDropdowns(null); });

  function syncRestartBoxes() {
    document.querySelectorAll("input[data-restart]").forEach(function (box) { box.checked = !!state.restarts[box.dataset.restart]; });
  }

  function bindRestarts() {
    document.querySelectorAll("input[data-restart]").forEach(function (box) {
      box.addEventListener("change", function () {
        state.restarts[box.dataset.restart] = box.checked;
        syncRestartBoxes();
        drawFan();
        drawScenarios();
        if (sim.result) updateTiles("sim", sim.result.bands);
      });
    });
  }

  var STATE_NAME = {
    AL: "Alabama", AR: "Arkansas", AZ: "Arizona", CA: "California", CT: "Connecticut", FL: "Florida", GA: "Georgia", IA: "Iowa", IL: "Illinois",
    KS: "Kansas", LA: "Louisiana", MA: "Massachusetts", MD: "Maryland", MI: "Michigan", MN: "Minnesota", MO: "Missouri", MS: "Mississippi",
    NC: "North Carolina", NE: "Nebraska", NH: "New Hampshire", NJ: "New Jersey", NY: "New York", OH: "Ohio", PA: "Pennsylvania",
    SC: "South Carolina", TN: "Tennessee", TX: "Texas", VA: "Virginia", VT: "Vermont", WA: "Washington", WI: "Wisconsin"
  };
  var RESTART_OF = { "TMI-1": "Crane", "Palisades": "Palisades", "Duane Arnold": "Duane Arnold" };
  var STATUS_ORDER = { closed: 0, operating: 1, restart: 2, listed: 3 };
  var SVGNS = "http://www.w3.org/2000/svg";
  var SITES = [], SITE_BY_ID = {}, UNIT_SITE = {};
  var NAME_SITE = { "Palisades": "palisades", "Crane": "crane", "Duane Arnold": "duane-arnold" };
  var mapv = { svg: null, pins: null, ring: null, hover: null, sel: null, pos: {}, k: 1, r: 5.6, coarse: false };
  var PLANT_WIKI = window.PLANT_WIKI || { sites: {} };

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function commonPrefix(list) {
    if (list.length === 1) return list[0];
    var p = list[0];
    list.forEach(function (s) { while (s.indexOf(p) !== 0) p = p.slice(0, -1); });
    return p.replace(/[\s\d-]+$/, "");
  }

  function buildSites() {
    var D = window.USMAP, heads = {};
    if (!D || SITES.length) return;
    U.headroom.forEach(function (h) { heads[h.unit] = h; });
    D.sites.forEach(function (d) {
      var inSite = function (u) { return d.units.indexOf(u) >= 0; };
      var hs = d.units.map(function (u) { return heads[u]; }).filter(Boolean);
      var site = {
        id: d.id, name: d.name, state: d.state, wiki: d.wiki, units: d.units, x: d.x, y: d.y, src: d.src, heads: hs,
        approvals: U.approvals.filter(function (a) { return inSite(a.unit); }).sort(function (a, b) { return a.approved < b.approved ? -1 : a.approved > b.approved ? 1 : a.no - b.no; }),
        expected: apps.filter(function (a) { return a.unit && inSite(a.unit); }),
        restart: null, query: commonPrefix(d.units)
      };
      d.units.forEach(function (u) { UNIT_SITE[u] = d.id; if (RESTART_OF[u]) site.restart = RESTART_OF[u]; });
      site.mwt = site.approvals.reduce(function (s, a) { return s + a.mwt; }, 0);
      site.status = site.expected.length ? "listed" : site.restart ? "restart" : hs.length && hs.every(function (h) { return h.status === "closed"; }) ? "closed" : "operating";
      SITES.push(site);
      SITE_BY_ID[site.id] = site;
    });
    SITES.sort(function (a, b) { return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name); });
  }

  function plantLink(text, siteId) {
    if (!siteId || !SITE_BY_ID[siteId]) return document.createTextNode(text);
    var a = textEl("a", text, "plant-link");
    a.href = "#plant-" + siteId;
    a.setAttribute("data-site", siteId);
    return a;
  }

  function linkifyInto(el, text) {
    var re = /Palisades|Crane|Duane Arnold/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      el.appendChild(plantLink(m[0], NAME_SITE[m[0]]));
      last = re.lastIndex;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
    return el;
  }

  // Plant names on a chart's y axis open that plant on the map, like the links in the text.
  // map: { tick label: { site: site id, part: the plant name inside the label, underlined } }
  function linkTicks(id, map) {
    var gd = $(id);
    if (!gd) return;
    gd._plantTicks = map || {};
    if (!gd._plantTickHook && gd.on) {
      gd._plantTickHook = true;
      gd.on("plotly_afterplot", function () { decorateTicks(gd); });
    }
    decorateTicks(gd);
  }

  function decorateTicks(gd) {
    var map = gd._plantTicks || {};
    Array.prototype.forEach.call(gd.querySelectorAll(".yaxislayer-above .ytick"), function (g) {
      var tx = g.querySelector("text"), line = g.querySelector("line.tick-link");
      if (!tx) return;
      var label = tx.getAttribute("data-unformatted") || tx.textContent, it = map[label], site = it && SITE_BY_ID[it.site];
      if (!site) {
        if (line) g.removeChild(line);
        if (tx.classList.contains("plant-tick")) {
          tx.classList.remove("plant-tick", "flash");
          ["role", "tabindex", "aria-label", "data-site"].forEach(function (k) { tx.removeAttribute(k); });
        }
        return;
      }
      tx.classList.add("plant-tick");
      tx.setAttribute("data-site", site.id);
      tx.setAttribute("role", "link");
      tx.setAttribute("tabindex", "0");
      tx.setAttribute("aria-label", label + ". Open " + site.name + " on the map");
      var full = tx.textContent, i = it.part ? full.indexOf(it.part) : -1, n = it.part ? it.part.length : 0;
      if (i < 0) { i = 0; n = full.length; }
      try {
        var a = tx.getStartPositionOfChar(i), b = tx.getEndPositionOfChar(i + n - 1), y = (a.y + 3.4).toFixed(2);
        if (!line) line = svgEl("line", { class: "tick-link" });
        if (line.previousSibling !== tx) g.insertBefore(line, tx.nextSibling);
        line.setAttribute("x1", a.x.toFixed(2));
        line.setAttribute("x2", b.x.toFixed(2));
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        var tr = tx.getAttribute("transform");
        if (tr) line.setAttribute("transform", tr); else line.removeAttribute("transform");
      } catch (e) {
        if (line && line.parentNode) line.parentNode.removeChild(line);
      }
    });
  }

  function activatePlant(el) {
    var id = el.getAttribute("data-site"), s = SITE_BY_ID[id];
    if (!s) return;
    if (el.closest && el.closest("#fig-site")) selectSite(s);
    else openOnMap(id, el);
  }

  function plantFromHash() {
    var m = /^#plant-([a-z-]+)$/.exec(window.location.hash || "");
    return m && SITE_BY_ID[m[1]] ? m[1] : null;
  }

  function openOnMap(id, fromEl) {
    var s = SITE_BY_ID[id];
    if (!s || !mapv.svg) return;
    mapv.returnY = window.pageYOffset;
    mapv.returnEl = fromEl || null;
    selectSite(s);
    $("map-back").classList.add("on");
    try { window.history.pushState({ plant: id }, "", "#plant-" + id); } catch (e) {}
    $("key-map").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function backToText() {
    var el = mapv.returnEl;
    $("map-back").classList.remove("on");
    window.scrollTo({ top: mapv.returnY || 0, behavior: "smooth" });
    if (el) {
      el.classList.add("flash");
      try { el.focus({ preventScroll: true }); } catch (e) {}
      setTimeout(function () { el.classList.remove("flash"); }, 1800);
    }
  }

  function siteSummary(s) {
    var n = s.approvals.length;
    return s.units.length + (s.units.length === 1 ? " unit, " : " units, ") + n + (n === 1 ? " uprate approved" : " uprates approved");
  }

  function siteStatusText(s) {
    if (s.status === "listed") {
      var ty = {};
      s.expected.forEach(function (a) { ty[a.type] = (ty[a.type] || 0) + 1; });
      return "On the NRC\u2019s expected list: " + Object.keys(ty).map(function (k) { return ty[k] + " " + k + (ty[k] > 1 ? " filings" : " filing"); }).join(" and ");
    }
    if (s.status === "restart") return "Restart planned: about " + n0(U.params.restarts[s.restart]) + " MWe";
    if (s.status === "closed") return "Closed";
    return "Operating, no named filing on the NRC\u2019s list";
  }

  // Summaries and photos are saved with the page in plants.js, so the map makes no requests to Wikipedia.
  function wikiOf(site) { return (site && PLANT_WIKI.sites[site.id]) || null; }

  function wikiFallbackUrl(site) { return "https://en.wikipedia.org/wiki/" + encodeURIComponent(site.wiki.replace(/ /g, "_")); }

  function extLink(text, href) {
    var a = textEl("a", text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function photoCredit(el, ph) {
    el.textContent = "";
    el.appendChild(document.createTextNode("Photo: " + ph.author + ", "));
    if (ph.licenseUrl) el.appendChild(extLink(ph.license, ph.licenseUrl));
    else el.appendChild(document.createTextNode(ph.license === "Public domain" ? "public domain" : ph.license));
    el.appendChild(document.createTextNode(", "));
    el.appendChild(extLink("Wikimedia Commons", ph.page));
    el.title = "Photo: " + ph.author + ", " + ph.license + ", Wikimedia Commons. File: " + ph.file;
  }

  function pinShape(site, r) {
    if (site.status === "listed") {
      var pts = [];
      for (var i = 0; i < 10; i++) {
        var ang = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.62 : r * 1.55;
        pts.push((rad * Math.cos(ang)).toFixed(2) + "," + (rad * Math.sin(ang)).toFixed(2));
      }
      return svgEl("polygon", { points: pts.join(" "), class: "shape" });
    }
    if (site.status === "restart") {
      var q = r * 1.35;
      return svgEl("polygon", { points: "0," + (-q) + " " + q + ",0 0," + q + " " + (-q) + ",0", class: "shape" });
    }
    return svgEl("circle", { cx: 0, cy: 0, r: r, class: "shape" });
  }

  function pinRadius(site, r) { return site.status === "listed" ? r * 1.3 : site.status === "restart" ? r * 1.2 : r; }

  function layoutPins() {
    var svg = mapv.svg, D = window.USMAP, w = svg.getBoundingClientRect().width;
    if (!w) return;
    var k = D.viewBox[2] / w, r = w < 420 ? 4 : w < 620 ? 4.7 : 5.6;
    var rebuild = r !== mapv.r || !mapv.pins.firstChild;
    mapv.k = k;
    mapv.r = r;
    var P = SITES.map(function (s) { return { s: s, x: s.x / k, y: s.y / k, rad: pinRadius(s, r) }; });
    for (var it = 0; it < 60; it++) {
      var moved = false;
      for (var i = 0; i < P.length; i++) {
        for (var j = i + 1; j < P.length; j++) {
          var a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy), min = 0.82 * (a.rad + b.rad);
          if (d >= min) continue;
          if (d < 0.01) { dx = 1; dy = 0.35; d = Math.sqrt(dx * dx + dy * dy); }
          var push = (min - d) / 2, ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (rebuild) {
      mapv.pins.textContent = "";
      SITES.forEach(function (s) {
        var g = svgEl("g", { class: "pin " + s.status + (s === mapv.sel ? " sel" : "") + (s === mapv.hover ? " hover" : ""), "data-id": s.id });
        g.appendChild(pinShape(s, r));
        s.g = g;
        mapv.pins.appendChild(g);
      });
    }
    P.forEach(function (p) {
      mapv.pos[p.s.id] = { x: p.x * k, y: p.y * k };
      p.s.g.setAttribute("transform", "translate(" + (p.x * k).toFixed(2) + " " + (p.y * k).toFixed(2) + ") scale(" + k.toFixed(4) + ")");
    });
    placeRing();
    if (mapv.hover) placeTip(mapv.hover);
  }

  function placeRing() {
    var s = mapv.sel, ring = mapv.ring;
    if (!s) { ring.setAttribute("visibility", "hidden"); return; }
    var p = mapv.pos[s.id];
    ring.setAttribute("visibility", "visible");
    ring.setAttribute("cx", p.x.toFixed(2));
    ring.setAttribute("cy", p.y.toFixed(2));
    ring.setAttribute("r", ((pinRadius(s, mapv.r) + 5.5) * mapv.k).toFixed(2));
  }

  function toLocal(clientX, clientY) {
    var pt = mapv.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(mapv.svg.getScreenCTM().inverse());
  }

  function siteAt(clientX, clientY, maxPx) {
    var loc = toLocal(clientX, clientY), best = null, bd = maxPx;
    SITES.forEach(function (s) {
      var p = mapv.pos[s.id], d = Math.sqrt(Math.pow(p.x - loc.x, 2) + Math.pow(p.y - loc.y, 2)) / mapv.k;
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }

  function placeTip(site) {
    var tip = $("map-tip"), box = $("map-box").getBoundingClientRect(), p = mapv.pos[site.id];
    var pt = mapv.svg.createSVGPoint();
    pt.x = p.x;
    pt.y = p.y;
    var c = pt.matrixTransform(mapv.svg.getScreenCTM()), x = c.x - box.left, y = c.y - box.top;
    var tw = tip.offsetWidth, th = tip.offsetHeight, gap = 16;
    var left = x + gap + tw > box.width - 4 ? x - gap - tw : x + gap;
    var top = clamp(y - th / 2, 4, Math.max(4, box.height - th - 4));
    tip.style.left = Math.max(4, left) + "px";
    tip.style.top = top + "px";
  }

  function showTip(site) {
    var tip = $("map-tip"), wd = wikiOf(site), small = $("map-box").clientWidth < 560;
    tip.textContent = "";
    tip.className = small ? "map-tip small" : "map-tip";
    if (wd && wd.photo && !small) {
      var img = document.createElement("img");
      img.src = wd.photo.tip;
      img.alt = "";
      img.decoding = "async";
      img.addEventListener("load", function () { if (mapv.hover === site) placeTip(site); });
      tip.appendChild(img);
    }
    tip.appendChild(textEl("b", site.name));
    tip.appendChild(textEl("span", STATE_NAME[site.state], "tip-state"));
    tip.appendChild(textEl("span", siteSummary(site), "tip-line"));
    tip.appendChild(textEl("span", siteStatusText(site), "tip-line"));
    tip.appendChild(textEl("span", mapv.sel === site ? "Open in the panel" : "Click for details", "tip-hint"));
    tip.hidden = false;
    placeTip(site);
  }

  function setHover(site) {
    if (mapv.hover === site) return;
    if (mapv.hover) mapv.hover.g.classList.remove("hover");
    mapv.hover = site;
    if (!site) { $("map-tip").hidden = true; return; }
    site.g.classList.add("hover");
    mapv.pins.appendChild(site.g);
    showTip(site);
  }

  function selectSite(site, opts) {
    opts = opts || {};
    if (mapv.sel && mapv.sel.g) mapv.sel.g.classList.remove("sel");
    mapv.sel = site;
    if (site && site.g) site.g.classList.add("sel");
    placeRing();
    $("map-pick").value = site ? site.id : "";
    syncDropdowns();
    $("map-close").classList.toggle("on", !!site);
    if (!site) $("map-back").classList.remove("on");
    setSeg("sitePlot", site && (site.status === "listed" || site.status === "restart") ? "expected" : "history", true);
    renderPanel();
    drawSitePlot();
    if (mapv.hover) showTip(mapv.hover);
    if (site && opts.scroll) {
      var photo = $("map-photo"), top = photo.getBoundingClientRect().top;
      if (top > window.innerHeight * 0.7) photo.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function showSiteRows(site) {
    setSeg("tblType", "all", true);
    setSeg("tblSource", "all", true);
    state.tblSearch = site.query;
    $("tbl-search").value = site.query;
    renderTable();
    $("data").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function mapIntro(body) {
    var n = { listed: 0, restart: 0, closed: 0, operating: 0 };
    SITES.forEach(function (s) { n[s.status] += 1; });
    body.appendChild(textEl("p", "Click a pin on the map or choose a plant above. Each plant opens with its photo, its Wikipedia summary, a chart and its record in this dataset. Plant names in the text above open here too.", "mp-intro"));
    var ul = document.createElement("ul");
    ul.className = "mp-counts";
    [[n.operating, "operating plants with approved uprates"], [n.listed, "plants with named filings on the NRC\u2019s expected list"],
     [n.restart, "restarts: Palisades, Crane and Duane Arnold"], [n.closed, "closed plants whose approvals stay in the dataset"]].forEach(function (c) {
      ul.appendChild(textEl("li", c[0] + " " + c[1]));
    });
    body.appendChild(ul);
  }

  var PLANT_ART = "<svg viewBox=\"0 0 300 170\" width=\"240\" height=\"136\" aria-hidden=\"true\" focusable=\"false\" fill=\"#fff\" stroke=\"#22222A\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\">" +
    "<path d=\"M58 34 C70 30 76 18 92 20 C102 8 124 10 128 24 C142 22 150 34 140 42\"/>" +
    "<path d=\"M50 158 C62 116 76 92 74 66 C73 56 70 48 67 42 L133 42 C130 48 127 56 126 66 C124 92 138 116 150 158 Z\"/>" +
    "<path d=\"M170 158 L170 108 A40 40 0 0 1 250 108 L250 158 Z\"/>" +
    "<path d=\"M250 158 L250 124 L286 124 L286 158\"/>" +
    "<path d=\"M14 158 L292 158\"/></svg>";

  function photoMissing(frame, site, wd, why) {
    frame.textContent = "";
    var p = textEl("p", why + " ", "mph-empty");
    p.appendChild(extLink(wd && wd.photo ? "See it on Wikimedia Commons" : "See the plant on Wikipedia", wd && wd.photo ? wd.photo.page : wikiFallbackUrl(site)));
    frame.appendChild(p);
  }

  function setPhoto(site) {
    var frame = $("mph-frame"), cap = $("mph-cap"), wd = wikiOf(site);
    frame.textContent = "";
    cap.textContent = "";
    if (!site) {
      var empty = textEl("div", null, "mph-empty mph-art");
      empty.innerHTML = PLANT_ART;
      empty.appendChild(textEl("p", "Click a pin, or choose a plant below, to see a photo of it here."));
      frame.appendChild(empty);
      cap.appendChild(textEl("b", "No plant selected"));
      cap.appendChild(textEl("span", SITES.length + " sites with approved uprates, planned filings or restarts"));
      cap.appendChild(textEl("span", "\u00a0", "mph-credit"));
      return;
    }
    cap.appendChild(textEl("b", site.name));
    cap.appendChild(textEl("span", STATE_NAME[site.state] + ", " + siteSummary(site)));
    var credit = textEl("span", "\u00a0", "mph-credit");
    cap.appendChild(credit);
    if (!wd || !wd.photo) { photoMissing(frame, site, wd, "There is no free photo of this plant on Wikimedia Commons."); return; }
    var ph = wd.photo, img = document.createElement("img");
    img.alt = "Photo of " + wd.title + (ph.note ? ". " + ph.note : "");
    img.decoding = "async";
    if (ph.pos) img.style.objectPosition = ph.pos;
    img.addEventListener("load", function () { img.classList.add("in"); });
    img.addEventListener("error", function () { if (mapv.sel === site) photoMissing(frame, site, wd, "The photo didn\u2019t load here."); });
    img.src = ph.src;
    frame.appendChild(img);
    if (ph.note) frame.appendChild(textEl("span", ph.note, "mph-note"));
    photoCredit(credit, ph);
  }

  function renderWiki(box, site, wd) {
    box.textContent = "";
    var h = textEl("h3", null, "mp-title");
    h.appendChild(extLink(wd.title, wd.url));
    box.appendChild(h);
    if (wd.description) box.appendChild(textEl("p", wd.description.charAt(0).toUpperCase() + wd.description.slice(1), "mp-desc"));
    box.appendChild(textEl("p", wd.extract, "mp-extract"));
    var src = textEl("p", null, "mp-src");
    src.appendChild(extLink("Read the full article on Wikipedia", wd.url));
    src.appendChild(document.createTextNode(". Text from Wikipedia under "));
    src.appendChild(extLink("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"));
    src.appendChild(document.createTextNode(", saved " + (PLANT_WIKI.retrieved || "October 2026") + "."));
    box.appendChild(src);
  }

  function renderRecord(body, s) {
    body.appendChild(textEl("h4", "In this dataset", "mp-sub"));
    var st = textEl("p", null, "mp-status");
    if (s.status === "listed") {
      st.appendChild(textEl("b", "On the NRC\u2019s expected list. "));
      st.appendChild(document.createTextNode(s.expected.map(function (a) { return "Q" + a.q + " " + a.year + " " + a.type + " (" + a.unit + ", " + n0(a.mwe) + " MWe in my split)"; }).join(", ") + "."));
    } else if (s.status === "restart") {
      st.appendChild(textEl("b", "Restart planned. "));
      st.appendChild(document.createTextNode("About " + n0(U.params.restarts[s.restart]) + " MWe at company guidance, counted at 60% in 2027 and in full from 2028. Restarts never go through the uprate review chain."));
    } else if (s.status === "closed") {
      st.appendChild(textEl("b", "Closed. "));
      st.appendChild(document.createTextNode("Its approvals stay in the dataset and count toward the percentiles in the room chart."));
    } else {
      st.appendChild(textEl("b", "Operating. "));
      st.appendChild(document.createTextNode("No named filing on the NRC\u2019s expected list, though the NRC withholds the plant on 13 filings."));
    }
    body.appendChild(st);
    body.appendChild(textEl("p", siteSummary(s) + ", adding " + n0(s.mwt) + " MWt in all.", "mp-line"));
    var tbox = textEl("div", null, "mp-tablebox"), tbl = textEl("table", null, "mp-table"), thead = document.createElement("thead"), hr = document.createElement("tr");
    [["Approved", ""], ["Unit", ""], ["Type", ""], ["%", "num"], ["Review", "num"]].forEach(function (c) { hr.appendChild(textEl("th", c[0], c[1])); });
    thead.appendChild(hr);
    tbl.appendChild(thead);
    var tb = document.createElement("tbody");
    s.approvals.forEach(function (a) {
      var tr = document.createElement("tr"), td0 = textEl("td", null, "date");
      if (a.url) {
        var l = textEl("a", MON[+a.approved.slice(5, 7) - 1] + " " + a.approved.slice(0, 4));
        l.href = a.url;
        l.target = "_blank";
        l.rel = "noopener";
        l.title = "NRC approval letter";
        td0.appendChild(l);
      } else {
        td0.textContent = MON[+a.approved.slice(5, 7) - 1] + " " + a.approved.slice(0, 4);
      }
      tr.appendChild(td0);
      tr.appendChild(textEl("td", a.unit));
      var tdt = document.createElement("td");
      tdt.appendChild(textEl("span", a.type, "tag " + a.type));
      tr.appendChild(tdt);
      tr.appendChild(textEl("td", String(a.pct), "num"));
      tr.appendChild(textEl("td", a.months != null ? a.months.toFixed(1) + " mo" : "none", "num"));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    tbox.appendChild(tbl);
    body.appendChild(tbox);
    var lines = s.heads.map(function (h) {
      return h.unit + ": " + h.cumulative_pct.toFixed(1) + "% approved so far" +
        (h.status === "operating" ? ", " + h.headroom_pct.toFixed(1) + "% room under the " + h.reactor_type + " line" : h.status === "restart" ? ", restart unit" : ", closed");
    });
    var ul = textEl("ul", null, "mp-units");
    lines.forEach(function (t) { ul.appendChild(textEl("li", t)); });
    body.appendChild(ul);
    var rowsLink = textEl("button", "Show these approvals in the dataset table", "mp-rows");
    rowsLink.type = "button";
    rowsLink.addEventListener("click", function () { showSiteRows(s); });
    body.appendChild(rowsLink);
  }

  function markMore() {
    var el = $("map-body");
    el.classList.toggle("more", el.scrollHeight - el.scrollTop - el.clientHeight > 6);
  }

  function renderPanel() {
    var body = $("map-body"), s = mapv.sel, wd = wikiOf(s);
    body.textContent = "";
    body.scrollTop = 0;
    setPhoto(s);
    if (!s) { mapIntro(body); markMore(); return; }
    var wiki = textEl("div", null, "mp-wiki");
    if (wd) {
      renderWiki(wiki, s, wd);
    } else {
      wiki.appendChild(textEl("h3", s.name, "mp-title"));
      var p = textEl("p", null, "mp-loading");
      p.appendChild(extLink("Read about " + s.name + " on Wikipedia", wikiFallbackUrl(s)));
      p.appendChild(document.createTextNode("."));
      wiki.appendChild(p);
    }
    body.appendChild(wiki);
    renderRecord(body, s);
    markMore();
  }

  var SITE_UNIT_STYLE = [[C.ink, "solid"], [C.steel, "dash"], [C.plum, "dot"]];
  var siteBound = false;

  function siteHeight() {
    var h = parseFloat(window.getComputedStyle($("fig-site")).height);
    return h > 150 ? Math.round(h) : 292;
  }

  function siteOverview(t) {
    var top = SITES.slice().sort(function (a, b) { return b.mwt - a.mwt; }).slice(0, 10);
    var labels = top.map(function (s) { return s.name; });
    var listed = top.filter(function (s) { return s.status === "listed"; });
    var maxX = top[0].mwt;
    var hov = function (s) { return "<b>" + esc(s.name) + "</b>, " + STATE_NAME[s.state] + "<br>" + s.approvals.length + " uprates, " + n0(s.mwt) + " MWt" + (s.status === "listed" ? "<br>" + siteStatusText(s) : "") + "<br>Click to open this plant"; };
    var traces = [{
      type: "bar", orientation: "h", y: labels, x: top.map(function (s) { return s.mwt; }), width: 0.66, customdata: top.map(function (s) { return s.id; }),
      marker: { color: C.steel, line: { color: C.ink, width: 1.5 } }, hovertext: top.map(hov), hoverinfo: "text"
    }];
    if (listed.length) {
      traces.push({ type: "scatter", mode: "markers", y: listed.map(function (s) { return s.name; }), x: listed.map(function (s) { return s.mwt + maxX * 0.045; }),
                    customdata: listed.map(function (s) { return s.id; }), marker: { symbol: "star", size: fsz(t, 13, 15, 16), color: C.navy, line: { color: C.ink, width: 1.2 } },
                    hovertext: listed.map(hov), hoverinfo: "text" });
    }
    var key = [{ kind: "bar", color: C.steel, label: "MWt approved, 1977 to 2021" }];
    if (listed.length) key.push({ kind: "marker", symbol: "star", color: C.navy, label: "On the NRC\u2019s expected list" });
    return {
      title: "The 10 most uprated plants, by thermal megawatts approved",
      note: "Click a bar or a name to open that plant.",
      key: key,
      traces: traces,
      ticks: top.reduce(function (m, s) { m[s.name] = { site: s.id, part: s.name }; return m; }, {}),
      layout: layout(t, {
        bargap: 0.3,
        xaxis: axis(t, { title: "MWt approved", tickformat: ",", range: [0, maxX * 1.12] }),
        yaxis: axis(t, { categoryorder: "array", categoryarray: labels, autorange: "reversed", ticks: "", tickfont: { family: FONT, size: fsz(t, 11, 12, 12.5), color: C.ink } })
      })
    };
  }

  function siteHistory(s, t) {
    var traces = [], key = [], top = 0, today = "2026-10-26";
    var ceil = s.heads.length ? s.heads[0].ceiling_pct : null, rx = s.heads.length ? s.heads[0].reactor_type : "";
    var xmax = s.expected.length ? "2033-06-01" : "2027-06-01";
    var current = {};
    s.units.forEach(function (u, k) {
      var rows = s.approvals.filter(function (a) { return a.unit === u; });
      var xs = ["1976-01-01"], ys = [0], cum = 0, mx = [], my = [];
      rows.forEach(function (a) {
        cum = Math.round((cum + a.pct) * 100) / 100;
        xs.push(a.approved);
        ys.push(cum);
        mx.push(a.approved);
        my.push(cum);
      });
      xs.push(today);
      ys.push(cum);
      current[u] = cum;
      top = Math.max(top, cum);
      var st = SITE_UNIT_STYLE[k % SITE_UNIT_STYLE.length];
      traces.push({ type: "scatter", mode: "lines", x: xs, y: ys, line: { color: st[0], width: 3, shape: "hv", dash: st[1] }, hoverinfo: "skip" });
      traces.push({
        type: "scatter", mode: "markers", x: mx, y: my, customdata: rows.map(function (a) { return a.url || ""; }),
        marker: { color: rows.map(function (a) { return TYPE_COLOR[a.type]; }), symbol: rows.map(function (a) { return TYPE_SYMBOL[a.type]; }), size: fsz(t, 10, 11, 12), line: { color: C.ink, width: 1.4 } },
        hovertext: rows.map(function (a) {
          return "<b>" + esc(a.unit) + "</b>  " + a.type + " " + a.pct + "% (" + n0(a.mwt) + " MWt)<br>Approved " + fmtDate(a.approved) +
            (a.months != null ? "<br>Review " + a.months.toFixed(1) + " months" : "") + "<br>Summed so far: " + rowsCum(rows, a) + "%" + (a.url ? "<br>Click to open the NRC letter" : "");
        }),
        hoverinfo: "text"
      });
      key.push({ kind: "line", color: st[0], width: 3, dash: st[1] === "dash" ? "6,3" : st[1] === "dot" ? "2,3" : null, label: u });
    });
    if (s.expected.length) {
      traces.push({
        type: "scatter", mode: "markers", x: s.expected.map(function (a) { return a.filed; }), y: s.expected.map(function (a) { return current[a.unit] || 0; }),
        marker: { symbol: "star", size: fsz(t, 14, 16, 17), color: C.navy, line: { color: C.ink, width: 1.2 } },
        hovertext: s.expected.map(function (a) { return "<b>" + esc(a.unit) + "</b>  planned " + a.type + " filing, Q" + a.q + " " + a.year + "<br>" + n0(a.mwe) + " MWe in my split"; }),
        hoverinfo: "text"
      });
      key.push({ kind: "marker", symbol: "star", color: C.navy, label: "Planned filing" });
    }
    var shapes = [], ann = [];
    if (ceil) {
      shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: ceil, y1: ceil, line: { color: C.rust, width: 2.4, dash: "dash" } });
      ann.push({ xref: "paper", x: 0.01, y: ceil, text: rx + " line " + ceil.toFixed(1) + "%", showarrow: false, xanchor: "left", yanchor: "bottom", font: { family: FONT, size: fsz(t, 11, 12, 12.5), color: C.rust } });
    }
    return {
      title: "Uprates approved at " + s.name + ", summed by unit",
      note: "Hover a point for the approval. Click it for the NRC letter.",
      key: key,
      traces: traces,
      layout: layout(t, {
        shapes: shapes, annotations: ann, hovermode: "closest",
        xaxis: axis(t, { type: "date", range: ["1976-01-01", xmax], dtick: "M120", tickformat: "%Y" }),
        yaxis: axis(t, { title: "Summed uprates (%)", ticksuffix: "%", range: [0, Math.max(ceil || 0, top) * 1.18 + 1] })
      })
    };
  }

  function rowsCum(rows, a) {
    var c = 0;
    for (var i = 0; i < rows.length; i++) { c += rows[i].pct; if (rows[i] === a) break; }
    return (Math.round(c * 10) / 10).toFixed(1);
  }

  function siteExpected(s, t) {
    var years = range(2026, 2035), idx = s.expected.map(function (a) { return apps.indexOf(a); });
    var total = s.expected.reduce(function (acc, a) { return acc + a.mwe; }, 0);
    var series = [["historical", "Historical review times", C.terra, "solid", "circle"], ["targets", "NRC targets met", C.plum, "dash", "square"]];
    var traces = series.map(function (sr) {
      var sc = U.scenarios[sr[0]];
      return {
        type: "scatter", mode: "lines+markers", x: years,
        y: years.map(function (y) { return idx.reduce(function (acc, i) { return acc + apps[i].mwe * sc.by_end_of[i][String(y)]; }, 0); }),
        line: { color: sr[2], width: 3, dash: sr[3] }, marker: { symbol: sr[4], size: fsz(t, 7, 8, 9), color: sr[2], line: { color: C.ink, width: 1.4 } },
        hovertemplate: sr[1] + ": %{y:,.0f} MWe<extra></extra>"
      };
    });
    var name = s.name.replace(/ \(.*\)$/, "");
    return {
      title: "Expected megawatts online from " + name + "\u2019s planned filings",
      key: [{ kind: "line", symbol: "circle", color: C.terra, label: "Historical review times" }, { kind: "line", symbol: "square", dash: "5,3", color: C.plum, label: "NRC targets met" },
            { kind: "line", color: C.ink, dash: "2,3", width: 2.4, label: "All " + n0(total) + " MWe, by my split" }],
      traces: traces,
      layout: layout(t, {
        hovermode: "x unified",
        shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: total, y1: total, line: { color: C.ink, width: 2.4, dash: "dot" } }],
        xaxis: axis(t, { title: "End of year", tickmode: "array", tickvals: years, ticktext: years.map(function (y) { return t === "s" ? "\u2019" + String(y).slice(2) : String(y); }), range: [2025.6, 2035.4] }),
        yaxis: axis(t, { title: "Expected MWe online", tickformat: ",", range: [0, total * 1.15] })
      })
    };
  }

  function siteRestart(s, t) {
    var mwe = U.params.restarts[s.restart], share = U.params.restart_share, years = range(2026, 2033);
    var ys = years.map(function (y) { return mwe * (share[String(y)] != null ? share[String(y)] : 1); });
    return {
      title: "Restart megawatts the model counts for " + s.name.replace(/ \(.*\)$/, ""),
      key: [{ kind: "bar", color: C.steel, label: "Counted at 60% in 2027 and in full from 2028" }],
      traces: [{ type: "bar", x: years, y: ys, width: 0.62, marker: { color: C.steel, line: { color: C.ink, width: 1.5 } },
                 hovertemplate: "End of %{x}: %{y:,.0f} MWe counted<extra></extra>" }],
      layout: layout(t, {
        annotations: [{ xref: "paper", x: 0.01, y: mwe, text: "Company guidance: " + n0(mwe) + " MWe", showarrow: false, xanchor: "left", yanchor: "bottom", yshift: 4,
                        font: { family: FONT, size: fsz(t, 11, 12, 12.5), color: C.navy } }],
        xaxis: axis(t, { title: "End of year", tickmode: "array", tickvals: years, ticktext: years.map(function (y) { return t === "s" ? "\u2019" + String(y).slice(2) : String(y); }), range: [2025.4, 2033.6] }),
        yaxis: axis(t, { title: "MWe counted", tickformat: ",", range: [0, mwe * 1.25] })
      })
    };
  }

  function drawSitePlot() {
    var id = "fig-site";
    if (!SITES.length || !$(id)) return;
    var s = mapv.sel, W = chartWidth(id), t = tierOf(W), two = !!s && (s.status === "listed" || s.status === "restart");
    $("site-seg").classList.toggle("off", !two);
    var mode = !s ? "overview" : two ? state.sitePlot : "history";
    var out = mode === "overview" ? siteOverview(t) : mode === "history" ? siteHistory(s, t) : s.status === "listed" ? siteExpected(s, t) : siteRestart(s, t);
    out.layout.height = siteHeight();
    $("site-title").textContent = out.title;
    $("site-note").textContent = two ? "" : out.note || "";
    setKey("key-site", out.key);
    draw(id, out.traces, out.layout).then(function () {
      linkTicks(id, out.ticks || {});
      if (siteBound) return;
      siteBound = true;
      $(id).on("plotly_click", function (ev) {
        var p = ev.points && ev.points[0], cd = p && p.customdata;
        if (typeof cd !== "string" || !cd) return;
        if (SITE_BY_ID[cd]) selectSite(SITE_BY_ID[cd]);
        else if (/^https?:/.test(cd)) window.open(cd, "_blank", "noopener");
      });
    });
  }

  function initMap() {
    var D = window.USMAP, svg = $("map-svg");
    if (!D || !svg) return;
    buildSites();
    mapv.svg = svg;
    mapv.coarse = window.matchMedia && window.matchMedia("(hover: none)").matches;
    svg.setAttribute("viewBox", D.viewBox.join(" "));
    svg.appendChild(svgEl("path", { d: D.nation, class: "map-land" }));
    svg.appendChild(svgEl("path", { d: D.states, class: "map-states" }));
    svg.appendChild(svgEl("path", { d: D.nation, class: "map-nation" }));
    mapv.ring = svgEl("circle", { class: "map-ring", r: 0, visibility: "hidden" });
    svg.appendChild(mapv.ring);
    mapv.pins = svgEl("g", { class: "map-pins" });
    svg.appendChild(mapv.pins);
    var pick = $("map-pick");
    pick.appendChild(textEl("option", "Choose a plant")).value = "";
    SITES.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (s) {
      var o = textEl("option", s.name + ", " + STATE_NAME[s.state]);
      o.value = s.id;
      pick.appendChild(o);
    });
    enhanceSelect(pick);
    pick.addEventListener("change", function () { selectSite(SITE_BY_ID[pick.value] || null); });
    $("map-close").addEventListener("click", function () { selectSite(null); });
    $("map-back").addEventListener("click", backToText);
    $("map-body").addEventListener("scroll", markMore, { passive: true });
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a.plant-link, .plant-tick");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      activatePlant(a);
    });
    document.addEventListener("keydown", function (e) {
      var el = e.target;
      if ((e.key === "Enter" || e.key === " ") && el && el.classList && el.classList.contains("plant-tick")) {
        e.preventDefault();
        activatePlant(el);
      }
    });
    var fromHash = function () {
      var hid = plantFromHash();
      if (hid && (!mapv.sel || mapv.sel.id !== hid)) selectSite(SITE_BY_ID[hid]);
      if (!hid) $("map-back").classList.remove("on");
    };
    window.addEventListener("popstate", fromHash);
    window.addEventListener("hashchange", fromHash);
    svg.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      setHover(siteAt(e.clientX, e.clientY, 16));
      svg.style.cursor = mapv.hover ? "pointer" : "default";
    });
    svg.addEventListener("pointerleave", function () { setHover(null); });
    svg.addEventListener("click", function (e) {
      var s = siteAt(e.clientX, e.clientY, e.pointerType === "touch" || mapv.coarse ? 26 : 16);
      if (!s) return;
      if (mapv.coarse || e.pointerType === "touch") setHover(null);
      selectSite(s, { scroll: true });
    });
    setKey("key-map", [
      { kind: "marker", symbol: "circle", color: C.ink, label: "Operating, uprates approved" },
      { kind: "marker", symbol: "star", color: C.navy, label: "Named on the NRC\u2019s expected list" },
      { kind: "marker", symbol: "diamond", color: C.steel, label: "Restart planned" },
      { kind: "marker", symbol: "circle", color: "#fff", label: "Closed" }
    ]);
    layoutPins();
    var hid = plantFromHash();
    selectSite(hid ? SITE_BY_ID[hid] : null);
    if (hid) $("key-map").scrollIntoView({ block: "start" });
    if (window.ResizeObserver) {
      var lastW = 0;
      new ResizeObserver(function () {
        var w = Math.round(svg.getBoundingClientRect().width);
        if (w && w !== lastW) { lastW = w; layoutPins(); }
      }).observe(svg);
    } else {
      window.addEventListener("resize", debounce(layoutPins, 120));
    }
  }

  var renderers = {
    "fig-pipeline": drawPipeline, "fig-history": drawHistory, "fig-provenance": drawProvenance, "fig-reviews": drawReviews,
    "fig-eras": drawEras, "fig-lead": drawLead, "fig-fan": drawFan, "fig-inside": drawInside, "fig-room": drawRoom,
    "fig-scenarios": drawScenarios, "fig-arrivals": drawArrivals, "fig-sim": drawSim, "fig-site": drawSitePlot
  };

  function drawAll() { Object.keys(renderers).forEach(function (id) { renderers[id](); }); }

  function watchSizes() {
    var seen = {}, timers = {};
    Object.keys(renderers).forEach(function (id) { seen[id] = chartWidth(id); });
    if (!window.ResizeObserver) {
      window.addEventListener("resize", debounce(drawAll, 150));
      return;
    }
    var ro = new ResizeObserver(function (entries) {
      entries.forEach(function (en) {
        var id = en.target.id, w = Math.max(240, Math.floor(en.contentRect.width));
        if (seen[id] === w) return;
        seen[id] = w;
        clearTimeout(timers[id]);
        timers[id] = setTimeout(renderers[id], 80);
      });
    });
    Object.keys(renderers).forEach(function (id) { ro.observe($(id)); });
  }

  function start() {
    buildSites();
    buildExpectedTable();
    buildVariantTable();
    buildSensitivity();
    bindSegs();
    bindScenario();
    bindRestarts();
    bindSim();
    bindTable();
    quarterOptions();
    document.querySelectorAll("select").forEach(enhanceSelect);
    $("parser-text").addEventListener("input", debounce(showParser, 150));
    loadExample();
    renderTable();
    runSim();
    drawAll();
    initMap();
    watchSizes();
    document.documentElement.setAttribute("data-ready", "1");
  }

  var started = false;
  function go() { if (!started) { started = true; start(); } }
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load("16px 'CMU Serif'"), document.fonts.load("bold 16px 'CMU Serif'"), document.fonts.load("italic 16px 'CMU Serif'"),
                 document.fonts.load("16px 'CMU Typewriter Text'")]).then(go, go);
    setTimeout(go, 2500);
  } else {
    go();
  }
})();

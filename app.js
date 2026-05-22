/* global ReceiptRoastEngine */
(function () {
  "use strict";

  var LS_KEY = "receiptRoastHistoryV1";

  /** @type {any} */
  var foodsDb = null;

  /** @typedef {{ id: string, name: string, qty: string, price: string, estimated?: ReturnType<RRE['estimateLineItem']> }} Row */
  /** @typedef {typeof ReceiptRoastEngine} RRE */
  /** @type {Row[]} */
  var rows = [];

  var els = {};

  function id() {
    return "r" + Math.random().toString(36).slice(2, 10);
  }

  function $(sel) {
    return document.querySelector(sel);
  }

  function loadEls() {
    els.input = $("#receipt-input");
    els.parseStatus = $("#parse-status");
    els.loadStatus = $("#load-status");
    els.body = $("#items-body");
    els.btnParse = $("#btn-parse");
    els.btnAdd = $("#btn-add-row");
    els.btnClearRows = $("#btn-clear-rows");
    els.btnEstimate = $("#btn-estimate");
    els.resultsEmpty = $("#results-empty");
    els.resultsBlock = $("#results-block");
    els.totalsLine = $("#totals-line");
    els.overallConf = $("#overall-conf");
    els.roast = $("#verdict-roast");
    els.serious = $("#verdict-serious");
    els.historyList = $("#history-list");
    els.btnClrHist = $("#btn-clear-history");
  }

  /** @returns {any[]} */
  function readHistory() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }

  function writeHistory(arr) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(0, 5)));
    } catch (e) {
      /* quota or private mode — ignore */
    }
  }

  function renderHistory() {
    var list = readHistory();
    els.historyList.innerHTML = "";
    if (!list.length) {
      var liEmpty = document.createElement("li");
      liEmpty.textContent = "No saved estimates yet.";
      els.historyList.appendChild(liEmpty);
      return;
    }
    list.forEach(function (entry) {
      var li = document.createElement("li");
      var kcal =
        entry.totals && typeof entry.totals.calories === "number"
          ? entry.totals.calories
          : "?";
      var snippet = entry.snippet || "(no text)";
      li.innerHTML =
        '<span>' +
        new Date(entry.ts || Date.now()).toLocaleString() +
        "</span>" +
        " · ~" +
        kcal +
        " kcal" +
        " · ";
      var lbl = document.createElement("span");
      lbl.style.flex = "1";
      lbl.style.minWidth = "140px";
      lbl.textContent = snippet.slice(0, 72) + (snippet.length > 72 ? "…" : "");
      li.appendChild(lbl);
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "Load";
      b.addEventListener("click", function () {
        restore(entry);
      });
      li.appendChild(b);
      els.historyList.appendChild(li);
    });
  }

  function restore(entry) {
    if (!entry || !entry.items || !entry.items.length) return;
    rows = entry.items.map(function (raw) {
      var macros = raw.macros;
      var conf = raw.macrosConf;
      var label = raw.matchLabel;
      var matched = raw.matched;
      var hasEst =
        macros &&
        typeof macros.calories === "number" &&
        conf &&
        label;

      var estimated = hasEst
        ? {
            macros: macros,
            confidence: conf,
            label: label,
            matched: matched != null ? !!matched : true,
          }
        : undefined;

      return {
        id: id(),
        name: raw.name || "",
        qty: String(raw.qty != null ? raw.qty : 1),
        price: raw.price != null ? String(raw.price) : "",
        estimated: estimated,
      };
    });
    els.input.value = entry.receiptRaw || "";
    els.loadStatus.textContent = "";
    els.loadStatus.classList.remove("error");
    renderTable();
    var canShow =
      foodsDb &&
      entry.totals &&
      typeof entry.totals.calories === "number" &&
      entry.roast != null &&
      entry.roastSerious != null;
    if (canShow && rows.every(function (r) {
      return !r.name.trim() || r.estimated;
    }))
      paintResults(entry.totals, entry.rollConf, entry.roast, entry.roastSerious);
    else {
      els.resultsBlock.classList.add("hidden");
      els.resultsEmpty.classList.remove("hidden");
      if (!foodsDb)
        els.loadStatus.textContent =
          "Load foods.json first (serve over HTTP). Then Estimate macros to rebuild totals.";
    }
    scrollToSummary();
  }

  function persistEstimate(payload) {
    var hist = readHistory();
    hist.unshift(payload);
    writeHistory(hist);
    renderHistory();
  }

  function renderTable() {
    els.body.innerHTML = "";
    rows.forEach(function (row, idx) {
      var tr = document.createElement("tr");
      var est = row.estimated;

      [
        ["name", row.name, "text", "Chicken wings"],
        ["qty", row.qty, "text", "1"],
        ["price", row.price, "text", "4.99"],
      ].forEach(function (def) {
        var td = document.createElement("td");
        var inp = document.createElement("input");
        inp.dataset.field = def[0];
        inp.dataset.id = row.id;
        inp.value = row[def[0]] || "";
        inp.type = "text";
        inp.inputMode = def[0] === "qty" ? "numeric" : "text";
        inp.placeholder = def[3];
        inp.addEventListener("input", function () {
          row[def[0]] = inp.value;
          row.estimated = undefined;
        });
        td.appendChild(inp);
        tr.appendChild(td);
      });

      tdNum(tr, est ? String(est.macros.calories) : "—");

      tdText(
        tr,
        est
          ? Math.round(est.macros.protein) +
              " / " +
              Math.round(est.macros.carbs) +
              " / " +
              Math.round(est.macros.fat) +
              " g"
          : "—"
      );

      tdConf(tr, est ? est.confidence : "—");
      tdText(tr, est ? est.label : "—");

      var tdDel = document.createElement("td");
      tdDel.className = "row-actions";
      var del = document.createElement("button");
      del.type = "button";
      del.textContent = "✕";
      del.setAttribute(
        "aria-label",
        "Remove row " + (row.name ? row.name.slice(0, 24) : idx + 1)
      );
      del.addEventListener("click", function () {
        rows = rows.filter(function (r) {
          return r.id !== row.id;
        });
        renderTable();
      });
      tdDel.appendChild(del);
      tr.appendChild(tdDel);

      els.body.appendChild(tr);
    });

    els.btnEstimate.disabled =
      !(foodsDb && rows.length && rows.some(function (r) { return (r.name || "").trim(); }));

    var namedComplete = rows.every(function (r) {
      return !r.name.trim() || !!r.estimated;
    });
    var anyEstimated = rows.some(function (r) {
      return !!r.estimated;
    });
    if (!namedComplete || !anyEstimated) {
      els.resultsBlock.classList.add("hidden");
      els.resultsEmpty.classList.remove("hidden");
    }
  }

  function tdNum(row, txt) {
    var td = document.createElement("td");
    td.textContent = txt;
    row.appendChild(td);
  }

  function tdText(row, txt) {
    var td = document.createElement("td");
    td.textContent = txt;
    row.appendChild(td);
  }

  function tdConf(row, lvl) {
    var td = document.createElement("td");
    if (lvl === "—") {
      td.textContent = "—";
      row.appendChild(td);
      return;
    }
    var span = document.createElement("span");
    span.className =
      "confidence-badge " +
      (lvl === "High" ? "conf-high" : lvl === "Medium" ? "conf-medium" : "conf-low");
    span.textContent = lvl;
    td.appendChild(span);
    row.appendChild(td);
  }

  /**
   * @param {*} totals
   * @param {*} roll
   * @param {string} roast
   * @param {string} serious
   */
  function paintResults(totals, roll, roast, serious) {
    els.resultsEmpty.classList.add("hidden");
    els.resultsBlock.classList.remove("hidden");
    els.totalsLine.innerHTML =
      "<strong>~Totals</strong> · " +
      Math.round(totals.calories) +
      " kcal · Protein " +
      Math.round(totals.protein * 10) / 10 +
      " g · Carbs " +
      Math.round(totals.carbs * 10) / 10 +
      " g · Fat " +
      Math.round(totals.fat * 10) / 10 +
      " g";

    els.overallConf.innerHTML =
      "Overall estimate confidence (heuristic rollup): <strong>" + roll + "</strong> • " +
      "Per-line hints only; real plates vary wildly.";

    els.roast.textContent = '"' + roast + '"';

    els.serious.innerHTML =
      "<strong>For real-life improvement:</strong> " + escapeHtml(serious);

    els.btnEstimate.disabled =
      !(foodsDb && rows.length && rows.some(function (r) { return (r.name || "").trim(); }));
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function estimateAll() {
    if (!foodsDb) return;

    rows.forEach(function (row) {
      if (!(row.name || "").trim()) {
        row.estimated = undefined;
        return;
      }
      row.estimated = ReceiptRoastEngine.estimateLineItem(
        row.name,
        Number(row.qty || 1) || 1,
        foodsDb
      );
    });

    /** @type {Row[]} */
    var withMacros = rows.filter(function (r) {
      return r.estimated != null && (r.name || "").trim();
    });
    /** @type {Array<{macros:*,confidence:string}>} */
    var forRoll = withMacros.map(function (r) {
      return { macros: r.estimated.macros, confidence: r.estimated.confidence };
    });
    var totals = ReceiptRoastEngine.sumMacros(forRoll);
    var roll = ReceiptRoastEngine.rollupConfidence(forRoll);
    var proteinAvg =
      withMacros.length > 0
        ? totals.protein / withMacros.length
        : 0;
    var v = ReceiptRoastEngine.buildVerdicts(totals, proteinAvg);

    renderTable();
    paintResults(totals, roll, v.roast, v.serious);

    persistEstimate({
      ts: Date.now(),
      snippet: (els.input.value || rows.map(function (r) { return r.name; }).join(", ")).trim(),
      receiptRaw: els.input.value,
      items: withMacros.map(function (r) {
        return {
          name: r.name,
          qty: r.qty,
          price: r.price,
          macros: r.estimated.macros,
          macrosConf: r.estimated.confidence,
          matchLabel: r.estimated.label,
          matched: r.estimated.matched,
        };
      }),
      totals: totals,
      rollConf: roll,
      roast: v.roast,
      roastSerious: v.serious,
    });
  }

  function parseIntoRows() {
    var raw = els.input.value.trim();
    if (!raw) {
      els.parseStatus.textContent = "Paste something edible first.";
      els.parseStatus.classList.add("error");
      return;
    }
    var parsed = ReceiptRoastEngine.parseReceiptText(raw);
    if (!parsed.length) {
      els.parseStatus.textContent =
        "No item lines matched. Try lines with descriptions; prices like $12.49 help.";
      els.parseStatus.classList.add("error");
      return;
    }
    parsed.forEach(function (p) {
      rows.push({ id: id(), name: p.name, qty: p.qty, price: p.price });
    });
    els.parseStatus.textContent = "Parsed " + parsed.length + " line(s).";
    els.parseStatus.classList.remove("error");
    renderTable();
  }

  function scrollToSummary() {
    var el = document.getElementById("lbl-results");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadFoods() {
    try {
      var res = await fetch("./foods.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      foodsDb = await res.json();
      if (foodsDb && foodsDb.$schema_hint) delete foodsDb.$schema_hint;
      els.loadStatus.textContent = "Food database loaded.";
      els.loadStatus.classList.remove("error");
      renderTable();
    } catch (e) {
      foodsDb = null;
      els.loadStatus.textContent =
        "Could not fetch foods.json. Serve this folder over HTTP (e.g. python3 -m http.server).";
      els.loadStatus.classList.add("error");
      renderTable();
    }
  }

  function bootstrap() {
    loadEls();
    rows = [];

    els.btnParse.addEventListener("click", parseIntoRows);

    els.btnAdd.addEventListener("click", function () {
      rows.push({ id: id(), name: "", qty: "1", price: "" });
      renderTable();
    });

    els.btnClearRows.addEventListener("click", function () {
      rows = [];
      renderTable();
    });

    els.btnEstimate.addEventListener("click", function () {
      estimateAll();
      scrollToSummary();
    });

    els.btnClrHist.addEventListener("click", function () {
      localStorage.removeItem(LS_KEY);
      renderHistory();
    });

    renderHistory();
    renderTable();
    loadFoods();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", bootstrap);
  else bootstrap();
})();

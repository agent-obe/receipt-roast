/**
 * Receipt Roast — core heuristics (no DOM).
 * Depends on foods DB shape from foods.json (entries + fallback).
 */

(function (global) {
  "use strict";

  /** @typedef {{ calories: number, protein: number, carbs: number, fat: number }} Macros */
  /** @typedef {{ patterns: string[], label: string, perServing: Macros, confidenceWeight?: string }} FoodEntry */

  /**
   * @param {string} raw
   * @returns {{ name: string, qty: string, price: string }[]}
   */
  function parseReceiptText(raw) {
    if (!raw || typeof raw !== "string") return [];
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const skip =
      /^(subtotal|sub-total|total|tax|vat|gst|tip|gratuity|change|balance|amount due|due|paid|cash|visa|master|amex|debit|credit|card|\d{1,2}\/\d{1,2}\/\d{2,4}|receipt|invoice|thank|welcome|guest|party|covers|#\d)/i;

    /** @type {{ name: string, qty: string, price: string }[]} */
    const out = [];
    const priceTail = /(?:\$|USD)\s*(\d+(?:\.\d{2})?)\s*$/i;

    for (const line of lines) {
      if (skip.test(line)) continue;

      let priceStr = "";
      let namePart = line;
      const pm = line.match(priceTail);
      if (pm) {
        priceStr = pm[1];
        namePart = line.slice(0, pm.index).trim();
      }

      if (namePart.length < 2) continue;

      let qty = 1;
      let name = namePart;

      const multX = namePart.match(/^(\d+)\s*[x×]\s*(.+)$/i);
      if (multX) {
        qty = clampQty(parseInt(multX[1], 10));
        name = multX[2].trim();
      } else {
        const leadNum = namePart.match(/^(\d{1,2})\s+(.+)$/);
        if (leadNum) {
          const n = parseInt(leadNum[1], 10);
          const rest = leadNum[2].trim();
          if (n >= 1 && n <= 12 && /[a-zA-Z]/.test(rest)) {
            qty = n;
            name = rest;
          }
        }
      }

      out.push({
        name: name.replace(/^[-–—•\*\d.]+\s*/, "").trim(),
        qty: String(qty),
        price: priceStr,
      });
    }
    return out;
  }

  function clampQty(q) {
    if (!Number.isFinite(q) || q < 1) return 1;
    return Math.min(99, Math.floor(q));
  }

  function normalizeHaystack(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  /**
   * Score match of line against patterns; returns best entry + tier hint.
   * @param {string} lineText
   * @param {*} foodsDb
   */
  function matchFood(lineText, foodsDb) {
    const hay = normalizeHaystack(lineText);
    /** @type {FoodEntry[]} */
    const entries = foodsDb && foodsDb.entries ? foodsDb.entries : [];
    /** @type {FoodEntry} */
    const fallback =
      foodsDb && foodsDb.fallback
        ? foodsDb.fallback
        : {
            label: "Generic menu item",
            patterns: [],
            perServing: { calories: 380, protein: 15, carbs: 40, fat: 16 },
            confidenceWeight: "low",
          };

    let best = null;
    let bestScore = 0;

    for (const e of entries) {
      let score = 0;
      for (const p of e.patterns || []) {
        const needle = normalizeHaystack(p.trim());
        if (!needle) continue;
        if (hay.includes(needle)) score += needle.length >= 8 ? 3 : needle.length >= 4 ? 2 : 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }

    if (!best || bestScore === 0) {
      return {
        entry: fallback,
        label: fallback.label,
        perServing: { ...fallback.perServing },
        matched: false,
        weight: fallback.confidenceWeight || "low",
      };
    }

    let tier = best.confidenceWeight || "medium";
    if (bestScore >= 5) tier = "high";
    else if (bestScore <= 2) tier = tier === "high" ? "medium" : "low";

    return {
      entry: best,
      label: best.label,
      perServing: { ...best.perServing },
      matched: true,
      weight: tier,
    };
  }

  /**
   * @param {*} foodsDb
   * @returns {{ macros: Macros, confidence: string, label: string, matched: boolean }}
   */
  function estimateLineItem(name, qtyNum, foodsDb) {
    const q = clampQty(Number(qtyNum) || 1);
    const hit = matchFood(name, foodsDb);
    /** @type {Macros} */
    const macros = {
      calories: Math.round(hit.perServing.calories * q),
      protein: Math.round(hit.perServing.protein * q * 10) / 10,
      carbs: Math.round(hit.perServing.carbs * q * 10) / 10,
      fat: Math.round(hit.perServing.fat * q * 10) / 10,
    };

    /** @type {"Low"|"Medium"|"High"} */
    let confidence = hit.matched
      ? hit.weight === "high"
        ? "High"
        : hit.weight === "medium"
          ? "Medium"
          : "Low"
      : "Low";

    return { macros, confidence, label: hit.label, matched: hit.matched };
  }

  /**
   * @param {Array<{macros: Macros, confidence: string}>} rowsWithEstimates
   */
  function rollupConfidence(rowsWithEstimates) {
    let score = 0;
    for (const r of rowsWithEstimates) {
      if (r.confidence === "High") score += 2;
      else if (r.confidence === "Medium") score += 1;
      else score += 0;
    }
    const n = Math.max(1, rowsWithEstimates.length);
    const avg = score / n;
    if (avg >= 1.4) return "High";
    if (avg >= 0.65) return "Medium";
    return "Low";
  }

  /**
   * @param {Macros} totals
   * @param {number} proteinG
   * @returns {{ roast: string, serious: string }}
   */
  function buildVerdicts(totals, proteinPerItemAvg) {
    const kcal = totals.calories;
    const sugarProxy = totals.carbs;
    /** @type {string[]} */
    const roasts = [];

    if (kcal >= 2200)
      roasts.push(
        "This receipt could power a forklift for a respectable shift—and your nap game will be undefeated."
      );
    else if (kcal >= 1600)
      roasts.push("That is not lunch. That is a plot twist with fries as the protagonist.");
    else if (kcal >= 900)
      roasts.push(
        "Respectfully: this reads like you broke up with moderation and slid into its DMs with a mozzarella stick."
      );
    else if (kcal >= 500)
      roasts.push("Mild chaos. You're flirting with a food coma but still have plausible deniability.");
    else
      roasts.push("Snack-sized respect. Cute order—almost suspiciously responsible.");

    if (sugarProxy >= 180)
      roasts.push("Carbs did the heavy lifting. Your pancreas typed 'seen' without replying.");

    const p = totals.protein;
    const fat = totals.fat;
    if (p < 55 && kcal > 550)
      roasts.push(
        "Protein is playing hard to get. This meal is basically an emotional-support carb pile."
      );
    if (fat > 70 && kcal > 800)
      roasts.push(
        "Fat came to party. Invite fiber next time—they’re better at cleanup."
      );

    /** @type {string[]} */
    const seriousBits = [];

    if (kcal >= 900)
      seriousBits.push(
        "Spread this across two meals next time—or trim one sugary drink—to keep energy steadier."
      );
    else if (kcal <= 380 && p >= 28)
      seriousBits.push(
        "Solid macro balance here. Repeat this pattern before big workouts."
      );
    else
      seriousBits.push(
        "Aim next order: one lean protein centerpiece, veggies or salad without heavy dressing, swap fried sides for steamed or grilled when possible."
      );

    if (sugarProxy > 140)
      seriousBits.push("Watch liquid calories: soda shakes add hundreds of carbs with little fullness.");

    if (Number.isFinite(proteinPerItemAvg) && proteinPerItemAvg > 0 && proteinPerItemAvg < 10)
      seriousBits.push("Add protein (grilled meat, tofu, yogurt) so each item isn't mostly refined carbs.");

    const roastPick = roasts[Math.floor(Math.random() * roasts.length)];
    const serious = seriousBits.join(" ");

    return { roast: roastPick, serious };
  }

  /** @type {Macros} */
  const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  function sumMacros(rows) {
    return rows.reduce(
      (acc, r) => ({
        calories: acc.calories + (r.macros ? r.macros.calories : 0),
        protein: acc.protein + (r.macros ? r.macros.protein : 0),
        carbs: acc.carbs + (r.macros ? r.macros.carbs : 0),
        fat: acc.fat + (r.macros ? r.macros.fat : 0),
      }),
      { ...ZERO }
    );
  }

  global.ReceiptRoastEngine = {
    parseReceiptText,
    matchFood,
    estimateLineItem,
    rollupConfidence,
    buildVerdicts,
    sumMacros,
  };
})(typeof window !== "undefined" ? window : globalThis);

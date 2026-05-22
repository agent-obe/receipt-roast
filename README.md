# Receipt Roast

Static, mobile-first web app that pastes messy restaurant receipts or delivery notes, guesses calories and macros per line using a **local JSON food dictionary**, assigns **Low / Medium / High confidence** labels, cracks a harmless joke, then offers a sober nutrition nudge.

**Important:** outputs are heuristic guesses — not dietary or medical guidance.

## What it does

1. Paste raw receipt / order lines into the textarea (`index.html`).
2. **Parse lines into items** guesses item names and quantities (looks for `$` prices at line ends and small leading counts like `2x Fries`).
3. Edit the editable table manually (quantity multiplies macros).
4. **Estimate macros** matches text against bundled `foods.json` patterns → per-row kcal/protein/carbs/fat plus confidence badges.
5. Shows combined totals, rollup confidence, a **funny verdict**, and a **serious improvement suggestion**.
6. Keeps **the latest five analyses** in `localStorage` (device-only).

## How it works (under the hood)

- `foods.json`: hand-written pattern→macro template table with a coarse fallback bucket.
- `engine.js`: parses lines, fuzzy substring matches normalized text, aggregates macros, derives verdict templates.
- `app.js`: UI bindings, persistence, fetching the JSON (**requires HTTP**, not plain `file://` in most browsers).

## Limitations

- Matching is naive substring search against a toy database — novelty items, combos, sauces, booze, and regional specials will often land in **Low** confidence buckets.
- No OCR: only pasted or typed characters.
- No external APIs → no live restaurant menus.

## Running locally

```bash
cd receipt-roast
python3 -m http.server 8080
# visit http://127.0.0.1:8080/
```

Or any static file server (`npx serve .`, etc.) pointing at this folder.

## Tests

Serve the folder HTTP, open `tests.html` — it verifies five scripted receipts plus sanity checks on rollup/verdict hooks.

CLI smoke (optional):

```bash
python3 -m http.server 8080 &
sleep 1
curl -sf http://127.0.0.1:8080/foods.json | head -c 80 && echo "... OK"
curl -sf http://127.0.0.1:8080/tests.html | grep -q "Receipt Roast tests" && echo "tests HTML OK"
```

## GitHub Pages

After pointing GitHub Pages at this repo’s `/` (or copying these files):

**Public URL placeholder:**  
`https://<your-account>.github.io/<repo-name>/`

_(Replace placeholders after the host configures Pages.)_

## Files

| File | Role |
| --- | --- |
| `index.html` | Shell + UI |
| `styles.css` | Mobile-first styling |
| `foods.json` | Local heuristic nutrient templates |
| `engine.js` | Parsing + estimation + verdict copy |
| `app.js` | DOM + `localStorage` |
| `tests.html` | In-browser assertions |

## Privacy

Receipt text and summaries stay entirely in-browser until you screenshot or paste elsewhere — nothing uploads by design.

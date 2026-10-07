# Estimate Calculator — AI production studio

A single-file web app (`index.html`) for pricing AI video and image production work. It has no backend and no build step, and it is English-only. Everything is stored in your browser's `localStorage`.

## Hosting

Upload `index.html` to any static host:

- **GitHub Pages**: repo → Settings → Pages → deploy from branch, root folder.
- **Netlify / Vercel**: create a new project from this repo. Leave the build command empty and set the output directory to `/`.
- **Locally**: just open `index.html` in a browser. You can also run `python3 -m http.server` and go to `http://localhost:8000`.

## Quick start

1. Open **Settings** and fill in:
   - The price of one credit (USD) and the USD → EUR / USD → CZK exchange rates.
   - The credit cost of each model. The defaults are all 0.
   - Your hourly rate. You can also set a separate rate per service.
   - Your studio contact details.
2. Go to **Estimate** and fill in the project info.
3. Add generation lines with **+ Video / + Image / …**, switch on the services you need, and add any fixed costs.
4. Watch the summary on the right (on a phone, tap **Breakdown ↓**).
5. Press **Save**. Saved estimates are listed under **Saved**, where you can open, duplicate or delete them.
6. Press **Client version** and then **Print / Save PDF** to get a clean document for the client.

## Adding a new model

**Settings → Models & tools → + Add model**:

- **Name**, e.g. `Veo 3`.
- **Category**: Video / Image / Audio / Upscale / Other.
- **Cost in credits** per generation.
- **Per second**: tick this if the model charges per second of video. A line then costs credits × duration × generations.
- **Notes**: optional, e.g. resolution or plan.

The new model appears in the model dropdown for its category.

- **Edit** changes a model's price for **new** lines only.
- **Archive** hides a model from selection, but old estimates keep it. **Restore** brings it back.
- **Delete** is only offered for models that no saved estimate (or the open one) uses.

For a one-off model, pick **Custom…** in a line's model dropdown and type the credit cost directly.

## Price snapshots

Each estimate stores its own copy of:

- the model names and prices on every line,
- the credit price,
- the exchange rates,
- the hourly rates,
- the price per format and per revision round.

Changing Settings therefore never changes a saved estimate. If an estimate's prices differ from current Settings, a banner tells you so. **Refresh prices** lists every value that will change and the new total, and updates them only after you confirm.

A blank, never-saved estimate always follows current Settings. So you can fill in Settings first and then start estimating.

## How the price is calculated

All money inputs are in **USD**. Totals are converted to the estimate's output currency (USD / EUR / CZK) using the estimate's own rates. CZK is rounded to whole crowns.

| Step | Formula |
|---|---|
| Line credits | `credits × generations` (or `credits/sec × seconds × generations`) |
| AI cost | `total credits × credit price` |
| Waste buffer | `AI cost × waste %` (editable per estimate) |
| Labor | enabled services (hours × rate, or a fixed price) + extra formats (count × price) + extra revision rounds (count × price) |
| Markup | `markup % × (whichever you tick: AI cost incl. waste / fixed costs / labor)` |
| Subtotal | AI + labor + fixed costs + markup |
| Rush fee | `rush % × (labor + markup)`. It is never applied to raw credit or fixed costs. |
| Usage rights | `subtotal × (multiplier − 1)`, or a fixed surcharge |
| Discount | `% of (subtotal + rush + usage)`, or a fixed amount (never more than the price) |
| **Total** | subtotal + rush + usage − discount |
| Prepayment | `total × prepayment %` |
| Real cost | AI cost incl. waste + fixed costs |
| Margin | `total − real cost`. "Margin excl. your labor" also subtracts labor. |

The **client version** hides credits, model names, markup and margin:

- All generation appears as one **AI production** line.
- Markup is folded into the line items it applies to, so the visible lines add up exactly to the subtotal.
- Rush fee, usage rights and discount are shown as separate lines when they apply.
- The document also shows the number of included revision rounds, the prepayment amount and any client notes.

## Backup and moving between devices

**Settings → Data** (or the **Saved** tab):

- **Export data** downloads a JSON file with your settings and all saved estimates.
- **Import data** reads that file. You can choose:
  - **Merge**: keeps your settings, adds any missing models, and adds the imported estimates. When the same estimate exists on both sides, the newer version wins.
  - **Replace all**: overwrites everything on this device.

Browser storage is per browser and per site address, so export a backup now and then.

## Tests

```bash
node --test tests/calc.test.mjs
```

The tests load the calculation engine straight out of `index.html`, so they check the same code the browser runs. Node 18+ is required; there are no dependencies. They cover:

- **Example 1 (USD)**, worked by hand:
  - Lines: Kling 10 cr/sec (4 gens × 5 s) + Nano Banana 2 cr (×20) = 240 cr. Adding a 25 % waste buffer gives 300 cr, which at $0.05 per credit is **$15**.
  - Labor $1,030, fixed costs $200, markup 20 % on credits + fixed = **$43**, so the subtotal is **$1,288**.
  - Rush fee 25 % × (1,030 + 43) = **$268.25**.
  - Commercial usage ×1.25 adds **$322**.
  - A 10 % discount of **$187.83** gives a total of **$1,690.42** and a prepayment of **$845.21**.
- **Example 2 (CZK)**: a custom model, a per-service rate, markup on labor, a fixed usage surcharge and a fixed discount. Total **8,133 CZK**.
- **Rush fee** ignores raw credit and fixed costs.
- **Waste buffer** works per estimate.
- **Changing model prices in Settings does not change a saved estimate.** Refresh prices then updates it on purpose and leaves the original untouched.
- Number rounding and parsing (e.g. `1,5` → 1.5).
- Normalizing imported data.

# Estimate Calculator — AI production studio

A single-file web app (`index.html`) for pricing AI video and image production work. It has no backend and no build step. Everything is stored in your browser's `localStorage`.

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

## Languages

There are two separate language settings:

- **Interface language** (English / Russian): the **EN / RU** switch in the top bar. It is remembered per browser.
- **Client document language**: set per estimate, under **Project → Client document language**, or with the **EN / RU** switch on the client page. The default for new estimates is in **Settings → Pricing, currency & language**.

On the client document, built-in texts are translated. This covers:
- section and service names,
- the "AI production" line,
- totals, revision and usage terms,
- the default rush and usage option names,
- dates and number formats (`1 706,97 $` in Russian).

The tagline and footer note have separate EN and RU fields in Settings. Text you type yourself (project name, custom services, fixed-cost names, client notes, renamed options) is shown exactly as typed, so write it in the language of the document.

## Logo

**Settings → Studio & client version → Logo** offers three options:
- **Chiefs logo** (built in, the default). It appears white in the app's top bar and as the red block on the client document.
- **Own image**: upload a PNG, JPG or SVG. It is resized to at most 600 px, stored in the browser, and included in the export.
- **Text**: a plain text logo.

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
- the price per format, per revision round and for the source-files add-on,
- the license surcharge %.

Changing Settings therefore never changes a saved estimate. If an estimate's prices differ from current Settings, a banner tells you so. **Refresh prices** lists every value that will change and the new total, and updates them only after you confirm.

A blank, never-saved estimate always follows current Settings. So you can fill in Settings first and then start estimating.

## Usage license

Section **06 Usage license** of an estimate. The license fee is a % surcharge on the **creative fee** (labor + markup), so AI credits and third-party costs are not part of it. On the client document it is a separate line with a plain-language description, followed by a block listing media, territory, term and exclusivity.

| Preset | Scope | Default |
|---|---|---|
| Social | organic social media, worldwide, 12 months | +0% (included) |
| Digital Ads | social + paid digital ads + website, worldwide, 12 months | +40% |
| Campaign | all digital + outdoor + print, worldwide, 24 months | +80% |
| Full Buyout | all media, worldwide, perpetual, exclusive | +150% (×2.5) |

**Custom…** lets you tick the media and choose territory, term and exclusivity. Its % is the sum of the chosen surcharges, and it never goes below 0. The default values are:

| Setting | Values |
|---|---|
| Media | organic social 0, paid ads +30, website & marketplaces +10, outdoor +30, TV & cinema +60, print +20, events & retail screens +10, PR & internal +5 |
| Territory | Czech Republic −10, EU −5, CIS −5, worldwide 0 |
| Term | 6 months −10, 12 months 0, 24 months +20, perpetual +50 |
| Exclusivity | none 0, style / character +25, full +50 |

You can also type the % for a single estimate. The renewal note (default 40% of the license fee) is shown unless the term is perpetual. All defaults are in **Settings → Usage license pricing**.

Estimates saved before the license module keep their old "usage rights" pricing, so their total does not change. A notice in the section offers **Switch to the license module**.

## Client document sections

Besides the line items and totals, each estimate can add these sections to the client document. Each one is switched on or off per estimate.

- **Deliverables:** aspect ratios, durations, number of versions, resolution, codec, subtitles, clean versions and notes.
- **Stages & timeline:** stages with a number of days each. Dates are calculated from the start date. The editor warns when the timeline ends after the deadline.
- **Packages:** Base / Optimal / Premium, side by side. Each package costs a % of this estimate or a fixed amount, and has a description and an "included" list. One package is marked as recommended.
- **Usage license** details (see above).
- **Terms:** revisions, payment (the split follows the prepayment %), source files, client feedback time, portfolio (with an NDA or embargo date option), use of AI, and project archive.
- **Acceptance block:** name, date and signature lines for the client and the studio.

Also new:
- **Source files add-on:** a toggle under Services that adds a paid line.
- **Valid until:** a date in the document header (the default validity is 14 days).

The wording of every term is a template with an English and a Russian version, editable in **Settings → Terms texts**. Words in `{braces}` are filled in automatically (for example `{hours}`, `{included}`, `{price}`). **Reset** restores the default text. The default texts have not been reviewed by a lawyer.

## How the price is calculated

All money inputs are in **USD**. Totals are converted to the estimate's output currency (USD / EUR / CZK) using the estimate's own rates. CZK is rounded to whole crowns.

| Step | Formula |
|---|---|
| Line credits | `credits × generations` (or `credits/sec × seconds × generations`) |
| AI cost | `total credits × credit price` |
| Waste buffer | `AI cost × waste %` (editable per estimate) |
| Labor | enabled services (hours × rate, or a fixed price) + extra formats (count × price) + extra revision rounds (count × price) + source-files add-on |
| Markup | `markup % × (whichever you tick: AI cost incl. waste / fixed costs / labor)` |
| Usage license | `license % × (labor + markup)` |
| Subtotal | AI + labor + fixed costs + markup + license |
| Rush fee | `rush % × (labor + markup)`. It is never applied to raw credit costs, fixed costs or the license. |
| Discount | `% of (subtotal + rush)`, or a fixed amount (never more than the price) |
| **Total** | subtotal + rush − discount |
| Packages | each one is `% of total` or a fixed amount |
| Prepayment | `total × prepayment %` |
| Real cost | AI cost incl. waste + fixed costs |
| Margin | `total − real cost`. "Margin excl. your labor" also subtracts labor. |

The **client version** hides credits, model names, markup and margin:

- All generation appears as one **AI production** line.
- Markup is folded into the line items it applies to, so the visible lines add up exactly to the subtotal.
- The usage license, rush fee and discount are shown as separate lines when they apply.
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
  - The Digital Ads license is 40 % × (1,030 + 43) = **$429.20**, so the subtotal is **$1,717.20**.
  - Rush fee 25 % × (1,030 + 43) = **$268.25**.
  - A 10 % discount of **$198.55** gives a total of **$1,786.90** and a prepayment of **$893.45**.
- **Example 2 (CZK)**: a custom model, a per-service rate, markup on labor, a custom license (paid ads, Czech Republic, 6 months, exclusive style = 35 %) and a fixed discount. Total **7,987 CZK**.
- **Old estimates** saved before the license module keep their exact total ($1,690.42 with "Commercial ×1.25").
- The source-files add-on, and package prices (% of the total or a fixed amount).
- **Rush fee** ignores raw credit and fixed costs.
- **Waste buffer** works per estimate.
- **Changing model prices in Settings does not change a saved estimate.** Refresh prices then updates it on purpose and leaves the original untouched.
- Number rounding and parsing (e.g. `1,5` → 1.5), and Russian number formatting (`8 133 CZK`).
- Normalizing imported data.

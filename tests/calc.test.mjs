// Calculation tests for the estimate engine embedded in index.html.
// Run: node --test tests/calc.test.mjs     (Node 18+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const E = ctx.Engine;

const svc = (est, key) => est.services.find((s) => s.key === key);
const roundtrip = (x) => JSON.parse(JSON.stringify(x)); // what localStorage does

/**
 * Example 1 (USD) — every pricing step in play.
 *   Kling 10 cr/sec, 4 gens × 5 s           = 200 cr
 *   Nano Banana 2 cr/gen × 20 gens          =  40 cr
 *   raw 240 cr + 25% waste 60 cr = 300 cr × $0.05 = $15.00 (credits $12 + waste $3)
 *   Labor: editing 10 h × $50 = 500, pre-production fixed 300,
 *          2 formats × $40 = 80, 1 extra revision × $150 = 150     → 1,030
 *   Fixed: music license 200
 *   Markup 20% on credits + fixed: (15 + 200) × 0.2               = 43
 *   Subtotal 15 + 1030 + 200 + 43                                   = 1,288
 *   Rush Fast 25% on labor + markup: (1030 + 43) × 0.25            = 268.25
 *   Usage Commercial ×1.25: 1288 × 0.25                            = 322
 *   Before discount                                                 = 1,878.25
 *   Discount 10%: 187.825 → 187.83
 *   Total 1,690.42 · prepayment 50% = 845.21
 *   Real cost 15 + 200 = 215 · margin 1,475.42
 */
function example1() {
  const s = E.defaultSettings();
  s.creditPrice = 0.05;
  Object.assign(E.findModel(s, 'm_kling'), { credits: 10, perSecond: true });
  Object.assign(E.findModel(s, 'm_nanobanana'), { credits: 2 });

  const e = E.newEstimate(s);
  e.name = 'Example 1';
  e.wastePct = 25;
  const video = E.makeLine(s, 'Video', 'm_kling');
  video.gens = 4; video.duration = 5;
  const image = E.makeLine(s, 'Image', 'm_nanobanana');
  image.gens = 20;
  e.lines.push(video, image);
  Object.assign(svc(e, 'editing'), { enabled: true, hours: 10 });
  Object.assign(svc(e, 'preprod'), { enabled: true, mode: 'fixed', fixed: 300 });
  Object.assign(e.formats, { enabled: true, count: 2, price: 40 });
  Object.assign(e.revisions, { extra: 1, price: 150 });
  e.fixedCosts.push({ id: 'f1', name: 'Music license', amount: 200 });
  const fast = s.rushOptions.find((r) => r.name === 'Fast');
  e.rush = { optionId: fast.id, name: fast.name, pct: fast.pct };
  const commercial = s.usageOptions.find((u) => u.name === 'Commercial');
  e.usage = { optionId: commercial.id, name: commercial.name, type: commercial.type, value: commercial.value };
  e.discount = { type: 'pct', value: 10 };
  return { s, e };
}

test('example 1: credits, waste buffer, labor, markup, rush, usage, discount (USD)', () => {
  const { e } = example1();
  const c = E.calcEstimate(e);

  assert.equal(c.rawCredits, 240);
  assert.equal(c.wasteCredits, 60);
  assert.equal(c.totalCredits, 300);
  assert.deepEqual(roundtrip(c.categories.map((x) => [x.category, x.credits])), [['Video', 200], ['Image', 40]]);
  assert.equal(E.roundTo(c.creditsCost, 2), 12);
  assert.equal(E.roundTo(c.wasteCost, 2), 3);
  assert.equal(E.roundTo(c.genCost, 2), 15);
  assert.equal(c.labor, 1030);
  assert.equal(c.fixed, 200);
  assert.equal(E.roundTo(c.markupRaw, 2), 43);
  assert.equal(c.subtotal, 1288);
  assert.equal(c.rush, 268.25, 'rush = 25% × (labor 1030 + markup 43), not on credits/fixed');
  assert.equal(c.usage, 322);
  assert.equal(c.preDiscount, 1878.25);
  assert.equal(c.discount, 187.83);
  assert.equal(c.total, 1690.42);
  assert.equal(c.prepay, 845.21);
  assert.equal(E.roundTo(c.realCost, 2), 215);
  assert.equal(E.roundTo(c.margin, 2), 1475.42);
  assert.equal(E.roundTo(c.marginPct, 2), 87.28);

  // Client lines hide markup inside line items and add up exactly to the subtotal.
  assert.deepEqual(roundtrip(c.clientLines.map((l) => [l.section, l.kind, l.key || l.name || '', l.amount])), [
    ['ai', 'ai', '', 18],
    ['services', 'service', 'preprod', 300],
    ['services', 'service', 'editing', 500],
    ['services', 'formats', '', 80],
    ['revisions', 'revisions', '', 150],
    ['third', 'fixed', 'Music license', 240],
  ]);
  assert.deepEqual(roundtrip(c.clientLines[0].cats), ['Video', 'Image']);
  assert.equal(c.clientLines.reduce((a, l) => a + l.amount, 0), c.subtotal);
  // No model names or credit info leak into client lines.
  const clientText = JSON.stringify(c.clientLines);
  assert.ok(!/Kling|Nano Banana|credit/i.test(clientText), clientText);
});

test('rush fee ignores raw credit and fixed costs', () => {
  const { e } = example1();
  const base = E.calcEstimate(e).rush;
  const e2 = roundtrip(e);
  e2.markup.pct = 0;               // remove markup → rush only on labor
  assert.equal(E.calcEstimate(e2).rush, 1030 * 0.25);
  e2.rates.creditPrice = 5;        // huge credit cost, no markup on it → rush unchanged
  e2.fixedCosts[0].amount = 10000; // huge fixed cost → rush unchanged
  assert.equal(E.calcEstimate(e2).rush, 257.5);
  assert.equal(base, 268.25);
});

test('waste buffer scales credits cost and is editable per estimate', () => {
  const { e } = example1();
  e.wastePct = 0;
  assert.equal(E.roundTo(E.calcEstimate(e).genCost, 2), 12);
  e.wastePct = 50;
  const c = E.calcEstimate(e);
  assert.equal(c.totalCredits, 360);
  assert.equal(E.roundTo(c.genCost, 2), 18);
});

/**
 * Example 2 (CZK, 1 USD = 23 CZK) — custom model, per-service rate, markup on labor,
 * fixed usage surcharge, fixed discount, 0-decimal currency rounding.
 *   Custom image 5 cr × 10 = 50 cr + 20% waste = 60 cr × $0.10 = $6 → 138 CZK
 *   Color grading 4 h × $60 = $240 → 5,520 CZK;  stock $30 → 690 CZK
 *   Markup 10% on everything: client lines 151.8→152, 6,072, 759 → subtotal 6,983
 *   Usage fixed $100 → 2,300;  discount fixed $50 → 1,150
 *   Total 8,133 CZK · prepayment 30% = 2,439.9 → 2,440
 */
test('example 2: CZK, custom model, fixed usage surcharge and fixed discount', () => {
  const s = E.defaultSettings();
  s.creditPrice = 0.1;
  s.fx.CZK = 23;
  s.serviceRates.grading = 60;
  s.markupPct = 10;
  s.markupOn = { credits: true, fixed: true, labor: true };
  s.prepayPct = 30;
  const e = E.newEstimate(s);
  e.currency = 'CZK';
  const l = E.makeLine(s, 'Image', 'custom');
  Object.assign(l, { modelName: 'Some new model', credits: 5, gens: 10 });
  e.lines.push(l);
  assert.equal(svc(e, 'grading').rate, 60, 'per-service rate from settings');
  assert.equal(svc(e, 'editing').rate, 50, 'default hourly rate when no override');
  Object.assign(svc(e, 'grading'), { enabled: true, hours: 4 });
  e.fixedCosts.push({ id: 'f', name: 'Stock footage', amount: 30 });
  e.usage = { optionId: 'custom', name: 'Broadcast', type: 'fixed', value: 100 };
  e.discount = { type: 'fixed', value: 50 };

  const c = E.calcEstimate(e);
  assert.equal(c.totalCredits, 60);
  assert.equal(E.roundTo(c.genCost, 2), 138);
  assert.equal(c.labor, 5520);
  assert.equal(c.fixed, 690);
  assert.equal(c.subtotal, 6983);
  assert.equal(c.rush, 0);
  assert.equal(c.usage, 2300);
  assert.equal(c.discount, 1150);
  assert.equal(c.total, 8133);
  assert.equal(c.prepay, 2440);
  assert.equal(E.roundTo(c.realCost, 2), 828);
  assert.equal(E.fmtMoney(c.total, 'CZK').replace(/\s/g, ' '), 'CZK 8,133');
  assert.equal(E.fmtMoney(c.total, 'CZK', 'ru').replace(/\s/g, ' '), '8 133 CZK');
  assert.equal(E.fmtMoney(1690.42, 'USD', 'ru').replace(/\s/g, ' '), '1 690,42 $');

  // A fixed discount can never push the total below zero.
  e.discount.value = 1e6;
  assert.equal(E.calcEstimate(e).total, 0);
});

test('changing model prices in settings does not alter a saved estimate', () => {
  const { s, e } = example1();
  const saved = roundtrip(e); // saved to localStorage
  const before = E.calcEstimate(saved).total;
  assert.equal(before, 1690.42);

  // Change settings: model price, credit price, FX, hourly rate; archive a used model.
  E.findModel(s, 'm_kling').credits = 20;
  E.findModel(s, 'm_nanobanana').archived = true;
  s.creditPrice = 0.1;
  s.fx.EUR = 2;
  s.hourlyRate = 999;

  assert.equal(E.calcEstimate(saved).total, before, 'saved estimate keeps its snapshot');
  assert.equal(saved.lines[0].credits, 10);
  assert.equal(saved.lines[1].modelName, 'Nano Banana');
  // Archived models stay counted as "in use" (so they can't be hard-deleted).
  assert.equal(E.modelUsageCount('m_nanobanana', [saved]), 1);
  assert.equal(E.modelUsageCount('m_seedance', [saved]), 0);

  // New lines pick up the new price.
  assert.equal(E.makeLine(s, 'Video', 'm_kling').credits, 20);

  // "Refresh prices" updates snapshots on purpose — and doesn't mutate the original.
  const r = E.refreshPrices(saved, s);
  const has = (type, extra = {}) => r.changes.some((x) => x.type === type && Object.entries(extra).every(([k, v]) => x[k] === v));
  assert.ok(has('model', { name: 'Kling', from: 10, to: 20 }), JSON.stringify(r.changes));
  assert.ok(has('creditPrice', { from: 0.05, to: 0.1 }));
  assert.ok(has('rate', { key: 'editing', from: 50, to: 999 }));
  assert.equal(saved.lines[0].credits, 10);
  assert.equal(E.calcEstimate(saved).total, before);
  // The estimate used a hand-edited $40/format; refresh resets it to the settings default ($50).
  assert.ok(has('formatPrice', { from: 40, to: 50 }));
  // Raw credits 400 + 40 = 440, +25% = 550 cr × $0.10 = $55; editing now 10 h × $999
  const c = E.calcEstimate(r.estimate);
  assert.equal(c.totalCredits, 550);
  assert.equal(E.roundTo(c.genCost, 2), 55);
  assert.equal(c.labor, 9990 + 300 + 2 * 50 + 150);
  assert.notEqual(c.total, before);
});

test('rounding helper avoids float artefacts', () => {
  assert.equal(E.roundTo(187.825, 2), 187.83);
  assert.equal(E.roundTo(1.005, 2), 1.01);
  assert.equal(E.roundTo(2439.5, 0), 2440);
  assert.equal(E.roundTo(-1.005, 2), -1.01);
  assert.equal(E.num('1,5'), 1.5);
  assert.equal(E.num('1 200'), 1200);
  assert.equal(E.num(''), 0);
});

test('normalizing imported data fills in missing fields', () => {
  const e = E.normalizeEstimate({ id: 'x', name: 'Old', lines: [{ category: 'Image', credits: 3, gens: 2 }] });
  assert.equal(e.id, 'x');
  assert.equal(e.services.length, E.SERVICE_DEFS.length);
  assert.equal(E.calcEstimate(e).rawCredits, 6);
  const s = E.normalizeSettings({ creditPrice: 0.2, models: [{ id: 'a', name: 'A', category: 'Nope' }] });
  assert.equal(s.creditPrice, 0.2);
  assert.equal(s.models[0].category, 'Other');
  assert.equal(s.rushOptions.length, 3);
});

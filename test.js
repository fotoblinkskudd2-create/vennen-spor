const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('assert');
const URL = 'file:///workspace/vennen-spor/index.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const st = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__VS.state)));
  const reset = async () => { await p.click('#btnReset'); };
  const lastLog = async () => (await st()).log.map(e => e.msg);
  let pass = 0; const ok = (n) => { pass++; console.log('PASS', n); };

  await p.goto(URL); await reset();
  // Flow 1: fall -> Ja
  await p.click('#btnFall');
  assert((await st()).status === 'yellow');
  await p.click('#btnJa');
  let s = await st();
  assert.equal(s.status, 'green'); assert(s.log.some(m => /Ja → OK/.test(m.msg))); assert(s.lastTalk);
  assert.match(await p.textContent('#famStatus'), /Alt er bra/);
  ok('Fall → Ja → grønn "Alt er bra"');

  // Flow 1b: pill -> Ja
  await p.click('#btnPill'); await p.click('#btnJa'); s = await st();
  assert.equal(s.status, 'green'); assert.equal(s.med, true); assert.match(await p.textContent('#tMed'), /tatt/);
  ok('Pille → Ja → medisin tatt, grønn');

  // Flow 2: fall -> Nei -> ring? Ja -> red
  await reset(); await p.click('#btnFall'); await p.click('#btnNei');
  assert(await p.locator('.b.ai', { hasText: 'Skal jeg ringe familien?' }).count() === 1);
  await p.click('#btnJa'); s = await st();
  assert.equal(s.status, 'red'); assert(s.feed.some(f => f.level === 'red')); assert(s.log.some(m => /ALARM/.test(m.msg)));
  ok('Fall → Nei → "Skal jeg ringe familien?" → Ja → rød ALARM');

  // Flow 2b: pill -> Nei -> Nei -> yellow
  await reset(); await p.click('#btnPill'); await p.click('#btnNei'); await p.click('#btnNei'); s = await st();
  assert.equal(s.status, 'yellow'); assert.equal(s.med, false);
  ok('Pille → Nei → Nei → gul, medisin ikke tatt');

  // Flow 3: no answer with 5s demo timer (real UI toggle)
  await reset(); await p.click('#btnFall');
  await p.waitForTimeout(5600); s = await st();
  assert(s.log.some(m => /spør igjen/.test(m.msg))); assert.notEqual(s.status, 'red');
  assert(await p.locator('.b.ai', { hasText: 'Jeg hører deg ikke' }).count() === 1);
  await p.waitForTimeout(5400); s = await st();
  assert.equal(s.status, 'red'); assert(s.log.some(m => /INGEN SVAR → ALARM/.test(m.msg)));
  assert(await p.isDisabled('#btnJa'));
  ok('Ingen svar (5 s) → spør igjen → rød ALARM');
  await p.screenshot({ path: '/workspace/vennen-spor/screenshot.png', fullPage: true });

  // Persistence
  await p.reload(); s = await st();
  assert.equal(s.status, 'red'); assert(s.log.length >= 3);
  ok('Logg/status lagret i localStorage etter reload');

  // Flow 3b: no answer then answer on retry
  await reset(); await p.goto(URL + '?timeout=1'); await p.click('#btnPill');
  await p.waitForTimeout(1300); await p.click('#btnJa'); s = await st();
  assert.equal(s.status, 'green');
  ok('Ingen svar → spør igjen → Ja → grønn');

  // Reset
  await p.click('#btnReset'); s = await st(); assert.equal(s.log.length, 0); assert.equal(s.status, 'green');
  ok('Nullstill tømmer logg');

  assert.deepEqual(errs, [], 'JS-feil: ' + errs.join('; '));
  console.log(`ALLE ${pass} TESTER OK, 0 JS-feil`);
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });

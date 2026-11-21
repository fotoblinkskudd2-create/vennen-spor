const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('assert');
const path = require('path');
const URL = 'file://' + path.join(__dirname, 'index.html');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  await p.addInitScript(() => {
    window.__cancels = 0; window.__aborts = 0;
    if (window.speechSynthesis) {
      const orig = window.speechSynthesis.cancel.bind(window.speechSynthesis);
      window.speechSynthesis.cancel = () => { window.__cancels++; orig(); };
    }
    class FakeSR {
      start() {} abort() { window.__aborts++; } stop() {}
      set lang(v) {} set interimResults(v) {} set maxAlternatives(v) {}
      set onresult(f) {} set onerror(f) {}
    }
    window.SpeechRecognition = FakeSR;
  });
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
  await p.screenshot({ path: path.join(__dirname, 'screenshot.png'), fullPage: true });

  // Persistence
  await p.reload(); s = await st();
  assert.equal(s.status, 'red'); assert(s.log.length >= 3);
  ok('Logg/status lagret i localStorage etter reload');

  // Flow 3b: no answer then answer on retry
  await reset(); await p.goto(URL + '?timeout=1'); await p.click('#btnPill');
  await p.waitForTimeout(1300); await p.click('#btnJa'); s = await st();
  assert.equal(s.status, 'green');
  ok('Ingen svar → spør igjen → Ja → grønn');

  // Flow 4: reload mid-dialog resumes the unanswered check
  await reset(); await p.goto(URL + '?timeout=1');
  await p.click('#btnFall');
  assert(!(await p.isDisabled('#btnJa')));
  await p.reload();
  const act = await p.evaluate(() => window.__VS.active);
  assert(act && act.step === 'ask', 'aktiv dialog må overleve reload');
  assert(!(await p.isDisabled('#btnJa')), 'svar-knappene må være aktive etter reload');
  await p.waitForTimeout(1400); s = await st();
  assert(s.log.some(m => /spør igjen|ALARM/.test(m.msg)), 'retry/alarm må fyre etter reload');
  await p.waitForTimeout(1600); s = await st();
  assert.equal(s.status, 'red'); assert(s.log.some(m => /INGEN SVAR → ALARM/.test(m.msg)));
  ok('Reload midt i dialog → spør igjen → rød ALARM');

  // Flow 5: voice answer on the "Skal jeg ringe familien?" step
  await p.addInitScript(() => {
    window.__recs = [];
    class FakeSR {
      constructor() { window.__recs.push(this); }
      start() { this.started = true; }
      abort() { window.__aborts++; }
      say(txt) { this.onresult({ results: [[{ transcript: txt }]] }); }
    }
    window.SpeechRecognition = FakeSR;
  });
  await p.goto(URL); await reset();
  await p.click('#btnFall'); await p.click('#btnNei');
  const recs = await p.evaluate(() => window.__recs.filter(r => r.started).length);
  assert(recs >= 2, 'listen() skal starte ny gjenkjenning på «ringe familien»-steget');
  await p.evaluate(() => window.__recs.at(-1).say('ja'));
  s = await st();
  assert.equal(s.status, 'red'); assert(s.feed.some(f => f.level === 'red'));
  ok('Stemme «ja» på «Skal jeg ringe familien?» → rød ALARM');

  // Reset
  await p.click('#btnReset'); s = await st(); assert.equal(s.log.length, 0); assert.equal(s.status, 'green');
  ok('Nullstill tømmer logg');

  // Reset stops speech + listening
  await p.click('#btnFall'); // starts speechSynthesis + SpeechRecognition
  const before = await p.evaluate(() => ({ c: window.__cancels, a: window.__aborts }));
  await p.click('#btnReset');
  const after = await p.evaluate(() => ({ c: window.__cancels, a: window.__aborts }));
  assert(after.c > before.c, 'Nullstill kalte ikke speechSynthesis.cancel()');
  assert(after.a > before.a, 'Nullstill avbrøt ikke speech recognition');
  ok('Nullstill stopper tale og lytting');

  assert.deepEqual(errs, [], 'JS-feil: ' + errs.join('; '));
  console.log(`ALLE ${pass} TESTER OK, 0 JS-feil`);
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });

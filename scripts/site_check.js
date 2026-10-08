// Clicks every button, link and control on the site and measures load speed.
// usage: node scripts/site_check.js PAGE.html NODE_MODULES_DIR OUT.json
//   PAGE.html          docs/index.html or a built page
//   NODE_MODULES_DIR   where gsap, lenis and three are installed (npm i gsap@3.12.5 lenis@1.1.13 three@0.128.0);
//                      the CDN URLs are served from there so the check runs offline
const path = require('path'), fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const [PAGE, LIBS, OUT] = process.argv.slice(2);
const L = path.resolve(LIBS) + '/';
const URL = 'file://' + path.resolve(PAGE);
const S = path.dirname(path.resolve(OUT));
const results = []; const errors = [];
const check = (name, ok, info = '') => { results.push([ok ? 'PASS' : 'FAIL', name, info]); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const open = async (vp, hash = '') => {
    const p = await b.newPage({ viewport: vp });
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    for (const [k, f] of [['three.min.js', 'three/build/three.min.js'], ['gsap.min.js', 'gsap/dist/gsap.min.js'], ['ScrollTrigger.min.js', 'gsap/dist/ScrollTrigger.min.js'], ['lenis.min.js', 'lenis/dist/lenis.min.js']]) await p.route('**/' + k, r => r.fulfill({ path: L + f }));
    await p.goto(URL + hash); await p.waitForTimeout(1500); return p;
  };
  const shown = (p) => p.evaluate(() => [...document.querySelectorAll('.page')].filter(x => !x.hidden).map(x => x.id).join(','));
  const cur = (p) => p.evaluate(() => document.querySelector('[data-nav][aria-current="page"]')?.dataset.nav);
  const txt = (p, sel) => p.evaluate((s) => document.querySelector(s).textContent.trim(), sel);
  const html = (p, sel) => p.evaluate((s) => document.querySelector(s).innerHTML, sel);
  const pages = ['home', 'why', 'lab', 'play', 'results', 'team'];

  let p = await open({ width: 1440, height: 900 });
  // nav tabs
  for (const id of [...pages.slice(1), 'home']) {
    await p.evaluate(() => window.scrollTo(0, 400));
    await p.click(`.nav [data-nav="${id}"]`); await p.waitForTimeout(500);
    const s = await shown(p), c = await cur(p), y = await p.evaluate(() => Math.round(scrollY));
    check(`Top bar tab: ${id}`, s === id && c === id && y === 0, `shown=${s} active=${c} scroll=${y}`);
  }
  await p.click('.nav [data-nav="lab"]'); await p.waitForTimeout(300);
  await p.click('.nav .brand'); await p.waitForTimeout(400);
  check('Logo goes Home', (await shown(p)) === 'home');
  // chapter cards
  for (const id of pages.slice(1)) {
    await p.click('.nav [data-nav="home"]'); await p.waitForTimeout(300);
    await p.click(`.chapter-grid a[href="#${id}"]`); await p.waitForTimeout(400);
    check(`Home card: ${id}`, (await shown(p)) === id);
  }
  // next / previous
  await p.click('.nav [data-nav="home"]'); await p.waitForTimeout(300);
  for (let i = 1; i < pages.length; i++) {
    await p.click(`#${pages[i - 1]} .pager .next`); await p.waitForTimeout(400);
    check(`Next button ${pages[i - 1]} -> ${pages[i]}`, (await shown(p)) === pages[i]);
  }
  for (let i = pages.length - 2; i >= 0; i--) {
    await p.click(`#${pages[i + 1]} .pager .prev`); await p.waitForTimeout(400);
    check(`Previous button ${pages[i + 1]} -> ${pages[i]}`, (await shown(p)) === pages[i]);
  }
  // arrow keys
  await p.click('.nav .brand'); await p.waitForTimeout(300);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); const r1 = await shown(p);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); const r2 = await shown(p);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300); const l1 = await shown(p);
  check('Arrow keys flip pages', r1 === 'why' && r2 === 'lab' && l1 === 'why', `${r1},${r2},${l1}`);
  await p.click('.nav [data-nav="home"]'); await p.waitForTimeout(300);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300);
  check('Left arrow on Home stays on Home', (await shown(p)) === 'home');
  await p.click('#secret'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  check('Arrow keys ignored while typing', (await shown(p)) === 'home');
  // browser back/forward
  await p.click('.nav [data-nav="results"]'); await p.waitForTimeout(300);
  await p.goBack(); await p.waitForTimeout(500); const bk = await shown(p);
  await p.goForward(); await p.waitForTimeout(500); const fw = await shown(p);
  check('Browser Back and Forward', bk === 'home' && fw === 'results', `${bk},${fw}`);
  // hero CTA
  await p.click('.nav [data-nav="home"]'); await p.waitForTimeout(300);
  await p.click('.hero a[href="#bench"]'); await p.waitForTimeout(600);
  check('Hero "Play" link', (await shown(p)) === 'play');
  // hero secret: button and Enter
  await p.click('.nav [data-nav="home"]'); await p.waitForTimeout(300);
  await p.fill('#secret', 'HI'); await p.click('#secretForm button'); await p.waitForTimeout(9000);
  const w1 = await txt(p, '#wireText');
  check('Hero "Send it" button decodes the secret', w1.startsWith('HI'), `decoded "${w1}"`);
  await p.fill('#secret', 'OK'); await p.press('#secret', 'Enter'); await p.waitForTimeout(9000);
  const w2 = await txt(p, '#wireText');
  check('Hero secret also sends on Enter', w2.startsWith('OK'), `decoded "${w2}"`);
  
  // Play page controls
  await p.click('.nav [data-nav="play"]'); await p.waitForTimeout(500);
  const before = await html(p, '#verdicts');
  for (const g of ['0.9', '0.95', '0.98', '0.75']) {
    const prev = await txt(p, '#challenge');
    await p.click(`button[data-g0="${g}"]`); await p.waitForTimeout(400);
    const pressed = await p.evaluate((g) => document.querySelector(`button[data-g0="${g}"]`).getAttribute('aria-pressed'), g);
    const others = await p.evaluate((g) => [...document.querySelectorAll('button[data-g0]')].filter(x => x.dataset.g0 !== g && x.getAttribute('aria-pressed') === 'true').length, g);
    check(`Gap preset ${g}`, pressed === 'true' && others === 0, (await txt(p, '#challenge')).slice(0, 70));
  }
  const setRange = (id, v) => p.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
  let v0 = await html(p, '#verdicts');
  await setRange('jitter', 60); await p.waitForTimeout(500);
  check('Jitter slider', (await txt(p, '#jitterOut')).includes('60') && (await html(p, '#verdicts')) !== v0, await txt(p, '#jitterOut'));
  v0 = await html(p, '#seqChart');
  await setRange('loss', 5); await p.waitForTimeout(500);
  check('Packet loss slider', (await txt(p, '#lossOut')).includes('5') && (await html(p, '#seqChart')) !== v0, await txt(p, '#lossOut'));
  v0 = await html(p, '#verdicts');
  await p.selectOption('#win', { index: 0 }); await p.waitForTimeout(500);
  check('Window size dropdown', (await html(p, '#verdicts')) !== v0, await p.evaluate(() => document.getElementById('win').value));
  v0 = await html(p, '#verdicts');
  await setRange('stdtol', 30); await p.waitForTimeout(500);
  check('Fixed-rule tolerance slider', (await txt(p, '#stdtolOut')).length > 0 && (await html(p, '#verdicts')) !== v0, await txt(p, '#stdtolOut'));
  v0 = await html(p, '#seqChart');
  await p.click('#rerun'); await p.waitForTimeout(500);
  check('Rerun button', (await html(p, '#seqChart')) !== v0);
  const bits0 = await txt(p, '#msgBits');
  await p.fill('#msg', 'ABCD'); await p.waitForTimeout(500);
  check('Hidden message box', (await txt(p, '#msgBits')) !== bits0, `${bits0} -> ${await txt(p, '#msgBits')}`);

  // Results page
  await p.click('.nav [data-nav="results"]'); await p.waitForTimeout(500);
  const tabs = await p.$$('#studyTabs button');
  let tabsOk = tabs.length > 1;
  for (const t of tabs) { const c0 = await html(p, '#drChart'); await t.click(); await p.waitForTimeout(300); const pr = await t.getAttribute('aria-pressed'); if (pr !== 'true') tabsOk = false; }
  const c1 = await html(p, '#drChart'); await tabs[0].click(); await p.waitForTimeout(300);
  check('Results channel tabs', tabsOk && (await html(p, '#drChart')) !== c1, `${tabs.length} tabs`);
  await p.click('#findings details summary'); await p.waitForTimeout(300);
  check('"Full results table" opens', await p.evaluate(() => document.querySelector('#findings details').open && document.querySelector('#studyTable').offsetHeight > 0));
  // external links
  const ext = await p.evaluate(() => [...document.querySelectorAll('a[href^="http"]')].map(a => [a.textContent.trim(), a.href, a.target]));
  check('Source links point to the GitHub repo in a new tab', ext.length > 0 && ext.every(([, h, t]) => h.includes('github.com/AarushShetty346/icmp_traffic_analysis') && t === '_blank'), ext.map(e => e[0]).join(' | '));
  // every in-page link resolves
  const dead = await p.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href').slice(1)).filter(id => !document.getElementById(id)));
  check('Every in-page link has a target', dead.length === 0, dead.join(','));
  await p.close();

  // deep links
  for (const [h, want] of [['#bench', 'play'], ['#results', 'results'], ['#testbed', 'lab'], ['#nope', 'home']]) {
    const q = await open({ width: 1280, height: 800 }, h);
    check(`Opening the link with ${h}`, (await shown(q)) === want, await shown(q)); await q.close();
  }
  // phone
  const m = await open({ width: 390, height: 844 });
  let phoneOk = true;
  for (const id of pages) { await m.click(`.nav [data-nav="${id}"]`); await m.waitForTimeout(350); if ((await shown(m)) !== id) phoneOk = false; }
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  check('Phone: every tab works, no sideways scroll', phoneOk && sw === 390, `scrollWidth=${sw}`);
  await m.click('.nav [data-nav="play"]'); await m.waitForTimeout(300);
  await m.click('button[data-g0="0.98"]'); await m.waitForTimeout(400);
  check('Phone: gap preset tap', (await m.getAttribute('button[data-g0="0.98"]', 'aria-pressed')) === 'true');
  await m.close();

  // speed: a fresh load, then how long the Play simulator takes to rerun after a slider move
  const t = await open({ width: 1440, height: 900 });
  const perf = await t.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return { dom_ready_ms: nav.domContentLoadedEventEnd, load_ms: nav.loadEventEnd, fcp_ms: fcp ? fcp.startTime : NaN };
  });
  await t.click('.nav [data-nav="play"]'); await t.waitForTimeout(400);
  const play_update_ms = await t.evaluate(() => {
    const e = document.getElementById('jitter'), times = [];
    for (let i = 0; i < 15; i++) {
      e.value = (i % 2) ? 40 : 60;
      const t0 = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b); return times[7];
  });
  await t.close();
  await b.close();
  check('No script errors anywhere', errors.length === 0, [...new Set(errors)].join(' / '));
  for (const r of results) console.log(r.join(' | '));
  const passed = results.filter(r => r[0] === 'PASS').length;
  console.log(passed + '/' + results.length + ' passed');
  const html_kb = fs.statSync(path.resolve(PAGE)).size / 1024;
  fs.writeFileSync(OUT, JSON.stringify({ viewport: '1440x900', html_kb, ...perf, play_update_ms, checks: results.length, checks_passed: passed, results }, null, 1));
  process.exit(passed === results.length ? 0 : 1);
})();

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ headless: true, executablePath });
const out = path.resolve('../docs-v2/screens');
fs.mkdirSync(out, { recursive: true });
for (const [width, height, name] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  for (const [step, label] of [[0, 'intro'], [1, 'detective'], [2, 'guardian'], [3, 'encryption'], [4, 'close']]) {
    await page.goto(`http://127.0.0.1:5174/#/case${step ? `?step=${step}` : ''}`);
    await page.locator('main h1').first().waitFor();
    await page.waitForTimeout(800);
    if (step === 3) {
      await page.getByRole('button', { name: /Lock this note/ }).click();
      await page.locator('.crypto-success').waitFor();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(out, `${name}-${label}.png`), fullPage: true });
  }
  await page.goto('http://127.0.0.1:5174/#/lab');
  await page.locator('main h1').first().waitFor();
  await page.screenshot({ path: path.join(out, `${name}-lab.png`), fullPage: true });
  for (const route of ['guide', 'evidence']) {
    await page.goto(`http://127.0.0.1:5174/#/${route}`);
    await page.locator('main h1').first().waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${name}-${route}.png`), fullPage: true });
  }
  await page.close();
}
await browser.close();

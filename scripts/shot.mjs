// Screenshot helper: node scripts/shot.mjs <url> <out.png> [width] [height]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const [url = 'http://localhost:5173/', out = 'shot.png', w = '1400', h = '900'] = process.argv.slice(2);
const candidates = [
  process.env.BROWSER_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter((p) => p && existsSync(p));
const executablePath = candidates[0];
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-first-run', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
if (process.env.SHOT_ACTIONS) {
  // eslint-disable-next-line no-new-func
  await new Function('page', `return (async () => { ${process.env.SHOT_ACTIONS} })()`)(page);
}
await page.screenshot({ path: out });
console.log(JSON.stringify({ out, browser: executablePath, errors }));
await browser.close();

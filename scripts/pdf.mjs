// Render an HTML file to PDF with a local Chromium-based browser: node scripts/pdf.mjs <in.html> <out.pdf>
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [input, out = 'out.pdf'] = process.argv.slice(2);
const candidates = [
  process.env.BROWSER_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: candidates[0], headless: true, args: ['--no-first-run', '--disable-gpu'] });
const page = await browser.newPage();
await page.goto('file://' + resolve(input), { waitUntil: 'networkidle' });
await page.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' } });
console.log(JSON.stringify({ out }));
await browser.close();

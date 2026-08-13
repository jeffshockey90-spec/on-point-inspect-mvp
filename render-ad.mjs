import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import path from 'path';
import { pathToFileURL } from 'url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const name = process.argv[2] || 'flow-ad-offline';
const width = Number(process.argv[3] || 1080);
const height = Number(process.argv[4] || 1080);

const src = path.resolve(`public/marketing/${name}.html`);
const out = path.resolve(`public/marketing/${name}.png`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--allow-file-access-from-files', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
const buf = await page.screenshot({ type: 'png' });
await browser.close();

await sharp(buf).resize(width, height).png().toFile(out);
console.log('WROTE', out);

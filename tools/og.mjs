/*
 * Рисует картинку для превью ссылки — ту, что видно, когда её кидают в чат.
 *
 * Без неё мессенджер показывает голый заголовок, и ссылка выглядит как спам.
 * Рисуется браузером и кладётся в репозиторий готовой: пересобирать её на
 * каждый деплой незачем, меняется она раз в год.
 *
 *     node tools/og.mjs
 */
import { chromium } from '/usr/local/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SITE = path.join(ROOT, 'site');

const seo = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo.json'), 'utf8'));
const STRINGS = new Function(
  fs.readFileSync(path.join(SITE, 'i18n.js'), 'utf8') + '\nreturn STRINGS;')();

// Заголовок из переводов — в нём после тире идёт пояснение, которое на картинке
// только мешает: место есть под имя и одну фразу.
const nameOf = (lang) => STRINGS[lang].h1;
const lineOf = (lang) => STRINGS[lang].lede.split(/(?<=[.:])\s/)[0];

function card(lang) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing:border-box; margin:0; }
    body { width:1200px; height:630px; background:#f6f7f9; color:#15181d;
      font:400 34px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      display:flex; flex-direction:column; justify-content:space-between;
      padding:76px 84px; -webkit-font-smoothing:antialiased; }
    .mark { width:96px; height:96px; border-radius:22px; background:${seo.color};
      color:#fff; font-size:56px; font-weight:700; display:flex;
      align-items:center; justify-content:center; }
    h1 { font-size:106px; letter-spacing:-3px; font-weight:700; margin:34px 0 18px; }
    p { color:#4a525f; max-width:22ch; font-size:38px; line-height:1.35; }
    .foot { display:flex; justify-content:space-between; align-items:baseline;
      color:#8b93a1; font-size:27px; }
    .foot b { color:#15181d; font-weight:600; }
  </style></head><body>
    <div>
      <div class="mark">${seo.glyph}</div>
      <h1>${nameOf(lang)}</h1>
      <p>${lineOf(lang)}</p>
    </div>
    <div class="foot"><b>${seo.host}</b><span>${
      lang === 'ru' ? 'ничего не уходит на сервер' : 'nothing leaves your browser'}</span></div>
  </body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

for (const [lang, file] of [['en', 'og.png'], ['ru', 'og-ru.png']]) {
  await page.setContent(card(lang));
  await page.screenshot({ path: path.join(SITE, file) });
  const size = fs.statSync(path.join(SITE, file)).size;
  console.log(`  ${file}: ${Math.round(size / 1024)} КБ — ${nameOf(lang)}`);
}

// Значки для установки на телефон. Растровые и с полем по краям: система
// обрезает значок под свою форму — круг, скруглённый квадрат, каплю, — и без
// поля буква оказывается срезанной.
//
// Каждый размер рисуется своей страницей. Менять только окно нельзя: тело
// остаётся прежней ширины, и уменьшённый снимок не сжимает картинку, а
// обрезает её — первый заход дал ровный цветной квадрат без буквы.
const iconPage = await browser.newPage();
for (const size of [192, 512]) {
  await iconPage.setViewportSize({ width: size, height: size });
  await iconPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; box-sizing:border-box; }
    body { width:${size}px; height:${size}px; background:${seo.color}; display:flex;
      align-items:center; justify-content:center; }
    span { color:#fff; font:700 ${Math.round(size * 0.49)}px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      transform:translateY(-${Math.round(size * 0.015)}px); }
  </style></head><body><span>${seo.glyph}</span></body></html>`);
  const file = path.join(SITE, `icon-${size}.png`);
  await iconPage.screenshot({ path: file });
  const bytes = fs.readFileSync(file);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width !== size || height !== size) throw new Error(`значок ${size} вышел ${width}×${height}`);
  console.log(`  icon-${size}.png: ${width}×${height}, ${Math.round(bytes.length / 1024)} КБ`);
}

await browser.close();

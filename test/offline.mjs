/*
 * Проверяет то, ради чего вообще ставился обработчик: страница обязана
 * открыться при выключенной сети.
 *
 * Проверить это иначе нельзя. Манифест на месте, значки нужного размера и
 * обработчик без синтаксических ошибок — всё это ничего не говорит о том,
 * откроется ли страница в самолёте. Поэтому здесь браузеру честно рубят сеть.
 */
import { chromium } from '/usr/local/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');
const PORT = 8810;
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`;

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures++;
};

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png'
};
const server = http.createServer((request, response) => {
  // Маячок /_used: на сервере на него отвечает Caddy кодом 204. Без этого
  // статический сервер теста отдавал 404, браузер писал это в консоль, и
  // проверка «в консоли чисто» падала на самом маячке.
  if (request.url === '/_used') { response.writeHead(204); response.end(); return; }
  let asked = request.url.split('?')[0];
  if (asked.endsWith('/')) asked += 'index.html';
  const file = path.join(DIST, asked);
  if (!file.startsWith(DIST) || !fs.existsSync(file)) { response.writeHead(404); return response.end(); }
  response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
if (!process.env.BASE) await new Promise(resolve => server.listen(PORT, resolve));

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

console.log('проверяем ' + BASE);
await page.goto(BASE);

// Ждём, пока обработчик не просто зарегистрируется, а возьмёт страницу под
// себя: до этого момента выключать сеть рано, и проверка соврала бы.
const ready = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'браузер не умеет';
  const registration = await navigator.serviceWorker.ready;
  await new Promise(resolve => setTimeout(resolve, 400));
  return registration.active ? 'активен' : 'не активировался';
});
check('обработчик встал и работает', ready === 'активен', ready);

const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  if (!names.length) return [];
  const shelf = await caches.open(names[0]);
  return (await shelf.keys()).map(request => new URL(request.url).pathname);
});
check('в запас попали обе языковые страницы',
  cached.includes('/') && cached.includes('/ru/'), cached.join(', '));

/* --- собственно самолёт ------------------------------------------------------ */
await context.setOffline(true);

const reload = await page.reload().catch(error => ({ error }));
check('страница открылась без сети', !reload.error, reload.error && reload.error.message);

// Проверяем по разметке, а не по словам. Первая версия искала в тексте слово
// «offline» как признак страницы обрыва — и падала на shrink, где это слово
// стоит в честной фразе «works offline, nothing is uploaded».
const shown = await page.evaluate(() => ({
  length: document.body.innerText.replace(/\s+/g, ' ').trim().length,
  heading: (document.querySelector('h1') || {}).textContent || '',
  controls: document.querySelectorAll('button').length
}));
check('и на ней есть содержимое, а не страница обрыва',
  shown.length > 300 && shown.heading.length > 0 && shown.controls >= 3,
  `${shown.length} знаков, заголовок «${shown.heading}», кнопок ${shown.controls}`);

const working = await page.evaluate(() => {
  // Проверяем, что доехал не только текст, но и логика: без скриптов страница
  // была бы красивой картинкой и ничего бы не делала.
  const button = document.querySelector('button');
  return {
    scripts: typeof window.STRINGS === 'object',
    interactive: !!button && !!button.onclick || document.querySelectorAll('button').length > 2
  };
});
check('скрипты тоже взялись из запаса', working.scripts, JSON.stringify(working));

const ruOffline = await page.goto(BASE.replace(/\/$/, '') + '/ru/').catch(error => ({ error }));
check('русская страница тоже открывается без сети', !ruOffline.error,
  ruOffline.error && ruOffline.error.message);
const ruText = await page.evaluate(() => document.body.innerText);
check('и она действительно русская', /[а-яё]/i.test(ruText), ruText.slice(0, 40));

await context.setOffline(false);
await browser.close();
server.close();
console.log(failures ? `\n${failures} проверок упало` : '\nвсё сошлось');
process.exit(failures ? 1 : 0);

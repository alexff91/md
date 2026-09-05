/*
 * Печёт из шаблона две настоящие страницы — английскую и русскую.
 *
 * Зачем вообще сборка там, где всё остальное — статика без единого шага.
 * Текст на этих страницах подставлял JS из объекта переводов, и краулеру, а
 * главное — превьюшнику ссылок в телеграме или линкедине, доставалось около
 * восьмидесяти знаков: заголовок и «EN RU». Кинутая в чат ссылка выглядела
 * пустой. Googlebot JS выполняет, остальные — как придётся.
 *
 * Поэтому текст запекается в HTML на этапе сборки, а JS остаётся только для
 * переключения на лету. Заодно у каждого языка появляется свой адрес: две
 * страницы на одном URL поисковику не объяснить.
 *
 *     node tools/build.mjs        # site/ + seo.json -> dist/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SITE = path.join(ROOT, 'site');
const DIST = path.join(ROOT, 'dist');

const seo = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo.json'), 'utf8'));
const origin = 'https://' + seo.host;

// Переводы берём из того же файла, который грузит страница: второй список
// строк разъехался бы с первым на первой же правке.
const sandbox = {};
new Function('globalThis', fs.readFileSync(path.join(SITE, 'i18n.js'), 'utf8') +
  '\nglobalThis.__strings = STRINGS;')(sandbox);
const STRINGS = sandbox.__strings || (new Function(
  fs.readFileSync(path.join(SITE, 'i18n.js'), 'utf8') + '\nreturn STRINGS;'))();

// Соседи по хозяйству. Список одинаков во всех четырёх сборках намеренно:
// вынести его в общий пакет — значит завести зависимость между репозиториями
// ради двенадцати строк, которые меняются раз в квартал.
//
// Он нужен, потому что до сих пор инструменты друг о друге не знали: за неделю
// с витрины пришло тринадцать переходов на все четыре вместе, то есть человек,
// нашедший один, второй не находил.
const FAMILY = [
  { host: 'shrink.alftech.space', en: 'Shrink', ru: 'Ужать',
    hintEn: 'photos and video, smaller', hintRu: 'уменьшить фото и видео' },
  { host: 'qr.alftech.space', en: 'QR', ru: 'QR',
    hintEn: 'links, Wi-Fi, contacts', hintRu: 'ссылки, Wi-Fi, визитки' },
  { host: 'traces.alftech.space', en: 'Traces', ru: 'Следы',
    hintEn: 'what a file reveals', hintRu: 'что выдаёт ваш файл' },
  { host: 'cut.alftech.space', en: 'Cut', ru: 'Кусок',
    hintEn: 'trim video, make a GIF', hintRu: 'обрезать видео, сделать GIF' },
  { host: 'pdf.alftech.space', en: 'PDF', ru: 'PDF',
    hintEn: 'merge, split, rotate', hintRu: 'склеить, разбить, повернуть' },
  { host: 'convert.alftech.space', en: 'Convert', ru: 'Конвертер',
    hintEn: 'HEIC to JPG, resize, WebP', hintRu: 'HEIC в JPG, уменьшить, WebP' }
];

function family(lang) {
  const others = FAMILY.filter(tool => tool.host !== seo.host);
  const title = lang === 'ru' ? 'Рядом, из того же теста' : 'Next door, same idea';
  const tail = lang === 'ru'
    ? 'Всё считает браузер, ни один файл не уходит на сервер.'
    : 'All of it runs in the browser; no file is uploaded.';
  return `<nav class="family" aria-label="${title}">
  <h2>${title}</h2>
  <ul>` + others.map(tool => `
    <li><a href="https://${tool.host}/${lang === 'ru' ? 'ru/' : ''}">
      <b>${lang === 'ru' ? tool.ru : tool.en}</b>
      <span>${lang === 'ru' ? tool.hintRu : tool.hintEn}</span>
    </a></li>`).join('') + `
  </ul>
  <p>${tail}</p>
</nav>`;
}

const FAMILY_CSS = `
  .family { border-top:1px solid var(--line); margin-top:30px; padding-top:18px; }
  .family h2 { font-size:13px; text-transform:uppercase; letter-spacing:.05em;
    color:var(--soft); margin:0 0 12px; font-weight:600; }
  .family ul { list-style:none; margin:0; padding:0; display:grid; gap:10px;
    grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); }
  .family a { display:block; padding:12px 14px; border:1px solid var(--line);
    border-radius:10px; background:var(--card); text-decoration:none; color:var(--ink); }
  .family a:hover { border-color:var(--accent); }
  .family b { display:block; font-size:15px; }
  .family span { color:var(--soft); font-size:13.5px; }
  .family p { color:var(--soft); font-size:13px; margin:12px 0 0; }
`;

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Маячок «инструментом воспользовались»: один GET /_used в момент, когда
// человек забрал результат. Жил только на сервере с 1 сентября 2026 —
// следующая выкладка стёрла бы его. Теперь он часть сборки.
const BEACON = String.raw`<script>
/* Маячок «инструментом воспользовались». Открытая страница — ещё не польза:
   считается момент, когда человек забрал результат — скопировал его или
   скачал файл. Один GET /_used за сессию, в обычный лог доступа; никаких
   кук, никаких внешних сервисов, ничего о самом результате. */
(function () {
  var sent = false;
  window.markToolUsed = function () {
    if (sent) return;
    sent = true;
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon('/_used'))) {
        fetch('/_used', { keepalive: true });
      }
    } catch (error) { /* счётчик не важнее инструмента */ }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      var write = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = function (text) {
        window.markToolUsed();
        return write(text);
      };
    }
  } catch (error) { /* нет клипборда — останутся скачивания */ }
  document.addEventListener('click', function (event) {
    var node = event.target;
    while (node && node.tagName) {
      if (node.tagName === 'A' && node.hasAttribute('download')) {
        window.markToolUsed();
        break;
      }
      node = node.parentNode;
    }
  }, true);
})();
</script>`;

function head(lang) {
  const strings = STRINGS[lang];
  const url = lang === 'ru' ? origin + '/ru/' : origin + '/';
  const image = origin + (lang === 'ru' ? '/og-ru.png' : '/og.png');

  // JSON-LD: как раз тот случай, когда сказать поисковику прямым текстом
  // «это бесплатное веб-приложение такой-то категории» дешевле, чем надеяться,
  // что он догадается сам.
  const linked = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: strings.h1,
    url,
    description: strings.docDescription,
    applicationCategory: seo.category,
    operatingSystem: 'Any browser',
    browserRequirements: 'Requires JavaScript',
    inLanguage: lang === 'ru' ? 'ru' : 'en',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    featureList: seo.features[lang],
    author: { '@type': 'Person', name: 'Aleksandr Fedorov' }
  };

  return [
    `<title>${escapeHtml(strings.docTitle)}</title>`,
    `<meta name="description" id="metaDescription" content="${escapeHtml(strings.docDescription)}">`,
    `<link rel="canonical" href="${url}">`,
    `<link rel="alternate" hreflang="en" href="${origin}/">`,
    `<link rel="alternate" hreflang="ru" href="${origin}/ru/">`,
    `<link rel="alternate" hreflang="x-default" href="${origin}/">`,
    `<link rel="icon" href="/icon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="/icon-192.png">`,
    `<link rel="manifest" href="/manifest.webmanifest">`,
    `<meta name="theme-color" content="${seo.color}">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-title" content="${escapeHtml(strings.h1)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="alftech">`,
    `<meta property="og:title" content="${escapeHtml(strings.docTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(strings.docDescription)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:locale" content="${lang === 'ru' ? 'ru_RU' : 'en_US'}">`,
    `<meta property="og:locale:alternate" content="${lang === 'ru' ? 'en_US' : 'ru_RU'}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(strings.docTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(strings.docDescription)}">`,
    `<meta name="twitter:image" content="${image}">`,
    BEACON,
    `<script type="application/ld+json">${JSON.stringify(linked)}</script>`
  ].join('\n');
}

function render(template, lang) {
  const strings = STRINGS[lang];
  let html = template;

  html = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);

  // Всё, что стояло в шапке от руки, заменяем целиком: заголовок, описание и
  // прочее теперь считается из переводов, и держать два источника нельзя.
  html = html.replace(/<title>[\s\S]*?<\/title>\s*/, '');
  html = html.replace(/<meta name="description"[^>]*>\s*/, '');
  html = html.replace(/<meta name="robots"[^>]*>\s*/, '');
  html = html.replace('</head>', head(lang) + '\n</head>');

  // Текст в разметку, а не в JS: ради этого всё и затевалось.
  html = html.replace(/(<([a-z0-9]+)([^>]*?)data-i18n="([\w]+)"([^>]*?)>)([\s\S]*?)(<\/\2>)/g,
    (whole, open, tag, before, key, after, inner, close) => {
      const value = strings[key];
      if (value === undefined) return whole;
      return open + escapeHtml(value) + close;
    });

  // На русской странице ссылки на ассеты должны вести в корень, а не в /ru/.
  if (lang === 'ru') {
    html = html.replace(/(<script src=")([^/][^"]*)(")/g, '$1/$2$3');
  }

  // Подвал с соседями и его стиль — в конец разметки и в конец стилей, чтобы
  // не трогать шаблон каждого инструмента отдельно.
  // Ссылка на канал — внутри подвала, перед соседями. Текст по языку страницы.
  const channel = lang === 'ru'
    ? 'Новые инструменты и что в них поменялось: '
    : 'New tools and what changed in them: ';
  html = html.replace('</footer>',
    '    <p>' + channel + '<a href="https://t.me/alftechnologies" target="_blank" rel="noopener">@alftechnologies</a>.</p>\n  </footer>');
  html = html.replace('</footer>', '</footer>\n  ' + family(lang));
  html = html.replace('</style>', FAMILY_CSS + '</style>');

  // Регистрация обработчика для работы без сети. Отдельным файлом её делать
  // незачем: четыре строки, и они должны выполниться до всего остального.
  html = html.replace('</body>',
    '<script>if("serviceWorker"in navigator)' +
    'addEventListener("load",function(){navigator.serviceWorker.register("/sw.js")' +
    '.catch(function(){})})</script>\n</body>');

  html = html.replace(/aria-pressed="(true|false)"/g, (whole, value) => whole);
  html = html.replace(/id="langEn" data-lang="en" aria-pressed="[^"]*"/,
    `id="langEn" data-lang="en" aria-pressed="${lang === 'en'}"`);
  html = html.replace(/id="langRu" data-lang="ru" aria-pressed="[^"]*"/,
    `id="langRu" data-lang="ru" aria-pressed="${lang === 'ru'}"`);

  return html;
}

/* ---------------------------------------------------------------- сборка */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'ru'), { recursive: true });

const template = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
fs.writeFileSync(path.join(DIST, 'index.html'), render(template, 'en'));
fs.writeFileSync(path.join(DIST, 'ru', 'index.html'), render(template, 'ru'));

for (const name of fs.readdirSync(SITE)) {
  if (name === 'index.html') continue;
  fs.copyFileSync(path.join(SITE, name), path.join(DIST, name));
}

// Значок вкладки: одна буква на цветном квадрате. Векторный, потому что в
// тёмной теме браузера растровый значок выглядит грязным пятном.
fs.writeFileSync(path.join(DIST, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
  `<rect width="64" height="64" rx="14" fill="${seo.color}"/>` +
  `<text x="32" y="45" font-family="-apple-system,Segoe UI,Roboto,Arial" font-size="38" ` +
  `font-weight="700" fill="#fff" text-anchor="middle">${seo.glyph}</text></svg>`);

// Манифест: без него браузер не предложит «установить», и обещание «работает
// без интернета» остаётся тем, чем нельзя воспользоваться.
fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: STRINGS.en.docTitle,
  short_name: STRINGS.en.h1,
  description: STRINGS.en.docDescription,
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#f6f7f9',
  theme_color: seo.color,
  lang: 'en',
  categories: ['utilities', 'productivity'],
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2));

// Обработчик для работы без сети.
//
// Разметка берётся из сети и только при отказе — из запаса: иначе после каждой
// выкладки человек ещё сутки видел бы вчерашнюю страницу. Скрипты и картинки,
// наоборот, отдаются сразу из запаса и обновляются в фоне — они меняются
// вместе с именем запаса, а имя привязано к дате сборки.
const shelf = 'v-' + seo.updated + '-' + STRINGS.en.h1.toLowerCase();

// Список складывается из того, что реально уехало в dist, а не из памяти.
//
// Это оказалось не мелочью. Сначала в запас клались только две страницы, а
// скрипты предполагалось поймать по дороге — но при первой загрузке обработчик
// ещё не управляет страницей, и все её запросы проходят мимо него. Наружу это
// выглядело так: без сети страница открывается и даже читается, а не работает
// ничего. Поймал только тест, который честно рубит сеть.
const shellFiles = ['/', '/ru/'].concat(
  fs.readdirSync(DIST)
    .filter(name => /\.(js|svg|webmanifest)$/.test(name) && name !== 'sw.js')
    .map(name => '/' + name));
fs.writeFileSync(path.join(DIST, 'sw.js'), `'use strict';
var SHELF = ${JSON.stringify(shelf)};
var SHELL = ${JSON.stringify(shellFiles)};

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(SHELF).then(function (shelf) {
    return shelf.addAll(SHELL);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (name) { return name !== SHELF; })
      .map(function (name) { return caches.delete(name); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== location.origin) return;

  var wantsPage = request.mode === 'navigate' ||
    (request.headers.get('accept') || '').indexOf('text/html') >= 0;

  if (wantsPage) {
    event.respondWith(fetch(request).then(function (response) {
      var copy = response.clone();
      caches.open(SHELF).then(function (shelf) { shelf.put(request, copy); });
      return response;
    }).catch(function () {
      return caches.match(request).then(function (hit) {
        return hit || caches.match('/');
      });
    }));
    return;
  }

  event.respondWith(caches.match(request).then(function (hit) {
    var fresh = fetch(request).then(function (response) {
      if (response.ok) {
        var copy = response.clone();
        caches.open(SHELF).then(function (shelf) { shelf.put(request, copy); });
      }
      return response;
    }).catch(function () { return hit; });
    return hit || fresh;
  }));
});
`);

fs.writeFileSync(path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);

const today = seo.updated;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
  `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
  ['/', '/ru/'].map(where => {
    const url = origin + where;
    return `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>monthly</changefreq>\n    <priority>${where === '/' ? '1.0' : '0.9'}</priority>\n` +
      `    <xhtml:link rel="alternate" hreflang="en" href="${origin}/"/>\n` +
      `    <xhtml:link rel="alternate" hreflang="ru" href="${origin}/ru/"/>\n  </url>`;
  }).join('\n') + `\n</urlset>\n`);

const text = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const enText = text(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'));
const ruText = text(fs.readFileSync(path.join(DIST, 'ru', 'index.html'), 'utf8'));
console.log(`собрано в dist/`);
console.log(`  текста без JS: английская ${enText.length}, русская ${ruText.length} знаков`);

/*
 * Проверяет собранные страницы глазами того, кто не выполняет JS: краулера и
 * превьюшника ссылок в мессенджере.
 *
 * Это ровно тот случай, когда «открыл и посмотрел» ничего не доказывает. В
 * браузере страница выглядит полной всегда — текст подставляет скрипт. Поэтому
 * здесь читается сырой HTML, из него вырезаются script и style, и меряется то,
 * что останется.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const seo = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo.json'), 'utf8'));
const origin = 'https://' + seo.host;

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures++;
};

const read = (...parts) => fs.readFileSync(path.join(DIST, ...parts), 'utf8');
const visible = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Порядок атрибутов в теге ничего не значит, и проверка не должна на него
// опираться: описание было на месте, а первая версия этой строки его не видела
// только потому, что между name и content стоял id.
const meta = (html, attr, name) => {
  const tag = (html.match(new RegExp(`<meta [^>]*${attr}="${name}"[^>]*>`)) || [])[0];
  return tag && (tag.match(/content="([^"]*)"/) || [])[1];
};
const link = (html, rel, extra = '') =>
  (html.match(new RegExp(`<link rel="${rel}"${extra} href="([^"]*)"`)) || [])[1];

for (const [lang, where, file] of [['en', '/', 'index.html'], ['ru', '/ru/', path.join('ru', 'index.html')]]) {
  console.log(`\n${lang === 'ru' ? 'русская' : 'английская'} страница`);
  const html = read(file);
  const text = visible(html);
  const url = origin + where;

  check('текст лежит в разметке, а не только в скрипте', text.length > 700,
    text.length + ' знаков');
  check('язык страницы объявлен', new RegExp(`<html lang="${lang}"`).test(html));

  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  check('заголовок на месте и не длиннее шестидесяти знаков',
    title.length > 10 && title.length <= 70, `${title.length}: ${title}`);

  const description = meta(html, 'name', 'description') || '';
  // Гугл обрезает описание примерно на 160 знаках — то, что длиннее, до
  // человека в выдаче просто не доедет.
  check('описание есть и укладывается в выдачу',
    description.length >= 50 && description.length <= 200, `${description.length} знаков`);

  check('canonical указывает на себя', link(html, 'canonical') === url, link(html, 'canonical'));
  check('обе языковые версии связаны',
    link(html, 'alternate', ' hreflang="en"') === origin + '/' &&
    link(html, 'alternate', ' hreflang="ru"') === origin + '/ru/');
  check('есть x-default для тех, у кого язык не совпал',
    link(html, 'alternate', ' hreflang="x-default"') === origin + '/');

  check('og:title и og:description заполнены',
    !!meta(html, 'property', 'og:title') && !!meta(html, 'property', 'og:description'));
  check('og:url совпадает с canonical', meta(html, 'property', 'og:url') === url);

  const image = meta(html, 'property', 'og:image') || '';
  const imageFile = image.replace(origin + '/', '');
  check('картинка превью существует и это она и есть',
    image.startsWith(origin) && fs.existsSync(path.join(DIST, imageFile)),
    image);
  if (fs.existsSync(path.join(DIST, imageFile))) {
    const bytes = fs.readFileSync(path.join(DIST, imageFile));
    // Размер картинки читаем из заголовка PNG, а не из мета-тега: тег может
    // обещать что угодно.
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    check('картинка ровно 1200×630, как обещано в теге',
      width === 1200 && height === 630 &&
      meta(html, 'property', 'og:image:width') === '1200',
      `${width}×${height}`);
    check('картинка не тяжелее полумегабайта', bytes.length < 512 * 1024,
      Math.round(bytes.length / 1024) + ' КБ');
  }
  check('карточка твиттера крупная', meta(html, 'name', 'twitter:card') === 'summary_large_image');

  const raw = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
  let linked = null;
  try { linked = JSON.parse(raw); } catch (error) { /* ниже */ }
  check('разметка для поисковика разбирается как JSON', !!linked);
  if (linked) {
    check('в ней указан тип, адрес и что это бесплатно',
      linked['@type'] === 'WebApplication' && linked.url === url &&
      linked.isAccessibleForFree === true, linked['@type'] + ' ' + linked.url);
    check('перечислено, что умеет', Array.isArray(linked.featureList) && linked.featureList.length >= 3,
      String(linked.featureList && linked.featureList.length));
  }
}

console.log('\nслужебные файлы');
const robots = read('robots.txt');
check('robots.txt — это robots.txt, а не страница', robots.startsWith('User-agent:'),
  robots.split('\n')[0]);
check('в нём указан sitemap', robots.includes(origin + '/sitemap.xml'));

const sitemap = read('sitemap.xml');
check('sitemap начинается с объявления xml', sitemap.startsWith('<?xml'));
check('в sitemap обе страницы',
  sitemap.includes('<loc>' + origin + '/</loc>') && sitemap.includes('<loc>' + origin + '/ru/</loc>'));
check('в sitemap проставлены языковые связи', (sitemap.match(/xhtml:link/g) || []).length === 4);

check('значок вкладки на месте', fs.existsSync(path.join(DIST, 'icon.svg')));

// Русский текст должен быть действительно русским: подставить английский в
// русскую страницу — самая незаметная из возможных ошибок здесь.
const ru = visible(read('ru', 'index.html'));
const cyrillic = (ru.match(/[а-яё]/gi) || []).length;
check('на русской странице действительно кириллица',
  cyrillic > ru.length * 0.3, `${cyrillic} букв из ${ru.length}`);

console.log('\nсоседи и установка на телефон');

const FAMILY_HOSTS = ['shrink.alftech.space', 'qr.alftech.space',
                      'traces.alftech.space', 'cut.alftech.space'];

for (const [lang, file] of [['en', 'index.html'], ['ru', path.join('ru', 'index.html')]]) {
  const html = read(file);
  // Ищем только внутри самого подвала: свой адрес встречается ещё и в
  // canonical, og:url и sitemap, и поиск по всей странице находил четыре
  // хоста вместо трёх — ошибка была в проверке, а не в сборке.
  const nav = (html.match(/<nav class="family"[\s\S]*?<\/nav>/) || [''])[0];
  check(`${lang}: подвал с соседями на странице есть`, nav.length > 100, nav.length + ' знаков');
  const links = FAMILY_HOSTS.filter(host => nav.includes('https://' + host + '/'));
  check(`${lang}: ведёт не меньше чем на три соседних инструмента и не на себя`,
    links.length >= 3 && !links.includes(seo.host), links.join(', '));
  // Русская страница обязана звать соседей на их русские адреса, иначе человек
  // проваливается на английскую версию соседа.
  if (lang === 'ru') {
    const ruLinks = FAMILY_HOSTS.filter(host => nav.includes('https://' + host + '/ru/'));
    check('ru: ссылки ведут на русские страницы соседей', ruLinks.length >= 3, ruLinks.join(', '));
  }
  check(`${lang}: манифест подключён`, html.includes('rel="manifest"'));
  check(`${lang}: цвет темы объявлен`, html.includes('name="theme-color"'));
  check(`${lang}: обработчик офлайна регистрируется`, html.includes('serviceWorker.register'));
}

const manifest = JSON.parse(read('manifest.webmanifest'));
check('манифест разбирается и объявляет отдельное окно',
  manifest.display === 'standalone' && manifest.start_url === '/', manifest.display);
check('в манифесте есть имя и описание', !!manifest.name && !!manifest.description);
check('значок под маску объявлен',
  manifest.icons.some(icon => icon.purpose === 'maskable'));

for (const icon of manifest.icons) {
  const file = icon.src.replace(/^\//, '');
  const full = path.join(DIST, file);
  if (!fs.existsSync(full)) { check('значок ' + file + ' существует', false); continue; }
  const bytes = fs.readFileSync(full);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const promised = Number(icon.sizes.split('x')[0]);
  // Размер читаем из заголовка PNG: первый заход отдал ровный цветной квадрат
  // нужного веса, и по манифесту это было не видно.
  check(`значок ${file} действительно ${icon.sizes}`,
    width === promised && height === promised, `${width}×${height}`);
  // Пустой значок — это несколько сотен байт: у одноцветного PNG нечего сжимать.
  check(`значок ${file} не пустой`, bytes.length > 700, Math.round(bytes.length) + ' Б');
}

const worker = read('sw.js');
let workerOk = true;
try { new Function(worker); } catch (error) { workerOk = false; }
check('обработчик офлайна — синтаксически целый JS', workerOk);
check('он берёт разметку из сети, а запас держит про запас',
  worker.includes("wantsPage") && worker.includes('caches.match'), '');
check('имя запаса привязано к дате сборки, иначе старое не вычистится',
  worker.includes(seo.updated), '');
// Разбираем список, а не ищем подстроку: он собирается сборкой, и его формат
// уже один раз поменялся — проверка по тексту сломалась, хотя список верный.
const shell = JSON.parse((worker.match(/var SHELL = (\[[^;]*\]);/) || [null, '[]'])[1]);
check('обе языковые страницы попадают в запас',
  shell.includes('/') && shell.includes('/ru/'), shell.join(' '));
check('скрипты страницы тоже кладутся в запас заранее',
  shell.filter(name => name.endsWith('.js')).length >= 2, shell.join(' '));

console.log(failures ? `\n${failures} проверок упало` : '\nвсё сошлось');
process.exit(failures ? 1 : 0);

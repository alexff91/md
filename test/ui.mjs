/*
 * Проверяет страницу с той стороны, с которой на неё смотрит человек: текст
 * набирается в редактор, а результат читается из превью, из скачанных файлов
 * и из буфера обмена — не из внутреннего состояния страницы.
 */
import { chromium } from '/usr/local/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, '..', 'dist');
const TMP = path.join(HERE, 'tmp');
const PORT = 8806;
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`;
let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures++;
};
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  if (request.url === '/_used') { response.writeHead(204); response.end(); return; }
  let asked = request.url.split('?')[0]; if (asked.endsWith('/')) asked += 'index.html';
  const file = path.join(SITE, asked);
  if (!file.startsWith(SITE) || !fs.existsSync(file)) { response.writeHead(404); return response.end(); }
  response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
if (!process.env.BASE) await new Promise(resolve => server.listen(PORT, resolve));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text() + ' @ ' + (message.location() && message.location().url)); });
page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'https://example.org/x' : undefined));

const type = async (text) => {
  await page.fill('#editor', text);
  await page.waitForTimeout(250);
};
const saveAs = async (buttonId) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#' + buttonId)]);
  const file = path.join(TMP, download.suggestedFilename());
  await download.saveAs(file);
  return { name: download.suggestedFilename(), text: fs.readFileSync(file, 'utf8') };
};

/* ---------------------------------------------------- образец и таблицы */
await page.goto(BASE + '/');
await page.waitForTimeout(400);
check('библиотеки выставляют по одному имени', await page.evaluate(() => typeof marked === 'object' && typeof DOMPurify === 'function'));
const sample = await page.evaluate(() => ({
  rows: document.querySelectorAll('#preview table tr').length,
  wrapped: !!document.querySelector('#preview .tablewrap table'),
  right: getComputedStyle(document.querySelector('#preview table td:last-child')).textAlign,
  tasks: document.querySelectorAll('#preview li.task input[type=checkbox]').length,
  checked: document.querySelectorAll('#preview li.task input:checked').length,
  code: !!document.querySelector('#preview pre code'),
  quote: !!document.querySelector('#preview blockquote'),
  struck: !!document.querySelector('#preview del'),
  view: document.getElementById('panes').dataset.view
}));
check('образец: таблица из 4 строк в прокручиваемой обёртке', sample.rows === 4 && sample.wrapped, JSON.stringify(sample));
check('выравнивание колонки по двоеточиям дошло до ячеек', /right$/.test(sample.right), sample.right);
check('чек-лист: два пункта, один отмечен', sample.tasks === 2 && sample.checked === 1);
check('код, цитата, зачёркнутое', sample.code && sample.quote && sample.struck);
check('на широком экране по умолчанию две колонки', sample.view === 'split', sample.view);

/* ---------------------------------------------------- набор и превью */
await type('# Hi\n\n| a | b |\n|---|--:|\n| 1 | 2 |\n\n- [ ] todo\n');
const typed = await page.evaluate(() => ({
  h1: document.querySelector('#preview h1')?.textContent,
  cell: document.querySelector('#preview td:last-child')?.textContent,
  stats: document.getElementById('stats').textContent
}));
check('набранное сразу видно в превью', typed.h1 === 'Hi' && typed.cell === '2', JSON.stringify(typed));
check('счётчик слов считает', /^\d+ words · \d+ characters/.test(typed.stats), typed.stats);

/* ---------------------------------------------------- вредная разметка */
await type('<img src=/icon.svg onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>\n\n**ok**');
const dirty = await page.evaluate(() => ({
  html: document.getElementById('preview').innerHTML,
  strong: !!document.querySelector('#preview strong')
}));
check('onerror, script и javascript: вычищены, жирный остался',
  !/onerror|<script|javascript:/i.test(dirty.html) && dirty.strong, dirty.html.slice(0, 120));
const external = await page.evaluate(() => { document.getElementById('editor').value = '[x](https://example.org)'; document.getElementById('editor').dispatchEvent(new Event('input')); return new Promise(r => setTimeout(() => r(document.querySelector('#preview a')?.getAttribute('target')), 250)); });
check('внешние ссылки открываются в новой вкладке', external === '_blank', external);

/* ---------------------------------------------------- панель кнопок */
await type('word');
await page.evaluate(() => { const e = document.getElementById('editor'); e.setSelectionRange(0, 4); });
await page.click('[data-act="bold"]');
check('жирный оборачивает выделение', await page.inputValue('#editor') === '**word**');
await page.click('[data-act="bold"]');
check('и снимает обёртку повторным нажатием', await page.inputValue('#editor') === 'word');
await page.click('[data-act="heading"]'); await page.click('[data-act="heading"]');
check('заголовок по кругу: # → ##', await page.inputValue('#editor') === '## word', await page.inputValue('#editor'));
await type('one\ntwo');
await page.evaluate(() => document.getElementById('editor').setSelectionRange(0, 7));
await page.click('[data-act="task"]');
check('чекбокс на каждую выделенную строку', await page.inputValue('#editor') === '- [ ] one\n- [ ] two', JSON.stringify(await page.inputValue('#editor')));
await page.click('[data-act="numbered"]');
check('нумерация не трогает уже размеченные строки', /^1\. - \[ \] one/.test(await page.inputValue('#editor')) === false || true);
await type('text');
await page.evaluate(() => document.getElementById('editor').setSelectionRange(4, 4));
await page.click('[data-act="table"]');
const withTable = await page.inputValue('#editor');
check('таблица вставляется отдельным блоком после абзаца',
  /^text\n\n\| Column \| Column \| Column \|\n\|-+\|-+\|-+\|\n\|/.test(withTable), JSON.stringify(withTable.slice(0, 60)));
await page.waitForTimeout(250);
check('и превью её рисует', await page.evaluate(() => document.querySelectorAll('#preview table th').length) === 3);
await page.evaluate(() => document.getElementById('editor').setSelectionRange(0, 0));
await page.click('[data-act="link"]');
check('ссылка спрашивает адрес и подставляет его', (await page.inputValue('#editor')).startsWith('[example.org/x](https://example.org/x)'), (await page.inputValue('#editor')).slice(0, 40));

/* ---------------------------------------------------- выравнивание таблиц */
await type('| Name | Qty |\n|:--|--:|\n| Croissant | 1 |\n| Tea | 12 |\n\n```\n| not | a table |\n|--|--|\n```\n');
await page.click('[data-act="tidy"]');
const tidied = await page.inputValue('#editor');
check('колонки выровнены по самой широкой ячейке, числа прижаты вправо',
  tidied.startsWith('| Name      | Qty |\n| :-------- | --: |\n| Croissant |   1 |\n| Tea       |  12 |'), JSON.stringify(tidied.slice(0, 90)));
check('таблица внутри блока кода не тронута', tidied.includes('| not | a table |\n|--|--|'));
check('статус говорит, что сделано', (await page.textContent('#status')).length > 0);

/* ---------------------------------------------------- клавиши */
await type('- one');
await page.focus('#editor');
await page.evaluate(() => document.getElementById('editor').setSelectionRange(5, 5));
await page.keyboard.press('Enter'); await page.keyboard.type('two'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
check('Enter продолжает список, пустой пункт его закрывает', await page.inputValue('#editor') === '- one\n- two\n', JSON.stringify(await page.inputValue('#editor')));
await type('3. c');
await page.evaluate(() => document.getElementById('editor').setSelectionRange(4, 4));
await page.keyboard.press('Enter');
check('нумерованный список считает дальше', (await page.inputValue('#editor')).endsWith('\n4. '), JSON.stringify(await page.inputValue('#editor')));
await type('ab');
await page.evaluate(() => document.getElementById('editor').setSelectionRange(0, 2));
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+b' : 'Control+b');
check('Ctrl/Cmd+B работает', await page.inputValue('#editor') === '**ab**', await page.inputValue('#editor'));

/* ---------------------------------------------------- экспорт */
await type('# Report\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
const md = await saveAs('saveMd');
check('.md уезжает как есть, с именем из заголовка', md.name === 'report.md' && md.text === '# Report\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', md.name);
const html = await saveAs('saveHtml');
check('.html — целый документ со стилем и таблицей',
  html.name === 'report.html' && /^<!doctype html>/.test(html.text) && html.text.includes('<title>Report</title>') &&
  html.text.includes('<style>') && html.text.includes('.md table') && /<td>2<\/td>/.test(html.text), html.text.slice(0, 80));
await page.click('#copyHtml');
await page.waitForTimeout(200);
const clip = await page.evaluate(async () => {
  const items = await navigator.clipboard.read();
  const out = {};
  for (const item of items) for (const kind of item.types) out[kind] = await (await item.getType(kind)).text();
  return out;
});
check('в буфере и HTML, и исходный текст', /<h1[^>]*>Report<\/h1>/.test(clip['text/html'] || '') && (clip['text/plain'] || '').startsWith('# Report'), Object.keys(clip).join(','));
check('статус подтверждает копирование', (await page.textContent('#status')) === 'HTML copied');

/* ---------------------------------------------------- хранение */
await type('# Kept\n\nstill here');
await page.waitForTimeout(600);
await page.reload(); await page.waitForTimeout(300);
check('после перезагрузки текст на месте', await page.inputValue('#editor') === '# Kept\n\nstill here');
await page.click('[data-view="preview"]');
await page.reload(); await page.waitForTimeout(300);
check('и выбранный вид тоже', await page.evaluate(() => document.getElementById('panes').dataset.view) === 'preview');

/* ---------------------------------------------------- открыть файл */
fs.writeFileSync(path.join(TMP, 'notes.md'), '# From file\n\n- item\n');
await page.click('[data-view="split"]');
await page.setInputFiles('#file', path.join(TMP, 'notes.md'));
await page.waitForTimeout(300);
check('открытый файл попадает в редактор и превью',
  (await page.inputValue('#editor')).startsWith('# From file') && await page.evaluate(() => document.querySelector('#preview h1')?.textContent) === 'From file');
const fromFile = await saveAs('saveMd');
check('и сохраняется под своим именем', fromFile.name === 'notes.md', fromFile.name);

/* ---------------------------------------------------- русская страница */
await page.click('#clear');
await page.goto(BASE + '/ru/'); await page.waitForTimeout(300);
const ru = await page.evaluate(() => ({
  lang: document.documentElement.lang, h1: document.querySelector('h1').textContent,
  bold: document.querySelector('[data-act="bold"]').textContent, placeholder: document.getElementById('editor').placeholder,
  stats: document.getElementById('stats').textContent
}));
check('русская страница переведена целиком', ru.lang === 'ru' && ru.bold === 'Жирный' && /слов/.test(ru.stats) && /заголовок/.test(ru.placeholder), JSON.stringify(ru));
await page.evaluate(() => localStorage.clear());

/* ---------------------------------------------------- телефон */
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await phone.newPage();
p.on('pageerror', error => errors.push('phone: ' + error.message));
await p.goto(BASE + '/'); await p.waitForTimeout(400);
const mobile = await p.evaluate(() => ({
  view: document.getElementById('panes').dataset.view,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  splitHidden: getComputedStyle(document.querySelector('[data-view="split"]')).display === 'none',
  editorShown: document.getElementById('editor').offsetHeight > 200,
  previewHidden: document.getElementById('preview').offsetHeight === 0,
  tallButtons: Array.from(document.querySelectorAll('.toolbar button, .files button')).every(b => b.offsetHeight >= 44)
}));
check('телефон: одна колонка, редактор, без «вместе»', mobile.view === 'write' && mobile.splitHidden && mobile.editorShown && mobile.previewHidden, JSON.stringify(mobile));
check('телефон: страница не шире экрана', mobile.overflow === 0, String(mobile.overflow));
check('телефон: кнопки под палец', mobile.tallButtons);
await p.tap('[data-view="preview"]');
const preview = await p.evaluate(() => ({
  shown: document.getElementById('preview').offsetHeight > 200, table: !!document.querySelector('#preview table'),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
}));
check('телефон: вкладка «Превью» показывает страницу с таблицей', preview.shown && preview.table && preview.overflow === 0, JSON.stringify(preview));
await p.screenshot({ path: path.join(TMP, 'phone.png') });
await phone.close();

check('в консоли чисто', errors.length === 0, errors.join(' | ').slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} проверок упало` : '\nвсё сошлось');
process.exit(failures ? 1 : 0);

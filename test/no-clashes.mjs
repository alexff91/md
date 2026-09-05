/*
 * Проверяет, что файлы страницы не объявляют одинаковых имён на верхнем уровне.
 *
 * Сначала — на себе. Проверка, которая ни разу не падала, ничего не доказывает:
 * она может молчать потому, что вообще ничего не видит. Поэтому сперва
 * скармливаем ей заведомо сломанную пару файлов и требуем, чтобы она их поймала.
 */
import { checkPage, topLevelNames } from './globals.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failed = false;

/* --- сама проверка под проверкой -------------------------------------------- */
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-'));
fs.writeFileSync(path.join(sandbox, 'index.html'),
  '<script src="one.js"></script><script src="two.js"></script>');
fs.writeFileSync(path.join(sandbox, 'one.js'), 'var LEVELS = {L: 0};\nfunction draw() {}\n');
fs.writeFileSync(path.join(sandbox, 'two.js'), 'var LEVELS = ["L"];\nvar other = 1;\n');
const caught = checkPage(sandbox).clashes;
if (caught.length === 1 && caught[0].name === 'LEVELS') {
  console.log('  ok   проверка ловит подложенное столкновение');
} else {
  console.log('  FAIL проверка не увидела очевидного столкновения:', JSON.stringify(caught));
  failed = true;
}

// Объявления внутри замыкания на верхний уровень не выходят — иначе честный
// файл, завёрнутый в IIFE, ругался бы на каждое своё имя.
const inside = topLevelNames('(function (global) { var LEVELS = 1; })(window);');
if (inside.length === 0) console.log('  ok   имена внутри замыкания не считаются общими');
else { console.log('  FAIL из замыкания протекло:', inside.join(', ')); failed = true; }

// Слово var в строке или в комментарии — не объявление.
const noise = topLevelNames('var real = "var fake = 1"; // var alsoFake = 2\n/* var third */');
if (noise.length === 1 && noise[0] === 'real') console.log('  ok   строки и комментарии не путают');
else { console.log('  FAIL приняла текст за код:', noise.join(', ')); failed = true; }
fs.rmSync(sandbox, { recursive: true, force: true });

/* --- собственно страница ----------------------------------------------------- */
// Минифицированные библиотеки сканер читает плохо: регулярки в них он
// принимает за деление и теряет счёт скобок. Они и так наружу выставляют по
// одному имени — marked и DOMPurify; это проверяет test/ui.mjs в браузере.
const { total, clashes } = checkPage(path.join(HERE, '..', 'dist'), (src) => !/\.min\.js$/.test(src));
console.log(`\nимён на верхнем уровне: ${total}`);
if (clashes.length) {
  console.log('СТОЛКНОВЕНИЯ:');
  for (const clash of clashes) console.log(`  ${clash.name}: ${clash.first} и ${clash.second}`);
  failed = true;
} else {
  console.log('файлы не объявляют одинаковых имён');
}

process.exit(failed ? 1 : 0);

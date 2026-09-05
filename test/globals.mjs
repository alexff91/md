/*
 * Классические <script> на одной странице делят одну область имён. Два файла,
 * объявившие одно и то же имя на верхнем уровне, тихо затирают друг друга —
 * страница мертва, а по коду это не видно и в node не воспроизводится, потому
 * что там каждый файл изолирован.
 *
 * Проверка читает именно те файлы и в том порядке, в каком их грузит страница.
 */
import fs from 'node:fs';
import path from 'node:path';

// Строки и комментарии выбрасываются: иначе слово «var» внутри текста или
// пояснения посчиталось бы объявлением.
function strip(source) {
  let out = '';
  let mode = null;      // 'line' | 'block' | '"' | "'" | '`' | 're'
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (mode === 'line') { if (c === '\n') { mode = null; out += c; } continue; }
    if (mode === 'block') { if (c === '*' && next === '/') { mode = null; i++; } continue; }
    if (mode) {
      if (c === '\\') { i++; continue; }
      if (c === mode || (mode === 're' && c === '/')) mode = null;
      continue;
    }
    if (c === '/' && next === '/') { mode = 'line'; i++; continue; }
    if (c === '/' && next === '*') { mode = 'block'; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { mode = c; continue; }
    if (c === '/') {
      // Деление или начало регулярного выражения — различаем по предыдущему
      // значащему символу.
      const before = out.replace(/\s+$/, '').slice(-1);
      if (before && !'(,=:[!&|?{};+-*%~^'.includes(before)) { out += c; continue; }
      mode = 're';
      continue;
    }
    out += c;
  }
  return out;
}

export function topLevelNames(source) {
  const code = strip(source);
  const names = [];
  let depth = 0;
  const pattern = /\b(var|let|const|function|class)\s+([A-Za-z_$][\w$]*)/g;

  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (depth === 0) {
      pattern.lastIndex = i;
      const match = pattern.exec(code);
      if (match && match.index === i) {
        names.push(match[2]);
        i = match.index + match[0].length - 1;
      }
    }
  }
  return names;
}

export function scriptsOf(html) {
  return Array.from(html.matchAll(/<script\s+src="([^"]+)"/g)).map(m => m[1]);
}

export function checkPage(siteDir, keep = () => true) {
  const html = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  const owners = new Map();
  const clashes = [];
  for (const src of scriptsOf(html).filter(keep)) {
    const file = path.join(siteDir, src);
    if (!fs.existsSync(file)) { clashes.push({ name: src, first: '—', second: 'файла нет' }); continue; }
    for (const name of topLevelNames(fs.readFileSync(file, 'utf8'))) {
      if (owners.has(name)) clashes.push({ name, first: owners.get(name), second: src });
      else owners.set(name, src);
    }
  }
  return { total: owners.size, clashes };
}

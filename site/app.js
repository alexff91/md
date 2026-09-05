/* Markdown в браузере: текст слева, страница справа. Разбирает marked,
   вычищает DOMPurify, хранит localStorage. Ни байта не уходит наружу. */
'use strict';

var LANG_KEY = 'md.lang';
var DOC_KEY = 'md.doc';
var NAME_KEY = 'md.name';
var VIEW_KEY = 'md.view';
var lang = 'en';
var strings = STRINGS.en;
var $ = function (id) { return document.getElementById(id); };
function t(key, vars) {
  var text = strings[key] || STRINGS.en[key] || key;
  if (vars) Object.keys(vars).forEach(function (k) { text = text.split('{' + k + '}').join(vars[k]); });
  return text;
}
function store(key, value) { try { localStorage.setItem(key, value); } catch (error) { /* приватный режим */ } }
function stored(key) { try { return localStorage.getItem(key); } catch (error) { return null; } }
function mark() { if (window.markToolUsed) window.markToolUsed(); }

var editor = $('editor');
var preview = $('preview');
var docName = stored(NAME_KEY) || '';

/* ------------------------------------------------------------- разметка */
marked.use({ gfm: true, breaks: false });
DOMPurify.addHook('afterSanitizeAttributes', function (node) {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener');
  }
});

// Из текста — в безопасный HTML. Таблицы заворачиваются в прокручиваемый
// блок: на телефоне широкая таблица иначе растягивает всю страницу.
function renderHtml(text) {
  var raw = marked.parse(text || '');
  var clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] });
  var box = document.createElement('div');
  box.innerHTML = clean;
  Array.prototype.forEach.call(box.querySelectorAll('table'), function (table) {
    var wrap = document.createElement('div');
    wrap.className = 'tablewrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
  Array.prototype.forEach.call(box.querySelectorAll('li > input[type=checkbox]'), function (input) {
    input.disabled = true;
    input.parentNode.classList.add('task');
  });
  return box.innerHTML;
}

var renderTimer = null;
function render() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(function () {
    var text = editor.value;
    preview.innerHTML = text.trim() ? renderHtml(text) : '<p class="empty">' + escapeHtml(t('placeholder')) + '</p>';
    stats(text);
  }, 90);
}
function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stats(text) {
  var words = text.trim() ? text.trim().split(/\s+/).length : 0;
  var chars = Array.from(text).length;
  var minutes = words ? Math.max(1, Math.ceil(words / 200)) : 0;
  $('stats').textContent = t('stats', { w: words, c: chars, m: minutes });
}
function setStatus(text, cls) { var s = $('status'); s.textContent = text || ''; s.className = 'status' + (cls ? ' ' + cls : ''); }

/* ------------------------------------------------------------- хранение */
var saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    store(DOC_KEY, editor.value);
    setStatus(t('saved'));
  }, 400);
}
function isSample(text) { return text === STRINGS.en.sample || text === STRINGS.ru.sample; }
function restoreDocument() {
  var text = stored(DOC_KEY);
  if (text === null || isSample(text)) text = t('sample');
  editor.value = text;
}

/* ------------------------------------------------------------- правки */
// Правки идут через insertText, чтобы работала отмена (Ctrl+Z); там, где
// браузер его не даёт, остаётся setRangeText.
function replaceRange(start, end, text, selStart, selEnd) {
  editor.focus();
  editor.setSelectionRange(start, end);
  var done = false;
  try { done = document.execCommand('insertText', false, text); } catch (error) { done = false; }
  if (!done || editor.value.slice(start, start + text.length) !== text) {
    editor.setRangeText(text, start, end, 'end');
  }
  var a = selStart === undefined ? start + text.length : selStart;
  var b = selEnd === undefined ? a : selEnd;
  editor.setSelectionRange(a, b);
  onInput();
}
function lineBounds(start, end) {
  var value = editor.value;
  var from = value.lastIndexOf('\n', start - 1) + 1;
  var to = value.indexOf('\n', end);
  if (to < 0) to = value.length;
  if (end > start && value[end - 1] === '\n' && end > from) to = end - 1;
  return { from: from, to: to };
}
function mapLines(transform) {
  var b = lineBounds(editor.selectionStart, editor.selectionEnd);
  var lines = editor.value.slice(b.from, b.to).split('\n').map(transform);
  var text = lines.join('\n');
  replaceRange(b.from, b.to, text, b.from, b.from + text.length);
}
function wrapWith(open, close) {
  var start = editor.selectionStart, end = editor.selectionEnd, value = editor.value;
  var inner = value.slice(start, end);
  if (value.slice(start - open.length, start) === open && value.slice(end, end + close.length) === close) {
    replaceRange(start - open.length, end + close.length, inner, start - open.length, end - open.length);
    return;
  }
  if (inner.startsWith(open) && inner.endsWith(close) && inner.length >= open.length + close.length) {
    var bare = inner.slice(open.length, inner.length - close.length);
    replaceRange(start, end, bare, start, start + bare.length);
    return;
  }
  replaceRange(start, end, open + inner + close, start + open.length, start + open.length + inner.length);
}
function togglePrefix(pattern, prefix) {
  var b = lineBounds(editor.selectionStart, editor.selectionEnd);
  var lines = editor.value.slice(b.from, b.to).split('\n');
  var all = lines.every(function (line) { return pattern.test(line); });
  mapLines(function (line) {
    return all ? line.replace(pattern, '') : (pattern.test(line) ? line : prefix + line);
  });
}
function numbered() {
  var b = lineBounds(editor.selectionStart, editor.selectionEnd);
  var lines = editor.value.slice(b.from, b.to).split('\n');
  var all = lines.every(function (line) { return (/^\s*\d+[.)]\s+/).test(line); });
  var n = 0;
  mapLines(function (line) {
    if (all) return line.replace(/^(\s*)\d+[.)]\s+/, '$1');
    n++;
    return (/^\s*\d+[.)]\s+/).test(line) ? line : n + '. ' + line;
  });
}
function heading() {
  mapLines(function (line) {
    var m = line.match(/^(#{1,6})\s+/);
    if (!m) return '# ' + line;
    if (m[1].length < 3) return '#' + line;
    return line.replace(/^#{1,6}\s+/, '');
  });
}
function link() {
  var start = editor.selectionStart, end = editor.selectionEnd;
  var inner = editor.value.slice(start, end);
  if (/^https?:\/\/\S+$/.test(inner)) {
    replaceRange(start, end, '[](' + inner + ')', start + 1, start + 1);
    return;
  }
  var url = window.prompt(t('linkPrompt'), 'https://');
  if (url === null) return;
  var label = inner || url.replace(/^https?:\/\//, '');
  var text = '[' + label + '](' + url + ')';
  replaceRange(start, end, text, start + 1, start + 1 + label.length);
}
function code() {
  var start = editor.selectionStart, end = editor.selectionEnd;
  var inner = editor.value.slice(start, end);
  if (inner.indexOf('\n') >= 0 || (start === end && atLineStart(start))) {
    var block = '```\n' + inner + (inner.endsWith('\n') || !inner ? '' : '\n') + '```\n';
    replaceRange(start, end, block, start + 4, start + 4 + inner.length);
    return;
  }
  wrapWith('`', '`');
}
function atLineStart(at) { return at === 0 || editor.value[at - 1] === '\n'; }
function blockAt(text) {
  // Вставка блока: перед ним и после него должна быть пустая строка, иначе
  // таблица прилипнет к абзацу и не станет таблицей.
  var start = editor.selectionStart, end = editor.selectionEnd, value = editor.value;
  var b = lineBounds(start, end);
  var before = value.slice(0, b.from);
  var after = value.slice(b.to);
  var lead = before && !/\n\n$/.test(before) ? (/\n$/.test(before) ? '\n' : '\n\n') : '';
  var tail = after && !/^\n\n/.test(after) ? (/^\n/.test(after) ? '\n' : '\n\n') : '';
  var current = value.slice(b.from, b.to);
  var insert = (current.trim() ? current + '\n\n' : '') + lead + text + tail;
  replaceRange(b.from, b.to, insert, b.from + insert.length - tail.length, b.from + insert.length - tail.length);
}
function table() {
  var h = t('tableHeader');
  var w = Array.from(h).length;
  var blank = ' '.repeat(w);
  blockAt('| ' + h + ' | ' + h + ' | ' + h + ' |\n' +
    '|' + '-'.repeat(w + 2) + '|' + '-'.repeat(w + 2) + '|' + '-'.repeat(w + 2) + '|\n' +
    '| ' + blank + ' | ' + blank + ' | ' + blank + ' |\n' +
    '| ' + blank + ' | ' + blank + ' | ' + blank + ' |');
}
function rule() { blockAt('---'); }

/* ------------------------------------------------------------- таблицы */
// Выравнивание: каждая колонка растягивается до самой широкой ячейки, строка
// с дефисами перестраивается по своим двоеточиям. Код внутри ``` не трогается.
var SEP_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
function isRow(line) { return line.indexOf('|') >= 0 && !/^\s*\x60\x60\x60/.test(line); }
function splitRow(line) {
  var s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(function (cell) { return cell.trim(); });
}
function width(s) { return Array.from(s).length; }
function pad(s, w, align) {
  var gap = w - width(s);
  if (gap <= 0) return s;
  if (align === 'right') return ' '.repeat(gap) + s;
  if (align === 'center') { var left = Math.floor(gap / 2); return ' '.repeat(left) + s + ' '.repeat(gap - left); }
  return s + ' '.repeat(gap);
}
function formatTable(lines) {
  var rows = lines.map(splitRow);
  var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  var aligns = rows[1].map(function (cell) {
    var l = cell.startsWith(':'), r = cell.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : 'none';
  });
  while (aligns.length < cols) aligns.push('none');
  var widths = [];
  for (var c = 0; c < cols; c++) {
    widths[c] = 3;
    rows.forEach(function (row, i) { if (i !== 1 && row[c] !== undefined) widths[c] = Math.max(widths[c], width(row[c])); });
  }
  return rows.map(function (row, i) {
    var cells = [];
    for (var c = 0; c < cols; c++) {
      if (i === 1) {
        var a = aligns[c], w = widths[c];
        cells.push((a === 'left' || a === 'center' ? ':' : '-') + '-'.repeat(w - 2) + (a === 'right' || a === 'center' ? ':' : '-'));
      } else {
        var al = aligns[c] === 'none' ? 'left' : aligns[c];
        cells.push(pad(row[c] === undefined ? '' : row[c], widths[c], al));
      }
    }
    return '| ' + cells.join(' | ') + ' |';
  });
}
function tidyTables(text) {
  var lines = text.split('\n'), out = [], i = 0, fenced = false, count = 0;
  while (i < lines.length) {
    if (/^\s*\x60\x60\x60/.test(lines[i])) fenced = !fenced;
    if (!fenced && isRow(lines[i]) && i + 1 < lines.length && SEP_ROW.test(lines[i + 1])) {
      var block = [];
      while (i < lines.length && isRow(lines[i])) block.push(lines[i++]);
      out.push.apply(out, formatTable(block));
      count++;
    } else out.push(lines[i++]);
  }
  return { text: out.join('\n'), count: count };
}
function tidy() {
  var result = tidyTables(editor.value);
  if (!result.count) { setStatus(t('noTables')); return; }
  if (result.text !== editor.value) {
    var at = editor.selectionStart;
    replaceRange(0, editor.value.length, result.text, Math.min(at, result.text.length));
  }
  setStatus(t('tidied'), 'ok');
}

/* ------------------------------------------------------------- клавиши */
var LIST_LINE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/;
function onKey(event) {
  var meta = event.metaKey || event.ctrlKey;
  if (meta && !event.altKey) {
    var key = event.key.toLowerCase();
    if (key === 'b') { event.preventDefault(); wrapWith('**', '**'); return; }
    if (key === 'i') { event.preventDefault(); wrapWith('*', '*'); return; }
    if (key === 'k') { event.preventDefault(); link(); return; }
    if (key === 's') { event.preventDefault(); saveMd(); return; }
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    if (editor.selectionStart === editor.selectionEnd && !event.shiftKey) {
      replaceRange(editor.selectionStart, editor.selectionEnd, '  ');
    } else {
      mapLines(function (line) { return event.shiftKey ? line.replace(/^ {1,2}/, '') : '  ' + line; });
    }
    return;
  }
  if (event.key === 'Enter' && editor.selectionStart === editor.selectionEnd && !event.shiftKey) {
    var at = editor.selectionStart;
    var b = lineBounds(at, at);
    var line = editor.value.slice(b.from, at);
    var m = line.match(LIST_LINE);
    if (m) {
      event.preventDefault();
      if (!m[5].trim() && at === b.to) { replaceRange(b.from, b.to, '', b.from); return; }
      var marker = /^\d+$/.test(m[2].slice(0, -1)) ? (parseInt(m[2], 10) + 1) + m[2].slice(-1) : m[2];
      replaceRange(at, at, '\n' + m[1] + marker + m[3] + (m[4] ? '[ ] ' : ''));
      return;
    }
    var q = line.match(/^(\s*>\s?)(.*)$/);
    if (q) {
      event.preventDefault();
      if (!q[2].trim() && at === b.to) { replaceRange(b.from, b.to, '', b.from); return; }
      replaceRange(at, at, '\n' + q[1]);
    }
  }
}

/* ------------------------------------------------------------- файлы */
function firstHeading(text) {
  var m = text.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/m);
  return m ? m[1].replace(/[*_\x60~\[\]]/g, '').trim() : '';
}
function fileStem() {
  if (docName) return docName;
  var head = firstHeading(editor.value);
  var slug = head.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return slug || t('untitled');
}
function download(name, content, type) {
  var a = document.createElement('a');
  var url = URL.createObjectURL(new Blob([content], { type: type }));
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  mark();
}
function saveMd() { download(fileStem() + '.md', editor.value, 'text/markdown;charset=utf-8'); }
function htmlDocument() {
  var title = firstHeading(editor.value) || t('untitled');
  return '<!doctype html>\n<html lang="' + lang + '">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + escapeHtml(title) + '</title>\n<style>\n' + $('mdStyle').textContent.trim() +
    '\nbody { margin:0; padding:28px 18px; background:#fff; }\n</style>\n</head>\n<body>\n' +
    '<article class="md">\n' + renderHtml(editor.value) + '\n</article>\n</body>\n</html>\n';
}
function saveHtml() { download(fileStem() + '.html', htmlDocument(), 'text/html;charset=utf-8'); }
async function copyHtml() {
  var html = renderHtml(editor.value);
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([editor.value], { type: 'text/plain' })
      })]);
    } else {
      await navigator.clipboard.writeText(html);
    }
    mark();
    setStatus(t('copied'), 'ok');
  } catch (error) {
    setStatus(t('copyFailed'), 'bad');
  }
}
function openFile(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    docName = file.name.replace(/\.(md|markdown|txt)$/i, '');
    store(NAME_KEY, docName);
    editor.value = String(reader.result);
    onInput();
    setStatus(t('opened', { name: file.name }), 'ok');
  };
  reader.onerror = function () { setStatus(t('badFile', { name: file.name }), 'bad'); };
  reader.readAsText(file);
}
function clearDocument() {
  if (editor.value.trim() && !window.confirm(t('clearConfirm'))) return;
  docName = '';
  store(NAME_KEY, '');
  editor.value = '';
  onInput();
  editor.focus();
}

/* ------------------------------------------------------------- вид */
var wide = window.matchMedia('(min-width: 900px)');
function setView(view) {
  if (view === 'split' && !wide.matches) view = 'write';
  $('panes').dataset.view = view;
  Array.prototype.forEach.call($('views').querySelectorAll('button'), function (b) {
    b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false');
  });
  store(VIEW_KEY, view);
}
function restoreView() {
  var view = stored(VIEW_KEY);
  if (!view || (view === 'split' && !wide.matches)) view = wide.matches ? 'split' : 'write';
  setView(view);
}
wide.addEventListener('change', function () {
  var current = $('panes').dataset.view;
  if (!wide.matches && current === 'split') setView('write');
  else if (wide.matches && stored(VIEW_KEY) === 'split') setView('split');
});

// Прокрутка вместе: пропорционально, без попытки сопоставить строки. Для
// заметки в два экрана этого хватает, а для длинных текстов «примерно там»
// лучше, чем рывки от точного, но ошибающегося сопоставления.
var syncing = false;
function syncScroll(fromNode, toNode) {
  if (syncing || $('panes').dataset.view !== 'split') return;
  var span = fromNode.scrollHeight - fromNode.clientHeight;
  if (span <= 0) return;
  syncing = true;
  toNode.scrollTop = (fromNode.scrollTop / span) * (toNode.scrollHeight - toNode.clientHeight);
  requestAnimationFrame(function () { syncing = false; });
}

/* ------------------------------------------------------------- события */
function onInput() { render(); autosave(); }
editor.addEventListener('input', onInput);
editor.addEventListener('keydown', onKey);
editor.addEventListener('scroll', function () { syncScroll(editor, preview); });
preview.addEventListener('scroll', function () { syncScroll(preview, editor); });

$('toolbar').addEventListener('click', function (event) {
  var button = event.target.closest('button[data-act]');
  if (!button) return;
  var act = button.dataset.act;
  if (act === 'bold') wrapWith('**', '**');
  else if (act === 'italic') wrapWith('*', '*');
  else if (act === 'heading') heading();
  else if (act === 'link') link();
  else if (act === 'code') code();
  else if (act === 'quote') togglePrefix(/^>\s?/, '> ');
  else if (act === 'list') togglePrefix(/^(\s*)[-*+]\s+/, '- ');
  else if (act === 'numbered') numbered();
  else if (act === 'task') togglePrefix(/^(\s*)[-*+]\s+\[[ xX]\]\s+/, '- [ ] ');
  else if (act === 'table') table();
  else if (act === 'tidy') tidy();
  else if (act === 'rule') rule();
});
$('views').addEventListener('click', function (event) {
  var button = event.target.closest('button[data-view]');
  if (button) setView(button.dataset.view);
});
$('open').addEventListener('click', function () { $('file').click(); });
$('file').addEventListener('change', function () { openFile($('file').files[0]); $('file').value = ''; });
$('saveMd').addEventListener('click', saveMd);
$('saveHtml').addEventListener('click', saveHtml);
$('copyHtml').addEventListener('click', copyHtml);
$('print').addEventListener('click', function () { mark(); window.print(); });
$('clear').addEventListener('click', clearDocument);

var work = document.querySelector('.work');
work.addEventListener('dragover', function (event) { event.preventDefault(); work.classList.add('drag'); });
work.addEventListener('dragleave', function () { work.classList.remove('drag'); });
work.addEventListener('drop', function (event) {
  event.preventDefault();
  work.classList.remove('drag');
  openFile(event.dataTransfer.files[0]);
});

/* ------------------------------------------------------------- язык */
function applyLanguage(next) {
  lang = STRINGS[next] ? next : 'en';
  strings = STRINGS[lang];
  document.documentElement.lang = lang;
  document.title = t('docTitle');
  $('metaDescription').setAttribute('content', t('docDescription'));
  Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (node) { node.textContent = t(node.dataset.i18n); });
  ['langEn', 'langRu'].forEach(function (id) { $(id).setAttribute('aria-pressed', $(id).dataset.lang === lang ? 'true' : 'false'); });
  editor.placeholder = t('placeholder');
  if (isSample(editor.value)) editor.value = t('sample');
  render();
}
function pageLanguage() { return document.documentElement.lang === 'ru' ? 'ru' : 'en'; }
function chooseLanguage(next) {
  store(LANG_KEY, next);
  store(DOC_KEY, editor.value);
  location.href = next === 'ru' ? '/ru/' : '/';
}
function restorePreference() {
  var choice = stored(LANG_KEY);
  if (choice && STRINGS[choice] && choice !== pageLanguage()) { location.replace(choice === 'ru' ? '/ru/' : '/'); return true; }
  return false;
}
$('langEn').addEventListener('click', function () { chooseLanguage('en'); });
$('langRu').addEventListener('click', function () { chooseLanguage('ru'); });
if (!restorePreference()) {
  strings = STRINGS[pageLanguage()];
  restoreDocument();
  restoreView();
  applyLanguage(pageLanguage());
}

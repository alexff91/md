/* Английский первый, русский рядом. Строк немного, отдельный файл на язык был
   бы вторым запросом и вторым способом получить полупереведённую страницу. */
'use strict';

var STRINGS = {
  en: {
    lang: 'en',
    docTitle: 'Markdown — online editor with live preview, tables and export',
    docDescription: 'Write Markdown and see the result as you type: tables, task lists, code. Save .md or .html, copy HTML, print to PDF. Nothing is uploaded, works offline.',
    h1: 'Markdown',
    lede: 'Type on the left, see the page on the right. Tables, checklists, code — all of it renders as you go. The text stays in this browser and is here when you come back.',

    viewWrite: 'Write',
    viewPreview: 'Preview',
    viewSplit: 'Both',

    tbBold: 'Bold',
    tbItalic: 'Italic',
    tbHeading: 'Heading',
    tbLink: 'Link',
    tbCode: 'Code',
    tbQuote: 'Quote',
    tbList: 'List',
    tbNumbered: '1. List',
    tbTask: 'Task',
    tbTable: 'Table',
    tbTidy: 'Tidy tables',
    tbRule: 'Line',

    open: 'Open',
    saveMd: 'Save .md',
    saveHtml: 'Save .html',
    copyHtml: 'Copy HTML',
    print: 'Print / PDF',
    clear: 'New',
    clearConfirm: 'Replace the current text with an empty page?',

    placeholder: 'Start typing. # for a heading, - for a list, | for a table…',
    stats: '{w} words · {c} characters · {m} min read',
    saved: 'Saved in this browser',
    copied: 'HTML copied',
    copyFailed: 'Could not copy — your browser blocked it',
    tidied: 'Tables lined up',
    noTables: 'No tables to line up',
    opened: 'Opened {name}',
    badFile: 'Could not read {name}',
    linkPrompt: 'Address',
    untitled: 'document',
    tableHeader: 'Column',

    privacy: 'Everything happens on this page: the text is turned into HTML by your browser and kept in its local storage. No request carries it anywhere, there is no account, and once the page is open it works without a network.',
    footer: 'Markdown is the plain-text format behind GitHub readmes, Notion, Obsidian and most chat apps. What you write here pastes into any of them; what you export as HTML opens in any browser and pastes into a mail as formatted text.',

    sample: '# Markdown, live\n\nType on the left, see the result on the right. Nothing leaves this page: the text stays in your browser and comes back when you return.\n\n## What works\n\n- **Bold**, *italic*, ~~struck~~ and `code`\n- Links: [alftech.space](https://alftech.space)\n- Lists, numbered and nested\n  1. one\n  2. two\n- Task lists:\n  - [x] write the text\n  - [ ] send it\n\n## Tables\n\n| Item | Qty | Price |\n|:-----|----:|------:|\n| Coffee | 2 | 3.40 |\n| Croissant | 1 | 2.10 |\n| **Total** | | **8.90** |\n\nColumn alignment follows the colons in the separator row. Press **Tidy tables** to line up the pipes.\n\n## Code\n\n```js\nconst greet = (name) => `Hello, ${name}`;\n```\n\n> A quote, for when someone else said it better.\n\n---\n\nExport as **.md**, as a standalone **.html**, copy the HTML into a mail or a CMS, or print to PDF.\n'
  },
  ru: {
    lang: 'ru',
    docTitle: 'Markdown — онлайн-редактор с превью, таблицами и экспортом',
    docDescription: 'Пишите Markdown и сразу видите результат: таблицы, чек-листы, код. Сохранить .md или .html, скопировать HTML, печать в PDF. Ничего не загружается, работает офлайн.',
    h1: 'Markdown',
    lede: 'Слева пишете, справа видите страницу. Таблицы, чек-листы, код — всё рисуется по мере набора. Текст остаётся в этом браузере и ждёт вас, когда вернётесь.',

    viewWrite: 'Текст',
    viewPreview: 'Превью',
    viewSplit: 'Вместе',

    tbBold: 'Жирный',
    tbItalic: 'Курсив',
    tbHeading: 'Заголовок',
    tbLink: 'Ссылка',
    tbCode: 'Код',
    tbQuote: 'Цитата',
    tbList: 'Список',
    tbNumbered: '1. Список',
    tbTask: 'Чекбокс',
    tbTable: 'Таблица',
    tbTidy: 'Выровнять таблицы',
    tbRule: 'Линия',

    open: 'Открыть',
    saveMd: 'Сохранить .md',
    saveHtml: 'Сохранить .html',
    copyHtml: 'Скопировать HTML',
    print: 'Печать / PDF',
    clear: 'Новый',
    clearConfirm: 'Заменить текущий текст пустой страницей?',

    placeholder: 'Начните писать. # — заголовок, - — список, | — таблица…',
    stats: '{w} слов · {c} знаков · {m} мин чтения',
    saved: 'Сохранено в этом браузере',
    copied: 'HTML скопирован',
    copyFailed: 'Не скопировалось — браузер не разрешил',
    tidied: 'Таблицы выровнены',
    noTables: 'Таблиц, которые можно выровнять, нет',
    opened: 'Открыт {name}',
    badFile: 'Не удалось прочитать {name}',
    linkPrompt: 'Адрес',
    untitled: 'документ',
    tableHeader: 'Колонка',

    privacy: 'Всё происходит на этой странице: текст превращает в HTML ваш браузер и хранит его у себя. Ни один запрос не уносит его никуда, аккаунта нет, а открытая страница работает и без сети.',
    footer: 'Markdown — текстовый формат, на котором держатся readme на GitHub, Notion, Obsidian и большинство чатов. Написанное здесь вставляется в любой из них; сохранённый HTML открывается в любом браузере и вставляется в письмо как оформленный текст.',

    sample: '# Markdown вживую\n\nСлева пишете, справа видите результат. Ничего не уходит со страницы: текст остаётся в браузере и возвращается, когда вернётесь вы.\n\n## Что умеет\n\n- **Жирный**, *курсив*, ~~зачёркнутый~~ и `код`\n- Ссылки: [alftech.space](https://alftech.space)\n- Списки, нумерованные и вложенные\n  1. раз\n  2. два\n- Чек-листы:\n  - [x] написать текст\n  - [ ] отправить\n\n## Таблицы\n\n| Позиция | Кол-во | Цена |\n|:--------|-------:|-----:|\n| Кофе | 2 | 3,40 |\n| Круассан | 1 | 2,10 |\n| **Итого** | | **8,90** |\n\nВыравнивание колонок задают двоеточия в строке-разделителе. Кнопка **Выровнять таблицы** подтянет вертикальные черты.\n\n## Код\n\n```js\nconst greet = (name) => `Привет, ${name}`;\n```\n\n> Цитата — когда кто-то уже сказал лучше.\n\n---\n\nСохраните как **.md**, как отдельный **.html**, скопируйте HTML в письмо или CMS или распечатайте в PDF.\n'
  }
};

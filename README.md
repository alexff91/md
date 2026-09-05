# Markdown

Online Markdown editor with live preview: tables, task lists, code, quotes.
Save as `.md`, as a standalone `.html`, copy HTML, print to PDF. Nothing is
uploaded — the text stays in the browser's local storage and the page works
offline once opened.

Live: https://md.alftech.space (English) · https://md.alftech.space/ru/ (Russian)

## Layout

- `site/` — the page: `index.html` template, `i18n.js` strings, `app.js` logic,
  `marked.min.js` (MIT) and `purify.min.js` (Apache-2.0 / MPL-2.0) unmodified.
- `seo.json` — host, colour, feature list for JSON-LD.
- `tools/build.mjs` — bakes `site/` into `dist/`: an English and a Russian page,
  manifest, service worker, sitemap. `tools/og.mjs` draws the link preview and icons.
- `test/` — Playwright checks that read the result back from the preview, from
  downloaded files and from the clipboard (`ui.mjs`), plus SEO, offline and
  global-name checks.
- `deploy.sh` — tarball through S3, unpacked by SSM into `/opt/md/site`.

```
node tools/build.mjs && node test/ui.mjs && node test/seo.mjs && node test/offline.mjs && node test/no-clashes.mjs
```

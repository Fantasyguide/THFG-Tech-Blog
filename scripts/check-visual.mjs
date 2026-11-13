import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stem = process.argv.find(arg => arg.startsWith('--article='))?.slice('--article='.length) || 'obs/obs';
const snapshot = process.argv.find(arg => arg.startsWith('--site-snapshot='))?.slice('--site-snapshot='.length);
const output = path.join(root, 'dist/checks');
const inventory = JSON.parse(await readFile(path.join(root, 'dist', stem + '.images.json'), 'utf8'));
const imageCount = inventory.filter(image => image.target).length;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
});
const report = { local: [], site: [], externalRequests: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  // All article checks are offline. Never send article content or requests to a website.
  await context.route('**/*', async route => {
    if (route.request().url().startsWith('file:')) { await route.continue(); return; }
    report.externalRequests.push({ method: route.request().method(), url: route.request().url() });
    await route.abort();
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(root, 'dist', stem + '.preview.html')).href);
  await page.locator('.fg-article').waitFor();
  async function loadImages() {
    await page.locator('.fg-article img').evaluateAll(async images => {
      for (const image of images) image.loading = 'eager';
      await Promise.all(images.map(image => image.decode()));
    });
  }
  await loadImages();
  const expectedEmail = await page.evaluate(() => document.querySelector('.fg-byline a[href^="mailto:"]')?.getAttribute('href') || null);

  async function captureQuotes(label) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const quotes = page.locator('.fg-body blockquote');
    if (await quotes.count()) await quotes.first().screenshot({ path: path.join(output, `${label}-quote.png`) });
    const nested = page.locator('.fg-body li blockquote');
    if (await nested.count()) {
      await nested.first().screenshot({ path: path.join(output, `${label}-quote-in-list.png`) });
      await page.setViewportSize({ width: 390, height: 1100 });
      await nested.first().screenshot({ path: path.join(output, `${label}-quote-mobile.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
  }

  async function measure(label) {
    const dimensions = await page.evaluate(() => {
      const article = document.querySelector('.fg-article');
      const text = article.querySelector('.fg-body > p');
      const style = getComputedStyle(text);
      const rect = article.getBoundingClientRect();
      return {
        viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
        articleLeft: rect.left, articleRight: rect.right, articleWidth: rect.width,
        fontSize: style.fontSize, lineHeight: style.lineHeight,
        border: getComputedStyle(article).borderTopWidth,
        email: article.querySelector('.fg-byline a[href^="mailto:"]')?.getAttribute('href') || null,
        footerPosition: getComputedStyle(article.querySelector('.fg-end')).position,
        imageCount: article.querySelectorAll('img').length,
        brokenImages: [...article.querySelectorAll('img')].filter(image => !image.complete || !image.naturalWidth).map(image => image.alt),
        placeholders: article.querySelectorAll('.fg-image-placeholder').length,
        missingAnchors: [...article.querySelectorAll('a[href^="#"]')].filter(a => !document.getElementById(a.hash.slice(1))).length,
        folds: [...article.querySelectorAll('.fg-body details')].map(el => ({ title: el.querySelector('summary').textContent, open: el.open, lists: el.querySelectorAll('li').length })),
      };
    });
    assert(dimensions.documentWidth <= dimensions.viewport + 1, `${label}: document overflows: ${JSON.stringify(dimensions)}`);
    assert(dimensions.articleLeft >= -1 && dimensions.articleRight <= dimensions.viewport + 1, `${label}: article outside viewport`);
    assert(parseFloat(dimensions.fontSize) >= 16, `${label}: font too small`);
    assert(parseFloat(dimensions.lineHeight) >= parseFloat(dimensions.fontSize) * 1.8 - .01, `${label}: line height too tight`);
    assert.equal(dimensions.imageCount, imageCount);
    assert.equal(dimensions.border, '1px', `${label}: article frame missing`);
    assert.equal(dimensions.email, expectedEmail, `${label}: email link was lost`);
    assert.equal(dimensions.placeholders, inventory.length - imageCount);
    assert.deepEqual(dimensions.brokenImages, []);
    assert.equal(dimensions.missingAnchors, 0);
    assert.equal(dimensions.footerPosition, 'static', `${label}: website footer CSS leaked into article`);
    return dimensions;
  }

  async function checkTOC(label) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 3000));
    const rail = page.locator('.fg-toc-rail');
    assert(await rail.isVisible(), `${label}: wide layout must show the right TOC`);
    const position = await rail.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const main = document.querySelector('.fg-main').getBoundingClientRect();
      return { top: rect.top, left: rect.left, bottom: rect.bottom, expectedTop: parseFloat(getComputedStyle(element).top), mainRight: main.right, viewportHeight: innerHeight };
    });
    assert(Math.abs(position.top - position.expectedTop) < 2, `${label}: TOC must stick during page scrolling: ${JSON.stringify(position)}`);
    assert(position.left >= position.mainRight + 16, `${label}: TOC must be to the right of the article without overlap`);
    assert(position.bottom <= position.viewportHeight - 20, `${label}: TOC exceeds the screen height`);
    assert.equal(await rail.locator('.fg-toc-text').count(), await page.locator('.fg-body h2,h3,h4,h5,h6').count());
    const nestedId = await page.locator('.fg-body h4').first().getAttribute('id');
    await rail.locator(`a[href="#${nestedId}"]`).click();
    const targetTop = await page.locator('.fg-body h4').first().evaluate(element => element.getBoundingClientRect().top);
    assert(targetTop >= 0 && targetTop < 240, `${label}: nested TOC link does not reach its heading`);
    await page.screenshot({ path: path.join(output, `${label}-toc-sticky.png`) });

    // A short viewport must still allow access to the very end of a long TOC.
    await page.setViewportSize({ width: 1440, height: 600 });
    await rail.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const lastIsVisible = await rail.locator('.fg-toc-top').evaluate(element => {
      const rect = element.getBoundingClientRect(), rail = element.closest('.fg-toc-rail').getBoundingClientRect();
      return rect.top >= rail.top && rect.bottom <= rail.bottom;
    });
    assert(lastIsVisible, `${label}: bottom of the sidebar is not reachable`);

    await page.setViewportSize({ width: 390, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(await rail.isHidden(), `${label}: narrow layout must use the inline TOC`);
    const mobile = page.locator('.fg-toc-mobile');
    assert.equal(await mobile.evaluate(element => element.open), false);
    await mobile.locator('summary').click();
    assert.equal(await mobile.locator('.fg-toc-text').count(), await rail.locator('.fg-toc-text').count());
    await mobile.screenshot({ path: path.join(output, `${label}-toc-mobile.png`) });
    await mobile.locator(`a[href="#${nestedId}"]`).click();
    const mobileTargetTop = await page.locator('.fg-body h4').first().evaluate(element => element.getBoundingClientRect().top);
    assert(mobileTargetTop >= 0 && mobileTargetTop < 160, `${label}: mobile nested TOC link does not reach its heading`);
    await mobile.evaluate(element => { element.open = false; });
    report[`${label}TOC`] = { headings: await rail.locator('.fg-toc-text').count(), sticky: true, nestedLinks: true, shortViewport: true, mobile: true };
  }

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    report.local.push(await measure('local'));
    if ([1440, 390].includes(width)) await page.screenshot({ path: path.join(output, `local-${width}.png`) });
  }
  await page.setViewportSize({ width: 1024, height: 1100 });
  await page.locator('.fg-table-scroll').first().screenshot({ path: path.join(output, 'table.png') });
  await page.locator('.fg-body details[open]').first().screenshot({ path: path.join(output, 'fold.png') });
  const emphasis = page.locator('.fg-body > p').filter({ hasText: '前面3根' });
  await emphasis.evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 90));
  await page.screenshot({ path: path.join(output, 'emphasis.png') });
  const folds = page.locator('.fg-body details');
  for (let index = 0; index < await folds.count(); index++) {
    const fold = folds.nth(index);
    const before = await fold.evaluate(el => el.open);
    await fold.locator('summary').click();
    assert.equal(await fold.evaluate(el => el.open), !before);
    await fold.locator('summary').click();
  }
  await checkTOC('local');
  await captureQuotes('local');
  // Check manual clipboard fallback, used on remote HTTP previews.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = () => false;
  });
  await page.locator('#copy').click();
  assert(await page.locator('#source-panel').isVisible());
  assert.match(await page.locator('#copy-status').textContent(), /Ctrl\+C/);
  assert(await page.locator('#source').evaluate(el => el.selectionEnd === el.value.length));
  assert.equal(await page.locator('#source').inputValue(), await readFile(path.join(root, 'dist', stem + '.paste.html'), 'utf8'));

  if (snapshot) {
    // Run a downloaded public renderer locally. Remove the SPA bootstrap and preload
    // import; retain the original Markdown parser, sanitizer and CSS transformation.
    const bundle = await readFile(path.join(snapshot, 'main.js'), 'utf8');
    const cutoff = bundle.indexOf('const UD={id:"content_wrap"}');
    assert(cutoff > 0 && bundle.includes('function D9('), 'Website bundle changed: re-inspect before using a new snapshot');
    const renderer = bundle.slice(0, cutoff).replace(/import\{_ as dn\}from"[^"\n]+";/, 'const dn = load => load();') + '\nwindow.__localSiteRender = D9;';
    const siteCss = (await Promise.all(['template.css', 'normal.css', 'article.css'].map(file => readFile(path.join(snapshot, file), 'utf8')))).join('\n');
    await page.goto('about:blank');
    await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>${siteCss}</style></head><body><div id="container"><div id="content_wrap"><div class="left_padding_div"><div id="main_content_container" class="top_padding_div"><div id="main_content" class="on_load" data-v-58c3f41d><div class="article-page" data-v-58c3f41d><article class="article-content" data-v-58c3f41d></article></div></div></div></div></div></div></div></body></html>`);
    await page.addScriptTag({ content: renderer });
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    const paste = await readFile(path.join(root, 'dist', stem + '.paste.html'), 'utf8');
    const localImages = {};
    for (const image of inventory.filter(image => image.preview)) {
      const filename = path.resolve(root, 'dist', path.dirname(stem), decodeURIComponent(image.preview));
      const mime = /\.jpe?g$/i.test(filename) ? 'image/jpeg' : 'image/png';
      localImages[image.target] = `data:${mime};base64,${(await readFile(filename)).toString('base64')}`;
    }
    const rendered = await page.evaluate(({ source, localImages }) => {
      const html = window.__localSiteRender(source);
      const fragment = document.createElement('template');
      fragment.innerHTML = `<div>${html}</div>`;
      const paths = [...fragment.content.querySelectorAll('img')].map(image => image.getAttribute('src'));
      for (const image of fragment.content.querySelectorAll('img')) image.src = localImages[image.getAttribute('src')] || image.src;
      document.querySelector('.article-content').append(fragment.content);
      return { styles: document.querySelector('.fg-article-package style')?.textContent, folds: document.querySelectorAll('.fg-body details').length, paths };
    }, { source: paste, localImages });
    assert.match(rendered.styles, /\.fg-article/);
    assert.deepEqual(rendered.paths, inventory.filter(image => image.target).map(image => image.target));
    await loadImages();
    report.renderer = 'Offline snapshot of public website renderer; all network requests blocked';
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.evaluate(() => window.scrollTo(0, 0));
      report.site.push(await measure('site'));
      if ([1440, 390].includes(width)) await page.screenshot({ path: path.join(output, `site-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await checkTOC('site');
    await captureQuotes('site');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('.fg-body h2').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'site-body.png') });
    await page.locator('.fg-table-scroll').first().screenshot({ path: path.join(output, 'site-table.png') });
    await page.evaluate(() => { document.body.classList.add('dark'); window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(output, 'site-dark.png') });
  }
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import MarkdownIt from 'markdown-it';
import { marked } from 'marked';
import { parseHTML } from 'linkedom';
import { convert } from '../scripts/convert.mjs';

const source = readFileSync(new URL('../obs/obs.md', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/article.css', import.meta.url), 'utf8');
const render = html => parseHTML(`<html><body>${html}</body></html>`).document;
const original = render(marked.parse(source));
const result = convert(source, { css, name: 'obs' });
const converted = render(result.paste);

test('preserves the actual article text and structural elements', () => {
  assert.equal(converted.querySelector('h1').textContent, original.querySelector('h1').textContent);
  const body = converted.querySelector('.fg-body');
  for (const tag of ['h2', 'h3', 'h4', 'li', 'strong', 'em', 'del', 'code', 'kbd', 'th', 'blockquote', 'li blockquote', 'blockquote li']) {
    assert.deepEqual([...body.querySelectorAll(tag)].map(el => el.textContent.replace(/\s+/g, ' ').trim()),
      [...original.querySelectorAll(tag)].map(el => el.textContent.replace(/\s+/g, ' ').trim()), tag);
  }
  const paragraphs = [...original.querySelectorAll('p')].filter(p => !p.closest('figure') && !p.matches('.subtitle,.byline'));
  assert.deepEqual([...body.querySelectorAll('p')].map(p => p.textContent.trim()), paragraphs.map(p => p.textContent.trim()));
});

test('preserves every fold and its default state', () => {
  const folds = document => [...document.querySelectorAll('details')].map(el => ({ summary: el.querySelector('summary').textContent, open: el.hasAttribute('open') }));
  assert.deepEqual(folds(converted.querySelector('.fg-body')), folds(original));
  assert.equal(folds(original).length, 5);
});

test('renders strikethrough adjacent to Chinese punctuation', () => {
  const document = render(convert('等等~~，甚至是在课堂/组会上调节投影设备~~。', { css: '', name: 'punctuation' }).paste);
  assert.equal(document.querySelector('del').textContent, '，甚至是在课堂/组会上调节投影设备');
});

test('the five previously literal bold spans render in both Markdown parsers', () => {
  const phrases = ['但是', '尝试将场地中的视频线缆与你的笔记本相连', '接下来我们测试音频连接方式', '一定要注意源是否位于开头，是否会从开头开始播放', '一旦将含有这个源的场景切换到输出，源就会立刻从头开始播放'];
  for (const html of [marked.parse(source), new MarkdownIt({ html: true }).render(source)]) {
    const document = render(html);
    const bold = [...document.querySelectorAll('strong')].map(element => element.textContent);
    for (const phrase of phrases) assert(bold.includes(phrase), phrase);
    assert(!document.body.textContent.includes('**'), 'unparsed bold delimiters remain in the article');
  }
});

test('Markdown author and email appear below the subtitle, remain editable and are sanitized', () => {
  const document = render(convert(source, { css }).paste);
  assert.deepEqual([...document.querySelectorAll('.fg-byline span')].map(element => element.textContent), [...original.querySelectorAll('.byline span')].map(element => element.textContent));
  assert.equal(document.querySelector('.fg-byline a').getAttribute('href'), 'mailto:390177665@qq.com');
  assert.equal(document.querySelector('.fg-subtitle').nextElementSibling.className, 'fg-byline');
  assert.equal(document.querySelector('.fg-body .byline'), null);
  const changed = render(convert(source.replaceAll('卡诺热机之梦', '另一位作者').replaceAll('390177665@qq.com', 'author@example.com'), { css }).paste);
  assert.match(changed.querySelector('.fg-byline').textContent, /另一位作者/);
  assert.equal(changed.querySelector('.fg-byline a').getAttribute('href'), 'mailto:author@example.com');
  const sanitized = render(convert('# Test\n\n<p class="byline"><span onclick="bad()">作者</span><a href="javascript:bad()">邮箱</a><script>bad()</script></p>', { css: '' }).paste);
  assert.equal(sanitized.querySelectorAll('.fg-byline script,.fg-byline [onclick],.fg-byline [href^="javascript:"]').length, 0);
});

test('site image paths match uploaded filenames while retaining figures, captions, widths and case', () => {
  const options = JSON.parse(readFileSync(new URL('../obs/obs.article.json', import.meta.url), 'utf8'));
  const output = convert(source, { css, ...options });
  const document = render(output.paste);
  assert.equal(document.querySelectorAll('img').length, 16);
  assert.equal(document.querySelectorAll('.fg-image-placeholder').length, 0);
  assert.equal(document.querySelectorAll('figcaption').length, 12);
  assert.equal(document.querySelector('img[alt="VGA 线接头"]').getAttribute('src'), '/backend/file/article_file/tech_obs/vga.jpg');
  assert.equal(document.querySelector('img[alt="USB Type-C 线接头"]').getAttribute('src'), '/backend/file/article_file/tech_obs/typeC.jpg');
  assert.equal(document.querySelector('img[alt="3.5mm 音频线接头"]').getAttribute('src'), '/backend/file/article_file/tech_obs/3.5mm_audio.jpg');
  const uploadedNames = ['vga.jpg', 'hdmi.jpg', 'typeC.jpg', '3.5mm_audio.jpg', 'audio.png', 'au_devices.png', 'rightclick_display.png', 'multi_screen.png', 'dpi.png', 'obs_ui.png', 'screen_output.png', 'src_media.png', 'src_window.png', 'src_game.png', 'src_browser.png', 'mixer.png'];
  assert.deepEqual(output.images.map(image => image.target), uploadedNames.map(name => options.imageBase + name));
  const literalSpaces = convert(source.replaceAll('%20', ' '), { css, ...options });
  assert.deepEqual(literalSpaces.images.map(image => image.target), output.images.map(image => image.target));
  assert.equal(document.querySelector('img[alt="VGA 线接头"]').getAttribute('width'), '160');
  for (const link of document.querySelectorAll('figure a')) assert.equal(link.getAttribute('href'), link.querySelector('img').getAttribute('src'));
  for (const link of render(literalSpaces.paste).querySelectorAll('figure a')) assert.equal(link.getAttribute('href'), link.querySelector('img').getAttribute('src'));
  for (const image of document.querySelectorAll('img')) assert(image.getAttribute('src').startsWith(options.imageBase));
  assert.deepEqual(output.images.map(image => image.src), [...original.querySelectorAll('img')].map(image => image.getAttribute('src')));
  const roundtrip = render(new MarkdownIt({ html: true }).render(output.paste));
  assert.deepEqual([...roundtrip.querySelectorAll('img')].map(image => image.getAttribute('src')), output.images.map(image => image.target));
});

test('replaces all images and local image links, retaining their inventory', () => {
  assert.equal(result.images.length, 16);
  assert.equal(converted.querySelectorAll('img').length, 0);
  assert.equal(converted.querySelectorAll('.fg-image-placeholder').length, 16);
  assert.equal(converted.querySelectorAll('a[href^="images/"]').length, 0);
  assert.equal(result.images.filter(image => image.caption).length, 12);
  assert.deepEqual(result.images.map(image => image.src), [...original.querySelectorAll('img')].map(el => el.getAttribute('src')));
});

test('all table-of-contents and back-to-top links resolve', () => {
  const ids = [...converted.querySelectorAll('[id]')].map(el => el.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const link of converted.querySelectorAll('a[href^="#"]')) assert(converted.getElementById(link.getAttribute('href').slice(1)));
});

test('both TOCs retain every heading and numbered third-level source subsections', () => {
  for (const selector of ['.fg-toc-rail', '.fg-toc-mobile nav']) {
    const toc = converted.querySelector(selector);
    assert.deepEqual([...toc.querySelectorAll('.fg-toc-text')].map(element => element.textContent), result.headings.map(heading => heading.title));
    const items = [...toc.querySelectorAll('li > a')];
    for (const [title, number] of [['前置说明', '1'], ['连接方式', '2.1'], ['认识源', '3.7'], ['媒体', '3.7.1'], ['浏览器', '3.7.4'], [result.headings.at(-1).title, '5']]) {
      const link = items.find(element => element.querySelector('.fg-toc-text').textContent === title);
      assert.equal(link.querySelector('.fg-toc-number').textContent, number, title);
    }
    const media = items.find(element => element.querySelector('.fg-toc-text').textContent === '媒体');
    assert.equal(media.parentElement.parentElement.parentElement.querySelector('a .fg-toc-text').textContent, '认识源');
    assert.equal(toc.querySelectorAll('ol ol ol > li').length, 4);
  }
});

test('TOC hierarchy handles skipped heading levels and h5/h6 without empty entries', () => {
  const document = render(convert('# Title\n\n## One\n\n#### Child\n\n##### Grandchild\n\n###### Deep\n\n### Sibling\n\n## Two', { css: '', name: 'levels' }).paste);
  assert.deepEqual([...document.querySelectorAll('.fg-toc-rail .fg-toc-number')].map(element => element.textContent), ['1', '1.1', '1.1.1', '1.1.1.1', '1.2', '2']);
});

test('the website Markdown pass preserves CSS, folds and inline formatting', () => {
  // Match the public renderer's standalone style rule, then run its Markdown settings.
  const website = new MarkdownIt({ html: true, linkify: true, breaks: true });
  const htmlBlock = website.renderer.rules.html_block;
  website.renderer.rules.html_block = (tokens, index, options, env, self) => {
    assert(!/^\s*<style[^>]*>([\s\S]*?)<\/style>\s*$/i.test(tokens[index].content), 'style must stay in the scoped HTML package');
    return htmlBlock(tokens, index, options, env, self);
  };
  const roundtrip = render(website.render(result.paste));
  assert.equal(roundtrip.querySelector('style').textContent.trim(), css.trim());
  assert.equal(roundtrip.querySelector('.fg-byline a').getAttribute('href'), 'mailto:390177665@qq.com');
  assert.equal(roundtrip.querySelector('.fg-body').textContent.replace(/\s+/g, ' ').trim(), converted.querySelector('.fg-body').textContent.replace(/\s+/g, ' ').trim());
});

test('generated output cannot execute source scripts or submit forms', () => {
  const output = convert('# Example\n\n<script>alert(1)</script>\n\n<p onclick="bad()"><a href="javascript:bad()">link</a></p>\n\n<form action="/publish"><button>Publish</button></form>', { css: '', name: 'test' });
  const document = render(output.paste);
  assert.equal(document.querySelectorAll('script,iframe,form,button,[onclick],[href^="javascript:"]').length, 0);
});

test('conversion handles multiple articles, repeated headings and image-only Markdown links', () => {
  const output = convert('# Another article\n\n## Same\n\n[![demo](images/demo.png)](images/demo.png)\n\n## Same\n\n<details open>\n<summary>Extra</summary>\n\n**Text**\n\n</details>', { css: '', name: 'another' });
  const document = render(output.paste);
  assert.equal(output.images.length, 1);
  assert.equal(document.querySelectorAll('a[href^="images/"]').length, 0);
  assert.equal(new Set(output.headings.map(h => h.id)).size, 2);
  assert.equal(document.querySelector('.fg-body details strong').textContent, 'Text');
});

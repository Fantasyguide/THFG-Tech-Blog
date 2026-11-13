import { marked } from 'marked';
import { parseHTML } from 'linkedom';

// Preserve this manuscript's CJK punctuation inside deletion marks. Modern Markdown
// delimiter rules otherwise leave “等等~~，甚至……~~。” visibly unformatted.
marked.use({ extensions: [{
  name: 'cjkDeletion', level: 'inline',
  start(source) { return source.indexOf('~~'); },
  tokenizer(source) {
    const match = /^~~([\p{P}][^\n]*?)~~(?=$|[\p{P}\s])/u.exec(source);
    if (match) return { type: 'cjkDeletion', raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
  },
  renderer(token) { return `<del>${this.parser.parseInline(token.tokens)}</del>`; },
}] });

export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function convert(source, { css, name = 'article', imageBase = '' }) {
  if (imageBase && (!/^\/(?!\/)[^?#\\\s]+\/$/.test(imageBase) || imageBase.split('/').some(part => ['.', '..'].includes(decodeURIComponent(part))))) {
    throw new Error('imageBase 必须是以 / 开头和结尾的站内目录。');
  }
  function targetImagePath(src) {
    if (!imageBase) return '';
    if (src.startsWith(imageBase)) return src;
    if (!src || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src)) return '';
    const filename = decodeURIComponent(src.split(/[?#]/)[0].split('/').at(-1));
    if (!filename || /[/\\]/.test(filename) || ['.', '..'].includes(filename)) throw new Error('无效的图片文件名：' + src);
    // Uploaded filenames use underscores where the local filename has spaces.
    return imageBase + encodeURIComponent(filename.replaceAll(' ', '_'));
  }
  const { document } = parseHTML('<!doctype html><html><head></head><body><div id="source"></div></body></html>');
  const body = document.getElementById('source');
  body.innerHTML = marked.parse(source, { gfm: true, breaks: false });
  // Article sources may contain ordinary HTML, but output never contains executable content.
  for (const element of body.querySelectorAll('script,iframe,object,embed,link,meta,base,style,form,input,button')) element.remove();
  for (const element of body.querySelectorAll('*')) {
    for (const attr of [...element.attributes]) {
      if (/^on/i.test(attr.name) || /^(?:srcdoc|style)$/i.test(attr.name)) element.removeAttribute(attr.name);
      if (/^(?:href|src|xlink:href)$/i.test(attr.name) && /^(?:javascript|vbscript|data):/i.test(attr.value.replace(/[\u0000-\u0020]/g, ''))) element.removeAttribute(attr.name);
    }
  }
  const titleNode = body.querySelector('h1');
  const title = titleNode?.textContent.trim() || name;
  const titleHTML = titleNode?.innerHTML || escapeHTML(title);
  titleNode?.remove();
  const subtitleNode = body.querySelector('.subtitle');
  const subtitle = subtitleNode?.innerHTML || '';
  subtitleNode?.remove();
  // The byline is article content maintained beside the title in Markdown.
  // Its inline HTML has already passed the same sanitization as the body.
  const bylineNode = body.querySelector('.byline');
  const byline = bylineNode?.innerHTML || '';
  bylineNode?.remove();

  const images = [];
  for (const image of [...body.querySelectorAll('img')]) {
    const figure = image.closest('figure');
    const caption = figure?.querySelector('figcaption')?.textContent.trim() || '';
    const entry = { index: images.length + 1, src: image.getAttribute('src') || '', alt: image.getAttribute('alt') || '', caption };
    entry.target = targetImagePath(entry.src);
    images.push(entry);
    if (entry.target) {
      image.setAttribute('src', entry.target);
      image.removeAttribute('srcset');
      image.setAttribute('loading', 'lazy');
      image.setAttribute('decoding', 'async');
      const anchor = image.closest('a');
      if (anchor?.getAttribute('href') === entry.src) anchor.setAttribute('href', entry.target);
      continue;
    }
    const placeholder = document.createElement('span');
    placeholder.className = 'fg-image-placeholder';
    placeholder.setAttribute('data-image-index', String(entry.index));
    placeholder.innerHTML = `<span class="fg-image-label">图片 ${String(entry.index).padStart(2, '0')} · 待补</span><span>${escapeHTML(caption || entry.alt || '图片位置')}</span>`;
    // Remove image links too, so a placeholder cannot navigate to a nonexistent local file.
    const anchor = image.closest('a');
    if (figure && figure.querySelectorAll('img').length === 1) figure.replaceWith(placeholder);
    else if (anchor && anchor.textContent.trim() === '' && anchor.querySelectorAll('img').length === 1) anchor.replaceWith(placeholder);
    else image.replaceWith(placeholder);
  }
  for (const picture of body.querySelectorAll('picture')) {
    for (const source of picture.querySelectorAll('source')) source.remove();
  }
  for (const table of [...body.querySelectorAll('table')]) {
    const wrap = document.createElement('div');
    wrap.className = 'fg-table-scroll';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', '表格，可横向滚动');
    wrap.setAttribute('tabindex', '0');
    table.replaceWith(wrap);
    wrap.append(table);
  }
  const prefix = 'fg-' + name.replace(/[^a-z0-9_-]/gi, '-');
  const headings = [];
  const usedIds = new Set([...body.querySelectorAll('[id]')].map(el => el.id));
  for (const heading of body.querySelectorAll('h2,h3,h4,h5,h6')) {
    if (!heading.id) {
      let id = `${prefix}-section-${headings.length + 1}`;
      while (usedIds.has(id)) id += '-next';
      heading.id = id;
      usedIds.add(id);
    }
    headings.push({ level: Number(heading.tagName.slice(1)), id: heading.id, title: heading.textContent.trim() });
  }
  const wordCount = [...body.textContent.replace(/\s/g, '')].length;
  const tocRoots = [], tocStack = [];
  for (const heading of headings) {
    const item = { ...heading, children: [] };
    while (tocStack.length && tocStack.at(-1).level >= item.level) tocStack.pop();
    (tocStack.at(-1)?.children || tocRoots).push(item);
    tocStack.push(item);
  }
  const tocLinks = (items, parent = []) => `<ol role="list">${items.map((h, index) => {
    const number = [...parent, index + 1];
    return `<li><a href="#${escapeHTML(h.id)}"><span class="fg-toc-number">${number.join('.')}</span> <span class="fg-toc-text">${escapeHTML(h.title)}</span></a>${h.children.length ? tocLinks(h.children, number) : ''}</li>`;
  }).join('\n')}</ol>`;
  const tocTree = tocRoots.length ? tocLinks(tocRoots) : '';
  const toc = tocTree ? `<details class="fg-toc fg-toc-mobile"><summary>文章目录</summary><nav aria-label="文章目录">${tocTree}</nav></details>` : '';
  const topId = `${prefix}-top`;
  const article = `<article class="fg-article" id="${topId}">
${tocTree ? `<nav class="fg-toc fg-toc-rail" aria-label="文章目录"><p class="fg-toc-title">文章目录</p>${tocTree}<a class="fg-toc-top" href="#${topId}">回到文章开头 ↑</a></nav>` : ''}
<div class="fg-main">
<header class="fg-header"><h1>${titleHTML}</h1>${subtitle ? `<p class="fg-subtitle">${subtitle}</p>` : ''}${byline ? `<p class="fg-byline">${byline}</p>` : ''}<p class="fg-meta">约 ${wordCount.toLocaleString('zh-CN')} 字 · 阅读约 ${Math.max(1, Math.round(wordCount / 450))} 分钟</p></header>
${toc}
<div class="fg-body">${body.innerHTML}</div>
<div class="fg-end"><a href="#${topId}">回到文章开头 ↑</a></div>
</div>
</article>`;
  // Keep the style inside the HTML block: the site's standalone-style rewriter cannot
  // correctly scope comma selectors inside @media. Every rule is explicitly scoped here.
  const paste = `<!-- 本地生成；${images.some(image => image.target) ? '图片使用站内路径' : '图片待补'}。此文本不包含保存或发布操作。 -->\n<div class="fg-article-package">\n<style>\n${css}\n</style>\n${article}\n</div>\n`;
  return { paste, title, headings, images, wordCount };
}

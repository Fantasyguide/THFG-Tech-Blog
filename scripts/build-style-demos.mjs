import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'style-demos');
await mkdir(out, { recursive: true });
const base = await readFile(path.join(out, 'source/base.css'), 'utf8');
const variants = await readFile(path.join(out, 'source/themes.css'), 'utf8');
const sample = await readFile(path.join(out, 'source/sample.html'), 'utf8');
const galleryCss = await readFile(path.join(out, 'source/gallery.css'), 'utf8');
const themes = [
  { id: 'papermod', name: 'PaperMod', type: '清爽单栏', brief: '清晰的无衬线字、紧凑目录、适中的留白。', tags: '轻量 · 通用 · 知识分享', source: 'https://adityatelange.github.io/hugo-PaperMod/posts/markdown-syntax/', family: 'Hugo', mark: 'Paper notes', feature: '适合图文教程和日常技术文章。' },
  { id: 'next', name: 'NexT · Pisces', type: '经典双栏', brief: '黑白配色、居中标题、安静的左侧导航。', tags: '克制 · 有序 · 长期归档', source: 'https://theme-next.js.org/docs/theme-settings/', family: 'Hexo', mark: '纸上漫游', feature: '适合章节多、需要随时查阅的长文。' },
  { id: 'casper', name: 'Ghost · Casper', type: '杂志长文', brief: '醒目的大标题、宽松导语、衬线正文。', tags: '舒展 · 叙事 · 编辑感', source: 'https://demo.ghost.io/welcome/', family: 'Ghost', mark: '漫游 JOURNAL', feature: '适合经验分享、故事和专题文章。' },
  { id: 'bear', name: 'Bear Blog', type: '极简文字', brief: '窄栏、蓝色链接，像一个朴素的私人博客。', tags: '轻巧 · 直接 · 文字优先', source: 'https://herman.bearblog.dev/', family: 'Bear', mark: 'ʕ•ᴥ•ʔ 纸上漫游', feature: '适合短笔记、日志与持续更新的文章。' },
  { id: 'chirpy', name: 'Chirpy · Dark', type: '深色技术', brief: '深灰底、蓝色链接、侧栏目录与代码块。', tags: '深色 · 工具感 · 技术记录', source: 'https://chirpy.cotes.page/posts/text-and-typography/', family: 'Jekyll', mark: '纸上漫游', feature: '适合代码较多、层级明确的技术教程。' },
  { id: 'tufte', name: 'Tufte CSS', type: '书页旁注', brief: '暖白纸色、衬线字体、宽页边与旁注。', tags: '书卷气 · 慢阅读 · 说明性长文', source: 'https://edwardtufte.github.io/tufte-css/', family: '文章排版', mark: '漫游手记', feature: '适合随笔、知识讲解和带注释的长文。' },
];
const toc = '<a href="#rhythm">01 · 留一点呼吸</a><a href="#record">02 · 把观察留下来</a><a href="#practice">03 · 从一个小习惯开始</a>';
function sidebar(theme) {
  if (!['next', 'chirpy'].includes(theme.id)) return '';
  return `<aside class="side"><div class="side-brand"><span class="side-monogram" aria-hidden="true">漫</span><a href="./index.html">${theme.mark}</a><p>关于生活与技术的零散记录</p></div><nav class="side-menu" aria-label="博客导航"><a href="#article-top">文章</a><a href="#record">笔记</a><a href="#practice">归档</a></nav><div class="side-toc"><p>本文目录</p>${toc}</div><p class="side-bottom">WALK SLOWLY. WRITE CLEARLY.</p></aside>`;
}
for (const [index, theme] of themes.entries()) {
  const prev = themes[(index + themes.length - 1) % themes.length];
  const next = themes[(index + 1) % themes.length];
  const masthead = ['next', 'chirpy'].includes(theme.id) ? '' : `<header class="masthead"><a class="wordmark" href="./index.html">${theme.mark}</a><nav aria-label="博客导航"><a href="#article-top">文章</a><a href="#record">笔记</a><a href="#practice">关于</a></nav></header>`;
  const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${theme.name} · 博客样式参考</title><style>${base}\n${variants}</style></head>
<body class="theme-${theme.id}">
<div class="demo-bar"><a href="./index.html">← 样式总览</a><span>${String(index + 1).padStart(2, '0')} / 06 <b>${theme.name}</b></span><nav aria-label="样式切换"><a href="./${prev.id}.html">← 上一种</a><a href="./${next.id}.html">下一种 →</a></nav></div>
${masthead}<div class="layout">${sidebar(theme)}<main id="article-top" class="main">
<article class="post"><header class="post-header"><p class="eyebrow">生活笔记 <span> / FIELD NOTES</span></p><h1>让文字有自己的节奏</h1><p class="dek">从一次缓慢的散步开始，记录那些容易被忽略的细节。</p><div class="meta"><span class="byline">文 / 林间</span><time datetime="2026-11-13">2026 年 11 月 13 日</time><span>约 3 分钟</span></div></header>
<details class="inline-toc"><summary>文章目录</summary><nav>${toc}</nav></details>
${sample}
<div class="post-bottom"><span># 记录</span><span># 阅读</span><a href="#article-top">回到开头 ↑</a></div></article>
<aside class="reference"><p><b>样式参考：${theme.name}</b> · ${theme.family}</p><p>${theme.feature} 这里展示的是依据主题特征制作的中文排版小样。</p><a href="${theme.source}" target="_blank" rel="noopener noreferrer">查看原主题 / 官方示例 ↗</a></aside>
</main>${theme.id === 'chirpy' ? `<aside class="right-toc"><p>本文目录</p>${toc}<span>深色阅读 · 技术笔记</span></aside>` : ''}</div>
<script>if(new URLSearchParams(location.search).has('embed'))document.documentElement.classList.add('embedded');</script>
</body></html>`;
  await writeFile(path.join(out, theme.id + '.html'), page);
}
await writeFile(path.join(out, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>六种博客排版 · 样式参考</title><style>${galleryCss}</style></head><body>
<main class="gallery"><header class="gallery-header"><p class="kicker">BLOG TYPOGRAPHY / 01—06</p><h1>先挑一种阅读的感觉。</h1><p class="intro">同一篇短文，六种常见博客排版。打开小样，看看正文、标题、引用和代码读起来是否舒服。</p><div class="gallery-meta"><span>6 个独立 HTML</span><span>中文示例</span><span>桌面 / 手机</span><span>原创示例文字</span></div></header>
<section class="cards" aria-label="博客主题小样">${themes.map((t,i)=>`<article class="card"><a class="card-preview" href="./${t.id}.html" aria-label="打开 ${t.name} 的排版小样"><iframe src="./${t.id}.html?embed" title="${t.name} 预览" tabindex="-1" scrolling="no" loading="lazy"></iframe><span class="open-label">打开完整小样 ↗</span></a><div class="card-info"><div class="card-heading"><span class="number">${String(i+1).padStart(2,'0')}</span><h2><a href="./${t.id}.html">${t.name}</a></h2><span class="type">${t.type}</span></div><p>${t.brief}</p><div class="card-footer"><span>${t.tags}</span><a href="${t.source}" target="_blank" rel="noopener noreferrer">原主题 ↗</a></div></div></article>`).join('\n')}</section>
<footer class="gallery-footer"><p>这些小样参考公开主题的排版特征制作；每页都附有原主题链接。选定方向后，可以进一步组合字体、宽度与强调色。</p><p>这里的文字为独立演示内容，不涉及现有文章。</p></footer></main>
<script>const fit=()=>document.querySelectorAll('.card-preview').forEach(box=>{box.style.setProperty('--scale',box.clientWidth/1100);});new ResizeObserver(fit).observe(document.querySelector('.cards'));fit();</script></body></html>`);
console.log('已生成 style-demos/index.html 和 6 份独立的主题 HTML。');

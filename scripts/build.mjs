import { readFile, writeFile, mkdir, readdir, stat, realpath, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert, escapeHTML } from './convert.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectReal = await realpath(project);
const scriptJSON = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('npm run build -- [文章.md | 文件夹 ...]\n无参数时递归转换文章目录，排除 README.md、AGENTS.md、node_modules、dist 和工具目录。\n输出 dist/<相对路径>/<文件名>.paste.html 和 .preview.html。');
  process.exit(0);
}
const excluded = new Set(['node_modules', 'dist', 'scripts', 'styles', 'tests']);
async function collect(input) {
  const info = await stat(input);
  if (info.isFile()) return /\.md$/i.test(input) ? [input] : [];
  const files = [];
  for (const entry of await readdir(input, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || excluded.has(entry.name)) continue;
    if (entry.isDirectory()) files.push(...await collect(path.join(input, entry.name)));
    else if (entry.isFile() && /\.md$/i.test(entry.name) && !/^(README|AGENTS)\.md$/i.test(entry.name)) files.push(path.join(input, entry.name));
  }
  return files.sort();
}

const css = await readFile(path.join(project, 'styles/article.css'), 'utf8');
const template = await readFile(path.join(project, 'scripts/preview.html'), 'utf8');
const files = [...new Set((await Promise.all((args.length ? args : [project]).map(p => collect(path.resolve(p))))).flat())];
if (!files.length) throw new Error('没有找到可转换的 Markdown 文章。');
const outputs = [];
for (const file of files) {
  const relative = path.relative(project, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('请将文章放在此项目内再转换：' + file);
  const stem = relative.replace(/\.md$/i, '');
  let metadata = {};
  try { metadata = JSON.parse(await readFile(file.replace(/\.md$/i, '.article.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('文章配置必须是 JSON 对象：' + file);
  const result = convert(await readFile(file, 'utf8'), { css, name: stem.replaceAll(path.sep, '-'), imageBase: metadata.imageBase });
  const destination = path.join(project, 'dist', stem);
  await mkdir(path.dirname(destination), { recursive: true });
  const previewImages = {};
  const imageSources = new Map();
  for (const image of result.images.filter(image => image.target && !image.src.startsWith('/'))) {
    const local = await realpath(path.resolve(path.dirname(file), decodeURIComponent(image.src.split(/[?#]/)[0])));
    if (!local.startsWith(projectReal + path.sep)) throw new Error('图片必须位于项目内：' + image.src);
    if (imageSources.has(image.target) && imageSources.get(image.target) !== local) throw new Error('站内图片文件名冲突：' + image.target);
    imageSources.set(image.target, local);
    const filename = decodeURIComponent(image.target.split('/').at(-1));
    const assetDir = destination + '.assets';
    await mkdir(assetDir, { recursive: true });
    await copyFile(local, path.join(assetDir, filename));
    image.preview = `./${encodeURIComponent(path.basename(assetDir))}/${encodeURIComponent(filename)}`;
    previewImages[image.target] = image.preview;
  }
  await writeFile(destination + '.paste.html', result.paste);
  await writeFile(destination + '.images.json', JSON.stringify(result.images, null, 2) + '\n');
  const preview = template.replaceAll('__TITLE__', escapeHTML(result.title))
    .replace('__IMAGE_STATUS__', Object.keys(previewImages).length ? '图片使用本地副本' : '图片待补')
    .replace('__PASTE_JSON__', scriptJSON(result.paste))
    .replace('__PREVIEW_IMAGES_JSON__', scriptJSON(previewImages));
  await writeFile(destination + '.preview.html', preview);
  outputs.push({ stem: stem.split(path.sep).join('/'), title: result.title });
  console.log(`${relative} → dist/${stem}.paste.html（${result.images.filter(image => image.target).length} 张站内路径图片，${result.images.filter(image => !image.target).length} 处占位）`);
}
await mkdir(path.join(project, 'dist'), { recursive: true });
await writeFile(path.join(project, 'dist/index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本地文章预览</title><style>body{max-width:760px;margin:60px auto;padding:0 24px;font:17px/1.8 system-ui;color:#1d1e20;background:#fff}a{color:#1d1e20}li{margin:20px 0}</style><h1>本地文章预览</h1><p>打开文章，检查排版，再复制源码到网站编辑器。</p><ul>${outputs.map(o => `<li><a href="./${o.stem.split('/').map(encodeURIComponent).join('/')}.preview.html">${escapeHTML(o.title)}</a></li>`).join('')}</ul></html>`);

# 博客样式小样

打开 `index.html` 比较六种样式，或单独打开各个 HTML。每份主题 HTML 都内嵌样式，可以单独保存并离线浏览；只有点击“原主题”链接才需要联网。

| 小样 | 参考方向 | 官方来源 |
| --- | --- | --- |
| `papermod.html` | 清爽单栏 | [Hugo PaperMod](https://adityatelange.github.io/hugo-PaperMod/posts/markdown-syntax/) |
| `next.html` | 黑白双栏 | [Hexo NexT / Pisces](https://theme-next.js.org/docs/theme-settings/) |
| `casper.html` | 杂志长文 | [Ghost Casper](https://demo.ghost.io/welcome/) |
| `bear.html` | 极简文字 | [Bear Blog](https://herman.bearblog.dev/) |
| `chirpy.html` | 深色技术博客 | [Jekyll Chirpy](https://chirpy.cotes.page/posts/text-and-typography/) |
| `tufte.html` | 衬线书页与旁注 | [Tufte CSS](https://edwardtufte.github.io/tufte-css/) |

这些页面为根据公开主题的排版特征制作的中文小样，不是主题的完整安装或逐像素复刻。使用同一篇独立编写的演示文字，方便比较；没有使用 OBS 文章内容，也不包含图片、账号或网站发布功能。

`source/sample.html` 是共享示例，`source/base.css` 是基础排版，`source/themes.css` 是六种主题样式，`source/gallery.css` 是总览页样式。修改后运行：

```sh
npm run styles
```

需要预览服务时可仅提供本目录：

```sh
node scripts/serve.mjs --root style-demos --host 127.0.0.1 --port 3110
```

服务端口需要先检查占用；对外访问的监听地址和防火墙按用户全局规则处理。检查日期：2026-11-13。

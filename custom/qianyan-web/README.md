# 前沿消息 · 正式首页

2026-10-18 按用户选择采用最初版设计。正式入口为 `index.html`，样式为 `previous.css`，使用系统无衬线字体，无外部字体或框架依赖。`previous.html` 保留原预览，`radix.html`、`style.css`、`about.html` 和 `subscribe.html` 保留未采用的参考方案，不部署。

## 功能

- 完整正文单列展示、桌面右侧订阅栏、手机单栏。
- 全量 / AI 精选共用线上公开消息，搜索、独立分页、每页 10/20/50/100 条、数字页码及输入跳页。
- 系统 / 白天 / 黑夜三主题，记住选择并同步同站标签页。
- 每 30 秒检查更新；失败保留消息，首次请求失败时保留服务器注入的频道历史。
- 继续使用已有 RSS、Telegram 和历史详情入口。

## 部署

仅将 `index.html`、`previous.css`、`theme.js`、`broadcastchannel.js` 放入运行目录 `docker/qianyan-web/`，按 `../docker/compose.example.yml` 挂载至 `/app/dist/client/qianyan`。首页模块将三个根资源路径转换为 `/qianyan/` 并添加版本号，其他路由沿用原有页面。

`news-data/all.json` 仅供本地预览，不能提交或覆盖线上数据。生产沿用现有 `output/broadcast-public` 只读挂载，不能公开整个 output。

本地预览：在本目录执行 `python -m http.server 4176 --bind 127.0.0.1`，打开 http://127.0.0.1:4176/。主题验证：`node test-theme.cjs`。

首页依赖固定镜像的编译模块路径，镜像升级时必须重新核验。回滚可恢复上一提交的 `docker/broadcastchannel-home.mjs` 并仅重建网站服务，保留消息数据。保留 GPL-3.0 LICENSE。

公开归档约 34 MB；公网实测下载超过 30 秒，因此请求超时设为 60 秒。同步期间不会重复发起同一视图请求；失败仍保留缓存。

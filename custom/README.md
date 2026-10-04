# BroadcastChannel 前沿消息定制版

这是 BroadcastChannel 的部署定制层和 TrendRadar 推送补丁，不是完整上游源码副本。

## 功能
- 全量和精选共用卡片与分页渲染：统一绝对时间、来源、四行摘要、底部标签及控件尺寸，桌面双列、手机单列；后台消息标题直达论坛原文，历史独有消息保留频道详情。
- 全量 / AI 精选在同一页面通过标签按钮切换，不重新加载页面；保留两种视图各自的分页状态，支持方向键切换和浏览器返回。精选按相同全量数据筛选，不再限制最近 200 条。
- 网站与论坛精选推送共用 `config/config.yaml` 的 `ai_filter.min_score`，按 `score >= min_score` 筛选。
- 全量消息发往频道和可选私聊目标；单目标失败不阻断其他目标。
- 全量直接读取后台 RSS 持久化队列，精选从同一份 all.json 按相关度过滤；保留合并去重的频道历史，每页 20 条，显示实际归档条数、总页数和条目范围。全量和精选均为页内翻页，不重新加载文档；首尾页、相邻页和页码下拉框可直接跳到任意页，并保留刷新、返回和独立视图状态。
- 页码较多时使用省略号，手机页码横向滚动，不把全部历史按钮堆满屏幕；下拉框包含全部页。历史游标入口映射到归档页。后台暂不可用时保留缓存；首次失败显示历史降级状态。搜索在页面内过滤同一份后台消息，不调用频道搜索。
- 精选每页 20 条，显示当前页 / 总页数、条目范围和可点击页码，刷新及返回保留页码。
- 两种视图每 30 秒检查最新导出，支持立即同步；失败保留已有消息，超过 15 分钟未更新提示异常。隐藏标签页暂停轮询，返回时立即检查。

## 接入已有 TrendRadar
1. 将 `full_rss_push.py`、`trendradar/ai/forum_stream.py`、`docker/broadcastchannel.js`、`docker/broadcastchannel.css`、`docker/broadcastchannel-home.mjs` 和 `docker/broadcastchannel-logo.jpg` 放入已有 TrendRadar 对应位置。合并已有改动，不直接覆盖未知版本。
2. 将 `docker/compose.example.yml` 的服务合并到现有 compose，按真实目录调整挂载。
3. 全量推送服务需要原有 TrendRadar 运行时、配置和 output 挂载，并配置：
   - `FULL_RSS_PUBLIC_DIR=/app/output/broadcast-public`
   - `TELEGRAM_FULL_BOT_TOKEN`、`TELEGRAM_FULL_CHAT_ID`
   - `TELEGRAM_FULL_PRIVATE_CHAT_ID`（可选，原私聊用户 ID）
   - `FORUM_AI_STREAM=true` 和原有 AI 凭据
4. 确保 `output/broadcast-public/all.json` 已导出；仅挂载这个公开目录，不能公开整个 output 或 SQLite 数据库。
5. 重新创建受影响的服务，使挂载与环境变量生效；配置阈值后续修改无需重启，下一轮抓取评分后导出，已打开的精选网页自动检查并同步。后台抓取评分约每 5 分钟一轮，AI 或网络耗时可能延长；旧消息分数不会自动重算。没有新增达标消息时，数据更新时间仍会变化，条目数量不一定增加。
6. 旧频道迁移：先停用旧 broadcastchannel-index.timer 并停止对应 service，避免覆盖后台导出。将已完成的公开频道 all.json 保存为 output/broadcast-public/channel-history.json（只做一次，不覆盖已有历史）；没有旧归档时可单次运行 index 脚本，指定 --output 到 channel-history.json，之后不启用抓频道的定时任务。后台导出按原文 URL 去重，并按来源、发布时间及唯一标题前缀合并频道预览；不确定的历史保留并标记未评分，不自动加入精选。
7. 网站首页使用固定镜像对应的本地 home 模块覆盖，不再请求 Telegram 获取首页。该模块只提供本地历史降级内容；实时全量与精选都读取 all.json。镜像升级须重新核验 index_BRGBbngx.mjs 的挂载路径。旧频道详情、历史游标等兼容路径仍由上游处理。

后台抓取写入队列后立即导出全量，再发送 Telegram 和进行 AI 评分，评分后更新导出。待评分内容已在全量可见，不会因 Telegram 失败而消失。两个兼容 JSON 同轮导出，页面两种视图只读取原子发布的 all.json，selected.json 仅保留兼容。阈值改变不重算旧分数。

页码基于当前快照，新消息到来后旧消息可能移到后一页。频道历史冻结，不再实时对账旧频道的编辑或删除。历史独有内容没有 AI 分数，因此只在全量显示。

`compose.example.yml` 只包含网站服务，不替代现有推送部署。反向代理和 TLS 由部署环境管理。

## 检查
- 公开索引解析：python3 test_channel_index.py，覆盖正文、实体、绝对时间和公开链接校验，不访问数据库或发送消息。
- Python：在已有全量 RSS 运行时中执行 `python test_full_rss_dual_send.py`，包含双发隔离、原子导出、阈值热读取及边界一致性，不发送真实消息。
- 浏览器：`PLAYWRIGHT_MODULE=/path/to/playwright-core CHROME_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:4321 node test_pagination.cjs`。

## 上游及许可
- BroadcastChannel： https://github.com/miantiao-me/BroadcastChannel ，直接使用其固定摘要镜像，未包含镜像源码。
- TrendRadar： https://github.com/sansan0/TrendRadar ，此处包含依赖其运行时的定制源码。保留 GPL-3.0 LICENSE。

不包含凭据、生产数据库、用户兴趣文件、历史消息或私聊 ID。

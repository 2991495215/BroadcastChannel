# BroadcastChannel 前沿消息定制版

这是 BroadcastChannel 的部署定制层和 TrendRadar 推送补丁，不是完整上游源码副本。

## 功能
- 灰白卡片布局，桌面双列、手机单列。
- 全量 / AI 精选切换；精选展示最近最多 200 条。
- 网站与论坛精选推送共用 `config/config.yaml` 的 `ai_filter.min_score`，按 `score >= min_score` 筛选。
- 全量消息发往频道和可选私聊目标；单目标失败不阻断其他目标。
- 顶部和底部均提供上一页、下一页、回到最新及本次浏览页序。Telegram 是游标分页，无稳定总页数；直接打开历史游标时不伪造绝对页码。

## 接入已有 TrendRadar
1. 将 `full_rss_push.py`、`trendradar/ai/forum_stream.py` 和两个 `docker/broadcastchannel.*` 文件放入已有 TrendRadar 对应位置。合并已有改动，不直接覆盖未知版本。
2. 将 `docker/compose.example.yml` 的服务合并到现有 compose，按真实目录调整挂载。
3. 全量推送服务需要原有 TrendRadar 运行时、配置和 output 挂载，并配置：
   - `FULL_RSS_PUBLIC_DIR=/app/output/broadcast-public`
   - `TELEGRAM_FULL_BOT_TOKEN`、`TELEGRAM_FULL_CHAT_ID`
   - `TELEGRAM_FULL_PRIVATE_CHAT_ID`（可选，原私聊用户 ID）
   - `FORUM_AI_STREAM=true` 和原有 AI 凭据
4. 确保 `output/broadcast-public/selected.json` 已导出；仅挂载这个公开目录，不能公开整个 output 或 SQLite 数据库。
5. 重新创建受影响的服务，使挂载与环境变量生效；配置阈值后续修改无需重启，下一轮抓取评分后导出。已打开网页需刷新。旧消息分数不会自动重算。

`compose.example.yml` 只包含网站服务，不替代现有推送部署。反向代理和 TLS 由部署环境管理。

## 检查
- Python：在已有全量 RSS 运行时中执行 `python test_full_rss_dual_send.py`，包含双发隔离、原子导出、阈值热读取及边界一致性，不发送真实消息。
- 浏览器：`PLAYWRIGHT_MODULE=/path/to/playwright-core CHROME_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:4321 node test_pagination.cjs`。

## 上游及许可
- BroadcastChannel： https://github.com/miantiao-me/BroadcastChannel ，直接使用其固定摘要镜像，未包含镜像源码。
- TrendRadar： https://github.com/sansan0/TrendRadar ，此处包含依赖其运行时的定制源码。保留 GPL-3.0 LICENSE。

不包含凭据、生产数据库、用户兴趣文件、历史消息或私聊 ID。

"""论坛全量流的持久化评分队列；整点消费者只读取已完成评分的条目。"""
import json
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

from trendradar.ai.filter import AIFilter, AIFilterResult


def enabled():
    return os.getenv("FORUM_AI_STREAM", "").lower() == "true"


def min_score(config=None):
    if config is None:
        path = Path(os.getenv("FULL_RSS_CONFIG", "/app/config/config.yaml"))
        config = yaml.safe_load(path.read_text(encoding="utf-8"))
    settings = config.get("AI_FILTER", config.get("ai_filter", {}))
    value = settings.get("MIN_SCORE", settings.get("min_score", 0))
    if isinstance(value, bool):
        raise ValueError("ai_filter.min_score 必须是 0~1 的数值")
    threshold = float(value)
    if not 0 <= threshold <= 1:
        raise ValueError("ai_filter.min_score 必须是 0~1 的数值")
    return threshold


@contextmanager
def connect():
    path = Path(os.getenv("FULL_RSS_STATE", "/app/output/full-rss-seen.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(path, timeout=30)
    c.row_factory = sqlite3.Row
    try:
        init_queue(c)
        with c:
            yield c
    finally:
        c.close()


def init_queue(c):
    c.execute("""CREATE TABLE IF NOT EXISTS forum_ai_queue (
        id INTEGER PRIMARY KEY, identity TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL, discovered_at REAL NOT NULL,
        score REAL, tag TEXT, priority INTEGER, scored_at REAL, sent_at REAL
    )""")
    c.execute("CREATE TABLE IF NOT EXISTS forum_ai_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")


def enqueue(c, name, entry, key, url):
    payload = {
        "feed_id": entry["feed_id"], "source": name,
        "title": entry.get("title", ""), "url": url,
        "summary": entry.get("summary") or entry.get("description") or "",
        "author": entry.get("author", ""),
        "published": entry.get("published_display", ""),
    }
    c.execute(
        "INSERT OR IGNORE INTO forum_ai_queue(identity,payload,discovered_at) VALUES(?,?,?)",
        (url or entry["feed_id"] + ":" + key, json.dumps(payload, ensure_ascii=False), time.time()),
    )


def score_pending(config):
    threshold = min_score(config)
    with connect() as c:
        rows = c.execute("SELECT * FROM forum_ai_queue WHERE score IS NULL ORDER BY id").fetchall()
        if not rows:
            return
        f = AIFilter(config["AI"], config["AI_FILTER"], lambda: datetime.now(ZoneInfo("Asia/Shanghai")))
        interests = f.load_interests_content(config["AI_FILTER"].get("INTERESTS_FILE"))
        if not interests:
            raise RuntimeError("论坛评分兴趣文件为空")
        fingerprint = f.compute_interests_hash(interests)
        cached = c.execute("SELECT value FROM forum_ai_meta WHERE key='tags'").fetchone()
        metadata = json.loads(cached[0]) if cached else {}
        if metadata.get("hash") != fingerprint:
            tags = f.extract_tags(interests)
            if not tags:
                raise RuntimeError("论坛评分标签提取失败")
            metadata = {"hash": fingerprint, "tags": [dict(t, id=i, priority=i) for i, t in enumerate(tags, 1)]}
            c.execute("INSERT OR REPLACE INTO forum_ai_meta VALUES('tags',?)", (json.dumps(metadata, ensure_ascii=False),))
            c.commit()
        tags = metadata["tags"]
        tag_map = {t["id"]: t for t in tags}
        size = max(1, config["AI_FILTER"].get("BATCH_SIZE", 50))
        # ponytail: 单进程顺序评分；耗时超过轮询周期时再拆独立评分 worker。
        for start in range(0, len(rows), size):
            if start:
                time.sleep(config["AI_FILTER"].get("BATCH_INTERVAL", 2))
            batch = rows[start:start + size]
            titles = [dict(json.loads(r["payload"]), id=r["id"]) for r in batch]
            for item in titles:
                item["summary"] = item["summary"][:500]
            results = f.classify_batch(titles, tags, interests)
            if results is None:
                print(f"[论坛评分] {len(batch)} 条评分失败，保留待重试", flush=True)
                continue
            matches = {r["news_item_id"]: r for r in results}
            qualified = 0
            for row in batch:
                result = matches.get(row["id"])
                score = result["relevance_score"] if result else 0.0
                tag = tag_map[result["tag_id"]] if result else {}
                c.execute("UPDATE forum_ai_queue SET score=?,tag=?,priority=?,scored_at=? WHERE id=? AND score IS NULL",
                          (score, tag.get("tag", ""), tag.get("priority", 9999), time.time(), row["id"]))
                qualified += score >= threshold
            c.commit()
            print(f"[论坛评分] 已评分 {len(batch)} 条，{qualified} 条 score>={threshold:g}，等待整点推送", flush=True)


def hourly_result(c=None, now=None):
    if c is None:
        with connect() as connection:
            return hourly_result(connection, now)
    now = time.time() if now is None else now
    cutoff = int(now // 3600) * 3600
    threshold = min_score()
    rows = c.execute("SELECT * FROM forum_ai_queue WHERE score>=? AND sent_at IS NULL AND scored_at<=? ORDER BY priority,id", (threshold, cutoff)).fetchall()
    groups = {}
    for row in rows:
        p = json.loads(row["payload"])
        group = groups.setdefault(row["tag"], {"tag": row["tag"], "position": row["priority"], "count": 0, "items": []})
        group["items"].append({
            "title": p["title"], "url": p["url"],
            "source_id": p["feed_id"], "source_name": p["source"],
            "first_time": p["published"], "relevance_score": row["score"],
            "source_type": "rss", "classified_now": True, "queue_id": row["id"],
        })
        group["count"] += 1
    print(f"[论坛精选] 整点读取 {len(rows)} 条待推送记录", flush=True)
    return AIFilterResult(tags=list(groups.values()), total_matched=len(rows), total_processed=len(rows), success=True)


def mark_sent(ids, c=None):
    if not ids:
        return
    if c is None:
        with connect() as connection:
            mark_sent(ids, connection)
        return
    c.executemany("UPDATE forum_ai_queue SET sent_at=? WHERE id=? AND sent_at IS NULL", [(time.time(), i) for i in ids])

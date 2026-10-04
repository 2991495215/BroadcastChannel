"""Run with the full-RSS runtime dependencies; no Telegram requests are sent."""
import os
import json
import runpy
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch


class DualSendTest(unittest.TestCase):
    def load(self, private="123"):
        source = os.getenv("FULL_RSS_SCRIPT", str(Path(__file__).with_name("full_rss_push.py")))
        with patch.dict(os.environ, {"TELEGRAM_FULL_BOT_TOKEN": "test",
                                     "TELEGRAM_FULL_CHAT_ID": "@channel",
                                     "TELEGRAM_FULL_PRIVATE_CHAT_ID": private}):
            return runpy.run_path(source, run_name="dual_send_test")

    def test_dual_send_and_isolated_failure(self):
        module = self.load()
        items = [("test", {"title": "A & B", "link": "https://example.com"})]
        ok = Mock()
        ok.json.return_value = {"ok": True}
        with patch.object(module["requests"], "post", return_value=ok) as post, \
                patch.object(module["time"], "sleep"):
            module["send"](items)
            self.assertEqual([c.kwargs["json"]["chat_id"] for c in post.call_args_list],
                             ["@channel", "123"])
            self.assertIn("A &amp; B", post.call_args.kwargs["json"]["text"])
            for failure in [RuntimeError("offline"), Mock()]:
                if isinstance(failure, Mock):
                    failure.json.return_value = {"ok": False}
                post.reset_mock()
                post.side_effect = [failure, ok]
                with self.assertRaisesRegex(RuntimeError, "1 次发送失败"):
                    module["send"](items)
                self.assertEqual(post.call_count, 2)

    def test_single_target_and_deduplication(self):
        for private in ["", " @channel "]:
            self.assertEqual(self.load(private)["CHAT_IDS"], ["@channel"])

    def test_selected_export_is_public_and_atomic(self):
        module = self.load()
        connection = Mock()
        payload = {"title": "精选", "url": "https://example.com",
                   "summary": "<b>正文</b> &amp; 摘要", "author": "private-author"}
        connection.execute.return_value.fetchall.return_value = [
            (1, json.dumps(payload), 0.7, "AI", 1),
            (2, json.dumps(dict(payload, title="待评分", url="https://example.com/new")), None, None, 2),
            (3, json.dumps(dict(payload, url="javascript:alert(1)")), 0.8, "AI", 3),
            (4, json.dumps(dict(payload, url="https://")), 0.8, "AI", 4),
        ]
        directory = MagicMock()
        file = directory.__truediv__.return_value
        file.exists.return_value = False
        with patch.dict(os.environ, {"FULL_RSS_PUBLIC_DIR": "/unused"}), \
                patch.object(module["sqlite3"], "connect", return_value=connection), \
                patch.object(module["forum_stream"], "min_score", return_value=0.7), \
                patch.dict(module["export_selected"].__globals__, {"Path": Mock(return_value=directory)}):
            module["export_selected"]()
        query = connection.execute.call_args.args[0]
        self.assertNotIn("LIMIT", query)
        self.assertIn("forum_ai_queue", query)
        data = json.loads(file.write_text.call_args.args[0])
        self.assertEqual(data["min_score"], 0.7)
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["summary"].strip(), "正文 & 摘要")
        self.assertNotIn("author", data["items"][0])
        self.assertEqual(file.replace.call_count, 2)
        all_data = json.loads(file.write_text.call_args_list[0].args[0])
        self.assertEqual(len(all_data["items"]), 2)
        self.assertTrue({x["id"] for x in data["items"]} <= {x["id"] for x in all_data["items"]})
        self.assertEqual(data["updated_at"], all_data["updated_at"])
        connection.close.assert_called_once()

    def test_history_merge_pending_and_unlimited_selected(self):
        module = self.load()
        old = {"id": 10, "title": "旧标题", "url": "/posts/10", "source": "NodeSeek", "published": "2026-10-04 12:00:00"}
        historical = {"id": 11, "title": "历史独有", "url": "/posts/11", "source": "NodeSeek", "published": "2026-10-03 12:00:00"}
        directory = MagicMock()
        file = directory.__truediv__.return_value
        file.exists.return_value = True
        file.read_text.return_value = json.dumps({"items": [old, historical]})
        payload = {"title": "旧标题。原文完整标题", "url": "https://example.com/0", "source": "NodeSeek 最新", "published": old["published"]}
        rows = [(i, json.dumps(dict(payload, url=f"https://example.com/{i}", title=payload["title"] if i == 0 else str(i))), 0.8, "AI", i) for i in range(250)]
        rows.append((250, json.dumps(dict(payload, title="待评分", url="https://example.com/pending")), None, None, 250))
        connection = Mock()
        connection.execute.return_value.fetchall.return_value = rows
        with patch.dict(os.environ, {"FULL_RSS_PUBLIC_DIR": "/unused"}), \
                patch.object(module["sqlite3"], "connect", return_value=connection), \
                patch.object(module["forum_stream"], "min_score", return_value=0.65), \
                patch.dict(module["export_selected"].__globals__, {"Path": Mock(return_value=directory)}):
            module["export_selected"]()
        all_data, selected = [json.loads(call.args[0]) for call in file.write_text.call_args_list]
        self.assertEqual(len(all_data["items"]), 252)
        self.assertEqual(len(selected["items"]), 250)
        self.assertEqual(next(x for x in all_data["items"] if x["id"] == "rss:0")["channel_url"], "/posts/10")
        self.assertTrue(any(x["id"] == 11 for x in all_data["items"]))
        self.assertFalse(any(x["id"] == 10 for x in all_data["items"]))

    def test_website_publishes_before_failed_telegram_send(self):
        module = self.load()
        connection = Mock()
        connection.execute.return_value.fetchone.side_effect = [(1,), None, None]
        parsed = Mock(entries=[{"id": "new", "link": "https://example.com/new", "title": "新增"}])
        config = Mock()
        config.read_text.return_value = 'rss: {feeds: [{id: nodeseek, name: NodeSeek, url: "https://example.com/rss"}]}'
        events = []
        def fail_send(items):
            events.append("send")
            raise RuntimeError("Telegram offline")
        with patch.dict(module["poll"].__globals__, {
            "CONFIG": config, "db": Mock(return_value=connection),
            "fetch_feed": Mock(return_value=parsed), "write_cache": Mock(),
            "send": fail_send, "export_selected": lambda: events.append("export"),
        }), patch.object(module["forum_stream"], "enabled", return_value=True), \
                patch.object(module["forum_stream"], "enqueue"), \
                patch.object(module["forum_stream"], "score_pending", side_effect=lambda c: events.append("score")), \
                patch("trendradar.core.loader.load_config", return_value={}):
            with self.assertRaisesRegex(RuntimeError, "Telegram offline"):
                module["poll"](False)
        self.assertEqual(events, ["export", "send", "score", "export"])
        connection.commit.assert_called_once()

    def test_threshold_reloads_and_validates(self):
        stream = self.load()["forum_stream"]
        for threshold in [0, 0.5, 0.65, 0.8, 1]:
            with patch.object(stream.Path, "read_text", return_value=f"ai_filter:\n  min_score: {threshold}\n"):
                self.assertEqual(stream.min_score(), threshold)
            self.assertEqual(stream.min_score({"AI_FILTER": {"MIN_SCORE": threshold}}), threshold)
        for invalid in [-0.1, 1.1, float("nan"), float("inf"), True, "bad"]:
            with self.assertRaises(ValueError):
                stream.min_score({"ai_filter": {"min_score": invalid}})
        self.assertEqual(stream.min_score({"ai_filter": {}}), 0)

    def test_hourly_and_website_share_threshold_boundaries(self):
        module = self.load()
        stream = module["forum_stream"]
        for threshold, expected in [(0, 4), (0.5, 3), (0.65, 2), (0.8, 1), (1, 0)]:
            c = sqlite3.connect(":memory:")
            c.row_factory = sqlite3.Row
            stream.init_queue(c)
            for i, score in enumerate([0, 0.5, 0.65, 0.8, None]):
                payload = {"title": str(i), "url": f"https://example.com/{i}",
                           "feed_id": "test", "source": "test", "published": "test"}
                c.execute("INSERT INTO forum_ai_queue(identity,payload,discovered_at,score,tag,priority,scored_at) VALUES(?,?,?,?,?,?,?)",
                          (str(i), json.dumps(payload), i, score, "AI", 1, 1))
            directory = MagicMock()
            directory.__truediv__.return_value.exists.return_value = False
            with patch.object(stream.Path, "read_text", return_value=f"ai_filter:\n  min_score: {threshold}\n"):
                result = stream.hourly_result(c, now=7200)
                self.assertEqual(result.total_matched, expected)
                with patch.dict(os.environ, {"FULL_RSS_PUBLIC_DIR": "/unused"}), \
                        patch.object(module["sqlite3"], "connect", return_value=c), \
                        patch.dict(module["export_selected"].__globals__, {"Path": Mock(return_value=directory)}):
                    module["export_selected"]()
            data = json.loads(directory.__truediv__.return_value.write_text.call_args.args[0])
            self.assertEqual(len(data["items"]), expected)
            self.assertEqual(data["min_score"], threshold)


if __name__ == "__main__":
    unittest.main()

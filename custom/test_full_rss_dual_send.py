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
            (json.dumps(payload), 0.7, "AI"),
            (json.dumps(dict(payload, url="javascript:alert(1)")), 0.8, "AI"),
            (json.dumps(dict(payload, url="https://")), 0.8, "AI"),
        ]
        directory = MagicMock()
        file = directory.__truediv__.return_value
        with patch.dict(os.environ, {"FULL_RSS_PUBLIC_DIR": "/unused"}), \
                patch.object(module["sqlite3"], "connect", return_value=connection), \
                patch.object(module["forum_stream"], "min_score", return_value=0.7), \
                patch.dict(module["export_selected"].__globals__, {"Path": Mock(return_value=directory)}):
            module["export_selected"]()
        query = connection.execute.call_args.args[0]
        self.assertIn("score>=?", query)
        self.assertEqual(connection.execute.call_args.args[1], (0.7,))
        self.assertIn("LIMIT 200", query)
        data = json.loads(file.write_text.call_args.args[0])
        self.assertEqual(data["min_score"], 0.7)
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["summary"].strip(), "正文 & 摘要")
        self.assertNotIn("author", data["items"][0])
        file.replace.assert_called_once()
        connection.close.assert_called_once()

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

import datetime as dt
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('arsenal', pathlib.Path(__file__).with_name('collect-arsenal.py'))
arsenal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(arsenal)
NOW = dt.datetime(2026, 11, 15, tzinfo=dt.timezone.utc)

class ArsenalTests(unittest.TestCase):
    def test_headlines_only_dates_deduplication_and_publisher_urls(self):
        items = [
            ('Report: Arsenal &amp; a player', 'https://arseblog.news/report?utm_source=test', 'Wed, 11 Nov 2026 08:00:00 +0000'),
            ('Duplicate', 'https://arseblog.news/report', 'Wed, 11 Nov 2026 08:00:00 +0000'),
            ('Old transfer', 'https://arseblog.news/old', 'Wed, 02 Sep 2026 08:00:00 +0000'),
            ('Future', 'https://arseblog.news/future', 'Mon, 16 Nov 2026 08:00:00 +0000'),
            ('External', 'https://evil.example/story', 'Wed, 11 Nov 2026 08:00:00 +0000'),
        ]
        data = ('<rss><channel>' + ''.join('<item><title>%s</title><link>%s</link><pubDate>%s</pubDate><description>Full article excluded</description></item>' % x for x in items) + '</channel></rss>').encode()
        result = arsenal.parse_feed(data, NOW)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['title'], 'Report: Arsenal & a player')
        self.assertEqual(result[0]['url'], 'https://arseblog.news/report')
        self.assertNotIn('description', result[0])

    def test_valid_empty_feed_is_not_a_request_failure(self):
        result = arsenal.collect(NOW, lambda: b'<rss><channel/></rss>')
        self.assertEqual(result['articles'], [])
        with self.assertRaises(ValueError):
            arsenal.parse_feed(b'<html/>', NOW)

    def test_failures_propagate_without_fabricating_update_time(self):
        def fail():
            raise TimeoutError()
        with self.assertRaises(TimeoutError):
            arsenal.collect(NOW, fail)
        with self.assertRaises(ValueError):
            arsenal.parse_feed(b'<!DOCTYPE rss><rss/>', NOW)

if __name__ == '__main__':
    unittest.main()

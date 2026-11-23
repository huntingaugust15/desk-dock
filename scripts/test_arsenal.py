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
        result = arsenal.collect(NOW, lambda source: b'<rss><channel/></rss>')
        self.assertEqual(result['articles'], [])
        with self.assertRaises(ValueError):
            arsenal.parse_feed(b'<html/>', NOW)

    def test_failures_propagate_without_fabricating_update_time(self):
        def fail(source):
            raise TimeoutError()
        with self.assertRaises(RuntimeError):
            arsenal.collect(NOW, fail)
        with self.assertRaises(ValueError):
            arsenal.parse_feed(b'<!DOCTYPE rss><rss/>', NOW)

    def test_sky_filters_titles_not_evergreen_transfer_urls(self):
        data = b'''<rss><channel>
        <item><title>Arsenal latest: Raya injury update</title><link>https://www.skysports.com/football/live-blog/11670/1/arsenal-transfer-news</link><pubDate>Wed, 11 Nov 2026 08:00:00 GMT</pubDate></item>
        <item><title>Arteta on player contracts</title><link>https://www.skysports.com/watch/video/2/contracts</link><pubDate>Thu, 12 Nov 2026 09:00:00 GMT</pubDate></item>
        <item><title>Transfer latest</title><link>https://evil.example/transfer</link><pubDate>Thu, 12 Nov 2026 09:00:00 GMT</pubDate></item>
        </channel></rss>'''
        result = arsenal.parse_feed(data, NOW, arsenal.SOURCES[0])
        self.assertEqual([a['title'] for a in result], ['Arteta on player contracts'])
        self.assertEqual(result[0]['source'], 'Sky Sports')

    def test_source_failure_keeps_other_publisher_and_marks_partial(self):
        def fetch(source):
            if source['id'] == 'arseblog':
                raise TimeoutError()
            return b'<rss><channel><item><title>Arsenal transfer news</title><link>https://www.skysports.com/football/news/11670/1/transfer</link><pubDate>Wed, 11 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>'
        result = arsenal.collect(NOW, fetch)
        self.assertTrue(result['partial'])
        self.assertEqual(len(result['articles']), 1)
        self.assertIn('checkedAt', result['sources'][0])
        self.assertNotIn('checkedAt', result['sources'][1])

if __name__ == '__main__':
    unittest.main()

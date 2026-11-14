import datetime as dt
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('collector', pathlib.Path(__file__).with_name('collect-news.py'))
news = importlib.util.module_from_spec(spec)
spec.loader.exec_module(news)
NOW = dt.datetime(2026, 11, 15, 0, tzinfo=dt.timezone.utc)

def feed(items):
    return ('<rss><channel>' + ''.join('<item><title>%s</title><link>%s</link><pubDate>%s</pubDate></item>' % i for i in items) + '</channel></rss>').encode()

class NewsTests(unittest.TestCase):
    def test_dates_and_publisher_links(self):
        data = feed([
            ('Fresh &amp; safe', 'https://technews.tw/story?utm_source=test', 'Sat, 14 Nov 2026 16:00:00 +0000'),
            ('Old', 'https://technews.tw/old', 'Mon, 14 Aug 2017 02:01:27 +0000'),
            ('Future', 'https://technews.tw/future', 'Mon, 16 Nov 2026 00:00:00 +0000'),
            ('External', 'https://evil.example/redirect', 'Sat, 14 Nov 2026 16:00:00 +0000'),
        ])
        articles = news.parse_feed(data, news.SOURCES[0], NOW)
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]['title'], 'Fresh & safe')
        self.assertEqual(articles[0]['url'], 'https://technews.tw/story')
        self.assertEqual(news.iso(news.parse_date('2026-11-14  11:11:39', 8)), '2026-11-14T03:11:39Z')

    def test_partial_failure_keeps_previous_source_with_honest_timestamp(self):
        article = {'id': 'one', 'title': 'Saved', 'url': 'https://www.ithome.com.tw/news/123', 'publishedAt': '2026-11-14T03:11:39Z', 'sourceId': 'ithome', 'sourceName': 'iThome'}
        old = {'articles': [article], 'sources': [{'id': 'ithome', 'lastSuccess': '2026-11-14T04:00:00Z'}]}
        def fetch(source, now):
            if source['id'] == 'ithome':
                raise TimeoutError()
            return []
        result = news.collect(NOW, fetch, old)
        self.assertEqual(news.flat_articles(result['articles']), [article])
        self.assertFalse(result['sources'][1]['ok'])
        self.assertEqual(result['sources'][1]['lastSuccess'], old['sources'][0]['lastSuccess'])

    def test_all_failures_do_not_replace_data(self):
        def fail(source, now):
            raise TimeoutError()
        with self.assertRaises(RuntimeError):
            news.collect(NOW, fail, {})

    def test_deduplication_and_invalid_xml(self):
        data = feed([('Same', 'https://technews.tw/same', 'Sat, 14 Nov 2026 16:00:00 +0000')] * 2)
        result = news.collect(NOW, lambda source, now: news.parse_feed(data, source, now) if source['id'] == 'technews' else [], {})
        self.assertEqual(len(result['articles']), 1)
        with self.assertRaises(ValueError):
            news.parse_feed(b'<!DOCTYPE rss><rss/>', news.SOURCES[0], NOW)

    def test_technology_categories_exclude_lifestyle_and_science_only(self):
        self.assertFalse(news.TECH_CATEGORIES.search('自然科學 科技趣聞 Gaia'))
        self.assertFalse(news.TECH_CATEGORIES.search('生物科技 素食貓糧'))
        self.assertTrue(news.TECH_CATEGORIES.search('AI 人工智慧 醫療科技'))
        self.assertTrue(news.TECH_CATEGORIES.search('Nvidia 半導體'))

    def test_related_coverage_groups_without_losing_original_links(self):
        first = {'id': 'one', 'title': '微軟 Microsoft 365 全球當機，多項服務無法使用', 'url': 'https://technews.tw/outage', 'publishedAt': '2026-11-14T10:00:00Z', 'sourceId': 'technews', 'sourceName': '科技新報'}
        second = {**first, 'id': 'two', 'title': 'Microsoft 365 全球當機，多項服務無法使用，微軟調查中', 'url': 'https://www.ithome.com.tw/news/321', 'sourceId': 'ithome', 'sourceName': 'iThome'}
        groups = news.group_stories([first, second], [])
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['related'][0]['url'], second['url'])
        self.assertFalse(news.same_story(first, {**second, 'title': '微軟發表新一代 AI 晶片，預計明年進入量產'}))
        self.assertFalse(news.same_story(first, {**second, 'publishedAt': '2026-11-10T10:00:00Z'}))
        self.assertFalse(news.same_story({**first, 'title': 'Nvidia 第 2 季營收創新高，AI 晶片需求持續增長'}, {**second, 'title': 'Nvidia 第 3 季營收創新高，AI 晶片需求持續增長'}))

    def test_unchanged_collection_keeps_content_change_time(self):
        article = {'id': 'one', 'title': 'Test headline', 'url': 'https://technews.tw/story', 'publishedAt': '2026-11-14T10:00:00Z', 'sourceId': 'technews', 'sourceName': '科技新報'}
        fetch = lambda source, now: [article] if source['id'] == 'technews' else []
        first = news.collect(NOW, fetch, {})
        later = news.collect(NOW + dt.timedelta(minutes=30), fetch, first)
        self.assertNotEqual(first['generatedAt'], later['generatedAt'])
        self.assertEqual(first['contentUpdatedAt'], later['contentUpdatedAt'])

if __name__ == '__main__':
    unittest.main()

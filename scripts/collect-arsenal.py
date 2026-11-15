"""Collect only headline metadata from the publisher's transfer-category RSS."""
import datetime as dt
import hashlib
import importlib.util
import json
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/arsenal-transfers.json'
SOURCE = {'id': 'arseblog', 'name': 'Arseblog', 'host': 'arseblog.news', 'url': 'https://arseblog.news/category/transfers/feed/'}
spec = importlib.util.spec_from_file_location('dock_news', pathlib.Path(__file__).with_name('collect-news.py'))
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)

def parse_feed(data, now):
    if len(data) > 2_000_000 or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('Unsupported feed')
    root = ET.fromstring(data)
    if root.tag != 'rss' or root.find('channel') is None:
        raise ValueError('Expected publisher RSS')
    articles, seen = [], set()
    for item in root.findall('./channel/item'):
        try:
            title = shared.clean_title(item.findtext('title') or '')
            url = shared.canonical_url(item.findtext('link') or '', SOURCE)
            published = shared.parse_date(item.findtext('pubDate') or '')
            if not title or url in seen or published < now - dt.timedelta(days=30) or published > now + dt.timedelta(minutes=10):
                continue
            seen.add(url)
            articles.append({'id': hashlib.sha256(url.encode()).hexdigest()[:16], 'title': title, 'url': url, 'publishedAt': shared.iso(published)})
        except (ValueError, TypeError, OverflowError):
            continue
    return sorted(articles, key=lambda a: a['publishedAt'], reverse=True)[:12]

def fetch_feed():
    request = urllib.request.Request(SOURCE['url'], headers={'User-Agent': 'DeskDockNews/1.0 (personal RSS reader; https://github.com/huntingaugust15/desk-dock)'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read(2_000_001)

def collect(now=None, fetcher=fetch_feed):
    now = now or dt.datetime.now(dt.timezone.utc)
    return {'version': 1, 'generatedAt': shared.iso(now), 'source': {'name': SOURCE['name'], 'url': SOURCE['url']}, 'articles': parse_feed(fetcher(), now)}

def main():
    # A failed request never replaces the previous file or its successful timestamp.
    result = collect()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(OUTPUT)
    print('Collected %d Arsenal transfer headlines' % len(result['articles']))

if __name__ == '__main__':
    main()

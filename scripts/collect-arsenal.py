"""Collect transfer/contract headline metadata from publisher RSS feeds."""
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import pathlib
import re
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/arsenal-transfers.json'
SOURCES = [
    {'id': 'sky', 'name': 'Sky Sports', 'host': 'www.skysports.com', 'url': 'https://www.skysports.com/rss/11670', 'filtered': True},
    {'id': 'arseblog', 'name': 'Arseblog', 'host': 'arseblog.news', 'url': 'https://arseblog.news/category/transfers/feed/'},
]
SOURCE = SOURCES[1]
TRANSFER = re.compile(r'\b(transfer[s]?|rumou?rs?|contracts?|sign(?:s|ed|ing|ings)?|loans?|bids?|deal[s]?|exit|depart(?:ure|ures)?|buyout|release clause)\b', re.I)
spec = importlib.util.spec_from_file_location('dock_news', pathlib.Path(__file__).with_name('collect-news.py'))
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)

def parse_feed(data, now, source=SOURCE):
    if len(data) > 2_000_000 or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('Unsupported feed')
    root = ET.fromstring(data)
    if root.tag != 'rss' or root.find('channel') is None:
        raise ValueError('Expected publisher RSS')
    articles, seen = [], set()
    for item in root.findall('./channel/item'):
        try:
            title = shared.clean_title(item.findtext('title') or '')
            url = shared.canonical_url(item.findtext('link') or '', source)
            published = shared.parse_date(item.findtext('pubDate') or '')
            # The Arsenal team feed includes match/injury news. Filter the actual
            # title, never its evergreen transfer-liveblog URL, to avoid mislabelling.
            if source.get('filtered') and not TRANSFER.search(title):
                continue
            if not title or url in seen or published < now - dt.timedelta(days=30) or published > now + dt.timedelta(minutes=10):
                continue
            seen.add(url)
            articles.append({'id': hashlib.sha256(url.encode()).hexdigest()[:16], 'title': title, 'url': url, 'publishedAt': shared.iso(published), 'source': source['name']})
        except (ValueError, TypeError, OverflowError):
            continue
    return sorted(articles, key=lambda a: a['publishedAt'], reverse=True)[:12]

def fetch_feed(source):
    request = urllib.request.Request(source['url'], headers={'User-Agent': 'DeskDockNews/1.0 (personal RSS reader; https://github.com/huntingaugust15/desk-dock)'})
    with urllib.request.urlopen(request, timeout=20) as response:
        data = response.read(2_000_001)
    if data[:2] == bytes([31, 139]):
        # Bound decompression too; do not permit a compressed oversized feed.
        import io
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:
            data = stream.read(2_000_001)
    return data

def collect(now=None, fetcher=fetch_feed):
    now = now or dt.datetime.now(dt.timezone.utc)
    articles, statuses = [], []
    for source in SOURCES:
        status = {'name': source['name'], 'url': source['url']}
        try:
            articles.extend(parse_feed(fetcher(source), now, source))
            status['checkedAt'] = shared.iso(now)
        except Exception as error:
            status['error'] = type(error).__name__
        statuses.append(status)
    if all('error' in s for s in statuses):
        raise RuntimeError('All Arsenal publisher feeds failed; keeping previous data')
    unique = {a['url']: a for a in articles}
    return {'version': 1, 'generatedAt': shared.iso(now), 'sources': statuses, 'partial': any('error' in s for s in statuses), 'articles': sorted(unique.values(), key=lambda a: a['publishedAt'], reverse=True)[:12]}

def main():
    # Failed collection never replaces the previous file or successful timestamp.
    result = collect()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(OUTPUT)
    for source in result['sources']:
        if 'error' in source:
            print('::warning::%s feed failed (%s)' % (source['name'], source['error']))
    print('Collected %d Arsenal transfer/contract headlines' % len(result['articles']))

if __name__ == '__main__':
    main()

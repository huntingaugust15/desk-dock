"""Collect publisher RSS headlines for the static personal Dock. Stdlib only."""
import concurrent.futures
import datetime as dt
import email.utils
import hashlib
import html
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/news.json'
SOURCES = [
    {'id': 'technews', 'name': '科技新報', 'url': 'https://technews.tw/tn-rss/', 'host': 'technews.tw', 'timezone': 0},
    {'id': 'ithome', 'name': 'iThome', 'url': 'https://www.ithome.com.tw/rss', 'host': 'ithome.com.tw', 'timezone': 8},
]
UTC = dt.timezone.utc
TECH_CATEGORIES = re.compile(r'AI|人工智|3C|半導體|晶片|處理器|軟體|軟件|硬體|網路|資安|資訊安全|機器人|電動車|能源科技|電力儲存|電池|數位|數碼|手機|電腦|穿戴|智慧|科技趣聞|Microsoft|Nvidia|Apple|Google|Meta|Amazon|OpenAI|Arm', re.I)

def iso(value):
    return value.astimezone(UTC).isoformat(timespec='seconds').replace('+00:00', 'Z')

def parse_date(value, offset=0):
    try:
        result = email.utils.parsedate_to_datetime(value)
    except (ValueError, TypeError):
        result = dt.datetime.fromisoformat(re.sub(r'\s+', ' ', value.strip()).replace('Z', '+00:00'))
    if result.tzinfo is None:
        result = result.replace(tzinfo=dt.timezone(dt.timedelta(hours=offset)))
    return result.astimezone(UTC)

def clean_title(value):
    value = html.unescape(re.sub(r'<[^>]*>', '', value))
    return re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', value)).strip()[:280]

def canonical_url(value, source):
    parsed = urllib.parse.urlsplit(value.strip())
    host = (parsed.hostname or '').lower()
    if parsed.scheme != 'https' or not (host == source['host'] or host.endswith('.' + source['host'])) or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Article URL outside publisher')
    query = [(k, v) for k, v in urllib.parse.parse_qsl(parsed.query) if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid')]
    return urllib.parse.urlunsplit(('https', parsed.netloc, parsed.path, urllib.parse.urlencode(query), ''))

def parse_feed(data, source, now):
    if len(data) > 2_000_000 or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('Unsupported feed')
    root = ET.fromstring(data)
    entries = root.findall('.//item') or root.findall('.//{http://www.w3.org/2005/Atom}entry')
    if not entries:
        raise ValueError('No RSS entries')
    articles = []
    for item in entries:
        try:
            def field(*names):
                for name in names:
                    element = item.find(name)
                    if element is not None and element.text:
                        return element.text
                return ''
            title = clean_title(field('title', '{http://www.w3.org/2005/Atom}title'))
            categories = ' '.join(e.text or '' for e in item.findall('category'))
            if source['id'] == 'technews' and categories and not TECH_CATEGORIES.search(categories):
                continue
            url = canonical_url(field('link') or next((e.get('href', '') for e in item.findall('{http://www.w3.org/2005/Atom}link') if e.get('rel', 'alternate') == 'alternate'), ''), source)
            published = parse_date(field('pubDate', '{http://purl.org/dc/elements/1.1/}date', '{http://www.w3.org/2005/Atom}published', '{http://www.w3.org/2005/Atom}updated'), source['timezone'])
            if not title or published < now - dt.timedelta(days=7) or published > now + dt.timedelta(minutes=10):
                continue
            articles.append({'id': hashlib.sha256(url.encode()).hexdigest()[:16], 'title': title, 'url': url, 'publishedAt': iso(published), 'sourceId': source['id'], 'sourceName': source['name']})
        except (ValueError, TypeError, OverflowError):
            continue
    return articles

def fetch_source(source, now):
    request = urllib.request.Request(source['url'], headers={'User-Agent': 'DeskDockNews/1.0 (personal RSS reader; https://github.com/huntingaugust15/desk-dock)'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return parse_feed(response.read(2_000_001), source, now)

def collect(now=None, fetcher=fetch_source, previous=None):
    now = now or dt.datetime.now(UTC)
    previous = previous or {}
    articles, statuses = [], []
    successes = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        pending = [(s, pool.submit(fetcher, s, now)) for s in SOURCES]
        for source, future in pending:
            old = next((s for s in previous.get('sources', []) if s.get('id') == source['id']), {})
            try:
                articles.extend(future.result())
                statuses.append({'id': source['id'], 'name': source['name'], 'url': source['url'], 'lastSuccess': iso(now), 'ok': True})
                successes += 1
            except Exception as error:
                print(source['id'] + ': ' + type(error).__name__, file=sys.stderr)
                articles.extend(a for a in previous.get('articles', []) if a.get('sourceId') == source['id'])
                statuses.append({'id': source['id'], 'name': source['name'], 'url': source['url'], 'lastSuccess': old.get('lastSuccess'), 'ok': False})
    if not successes:
        raise RuntimeError('All news feeds failed; keeping existing data')
    unique, seen_urls, seen_titles, counts = [], set(), set(), {}
    for article in sorted(articles, key=lambda a: a.get('publishedAt', ''), reverse=True):
        try:
            source = next(s for s in SOURCES if s['id'] == article['sourceId'])
            url = canonical_url(article['url'], source)
            date = parse_date(article['publishedAt'])
            title_key = re.sub(r'\W+', '', article['title']).casefold()
            if date < now - dt.timedelta(days=7) or date > now + dt.timedelta(minutes=10) or url in seen_urls or title_key in seen_titles or counts.get(source['id'], 0) >= 15:
                continue
            article = {**article, 'url': url, 'title': clean_title(article['title']), 'sourceName': source['name']}
            unique.append(article)
            seen_urls.add(url)
            seen_titles.add(title_key)
            counts[source['id']] = counts.get(source['id'], 0) + 1
        except (KeyError, ValueError, StopIteration):
            continue
    return {'version': 1, 'generatedAt': iso(now), 'sources': statuses, 'articles': unique}

def main():
    try:
        previous = json.loads(OUTPUT.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        previous = {}
    result = collect(previous=previous)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(OUTPUT)
    print('Collected %d headlines from %d available feeds' % (len(result['articles']), sum(s['ok'] for s in result['sources'])))

if __name__ == '__main__':
    main()

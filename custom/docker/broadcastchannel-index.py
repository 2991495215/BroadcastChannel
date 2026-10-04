#!/usr/bin/env python3
"""Index only public channel HTML; never read the bot database or credentials."""
import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.request import urlopen


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        return ''.join(x.text() if isinstance(x, Node) else x for x in self.children)

    def find(self, match):
        return [x for child in self.children if isinstance(child, Node)
                for x in ([child] if match(child) else []) + child.find(match)]

    def css(self, name):
        return self.find(lambda x: name in x.attrs.get('class', '').split())


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag == 'br':
            self.stack[-1].children.append('\n')
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse(html):
    root = Page(html).root
    items = []
    for card in root.css('post-entry'):
        title = card.css('hn-story')[0].find(lambda x: x.tag == 'a')[0]
        url = title.attrs['href']
        if not re.fullmatch(r'/posts/[1-9]\d*', url):
            raise ValueError('unexpected public message URL')
        body = card.css('post-content')[0]
        text = body.text()
        source = body.css('link_preview_site_name')
        summary = body.css('link_preview_description')
        group = re.search(r'分组:\s*(.*?)(?=\n|🕒|$)', text)
        stamp = re.search(r'时间:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})', text)
        times = card.find(lambda x: x.tag == 'time')
        items.append(dict(id=int(url.rsplit('/', 1)[1]), url=url, title=title.text().strip(),
                          source=source[0].text().strip() if source else group[1].strip() if group else '',
                          summary=summary[0].text().strip() if summary else '\n'.join(
                              line.strip() for line in text.splitlines()
                              if not re.search(r'链接:|分组:|时间:', line) and line.strip() != title.text().strip()).strip(),
                          published=stamp[1] if stamp else times[0].attrs.get('datetime', '') if times else ''))
    older = root.css('older')
    next_path = older[0].attrs.get('href') if older else None
    if next_path and not re.fullmatch(r'/before/[1-9]\d*', next_path):
        raise ValueError('unexpected public pagination URL')
    return items, next_path


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--base', default='http://127.0.0.1:4321')
    args.add_argument('--output', type=Path, required=True)
    args.add_argument('--rebuild', action='store_true')
    options = args.parse_args()
    old = json.loads(options.output.read_text()) if options.output.exists() and not options.rebuild else None
    known = {item['id']: item for item in old['items']} if old else {}
    collected, visited, path = {}, set(), '/'
    # ponytail: incremental public archive; rebuild to reconcile historical edits/deletions.
    while path:
        if path in visited or len(visited) >= 1000:
            raise RuntimeError('public history did not reach its end; keep previous index')
        visited.add(path)
        with urlopen(options.base.rstrip('/') + path, timeout=60) as response:
            items, next_path = parse(response.read().decode())
        if not items and (path == '/' or next_path):
            raise RuntimeError('empty public response; keep previous index')
        overlap = any(item['id'] in known for item in items)
        collected.update((item['id'], item) for item in items)
        print(f'Indexed {len(collected)} public messages / {len(visited)} requests', flush=True)
        if overlap:
            break
        path = next_path
        if path:
            time.sleep(0.3)
    known.update(collected)
    payload = dict(items=sorted(known.values(), key=lambda item: item['id'], reverse=True),
                   updated_at=datetime.now(timezone.utc).isoformat(), complete=True)
    options.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = options.output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    temporary.replace(options.output)
    print(f'Published {len(known)} public messages', flush=True)


if __name__ == '__main__':
    main()

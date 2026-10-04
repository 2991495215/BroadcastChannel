import importlib.util
from pathlib import Path
import sys

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('index', Path(__file__).parent / 'docker/broadcastchannel-index.py')
index = importlib.util.module_from_spec(spec)
spec.loader.exec_module(index)
sample = '''<article class="post-entry"><div class="hn-story"><h2><a href="/posts/42">A &amp; B</a></h2></div>
<time datetime="2026-10-04T18:00:00Z"></time><div class="post-content">A &amp; B<br />链接: https://example.com<br />分组: Forum<br />时间: 2026-10-05 02:00:00
<div class="link_preview_site_name">Public source</div><div class="link_preview_description">Summary &lt;script&gt;</div></div></article>
<a class="older" href="/before/42">Older</a>'''
items, cursor = index.parse(sample)
assert cursor == '/before/42'
assert items == [dict(id=42, url='/posts/42', title='A & B', source='Public source', summary='Summary <script>', published='2026-10-05 02:00:00')]
for invalid in [sample.replace('/before/42', 'https://example.com'), sample.replace('/posts/42', 'javascript:alert(1)')]:
    try:
        index.parse(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError('untrusted public URL must be rejected')
print('PASS public HTML extraction, entity decoding, absolute time and URL validation')

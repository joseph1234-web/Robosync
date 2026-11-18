"""Check local website assets at the root and under a repository path."""
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import urljoin, urlsplit, unquote

docs = Path(__file__).resolve().parents[1] / 'docs'

class PageLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        self.urls.extend(value for key, value in attrs if key in ('href', 'src', 'action') and value)

checked = 0
for base in ['https://example.test/', 'https://example.test/school-robotics/']:
    for file in docs.rglob('*'):
        if file.suffix == '.html':
            links = PageLinks()
            links.feed(file.read_text())
            urls = links.urls
        elif file.suffix == '.js':
            urls = re.findall(r"""(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.[^'"]+)['"]""", file.read_text())
        else:
            continue
        for value in urls:
            parsed = urlsplit(urljoin(base + file.relative_to(docs).as_posix(), value))
            if parsed.hostname != 'example.test':
                continue
            prefix = urlsplit(base).path
            assert parsed.path.startswith(prefix), (file.name, value)
            relative = unquote(parsed.path[len(prefix):])
            target = docs / (relative or 'index.html')
            assert target.is_file(), (file.name, value, str(target))
            checked += 1
print(f'{checked} local references resolved across both hosting paths.')

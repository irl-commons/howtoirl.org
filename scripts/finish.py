"""Runs after `astro build`: every built page in dist/ links the addresses pages are served at, without ".html", from
the site root, so a page in a folder (dist/fix/picture-frozen.html) finds its links and assets too.

Content, components and page metadata keep writing `phone-setup.html`; this rewrites the finished HTML once, so links,
the canonical and og:url, alternate languages and the "Suggest an edit" address all lose their ".html"
(shared/addresses.py). The sitemap and share cards use the same addresses (scripts/prepare.py, scripts/share.py)."""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'shared'))
from addresses import clean_links  # noqa: E402

for path in sorted((ROOT / 'dist').rglob('*.html')):
    text = path.read_text()
    clean = clean_links(text)
    if clean != text:
        path.write_text(clean)

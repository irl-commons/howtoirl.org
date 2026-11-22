"""Page addresses without ".html", linked from the site root.

Pages stay files on disk (`phone-setup.html`, `fix/picture-frozen.html`) and are served at `/phone-setup` and
`/fix/picture-frozen`; the home page is `/`. The server answers an old address ending in ".html" with a 301 to the clean
one. Sources keep writing `phone-setup.html` and `assets/style.css`, as seen from the site root, whatever folder the page
is in: `clean_links` rewrites the finished HTML so every link to a page goes to the address a reader sees, and every
link and asset starts at the root (`/glossary`, `/assets/style.css`), so a page works at any depth. Links to other
sites, fragments on the same page and queries are left alone.
"""
import re

DOMAINS = ('howtoirl.org', 'irlcommons.org')
_DOMAIN = '|'.join(re.escape(d) for d in DOMAINS)
_PAGE = r'(?:[a-z0-9-]+/)*[a-z0-9-]+'


def address(name: str) -> str:
    """The path of a page file, without the leading slash: `index.html` -> ``, `phone-setup.html` -> `phone-setup`."""
    if name == 'index.html' or name.endswith('/index.html'):
        return name.removesuffix('index.html')
    return name.removesuffix('.html')


def url(domain: str, name: str) -> str:
    """The full address of a page: `https://howtoirl.org/phone-setup`."""
    return f'https://{domain}/{address(name)}'


def _relative(m: re.Match) -> str:
    return f'{m["attr"]}="/{address(m["page"] + ".html")}{m["rest"]}'


def _rooted(m: re.Match) -> str:
    return f'{m["attr"]}="/{m["path"].removeprefix("./")}"'


def _absolute(m: re.Match) -> str:
    return m['site'] + address(m['page'] + '.html')


def _encoded(m: re.Match) -> str:
    return m['site'] + address(re.sub('%2F', '/', m['page'], flags=re.I) + '.html').replace('/', '%2F')


def clean_links(html: str) -> str:
    """Links to pages of the two sites, at their clean addresses from the root: `href="glossary.html#bonding"` becomes
    `href="/glossary#bonding"`, `href="index.html"` becomes `href="/"`, and `https://howtoirl.org/help.html` (also
    URL-encoded, as in "Suggest an edit" links) loses its ".html". Every other relative `href` or `src`
    (`assets/style.css`, `favicon.svg`) starts at the root too."""
    html = re.sub(rf'(?P<attr>href|data-copy)="(?P<page>{_PAGE})\.html(?P<rest>[#?"])', _relative, html)
    html = re.sub(rf'(?P<attr>\s(?:href|src))="(?P<path>(?:\./|(?:\./)?[A-Za-z0-9_-][^"#?:]*)(?:[#?][^"]*)?)"', _rooted, html)
    html = re.sub(rf'(?P<site>https://(?:{_DOMAIN})/)(?P<page>{_PAGE})\.html(?![\w.-])', _absolute, html)
    html = re.sub(rf'(?P<site>https%3A%2F%2F(?:{_DOMAIN})%2F)(?P<page>(?:[a-z0-9-]+%2F)*[a-z0-9-]+)\.html(?![\w.-])',
                  _encoded, html, flags=re.I)
    return html

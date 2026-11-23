"""Link previews: what every page's share image shows, and the address src/components/Head.astro gives it.

Every page in site.json gets a card of its own (its h1, the first sentence of its lede or summary, and its drawing),
unless src/pages.yaml says `share: site` for it; those pages share the site card. `share_icon` and `share_line` choose
the drawing and line where a page has none of its own or its own is too long. The manifest goes to
.generated/share.json: src/components/Head.astro writes the Open Graph and X card tags from it, and
scripts/share-images.mjs renders its cards into dist/assets/share/ at the end of every build; the images are not in Git.
The image address carries a hash of what the card is made from (its text, drawing, category, the card template and the
site's stylesheet and drawings), so a changed card gets a new address and chat apps fetch it again instead of showing
their cached copy."""
import hashlib, html, json, pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'shared'))
from addresses import address  # noqa: E402
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import category  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
SIZE = (1200, 630)
SITE_CARD = 'assets/share/site.png'
LONG = 120
# What every card's look depends on besides its own text: a change to any of these gives every card a new address.
# The stylesheet counts under this one name wherever it lives (STYLESHEET), so moving it alone keeps every address.
TEMPLATE = ['scripts/share-images.mjs', 'scripts/category.py', 'public/assets/style.css', 'src/components/Illustrations.astro',
            'src/components/Marks.astro']
# Where the stylesheet may be: copied as is from public/, or bundled from src/styles/ with font addresses from the
# site root. Font addresses are hashed in the public/ form.
STYLESHEET = ['src/styles/site.css', 'public/assets/style.css']


def plain(t: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', t))).replace('­', '').strip()


def first_sentence(t: str) -> str:
    """The first sentence; a long one only up to its colon, so it fits three lines of the card."""
    t = re.split(r'(?<=[.!?])\s', t)[0]
    return t.split(': ')[0] + '.' if len(t) > LONG and ': ' in t else t


def home_cards(setup: dict) -> dict:
    """The Home page cards by the page they open, for their drawing and line."""
    from setup import page  # scripts/setup.py, which knows the folder each answer page is in
    return {c['href'] if c.get('href') else page(c['to']): c for g in setup['groups'] for c in g['cards']}


def card(name: str, meta: dict, body: str, cards: dict, domain: str) -> dict:
    """What the page's own share image shows, from the built page body and the Home card that opens it."""
    home = cards.get(name, {})
    head = re.search(r'<header class="page-head">[\s\S]*?</header>|<div class="result-head">[\s\S]*?<p class="sum">[\s\S]*?</p>', body)
    head = head[0] if head else body
    h1 = re.search(r'<h1\b[^>]*>([\s\S]*?)</h1>', head)
    if not h1:
        sys.exit(f'{name}: a page with its own share image needs an h1')
    lede = re.search(r'<p class="(?:lede|sum)"[^>]*>([\s\S]*?)</p>', head)
    line = meta.get('share_line') or (first_sentence(plain(lede[1])) if lede else plain(home.get('text', ''))
                                       or first_sentence(meta['description']))
    drawn = re.search(r'^<div class="result-head">\s*<svg class="ill[^"]*"[^>]*><use href="#([a-z0-9-]+)"', head)
    icon = meta.get('share_icon') or (drawn[1] if drawn else home.get('icon', ''))
    url = f'{domain}/' + address(name)
    return {'kind': 'page', 'page': name, 'title': plain(h1[1]), 'line': line, 'icon': icon, 'url': url,
            'category': category.of(name, meta)}


def site_card(home: dict, domain: str, name: str) -> dict:
    """The card the contact and legal pages share: the site's name and Home's description."""
    return {'kind': 'site', 'page': 'index.html', 'title': name,
            'line': home.get('share_line') or first_sentence(home['description']), 'icon': 'mark', 'url': domain,
            'category': None}


def image_of(name: str, meta: dict) -> str:
    # A page in a folder gets a flat file name: fix/picture-frozen.html -> assets/share/fix-picture-frozen.png.
    return SITE_CARD if meta.get('share') == 'site' else f'assets/share/{name.removesuffix(".html").replace("/", "-")}.png'


def stylesheet() -> bytes:
    for path in STYLESHEET:
        if (ROOT / path).is_file():
            return (ROOT / path).read_bytes().replace(b'url("/assets/fonts/', b'url("fonts/')
    sys.exit('scripts/share.py: no stylesheet at ' + ' or '.join(STYLESHEET))


def template_hash() -> str:
    h = hashlib.sha256()
    for path in TEMPLATE:
        source = stylesheet() if path == 'public/assets/style.css' else (ROOT / path).read_bytes()
        h.update(path.encode() + b'\0' + source)
    return h.hexdigest()


def card_hash(card: dict, template: str) -> str:
    """The card's version: its address carries the first 10 characters, the PNG keeps all 16 (scripts/share-card.mjs),
    so the tests can tell a stale image from a current one."""
    fields = [card[k] for k in ('kind', 'title', 'line', 'icon', 'url', 'category')]
    return hashlib.sha256(json.dumps([fields, template], ensure_ascii=False).encode()).hexdigest()[:16]


def manifest(pages: list[dict], rendered: dict, setup: dict, cfg: dict) -> dict:
    """The card of every page in site.json, the image each page uses, and each image's hash and alt text."""
    by_name = {p['name']: p for p in pages}
    missing = [n for n in cfg['pages'] if n not in by_name]
    if missing:
        sys.exit('site.json pages without metadata in src/pages.yaml or content/setup.yaml: ' + ', '.join(missing))
    cards, images, homes = {}, {}, home_cards(setup)
    for name in cfg['pages']:
        meta = by_name[name]
        image = images[name] = image_of(name, meta)
        if image not in cards:
            cards[image] = (site_card(by_name['index.html'], cfg['domain'], cfg['name']) if image == SITE_CARD
                            else card(name, meta, rendered[name], homes, cfg['domain']))
    template = template_hash()
    for c in cards.values():
        c['hash'] = card_hash(c, template)
        c['badge'] = category.badge(c['category']) if c['category'] else ''
    return {'size': list(SIZE), 'cards': cards, 'pages': images,
            'images': {image: {'v': c['hash'][:10], 'alt': f'{c["title"]}: {c["line"]}'} for image, c in cards.items()}}

"""What kind of page a page is: a fix, a guide or a tip. Its badge shows above the page's h1, on its share card and
in lists that mix kinds. Colours are the --cat-* custom properties in public/assets/style.css.

  fix    a problem page, fix/<id>.html
  tip    one tip per page, tips/<id>.html
  guide  an answer page from content/setup.yaml outside fix/ (scripts/setup.py answer_meta sets it), or a page
         under Help (`section: help.html`)

`category:` in src/pages.yaml sets it by hand; anything else (Home, Help, the glossary, the hubs, contact and legal
pages) has none."""
import html

LABELS = {'guide': 'Guide', 'fix': 'Fix', 'tip': 'Tip'}
GLYPHS = {
    'guide': '<path d="M2 3.6c2.2-.9 4.2-.7 6 .9 1.8-1.6 3.8-1.8 6-.9v9c-2.2-.9-4.2-.7-6 .9-1.8-1.6-3.8-1.8-6-.9z"/><path d="M8 4.5v9"/>',
    'fix': '<path d="M10.4 1.9a3.4 3.4 0 0 0-3.1 4.6L2.4 11.4a1.5 1.5 0 0 0 2.2 2.2l4.9-4.9a3.4 3.4 0 0 0 4.6-3.1l-2 2-2.2-.4-.4-2.2z"/>',
    'tip': '<path d="M8 1.6a4.4 4.4 0 0 0-2.6 8V11h5.2V9.6A4.4 4.4 0 0 0 8 1.6z"/><path d="M6.2 13.4h3.6M6.8 15.2h2.4"/>',
}


def of(name: str, meta: dict) -> str | None:
    """The category of one page, from its file name and metadata (src/pages.yaml or scripts/setup.py answer_meta)."""
    if 'category' in meta:
        if meta['category'] not in (*LABELS, None):
            raise ValueError(f'{name}: category must be one of {", ".join(LABELS)}')
        return meta['category']
    if name.startswith('fix/'):
        return 'fix'
    if name.startswith('tips/'):
        return 'tip'
    if meta.get('section') == 'help.html':
        return 'guide'
    return None


def table(pages: list[dict]) -> dict[str, str]:
    """Every page that has a category, by file name."""
    return {p['name']: c for p in pages if (c := of(p['name'], p))}


def badge(cat: str) -> str:
    return (f'<span class="cat cat-{cat}"><svg viewBox="0 0 16 16" aria-hidden="true">{GLYPHS[cat]}</svg>'
            f'{html.escape(LABELS[cat])}</span>')


def common(names: list[str], cats: dict[str, str]) -> str | None:
    """The one category every page in a list shares, or None when they mix or one has none."""
    found = {cats.get(n) for n in names}
    return found.pop() if len(found) == 1 else None


def head(body: str, cat: str | None) -> str:
    """The badge just above the page's h1."""
    if not cat:
        return body
    at = body.find('<h1')
    if at < 0:
        raise ValueError('a page with a category needs an h1')
    return body[:at] + badge(cat) + '\n            ' + body[at:]

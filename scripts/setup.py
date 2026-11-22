"""The home page cards and setup answers, from content/setup.yaml and the IRL Commons catalogue.

Blocks pick services by their catalogue fields; lines use the catalogue description unless the
block has a note for that service. `problems()` lists everything that should stop a build."""
import html, json, re, subprocess, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'shared'))
import render as r

KEYS = ('id', 'class', 'kind', 'role', 'hosting', 'part', 'platforms', 'tags')
LIST_FIELDS = {'part', 'platforms', 'tags'}


def load_yaml(path: pathlib.Path) -> dict:
    """Parsed with the `yaml` npm package, so the build needs no Python packages."""
    out = subprocess.run(['node', '--input-type=module', '-e',
                          'import {parse} from "yaml"; import {readFileSync} from "node:fs";'
                          'process.stdout.write(JSON.stringify(parse(readFileSync(process.argv[1], "utf8"))))', str(path)],
                         cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def allowed_values(schema: dict, services: list[dict]) -> dict[str, set]:
    """What each select key may say: the enums in the published JSON Schema, and the service ids."""
    props = schema['properties']['services']['items']['properties']
    def enum(p):
        p = props[p]
        p = p.get('items', p)
        for alt in p.get('anyOf', [p]):
            if 'enum' in alt:
                return set(alt['enum'])
        return set()
    allowed = {k: enum(k) for k in KEYS if k != 'id'}
    allowed['id'] = {s['id'] for s in services}
    return allowed


def as_list(v) -> list:
    return v if isinstance(v, list) else [v]


def fits(s: dict, match: dict) -> bool:
    for k, want in match.items():
        want = as_list(want)
        have = s.get(k)
        if k in LIST_FIELDS:
            if not set(want) & set(have):
                return False
        elif have not in want:
            return False
    return True


def shown(setup: dict, services: list[dict]) -> list[dict]:
    """The catalogue without the services `hold_back` keeps off this page."""
    held = setup.get('hold_back') or {}
    return [s for s in services if s['id'] not in held]


def selected(block: dict, services: list[dict]) -> list[dict]:
    return r.by_name(s for s in services if any(fits(s, m) for m in block.get('select', [])))


def problems(setup: dict, services: list[dict], allowed: dict[str, set]) -> list[str]:
    out = []
    known = {s['id'] for s in services}
    for sid, why in (setup.get('hold_back') or {}).items():
        if sid not in known:
            out.append(f'hold_back: "{sid}" is no service in IRL Commons')
        if not str(why or '').strip():
            out.append(f'hold_back: "{sid}" needs the reason it is held back')
    services = shown(setup, services)
    by_id = {s['id']: s for s in services}
    tagged_home: dict[tuple[str, str], bool] = {}
    ids = {a['id'] for a in setup['answers']}
    for g in setup['groups']:
        for c in g['cards']:
            if 'to' in c and c['to'] not in ids:
                out.append(f'card "{c["title"]}": no answer #{c["to"]}')
    for a in setup['answers']:
        back = a.get('back')
        if isinstance(back, dict) and back.get('to') not in ids:
            out.append(f'#{a["id"]}: back link to #{back.get("to")}, which is no answer')
        elif back is not None and not isinstance(back, dict) and back != 'history':
            out.append(f'#{a["id"]}: back is "{back}" (use history or {{to: <answer id>, label: ...}})')
        for c in a.get('choices', []):
            if c['to'] not in ids:
                out.append(f'#{a["id"]}: choice "{c["title"]}": no answer #{c["to"]}')
        anchors = {b['anchor'] for b in a.get('blocks', []) if b.get('anchor')}
        for x in a.get('sources', []):
            if not str(x.get('url', '')).startswith('https://') or not x.get('label'):
                out.append(f'#{a["id"]}: a source needs a label and an https:// url')
        if a.get('layout') not in (None, 'steps'):
            out.append(f'#{a["id"]}: layout "{a["layout"]}" (use steps, or leave it out)')
        for b in a.get('blocks', []):
            where = f'#{a["id"]} "{b["title"]}"'
            if b.get('ordered'):
                if b.get('select'):
                    out.append(f'{where}: an ordered block lists steps only, not services')
                if b.get('before', [''])[0].startswith(WATCH):
                    out.append(f'{where}: starts with a watch-out, which needs a step above it')
            if b.get('lead') and not b.get('select'):
                out.append(f'{where}: a lead line without services to list under it')
            for p in b.get('split', []):
                if p not in PLATFORM_NAMES:
                    out.append(f'{where}: split by "{p}" (use {", ".join(PLATFORM_NAMES)})')
            for c in b.get('choose', []):
                go = c.get('go', {}).get('href', '')
                if go.startswith('#') and go[1:] not in anchors:
                    out.append(f'{where}: "{c["title"]}" jumps to {go}, which no block of this answer has as its anchor')
            for m in b.get('select', []):
                for k, v in m.items():
                    if k not in KEYS:
                        out.append(f'{where}: unknown field "{k}" (use {", ".join(KEYS)})')
                        continue
                    for x in as_list(v):
                        if x not in allowed[k]:
                            out.append(f'{where}: {k} "{x}" is not in IRL Commons')
            picked = selected(b, services)
            picked_ids = {s['id'] for s in picked}
            for sid in b.get('notes', {}):
                if sid not in picked_ids:
                    out.append(f'{where}: note for "{sid}", which this block no longer selects')
            if b.get('select') and not picked:
                out.append(f'{where}: selects no service')
            for m in b.get('select', []):
                for t in as_list(m.get('tags', [])):
                    for s in picked:
                        if t in s['tags'] and fits(s, m):
                            tagged_home[(s['id'], t)] = True
    for s in services:
        for t in s['tags']:
            if (s['id'], t) not in tagged_home:
                out.append(f'{s["name"]} ({s["id"]}) is tagged {t}, but no block that selects by {t} shows it')
    for text in texts(setup):
        for sid in re.findall(r'\{([a-z0-9-]+)\}', text):
            if sid in (setup.get('hold_back') or {}):
                out.append(f'{{{sid}}}: held back in hold_back, so it can\'t be linked')
            elif sid not in by_id:
                out.append(f'{{{sid}}}: no such service in IRL Commons')
    return out


def texts(setup: dict):
    for a in setup['answers']:
        yield from a.get('before', [])
        yield from a.get('after', [])
        for b in a.get('blocks', []):
            if b.get('pre'):
                yield b['pre']
            yield from b.get('before', [])
            yield from b.get('after', [])
            yield from b.get('also', [])
            if b.get('lead'):
                yield b['lead']
            yield from b.get('notes', {}).values()
            for c in b.get('choose', []):
                yield c['text']
                yield from c.get('items', [])


def link_services(text: str, by_id: dict) -> str:
    def one(m):
        s = by_id[m[1]]
        url = r.SITE_HOME[s['id']][0] if s['id'] in r.SITE_HOME else s['url']
        return f'<a href="{html.escape(url)}">{html.escape(s["name"], quote=False)}</a>'
    return re.sub(r'\{([a-z0-9-]+)\}', one, text)


def esc(t: str) -> str:
    return html.escape(t, quote=False)


def card(c: dict) -> str:
    href = c.get('href') or page(c['to'])
    sub = f'<span>{esc(c["text"])}</span>' if c.get('text') else ''
    ill = f'<svg class="ill" aria-hidden="true"><use href="#{c["icon"]}"/></svg>' if c.get('icon') else ''
    return (f'<li><a href="{href}">{ill}'
            f'<strong>{esc(c["title"])}</strong>{sub}</a></li>')


SITE = 'https://howtoirl.org/'


def page(aid: str) -> str:
    """Each answer is a page of its own, at the answer's id."""
    return f'{aid}.html'


def home_html(setup: dict) -> str:
    parts = []
    for i, g in enumerate(setup['groups']):
        gid = g.get('id') or 'grp-' + re.sub('[^a-z0-9]+', '-', g['title'].lower()).strip('-')
        cls = 'choices' + {'learn': ' learn', 'symptoms': ' symptoms'}.get(g.get('style'), '')
        hcls = 'grp live' if g.get('style') == 'symptoms' else 'grp'
        cards = '\n          '.join(card(c) for c in g['cards'])
        anchor = f' id="{g["anchor"]}"' if g.get('anchor') else ''
        parts.append(f'<h2 class="{hcls}" id="{gid}" data-permalink="no">{esc(g["title"])}</h2>\n'
                     f'        <ul class="{cls}"{anchor} aria-labelledby="{gid}">\n          {cards}\n        </ul>')
    return ('<section class="step start" id="start" tabindex="-1" aria-label="Choose your starting point">\n        '
            + '\n        '.join(parts) + '\n      </section>')


def back_link(a: dict) -> str:
    """The one way back from an answer, at the top, named after where it goes.

    `back: history` returns to the previous page through site.js and falls back to the cards."""
    back = a.get('back')
    if back == 'history':
        href, label, extra = 'index.html', 'Back', ' data-back="history"'
    elif back:
        href, label, extra = page(back['to']), back['label'], ''
    else:
        href, label, extra = 'index.html', 'All starting points', ''
    return f'<p class="go-back"><a href="{href}"{extra}><span aria-hidden="true">←</span>{esc(label)}</a></p>'


def line(s: dict, note: str | None, by_id: dict) -> str:
    url = r.SITE_HOME[s['id']][0] if s['id'] in r.SITE_HOME else s['url']
    name = f'<a href="{html.escape(url)}">{esc(s["name"])}</a>'
    if note is not None:
        note = link_services(note, by_id)
        return f'<li>{name}{note}</li>' if note.startswith(("'s", ' ')) else f'<li>{name}: {note}</li>'
    lead = r.first_sentence(s['description'])[0]
    tag = f' <span class="tag">{esc(s["status"][0].upper() + s["status"][1:])}</span>' if s['status'] else ''
    return f'<li>{name}: {esc(lead)}{tag}</li>'


WATCH = '! '


def item(text: str, by_id: dict, cls: str = '') -> str:
    """One list line. A line that starts with "! " is a watch-out: an outlined "!" mark, read out as "Watch out:"."""
    if text.startswith(WATCH):
        return f'<li class="w"><span class="vh">Watch out: </span>{link_services(text[len(WATCH):], by_id)}</li>'
    attr = f' class="{cls}"' if cls else ''
    return f'<li{attr}>{link_services(text, by_id)}</li>'


def item_list(lines: list[str], tag: str = 'ul', mix: bool = False) -> str:
    """Lists that mix tips and watch-outs, and all lists in a step-by-step answer, use the dot and "!" marks."""
    if not lines:
        return ''
    cls = 'picks mix' if mix or any('class="w"' in li for li in lines) else 'picks'
    body = '\n            '.join(lines)
    return f'<{tag} class="{cls}">\n            {body}\n          </{tag}>'


def block_items(b: dict, picked: list[dict], by_id: dict) -> list[str]:
    notes = b.get('notes', {})
    out = [item(t, by_id, 'plain') for t in b.get('before', [])]
    services = [line(s, notes.get(s['id']), by_id) for s in picked]
    if b.get('lead') and services:
        inner = '\n              '.join(services)
        out.append(f'<li class="plain">{link_services(b["lead"], by_id)}\n            <ul class="picks mix">\n              {inner}\n            </ul></li>')
    else:
        out += services
    out += [item(t, by_id, 'plain') for t in b.get('also', [])]
    out += [item(t, by_id, 'aside') for t in b.get('after', [])]
    return out


def steps_list(lines: list[str], by_id: dict) -> str:
    """Numbered steps. A "! " watch-out takes no number: it sits in a short list under the step above it,
    so a screen reader hears the steps as one ordered list and each watch-out as part of its step."""
    steps: list[tuple[str, list[str]]] = []
    for t in lines:
        if t.startswith(WATCH) and steps:
            steps[-1][1].append(item(t, by_id))
        else:
            steps.append((link_services(t, by_id), []))
    out = []
    for text, notes in steps:
        sub = ('\n              <ul class="picks mix">\n                ' + '\n                '.join(notes) + '\n              </ul>') if notes else ''
        out.append(f'<li>{text}{sub}</li>')
    return '<ol class="picks steps">\n            ' + '\n            '.join(out) + '\n          </ol>'


PLATFORM_NAMES = {'ios': 'iPhone', 'android': 'Android'}


def split_html(a: dict, b: dict, picked: list[dict], by_id: dict, mix: bool) -> str:
    """One list per phone platform. Without script both show, each under its name; site.js turns the names into
    a two-button switch that starts on the visitor's own platform. Apps for both platforms are in both lists."""
    plats = b['split']
    group = f'{a["id"]}-platform'
    buttons = ''.join(f'<button type="button" data-platform="{p}" aria-pressed="false">{PLATFORM_NAMES[p]}</button>' for p in plats)
    lists = []
    for p in plats:
        mine = [s for s in picked if p in s['platforms']]
        lis = block_items({**b, 'before': [], 'after': []}, mine, by_id)
        lists.append(f'<div class="plat" data-platform="{p}">\n          <h4 id="{a["id"]}-{p}">{PLATFORM_NAMES[p]}</h4>\n          '
                     f'{item_list(lis, mix=mix)}\n          </div>')
    seg = f'<div class="seg" role="group" aria-label="Phone" hidden>{buttons}</div>'
    return f'<div class="plats" id="{group}">\n          {seg}\n          ' + '\n          '.join(lists) + '\n          </div>'


def choose_html(b: dict, by_id: dict) -> str:
    """Option cards side by side (stacked on phones), each with its cost and fit, watch-outs, and a jump link."""
    cards = []
    for c in b['choose']:
        go = c.get('go')
        go = f'\n            <p class="go"><a href="{go["href"]}">{esc(go["label"])}<span aria-hidden="true"> ↓</span></a></p>' if go else ''
        cards.append(f'<li class="opt">\n            <h4>{esc(c["title"])}</h4>\n            <p>{link_services(c["text"], by_id)}</p>\n            '
                     f'{item_list([item(t, by_id) for t in c.get("items", [])], mix=True)}{go}\n          </li>')
    return '<ul class="choose">\n          ' + '\n          '.join(cards) + '\n        </ul>'


def block_body(a: dict, b: dict, services: list[dict], by_id: dict, mix: bool) -> str:
    picked = selected(b, services)
    parts = []
    if b.get('pre'):
        parts.append(f'<p class="pre">{link_services(b["pre"], by_id)}</p>')
    if b.get('choose'):
        parts.append(choose_html(b, by_id))
    if b.get('split'):
        before = [item(t, by_id, 'plain') for t in b.get('before', [])]
        if before:
            parts.append(item_list(before, mix=mix))
        parts.append(split_html(a, b, picked, by_id, mix))
        after = [item(t, by_id, 'aside') for t in b.get('after', [])]
        if after:
            parts.append(item_list(after, mix=mix))
    elif b.get('ordered'):
        parts.append(steps_list(b.get('before', []), by_id))
    else:
        parts.append(item_list(block_items(b, picked, by_id), 'ul', mix))
    return '\n          '.join(p for p in parts if p)


def count_html(b: dict, services: list[dict]) -> str:
    small = b.get('small', '')
    if 'count' in b:
        n = len(selected(b, services))
        one, many = b['count']
        small = f'{n} {one if n == 1 else many}'
    return f'<small>{esc(small)}</small>' if small else ''


def block_html(a: dict, b: dict, first: bool, services: list[dict], by_id: dict) -> str:
    """A collapsible block. The first one is open, and so is any block with `open: true`."""
    is_open = first or b.get('open')
    return (f'<details class="block"{" open" if is_open else ""}><summary><h3>{esc(b["title"])}</h3>{count_html(b, services)}</summary>\n'
            f'          {block_body(a, b, services, by_id, False)}\n        </details>')


def steps_html(a: dict, services: list[dict], by_id: dict) -> str:
    """`layout: steps`: numbered steps, each number once, with `sub: true` blocks as sub-sections of the step before."""
    out, n = [], 0
    for b in a['blocks']:
        anchor = f' id="{b["anchor"]}"' if b.get('anchor') else ''
        if b.get('sub'):
            head = f'<h4 class="sub"{anchor}>{esc(b["title"])}</h4>'
        else:
            n += 1
            head = f'<h3 class="num"{anchor}><span class="n" aria-hidden="true">{n}</span><span class="vh">Step {n}: </span>{esc(b["title"])}</h3>'
        out.append(f'<div class="stepblock{" sub" if b.get("sub") else ""}">\n          {head}\n          {block_body(a, b, services, by_id, True)}\n        </div>')
    return '\n        '.join(out)


SIMS = '<p class="sims-ref"><strong>Picking SIMs?</strong> See <a href="data-plans.html">Data plans and SIMs</a>: upload speed, how much data you need, and the limits behind "unlimited".</p>'


def side_html(a: dict) -> str:
    out = []
    for item in a.get('side', []):
        (k, v), = item.items()
        out.append(SIMS if k == 'sims' else f'<p class="{k}">{v}</p>')
    url = SITE + page(a['id'])
    out.append(f'<div class="send"><p>Link to send: <a href="{page(a["id"])}">howtoirl.org/<wbr>{page(a["id"])}</a></p>'
               f'<button type="button" class="copy-link" data-copy="{url}" hidden>Copy link for chat</button></div>')
    return '\n            '.join(out)


def sources_html(a: dict) -> str:
    """The public pages an answer's checks rest on, under the answer, like the Sources on the guide pages."""
    if not a.get('sources'):
        return ''
    links = ', '.join(f'<a href="{html.escape(x["url"])}">{esc(x["label"])}</a>' for x in a['sources'])
    return f'<details class="more fold sources" open><summary>Sources</summary><p class="tip-src">{links}</p></details>'


def answer_html(a: dict, services: list[dict], by_id: dict) -> str:
    aid = a['id']
    head = (f'<div class="result-head">\n          <svg class="ill big" aria-hidden="true"><use href="#{a["icon"]}"/></svg>\n          <div>\n'
            f'            <h2 id="{aid}-h">{esc(a["title"])}</h2>\n            <p class="sum">{a["summary"]}</p>\n          </div>\n        </div>')
    if a.get('question'):
        choices = '\n            '.join(card(c) for c in a['choices'])
        hint = f'<p class="hint">{a["hint"]}</p>\n        ' if a.get('hint') else ''
        ask = f'\n          <p class="ask-text">{a["ask_text"]}</p>' if a.get('ask_text') else ''
        body = (f'{hint}{a["extra"].strip()}\n'
                f'        <div class="ask-q">\n          <h3 class="q" id="{aid}-q">{esc(a["ask"])}</h3>{ask}\n'
                f'          <ul class="choices two" aria-labelledby="{aid}-q">\n            {choices}\n          </ul>\n        </div>')
        if a.get('side'):
            body += f'\n        <div class="q-side">\n            {side_html(a)}\n        </div>'
        kind = 'question'
    else:
        if a.get('layout') == 'steps':
            blocks = steps_html(a, services, by_id)
        else:
            blocks = '\n        '.join(block_html(a, b, i == 0, services, by_id) for i, b in enumerate(a['blocks']))
        loose = lambda key: item_list([item(t, by_id) for t in a.get(key, [])], mix=True).replace('class="picks mix"', f'class="picks mix loose {key}"', 1)
        blocks = '\n        '.join(x for x in (loose('before'), blocks, loose('after'), sources_html(a)) if x)
        body = (f'<div class="result-body">\n          <div class="result-main">\n        {blocks}\n          </div>\n'
                f'          <div class="result-side">\n            {side_html(a)}\n          </div>\n        </div>')
        kind = 'result steps' if a.get('layout') == 'steps' else 'result'
    return (f'<section class="step {kind}" id="{aid}" tabindex="-1" aria-labelledby="{aid}-h">\n        {back_link(a)}\n'
            f'        {head}\n        {body}\n      </section>')


def relink(body: str, aid: str, owner: dict[str, str]) -> str:
    """Answers link to each other by id ("#receiver"). On a page of its own, a link to another answer, or to an
    anchor inside one, goes to that page; an anchor on this answer's own page stays a fragment."""
    def one(m):
        target = m[1]
        home = owner.get(target)
        if home is None or home == aid and target != aid:
            return m[0]
        return f'href="{page(home)}{"" if target == home else "#" + target}"'
    return re.sub(r'href="#([A-Za-z0-9_-]+)"', one, body)


def headings_up(body: str) -> str:
    """On its own page the answer's title is the h1, so every heading in it moves up one level."""
    return re.sub(r'<(/?)h([2-5])\b', lambda m: f'<{m[1]}h{int(m[2]) - 1}', body)


def owners(setup: dict) -> dict[str, str]:
    """Which answer each id belongs to: the answer ids, and the anchors of their blocks."""
    out = {}
    for a in setup['answers']:
        out[a['id']] = a['id']
        for b in a.get('blocks', []):
            if b.get('anchor'):
                out[b['anchor']] = a['id']
    return out


def moved_html(setup: dict) -> str:
    """Old links to an answer on the home page (howtoirl.org/#second-network) still land: site.js forwards them to
    the answer's page, and without script the fragment shows a line that links there."""
    lines = [f'<p class="moved" id="{i}">This answer has its own page now: <a href="{page(a)}{"" if i == a else "#" + i}">'
             f'{esc(next(x["title"] for x in setup["answers"] if x["id"] == a))}</a></p>' for i, a in owners(setup).items()]
    return '<div class="moved-list">\n        ' + '\n        '.join(lines) + '\n      </div>'


def answer_page(a: dict, setup: dict, services: list[dict], by_id: dict) -> str:
    body = headings_up(relink(answer_html(a, services, by_id), a['id'], owners(setup)))
    return (f'<div class="wrap page fits-page answer-page">\n  <div class="parts">\n    <div class="flow">\n      '
            f'{body}\n    </div>\n  </div>\n</div>\n')


def answer_pages(setup: dict, services: list[dict]) -> dict[str, str]:
    services = shown(setup, services)
    by_id = {s['id']: s for s in services}
    return {page(a['id']): answer_page(a, setup, services, by_id) for a in setup['answers']}


def plain_text(t: str) -> str:
    return html.unescape(re.sub(r'<[^>]+>', '', t))


def fill(body: str, setup: dict, services: list[dict]) -> str:
    services = shown(setup, services)
    by_id = {s['id']: s for s in services}
    if '<!--setup:start-->' in body:
        body = body.replace('<!--setup:start-->', home_html(setup))
    if '<!--setup:answers-->' in body:
        body = body.replace('<!--setup:answers-->', moved_html(setup))
    return body

# The site's own pages in Help's Guides tab, in this order, each with the part colour of its topic.
HELP_PAGES = {'one-phone': 'sender', 'second-network': 'connections', 'hybrid': 'tools', 'better-picture': 'sender',
              'several-cameras': 'tools', 'cloud': 'receiver', 'more': 'sender', 'satellite': 'connections', 'receiver': 'receiver',
              'into-obs': 'tools', 'build': 'sender', 'ready-made': 'sender', 'live-not-on-platform': 'tools', 'picture-frozen': 'sender',
              'no-sound-or-alerts': 'tools', 'second-link-idle': 'connections', 'data-plans.html': 'connections', 'why-bonding.html': 'connections'}
HELP_SKIP = {'a', 'in', 'one', 'the', 'and', 'to', 'your'}


def help_pages(setup: dict) -> list[dict]:
    """Title, one subtitle line and link for each own page: the home card's line, or the summary's first sentence when
    the card line would only repeat the title."""
    cards = {c.get('to') or c.get('href'): c for g in setup['groups'] for c in g['cards']}
    answers = {a['id']: a for a in setup['answers']}
    out = []
    for key, step in HELP_PAGES.items():
        a, c = answers.get(key, {}), cards.get(key, {})
        title = c['title'] if key.endswith('.html') else a['title']
        sub = c.get('text', '')
        words = set(re.findall(r'[a-z]+', title.lower())) - HELP_SKIP
        if not sub or len(words & set(re.findall(r'[a-z]+', sub.lower()))) >= max(1, len(words) * 0.6):
            summary = html.unescape(re.sub(r'<[^>]+>', '', a.get('summary', '')))
            sub = re.split(r'(?<=[.!?])\s', summary)[0] if summary else ''
        out.append({'id': key.removesuffix('.html'), 'title': title, 'sub': sub, 'step': step,
                    'href': key if key.endswith('.html') else page(key)})
    return out


def help_problems(setup: dict) -> list[str]:
    known = {a['id'] for a in setup['answers']}
    return ([f'answer #{i} has no part colour in HELP_PAGES (scripts/setup.py), so Help\'s Guides tab would miss it' for i in sorted(known - set(HELP_PAGES))]
            + [f'HELP_PAGES names #{i}, which is no answer' for i in sorted(set(k for k in HELP_PAGES if not k.endswith('.html')) - known)])


def check(pkg: pathlib.Path, path: pathlib.Path = ROOT / 'content/setup.yaml') -> tuple[dict, list[str]]:
    services = json.loads((pkg / 'data/services.json').read_text())['services']
    schema = json.loads((pkg / 'schema/json/services.schema.json').read_text())
    setup = load_yaml(path)
    return setup, problems(setup, services, allowed_values(schema, services)) + help_problems(setup)


if __name__ == '__main__':
    pkg = ROOT / 'node_modules/@irl-commons/data'
    _, found = check(pkg, pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'content/setup.yaml')
    print('\n'.join(found) or 'setup.yaml: ok')
    sys.exit(1 if found else 0)


def share_image(aid: str) -> str:
    """The picture a chat app shows for a link to the page: its drawing, title and first line (scripts/share-images.mjs)."""
    return f'assets/share/{aid}.png'


def share_line(a: dict) -> str:
    """The first sentence of the summary, for the description and the share image."""
    return re.split(r'(?<=[.!?])\s', plain_text(a['summary']).strip())[0]


def answer_meta(setup: dict) -> list[dict]:
    """What each answer page's head needs (src/components/Head.astro): its own title, description and share image.
    The rest of the page around it is Home's."""
    return [{'name': page(a['id']), 'title': f'{a["title"]} · How to IRL', 'shareTitle': a['title'],
             'description': plain_text(a['summary']).strip(), 'image': share_image(a['id']),
             'imageAlt': f'{a["title"]}: {share_line(a)}', 'illustrations': 'home'}
            for a in setup['answers']]

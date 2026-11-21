"""Render catalogue slots from the pinned upstream package before Astro builds."""
import json, pathlib, sys, re
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'shared'))
import render as r
sys.path.insert(0,str(ROOT/'scripts'))
import setup as setup_answers
pkg=ROOT/'node_modules/@irl-commons/data'
data={k:json.loads((pkg/'data'/f'{k}.json').read_text())[k] for k in ['words','services','guides','standards']}
cfg=json.loads((ROOT/'site.json').read_text())
words_by_id={w['id']:w for w in data['words']}
selected=cfg['glossaryWords']
if len(selected)!=len(set(selected)) or any(wid not in words_by_id for wid in selected):
 sys.exit('site.json glossaryWords must contain unique ids present in IRL Commons')
glossary_words=[words_by_id[wid] for wid in selected]
r.GUIDES[:]=data['guides'];r.SERVICES_BY_ID.update({s['id']:s for s in data['services']})
r.GUIDE_THUMBS.update({m['for']['guide']:m for m in json.loads((ROOT/'shared/thumbnails.json').read_text())})
setup,found=setup_answers.check(pkg)
r.HELP_OWN[:]=setup_answers.help_pages(setup)
if found:
 sys.exit('content/setup.yaml does not match IRL Commons:\n  '+'\n  '.join(found))
cfg=json.loads((ROOT/'site.json').read_text())
other='irlcommons.org' if cfg['domain']=='howtoirl.org' else 'howtoirl.org'
def finish(body):
 # Resolve data-generated links across the two public sites.
 body=body.replace('>Data and standards</a>', '>Open data at IRL Commons</a>' if cfg['domain']=='howtoirl.org' else '>Open data</a>')
 def cross(match):
  page=match[1]
  return match[0] if page in cfg['pages'] else f'href="https://{other}/{page}'
 body=re.sub(r'href="([a-z0-9-]+\.html)',cross,body)
 # Each navigation needs a distinct accessible name. Keep the authored label;
 # only a label that repeats on the page gets "part 2", "part 3" and so on.
 seen={}
 def landmark(match):
  label=match[1]
  seen[label]=seen.get(label,0)+1
  return match[0] if seen[label]==1 else match[0][:-1]+f', part {seen[label]}"'
 body=re.sub(r'<nav[^>]+aria-label="([^"]+)"',landmark,body)
 body=re.sub(r'<nav(?![^>]*aria-label)([^>]*)>',lambda m: '<nav aria-label="Steps '+str(m.start())+'"'+m[1]+'>',body)
 return r.add_permalinks(body)
rendered={}
for src in (ROOT/'content').glob('*.html'):
 body=src.read_text()
 body=setup_answers.fill(body,setup,data['services'])
 body=r.fill_words(body,glossary_words)
 body=r.fill_standards(body,data['standards'],data['services'],data['words'])
 body=r.fill_services(body,data['services'])
 body=r.fill_calc(body,r.datause.load_model())
 body=setup_answers.stamp_sections(body)
 rendered[src.name]=finish(body)
# Each answer is a page of its own, with its own title, description and share image.
answer_pages=setup_answers.answer_pages(setup,data['services'])
missing=[n for n in answer_pages if n not in cfg['pages']]
if missing:
 sys.exit('site.json pages must list every answer page: '+', '.join(missing))
for name,body in answer_pages.items():
 rendered[name]=finish(body)
shells=json.loads((ROOT/'src/shells.json').read_text())
(ROOT/'.generated').mkdir(exist_ok=True)
(ROOT/'.generated/answer-shells.json').write_text(json.dumps(setup_answers.answer_shells(setup,next(x for x in shells if x['name']=='index.html')),ensure_ascii=False))
# The sitemap lists every page in site.json.
(ROOT/'public/sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
 +''.join(f'  <url><loc>https://{cfg["domain"]}/{"" if n=="index.html" else n}</loc></url>\n' for n in cfg['pages'])+'</urlset>\n')
(ROOT/'.generated').mkdir(exist_ok=True)
(ROOT/'.generated/content.json').write_text(json.dumps(rendered,ensure_ascii=False))
if 'links.html' in json.loads((ROOT/'site.json').read_text())['pages']:
 (ROOT/'public/assets/links-filters.css').write_text(r.links_filters_css(data['services']))

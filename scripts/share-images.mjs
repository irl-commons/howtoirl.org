// The share images chat apps show for a link to a page (og:image): the page's drawing, its title and the first
// sentence of its lede or summary on paper, with the wordmark and address. Pages with `share: site` in src/pages.yaml
// share one site card. Run after `npm run build`, then build again so the image addresses carry the new hash:
//   npm run build && npm run share-images && npm run check
// It renders every card listed in .generated/share.json (scripts/share.py) into public/assets/share/, inside a
// built page, so the picture uses the site's own stylesheet, fonts and drawings; removes images no page uses any
// more; and stops when text would be cut off. Commit the images.
import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {serve} from './serve.mjs';
import {cardHash,writeCard} from './share-card.mjs';

const {size:[width,height],cards}=JSON.parse(await readFile('.generated/share.json','utf8'));
const dir='public/assets/share';
await mkdir(dir,{recursive:true});
for(const file of await readdir(dir))if(!cards[`assets/share/${file}`]){await rm(`${dir}/${file}`);console.log(`removed ${dir}/${file}`);}

const style=`body>*:not(.sc){display:none!important}
 .sc{position:fixed;inset:0;z-index:99;background:var(--bg);color:var(--fg);font-family:var(--sans);display:grid;grid-template-columns:340px 1fr;grid-template-rows:1fr auto;gap:0 48px;padding:60px 72px 44px}
 .sc.no-art{grid-template-columns:1fr}
 .sc-art{display:flex;align-items:center;justify-content:center}
 .sc-art .ill{width:340px;height:227px;margin:0}
 .sc-text{align-self:center;min-width:0}
 .sc-title{font-size:68px;line-height:1.05;font-weight:700;letter-spacing:-0.02em;margin:0 0 24px;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
 .sc-line{font-size:34px;line-height:1.3;margin:0;text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
 .sc-foot{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:24px}
 .sc-brand{display:flex;align-items:center;gap:14px;margin:0;font-size:34px;font-weight:700}
 .sc-brand svg{width:48px;height:48px}
 .sc-url{margin:0;font-family:var(--mono);font-size:28px;color:var(--muted);white-space:nowrap}
 .sc.site{grid-template-columns:1fr;text-align:center;padding-top:72px}
 .sc.site .sc-text{justify-self:center;max-width:960px}
 .sc.site .sc-mark{width:150px;height:150px;display:block;margin:0 auto 20px}
 .sc.site .sc-title{font-size:112px;margin-bottom:28px}
 .sc.site .sc-line{font-size:40px}
 .sc.site .sc-foot{justify-content:center}
 .sc.site .sc-brand{display:none}`;

const server=await serve('dist');
const browser=await chromium.launch();
const problems=[];
try{
 // bypassCSP: the card is laid out with a few inline styles; the page itself keeps its strict CSP.
 const context=await browser.newContext({viewport:{width,height},colorScheme:'light',reducedMotion:'reduce',bypassCSP:true});
 const page=await context.newPage();
 for(const [image,card] of Object.entries(cards)){
  // The card's own page, unless its drawing is only in the home page's set.
  for(const at of [card.page,'index.html']){
   await page.goto(`${server.origin}/${at}`,{waitUntil:'load'});
   if(!card.icon||await page.evaluate(id=>!!document.getElementById(id),card.icon))break;
   if(at==='index.html')throw new Error(`${image}: no drawing #${card.icon} on ${card.page} or index.html`);
  }
  await page.evaluate(()=>document.fonts.ready.then(()=>true));
  const cut=await page.evaluate(({card,style})=>{
   const el=document.createElement('div');
   const art=card.kind==='page'&&card.icon;
   el.className=`sc ${card.kind}${art?'':' no-art'}`;
   el.innerHTML=(art?`<div class="sc-art"><svg class="ill" aria-hidden="true"><use href="#${card.icon}"/></svg></div>`:'')
    +`<div class="sc-text">${card.kind==='site'?'<svg class="sc-mark" aria-hidden="true"><use href="#mark"/></svg>':''}<p class="sc-title"></p><p class="sc-line"></p></div>
    <div class="sc-foot"><p class="sc-brand"><svg aria-hidden="true"><use href="#mark"/></svg>How to IRL</p><p class="sc-url"></p></div>`;
   el.querySelector('.sc-title').textContent=card.title;
   el.querySelector('.sc-line').textContent=card.line;
   el.querySelector('.sc-url').textContent=card.url;
   const s=document.createElement('style');s.textContent=style;
   document.head.appendChild(s);document.body.appendChild(el);
   // Glyphs reach a little below the last line box; a cut line is a whole line more.
   const over=e=>e.scrollHeight>e.clientHeight+parseFloat(getComputedStyle(e).lineHeight)/2||e.scrollWidth>e.clientWidth+1;
   const box=e=>e.getBoundingClientRect();
   return [...el.querySelectorAll('.sc-title,.sc-line,.sc-url')].filter(e=>over(e)||box(e).right>innerWidth||box(e).bottom>innerHeight).map(e=>`${e.className} ${e.scrollHeight}/${e.clientHeight} ${e.scrollWidth}/${e.clientWidth}`);
  },{card,style});
  if(cut.length)problems.push(`${image}: ${cut.join(', ')} cut off; shorten the text`);
  const png=await page.screenshot({animations:'disabled',caret:'hide'});
  await writeFile(`public/${image}`,writeCard(png,cardHash(card)));
  console.log(`public/${image}`);
 }
 await context.close();
}finally{await browser.close();await server.close();}
if(problems.length){console.error(problems.join('\n'));process.exit(1);}

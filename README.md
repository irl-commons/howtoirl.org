# howtoirl.org

A static Astro site for streamers and the people who help them.

## Build

Use the Node version in [`.nvmrc`](.nvmrc) (`nvm install && nvm use`)
and Python 3.12 or newer. The npm version is recorded in `package.json` (`packageManager`). Run `npm ci --ignore-scripts`, then
`npm run check`. Building never deploys. The `_headers` file records the required
response headers; configure equivalent headers when the host does not read it.

## Deploys and previews

GitHub Actions does both, once the repository variables `SITE_DEPLOY=on` and
`SITE_PREVIEWS=on` are set:

- **Live site:** every push to `main` is built, checked and put live
  ([deploy.yml](.github/workflows/deploy.yml)). The server keeps the last five
  releases and switches between them in one step. After the switch every file is
  fetched from the live site and compared with the build; if anything differs, the
  previous release goes back live. To undo a deploy by hand, run the Deploy workflow
  with `rollback`.
- **Previews:** each pull request from a branch of this repository gets its own
  address, `https://pr-<number>.preview.<domain>/`, posted as a comment on the pull
  request, rebuilt on every push and removed when it is closed
  ([preview.yml](.github/workflows/preview.yml)). Previews are not indexed. Pull
  requests from forks get no preview, because their code would run next to the
  deploy key; a maintainer can push the branch here to get one.
- **Data updates:** [data-bump.yml](.github/workflows/data-bump.yml) checks hourly
  for a new `@irl-commons/data` release and opens a pull request with a preview.
  Merging it puts the new data live.

The deploy key, the server address and its host key are secrets of the
`production` and `preview` environments; `production` only accepts `main`.

## Sources

The home page cards and the setup answers live in `content/setup.yaml`. Each
answer block picks apps and services from IRL Commons by their catalogue fields
(class, part, hosting, platforms, role, tags or id) and lists them
alphabetically with the catalogue description; a block can replace that line
with a short note for one service. The build stops when the file names a field
or value IRL Commons doesn't know, when a tagged service lands in no block that
selects by that tag, or when a note's service has left its block. A daily job
(`.github/workflows/data-bump.yml`) pins the newest stable npm release of IRL Commons, runs
every check and opens a pull request.

Each answer is a page of its own, `<answer id>.html` at `/<answer id>`, with the home page's header and footer and its own
title and description. An answer with `dir: fix` is a problem page instead, `fix/<answer id>.html` at
`/fix/<answer id>`, listed on `/fix`. A new answer needs its page in `site.json` (the build stops without it).
Tips (`content/tips/<name>.html`, at `/tips/<name>`) are listed on `/tips` from their entries in `src/pages.yaml`.
Old links to an answer on the home page (`/#second-network`) still land.

## Addresses

Pages are built as files (`phone-setup.html`) and served without the extension: `https://howtoirl.org/phone-setup`,
the home page at `/`. An old address ending in `.html`, and `/index`, answers with a permanent redirect (301) to the
clean one, query kept, so existing links keep working. Content and components may still link `phone-setup.html#step`
and `assets/style.css`, written as seen from the site root, also on a page in a folder: after `astro build`,
`scripts/finish.py` runs `shared/addresses.py` over the finished pages, so every link, canonical and edit address for a
page of either site is written without `.html`, and every link and asset starts at the root (`/phone-setup`,
`/assets/style.css`), so pages work at any depth. The sitemap and share cards use the same
addresses, and `npm test` fails if a page links an old address. `npm run serve` serves and redirects the same way as
the host, and the deploy check fetches each page at its clean address and its redirect from the old one.

## Link previews

`src/components/Head.astro` writes the Open Graph and X card tags of every page from its metadata
and `.generated/share.json`, which `scripts/share.py` builds. Each page gets a share image of its
own: its category badge, h1, the first sentence of its lede or summary, and its drawing from the home page cards.
Pages with `share: site` in `src/pages.yaml` (contact and legal pages) share one site card;
`share_icon` and `share_line` choose the drawing and line where a page has none or its own is
too long. The images are build output, not files in Git: the last step of `npm run build`
(`scripts/share-images.mjs`) draws them into `dist/assets/share/` with the site's own stylesheet and fonts in the
Chromium build `playwright-core` is pinned to (`npx playwright-core install chromium-headless-shell` once). The image
address carries a hash of what the card is made from, so chat apps fetch a changed card again. `npm test` fails when
a page lacks a tag or its image, when an image is not 1200 by 630 pixels or no longer matches
its page, or when an image is used by no page, and the build stops when text would be cut off.

## Fix, guide and tip

Each page is a fix (`fix/`), a tip (`tips/`) or a guide (an answer page, or a page under Help), or none of them
(`scripts/category.py`; `category:` in `src/pages.yaml` overrides). Its badge shows above the h1 and on its share
card. A Home group whose cards share a category shows the badge once in its heading and the colour as an edge on its
cards; Help's Guides tab shows it on each of the site's own rows. The colours are the `--cat-*` custom properties in
`public/assets/style.css`, in light and dark, and always come with the label and glyph.

Edit prose in `content/` and each page's title, description, language and pager
link in `src/pages.yaml`. The head, header with the site navigation, drawings,
pager and footer are Astro components in `src/components/`, put together by
`src/layouts/Layout.astro`. The build resolves catalogue
slots from `@irl-commons/data`, pinned to an exact npm version. To update it,
change the dependency pin, lockfile and `site.json` dataVersion together, then
run all checks. CI verifies registry signatures and provenance. The daily
update job follows npm’s `latest` tag and opens a release pull request.

`site.json` lists the published glossary words in `glossaryWords`. Adding a word
to the data package does not automatically publish it on this site; add its id
to that list when the page change is ready. The build rejects missing ids.

`shared/` is the same versioned folder in both site repositories: rendering
functions, calculator formula, thumbnail attribution and the data-use model.
Shared version: 1.2.11. Changes should be copied to the sibling site in the same
review. Vendoring this small folder keeps either repository independently
buildable without a third package release. Styles and self-hosted fonts are
identical; one first-party script adds theme choice, search, the calculator and
the Help page's app list (My apps).
The site also works without script. Quick checks are not published.

Tests cover the build, local links and anchors, metadata, HTML validation,
schema addresses, the strict CSP and page weight. Browser checks for
accessibility, layout, console errors and the site without script run in CI
(`npm run check:browser`, see [CONTRIBUTING.md](CONTRIBUTING.md)). No third-party
resources load in readers' browsers. The data package is fetched at build time only.

## Licences

Code: MIT (`LICENSE`). Original prose and drawings: CC BY 4.0
(`LICENSE-CONTENT`). Data from [IRL Commons](https://github.com/irl-commons/irl-commons),
CC BY 4.0. Video thumbnails belong to their credited creators and are linked to
the originals; they are not relicensed here. Fonts retain their bundled OFL notices.

Glossary and naming search reads `also_called`, `search_terms` and every naming
alternative term, along with the term, recommended label and plural. Deprecated
`aliases` is not used. Naming sources are displayed as “Where seen”, with
context-only sources identified, and without maker counts.

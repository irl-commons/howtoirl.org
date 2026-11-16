# howtoirl.org

A static Astro site for streamers and the people who help them.

## Build

Use the Node version in [`.nvmrc`](.nvmrc) (`nvm install && nvm use`)
and Python 3.12 or newer. The npm version is recorded in `package.json` (`packageManager`). Run `npm ci --ignore-scripts`, then
`npm run check`. Upload the plain `dist/` directory through your normal static
hosting process. Building never deploys. The `_headers` file records the required
response headers; configure equivalent headers when the host does not read it.

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

Edit prose in `content/`, page metadata and navigation in `src/shells.json`,
and the Astro layout and components in `src/`. The build resolves catalogue
slots from `@irl-commons/data`, pinned to an exact npm version. To update it,
change the dependency pin, lockfile and `site.json` dataVersion together, then
run all checks. CI verifies registry signatures and provenance. The daily
update job follows npm’s `latest` tag and opens a release pull request.

`site.json` lists the published glossary words in `glossaryWords`. Adding a word
to the data package does not automatically publish it on this site; add its id
to that list when the page change is ready. The build rejects missing ids.

`shared/` is the same versioned folder in both site repositories: rendering
functions, calculator formula, thumbnail attribution and the data-use model.
Shared version: 1.2.8. Changes should be copied to the sibling site in the same
review. Vendoring this small folder keeps either repository independently
buildable without a third package release. Styles and self-hosted fonts are
identical; one first-party script adds theme choice, search, the calculator and
the Help page's app list (My apps).
The site also works without script. Quick checks are not published.

Tests cover the build, local links and anchors, metadata, HTML validation,
schema addresses and the strict CSP. No third-party resources load in readers'
browsers. The data package is fetched at build time only.

## Licences

Code: MIT (`LICENSE`). Original prose and drawings: CC BY 4.0
(`LICENSE-CONTENT`). Data from [IRL Commons](https://github.com/irl-commons/irl-commons),
CC BY 4.0. Video thumbnails belong to their credited creators and are linked to
the originals; they are not relicensed here. Fonts retain their bundled OFL notices.

Glossary and naming search reads `also_called`, `search_terms` and every naming
alternative term, along with the term, recommended label and plural. Deprecated
`aliases` is not used. Naming sources are displayed as “Where seen”, with
context-only sources identified, and without maker counts.

import { hashId } from "./addresses.ts";
import { reveal } from "./page-controls.ts";

export function norm(text: string | null) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function wordMatches(haystack: string | null, query: string) {
  const hay = norm(haystack);
  return norm(query)
    .split(/\s+/)
    .filter(Boolean)
    .every(function (piece) {
      return hay.indexOf(piece) !== -1;
    });
}

// Glossary count: a short "12 / 31" on screen, "12 of 31 words" for screen readers.
export function wordCount(shown: number, total: number) {
  return { shown: shown + " / " + total, said: shown + " of " + total + " words" };
}

export function initWords() {
  const tools = document.getElementById("word-tools");
  if (!tools) return;
  const q = document.querySelector<HTMLInputElement>("#word-q");
  const count = document.getElementById("word-count");
  const entries = Array.from(document.querySelectorAll<HTMLElement>(".glossary .entry"));
  if (!q || !count) return;
  const toc = new Map<string | null, HTMLElement>();
  Array.from(document.querySelectorAll<HTMLElement>(".toc li[data-for]")).forEach(function (li) {
    toc.set(li.getAttribute("data-for"), li);
  });
  const seen = document.createElement("span");
  seen.setAttribute("aria-hidden", "true");
  const said = document.createElement("span");
  said.className = "vh";
  count.appendChild(seen);
  count.appendChild(said);
  const apply = () => {
    let shown = 0;
    entries.forEach(function (e) {
      const ok = wordMatches(e.getAttribute("data-search"), q.value);
      e.hidden = !ok;
      const item = toc.get(e.id);
      if (item) item.hidden = !ok;
      if (ok) shown++;
    });
    const c = wordCount(shown, entries.length);
    seen.textContent = c.shown;
    said.textContent = c.said;
  };
  // A deep link (#word, or #word-more for its further reading) always lands: a search that hides the word is
  // cleared, the word's "More" opens when the link points into it, and the word is highlighted for a moment.
  const show = (id: string, scroll: boolean) => {
    const t = document.getElementById(id);
    const entry = t?.closest<HTMLElement>(".glossary .entry");
    if (!t || !entry) return;
    if (entry.hidden) {
      q.value = "";
      q.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (t instanceof HTMLDetailsElement) t.open = true;
    else reveal(t);
    entry.classList.remove("is-landed");
    void entry.offsetWidth; // restart the highlight when the same word is linked again
    entry.classList.add("is-landed");
    if (scroll) t.scrollIntoView({ block: "start" });
  };
  q.addEventListener("input", apply);
  tools.hidden = false;
  apply();
  show(hashId(window.location.hash), false); // landTarget() scrolls there once the page is set up
  document.addEventListener("click", function (ev) {
    const a = ev.target instanceof Element ? ev.target.closest('a[href^="#"]') : null;
    if (!a) return;
    const id = hashId(a.getAttribute("href"));
    // The same address again fires no hashchange, so this covers it too.
    if (id && id === hashId(window.location.hash)) {
      ev.preventDefault();
      show(id, true);
    } else show(id, false);
  });
  window.addEventListener("hashchange", function () {
    show(hashId(window.location.hash), true);
  });
  entries.forEach(function (e) {
    e.addEventListener("animationend", function () {
      e.classList.remove("is-landed");
    });
  });
}

export function initClear() {
  const SVG = "http://www.w3.org/2000/svg";
  document.querySelectorAll<HTMLInputElement>('input[type="search"]').forEach(function (input) {
    if (input.classList.contains("has-clear") || input.id === "dir-q" || input.id === "std-q") return;
    const box = document.createElement("span");
    box.className = "search-box";
    input.before(box);
    box.appendChild(input);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "search-clear";
    b.setAttribute("aria-label", "Clear search");
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round");
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", "M6 6l12 12M18 6L6 18");
    svg.appendChild(path);
    b.appendChild(svg);
    box.appendChild(b);
    input.classList.add("has-clear");
    function sync() {
      b.hidden = input.value === "";
    }
    function clear() {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }
    b.addEventListener("click", clear);
    input.addEventListener("input", sync);
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && input.value !== "") {
        ev.preventDefault();
        clear();
      }
    });
    sync();
  });
}

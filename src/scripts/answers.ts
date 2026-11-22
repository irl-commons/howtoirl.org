import { hashId, pickPlatform } from "./addresses.ts";
import { storageOrNull } from "./theme.ts";

// An answer's iPhone/Android lists become a two-button switch that starts on the visitor's own platform.
// Without script both lists show, each under its name. Apps for both platforms are in both lists.
export function initPlatforms() {
  document.querySelectorAll<HTMLElement>(".plats").forEach(function (box) {
    const seg = box.querySelector<HTMLElement>(".seg");
    if (!seg) return;
    const lists = Array.from(box.querySelectorAll<HTMLElement>(".plat"));
    const buttons = Array.from(seg.querySelectorAll("button"));
    const offered = buttons.map(function (b) {
      return b.getAttribute("data-platform");
    });
    function pick(p: string | null) {
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-platform") === p ? "true" : "false");
      });
      lists.forEach(function (l) {
        l.hidden = l.getAttribute("data-platform") !== p;
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        pick(b.getAttribute("data-platform"));
      });
    });
    box.classList.add("is-switch");
    seg.hidden = false;
    pick(pickPlatform(navigator.userAgent, offered));
  });
}

// A "Back" link with data-back="history" returns to the page the visitor came from on this site. The site sends
// no referrer, so each page notes its address for the next one in sessionStorage. Arriving from anywhere else,
// after a reload, or without script, the link follows its href to the cards.
export function initBack() {
  let store: Storage | null = null;
  try {
    store = window.sessionStorage;
  } catch {}
  const here = window.location.pathname;
  let prev = null;
  try {
    prev = store && store.getItem("howtoirl.last");
    store && store.setItem("howtoirl.last", here);
  } catch {}
  if (!prev || prev === here) return;
  document.addEventListener("click", function (ev) {
    const a = ev.target instanceof Element ? ev.target.closest('a[data-back="history"]') : null;
    if (
      !a ||
      ev.defaultPrevented ||
      ev.button !== 0 ||
      ev.metaKey ||
      ev.ctrlKey ||
      ev.shiftKey ||
      ev.altKey
    )
      return;
    ev.preventDefault();
    window.history.back();
  });
}

// Old links to an answer on the home page (/#second-network) go on to the answer's own page.
export function initMoved() {
  const t = document.getElementById(hashId(window.location.hash));
  const a = t && t.classList.contains("moved") ? t.querySelector("a[href]") : null;
  if (a instanceof HTMLAnchorElement) window.location.replace(a.getAttribute("href") ?? "");
  return !!a;
}

// "Copy link for chat": copies the answer's address, and says so where the button was.
export function initCopy() {
  Array.from(document.querySelectorAll<HTMLElement>("button.copy-link[data-copy]")).forEach(
    function (b) {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      const label = b.textContent;
      let timer: number | undefined;
      const said = document.createElement("span");
      said.className = "vh";
      said.setAttribute("role", "status");
      b.after(said);
      b.hidden = false;
      b.addEventListener("click", function () {
        navigator.clipboard.writeText(b.getAttribute("data-copy") ?? "").then(
          function () {
            b.textContent = "Copied. Paste it in chat.";
            said.textContent = "Link copied.";
            b.classList.add("is-copied");
            clearTimeout(timer);
            timer = setTimeout(function () {
              b.textContent = label;
              said.textContent = "";
              b.classList.remove("is-copied");
            }, 4000);
          },
          function () {},
        );
      });
    },
  );
}

// "Before you go live": ticks are kept on this device only, per answer, and counted.
const GOLIVE_KEY = "howtoirl.golive.v1";
export function initChecklists() {
  const lists = Array.from(document.querySelectorAll<HTMLElement>(".golive[data-checklist]"));
  if (!lists.length) return;
  const store = storageOrNull();
  let saved: Record<string, unknown> = {};
  try {
    saved = readChecks(store);
  } catch {
    saved = {};
  }
  function save() {
    if (!store) return;
    try {
      if (Object.keys(saved).length) store.setItem(GOLIVE_KEY, JSON.stringify(saved));
      else store.removeItem(GOLIVE_KEY);
    } catch {}
  }
  lists.forEach(function (list) {
    const id = list.dataset.checklist;
    if (id === undefined) return;
    const boxes = Array.from(list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const count = list.querySelector<HTMLElement>(".golive-count");
    const note = list.querySelector<HTMLElement>(".golive-note");
    if (!count || !note) return;
    const stored = saved[id];
    const mine: readonly unknown[] = Array.isArray(stored) ? stored : [];
    boxes.forEach(function (b) {
      b.checked = mine.indexOf(b.value) !== -1;
    });
    const update = (persist: boolean) => {
      const on = boxes
        .filter(function (b) {
          return b.checked;
        })
        .map(function (b) {
          return b.value;
        });
      count.textContent = on.length + " of " + boxes.length + " ready";
      list.classList.toggle("is-done", on.length === boxes.length);
      if (persist) {
        if (on.length) saved[id] = on;
        else delete saved[id];
        save();
      }
    };
    list.addEventListener("change", function () {
      update(true);
    });
    list.querySelector(".golive-clear")?.addEventListener("click", function () {
      boxes.forEach(function (b) {
        b.checked = false;
      });
      update(true);
    });
    count.hidden = false;
    if (store) note.hidden = false;
    update(false);
  });
}

function readChecks(store: Storage | null): Record<string, unknown> {
  const value: unknown = JSON.parse(store?.getItem(GOLIVE_KEY) ?? "{}");
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

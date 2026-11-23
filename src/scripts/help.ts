import { requireElement, requireId } from "./dom.ts";
import { storageOrNull } from "./theme.ts";
import { countText, fuzzy, guidesHash, parseHash } from "./help-query.ts";
import type { Tab } from "./help-query.ts";

interface Channel {
  t: string;
  u: string;
}
interface App {
  id: string;
  st: string;
  n: string;
  pl: string;
  ini: string;
  chans: Channel[];
  web: string;
  guides: number;
}

// Help, "My apps": the page lists every app (four part boxes, A-Z) and every guide in its HTML. With script this adds
// the "Find your app" search, saving apps on this device (localStorage, nothing leaves the browser), the full app card
// (a bottom sheet on a phone, a dialog on a computer), "Share link" (a #stack= link), the Help and Guides tabs
// and the guide filters. Older addresses still land: #for-<app>, #guides-<part>, #kind-<kind>, #guides?part=…&q=…,
// #ask-<app> (opens its card), #where-to-ask and a guide's own id.
const KEY = "howtoirl.myapps";
const STEPS = [
  ["sender", "Camera and sender"],
  ["connections", "Connections"],
  ["receiver", "Receiver or cloud"],
  ["tools", "OBS and tools"],
];
const KINDS = [
  ["article", "Articles"],
  ["video", "Videos"],
  ["docs", "Docs"],
];
const SRC = [
  ["own", "How to IRL"],
  ["other", "Apps and community"],
];
function toTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function esc(t: string) {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function initHelp() {
  const page = document.querySelector<HTMLElement>(".myapps");
  if (!page) return;
  const $ = requireId;
  const apps: Record<string, App> = Object.create(null);
  const order: string[] = [];
  Array.from(page.querySelectorAll<HTMLElement>(".row[data-id]")).forEach(function (li) {
    const links: Channel[] = [];
    let guides = 0;
    Array.from(li.querySelectorAll<HTMLAnchorElement>(".row-x a")).forEach(function (a) {
      if (a.hasAttribute("data-g")) guides = parseInt(a.textContent ?? "", 10) || 0;
      else links.push({ t: a.dataset.ct ?? "", u: a.getAttribute("href") ?? "" });
    });
    const id = li.dataset.id;
    if (!id) return;
    apps[id] = {
      id: id,
      st: li.dataset.st ?? "",
      n: requireElement(li, ".rn-n").textContent ?? "",
      pl: li.dataset.pl ?? "",
      ini: requireElement(li, ".tile").textContent ?? "",
      chans: links.filter(function (l) {
        return l.t !== "Website";
      }),
      web: links.find((link) => link.t === "Website")?.u ?? "",
      guides,
    };
    order.push(id);
    // The name opens the full card; the extra links move into it.
    const rn = requireElement(li, ".rn"),
      b = document.createElement("button");
    b.type = "button";
    b.className = "rn";
    b.setAttribute("data-open", id);
    b.innerHTML =
      '<span class="rn-n">' + esc(apps[id].n) + "</span>" + requireElement(rn, "small").outerHTML;
    rn.replaceWith(b);
  });
  function known(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    return ids.filter(
      (id: unknown, i): id is string => typeof id === "string" && !!apps[id] && ids.indexOf(id) === i,
    );
  }

  const storage = storageOrNull();
  let mine: string[] = [];
  try {
    mine = known(JSON.parse(storage?.getItem(KEY) ?? "[]"));
  } catch {}
  function save() {
    try {
      if (mine.length) storage?.setItem(KEY, JSON.stringify(mine));
      else storage?.removeItem(KEY);
    } catch {}
  }
  let shared: string[] | null = null;
  let showing: "mine" | "shared" = "mine";
  const cur = () => (showing === "shared" ? (shared ?? []) : mine);
  const has = (id: string) => cur().includes(id);

  page.classList.add("ma-js");
  Array.from(page.querySelectorAll<HTMLElement>(".search, .filters, .tog")).forEach(function (el) {
    el.hidden = false;
  });

  // On wide screens the guide filters sit in the left rail, under the tabs; below 1000 px they stay above the guides.
  const rail = page.querySelector(".help-rail"),
    filters = requireElement(page, ".filters");
  if (rail && window.matchMedia) {
    const fHome = filters.parentNode,
      fNext = filters.nextSibling,
      wide = window.matchMedia("(min-width: 1000px)");
    const placeFilters = function () {
      if (wide.matches) rail.appendChild(filters);
      else fHome?.insertBefore(filters, fNext);
    };
    placeFilters();
    if (wide.addEventListener) wide.addEventListener("change", placeFilters);
  }

  // Tabs
  const nav = requireElement(page, ".tabs"),
    tabs = [$("t-help"), $("t-guides")],
    panels = [$("start-here"), $("guides")];
  nav.setAttribute("role", "tablist");
  nav.removeAttribute("aria-label");
  tabs.forEach(function (t, i) {
    t.setAttribute("role", "tab");
    t.setAttribute("aria-controls", panels[i].id);
    panels[i].setAttribute("role", "tabpanel");
  });
  let active: Tab = "help";
  function tab(name: Tab, focus = false) {
    active = name;
    tabs.forEach(function (t, i) {
      const on = (i === 0) === (name === "help");
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tabs[name === "help" ? 0 : 1].focus();
  }
  function address(h: string) {
    const want = h || window.location.pathname + window.location.search;
    try {
      window.history.replaceState(window.history.state, "", want);
    } catch {}
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function (ev) {
      ev.preventDefault();
      tab(i === 0 ? "help" : "guides");
      address(i === 0 ? "" : guidesHash(gfHash()));
      toTop();
    });
    t.addEventListener("keydown", function (ev) {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "Home" && ev.key !== "End")
        return;
      ev.preventDefault();
      const next = ev.key === "Home" ? 0 : ev.key === "End" ? 1 : 1 - i;
      tabs[next].click();
      tabs[next].focus();
    });
  });

  // Cards
  function togHtml(a: App) {
    const on = has(a.id);
    return (
      '<button type="button" class="tog" data-t="' +
      a.id +
      '" aria-pressed="' +
      on +
      '" aria-label="Add ' +
      esc(a.n) +
      ' to my apps">' +
      (on ? "✓" : "+") +
      "</button>"
    );
  }
  function card(a: App, full: boolean, nameId?: string) {
    const chans = full ? a.chans : a.chans.slice(0, 1);
    const acts = chans.map(function (c, k) {
      return "<a" + (k === 0 ? ' class="p"' : "") + ' href="' + esc(c.u) + '">' + esc(c.t) + "</a>";
    });
    if (a.guides)
      acts.push(
        '<button type="button" data-g="' +
          a.id +
          '">' +
          a.guides +
          " guide" +
          (a.guides > 1 ? "s" : "") +
          "</button>",
      );
    if (a.web)
      acts.push("<a" + (chans.length ? "" : ' class="p"') + ' href="' + esc(a.web) + '">Website</a>');
    return (
      '<div class="card' +
      (full ? " full" : "") +
      '" data-id="' +
      a.id +
      '"><div class="head"><span class="tile s-' +
      a.st +
      '" aria-hidden="true">' +
      esc(a.ini) +
      "</span>" +
      '<div class="ct"><b' +
      (nameId ? ' id="' + nameId + '"' : "") +
      ">" +
      esc(a.n) +
      "</b><small>" +
      esc(a.pl) +
      "</small></div>" +
      togHtml(a) +
      "</div>" +
      '<div class="acts">' +
      acts.join("") +
      "</div></div>"
    );
  }

  const q = $("q", HTMLInputElement),
    results = $("results"),
    boxes = $("where-to-ask"),
    nomatch = $("nomatch");
  function renderMine() {
    const list = cur(),
      searching = !!q.value.trim();
    const differs = shared && shared.join() !== mine.join();
    $("shared").hidden = !differs;
    $("keep").hidden = showing !== "shared";
    $("flip").textContent = showing === "shared" ? "Show mine" : "Show shared";
    $("my-stack").hidden = !list.length || searching;
    $("mine-h").textContent = "Based on your setup";
    $("mine-grid").innerHTML = list
      .map(function (id) {
        return card(apps[id], true);
      })
      .join("");
    $("saved").hidden = $("clear").hidden = showing === "shared";
    if (!list.length && !popEl.hidden) pop(false);
  }
  function renderSearch() {
    const text = q.value.trim();
    boxes.hidden = !!text;
    results.hidden = !text;
    if (!text) {
      results.innerHTML = "";
      nomatch.hidden = true;
      return;
    }
    let html = "",
      hits = 0;
    STEPS.forEach(function (s) {
      const its = order
        .filter(function (id) {
          return apps[id].st === s[0];
        })
        .map(function (id) {
          return [fuzzy(text, apps[id].n + " " + id), apps[id]] as const;
        })
        .filter(function (x) {
          return x[0] > 0;
        })
        .sort(function (x, y) {
          return y[0] - x[0];
        });
      if (!its.length) return;
      hits += its.length;
      html +=
        '<h2 class="rh"><span class="dot s-' +
        s[0] +
        '" aria-hidden="true"></span>' +
        s[1] +
        '</h2><div class="grid">' +
        its
          .map(function (x) {
            return card(x[1], false);
          })
          .join("") +
        "</div>";
    });
    results.innerHTML = html;
    nomatch.hidden = hits > 0;
  }
  function syncToggles() {
    Array.from(document.querySelectorAll<HTMLElement>("[data-t]")).forEach(function (b) {
      const on = has(b.dataset.t ?? "");
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = on ? "✓" : "+";
      const row = b.closest(".row");
      if (row) row.classList.toggle("on", on);
    });
  }
  function render() {
    renderMine();
    renderSearch();
    syncToggles();
    renderGuides();
    fades();
  }

  let tt: number | undefined;
  function toast(t: string) {
    const e = $("toast");
    e.textContent = t;
    e.classList.add("on");
    clearTimeout(tt);
    tt = setTimeout(function () {
      e.classList.remove("on");
    }, 1600);
  }

  // The full card: a bottom sheet on a phone, a dialog on a computer. Esc, × and a tap outside close it.
  const sheet = $("sheet", HTMLDialogElement);
  let opener: HTMLElement | null = null;
  function openCard(id: string, from: HTMLElement | null) {
    if (!apps[id]) return;
    opener = from || null;
    $("sheet-body").innerHTML = card(apps[id], true, "sheet-name");
    if (typeof sheet.showModal === "function") {
      if (!sheet.open) sheet.showModal();
    } else sheet.setAttribute("open", "");
    $("sheet-x").focus();
  }
  function closeCard() {
    if (sheet.open) {
      if (typeof sheet.close === "function") sheet.close();
      else {
        sheet.removeAttribute("open");
        afterClose();
      }
    }
  }
  function afterClose() {
    if (opener && document.body.contains(opener)) opener.focus();
    opener = null;
  }
  sheet.addEventListener("close", afterClose);

  // Share link: copies the #stack= link and shows it in a popover at the button. "Share" beside it opens the
  // phone's own share sheet, only where the browser has one.
  const shareBtn = $("share"),
    popEl = $("share-pop"),
    shareUrlEl = $("share-url", HTMLInputElement);
  function shareUrl() {
    return window.location.origin + window.location.pathname + "#stack=" + cur().join(",");
  }
  function pop(on: boolean, copied = false) {
    popEl.hidden = !on;
    shareBtn.setAttribute("aria-expanded", on ? "true" : "false");
    if (!on) return;
    const msg = $("share-msg");
    msg.textContent = "";
    setTimeout(function () {
      msg.innerHTML =
        "<b>" +
        (copied ? "Link copied." : "Copy this link.") +
        "</b> Anyone with it sees these apps and where to get help.";
    }, 30);
    shareUrlEl.scrollLeft = 0;
    if (!copied) shareUrlEl.focus();
  }
  function copyLink() {
    const url = shareUrl();
    shareUrlEl.value = url;
    const fallback = function () {
      popEl.hidden = false;
      shareUrlEl.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      pop(true, ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(url).then(function () {
        pop(true, true);
      }, fallback);
    else fallback();
  }
  shareBtn.addEventListener("click", function () {
    if (popEl.hidden) copyLink();
    else pop(false);
  });
  shareUrlEl.addEventListener("focus", function () {
    shareUrlEl.select();
  });
  shareUrlEl.addEventListener("mouseup", function (e) {
    e.preventDefault();
  });
  $("nshare").hidden = typeof navigator.share !== "function";
  $("nshare").addEventListener("click", function () {
    try {
      navigator.share({ title: "IRL apps", url: shareUrl() }).catch(function () {});
    } catch {}
  });
  document.addEventListener("click", function (e) {
    if (!popEl.hidden && e.target instanceof Element && !e.target.closest(".share-wrap")) pop(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !popEl.hidden) {
      pop(false);
      shareBtn.focus();
    }
  });

  $("clear").addEventListener("click", function () {
    mine = [];
    save();
    render();
    toast("Cleared");
    q.focus();
  });
  $("keep").addEventListener("click", function () {
    mine = mine.concat(
      (shared ?? []).filter(function (id) {
        return mine.indexOf(id) === -1;
      }),
    );
    save();
    showing = "mine";
    shared = null;
    address("");
    render();
    toast("Saved as my apps");
    $("mine-h").focus();
  });
  $("flip").addEventListener("click", function () {
    showing = showing === "shared" ? "mine" : "shared";
    render();
  });
  q.addEventListener("input", function () {
    renderMine();
    renderSearch();
    syncToggles();
    fades();
  });

  page.addEventListener("click", function (e) {
    if (!(e.target instanceof Element)) return;
    const t = e.target.closest<HTMLElement>("[data-t]");
    if (t) {
      const id = t.dataset.t;
      if (!id) return;
      const inResults = !!t.closest("#results"),
        inGrid = t.closest("#mine-grid"),
        cards = inGrid ? Array.from(inGrid.children) : [],
        at = inGrid ? cards.findIndex((card) => card === t.closest(".card")) : -1;
      if (showing === "shared") showing = "mine";
      mine =
        mine.indexOf(id) !== -1
          ? mine.filter(function (x) {
              return x !== id;
            })
          : mine.concat([id]);
      save();
      render();
      toast(mine.indexOf(id) !== -1 ? "Added" : "Removed");
      if (inGrid) {
        // The card is gone or redrawn: keep the focus on the same place in My apps.
        const left = $("mine-grid").querySelectorAll<HTMLButtonElement>(".card .tog");
        if (!$("my-stack").hidden && left.length) left[Math.min(at, left.length - 1)].focus();
        else q.focus();
      } else if (inResults) {
        const again = results.querySelector<HTMLButtonElement>('[data-t="' + id + '"]');
        if (again) again.focus();
      }
      return;
    }
    const g = e.target.closest("[data-g]");
    if (g) {
      e.preventDefault();
      closeCard();
      gf = { src: "", st: "", k: "", app: g.getAttribute("data-g") ?? "", mine: false };
      $("gq", HTMLInputElement).value = "";
      tab("guides", true);
      renderGuides();
      address(guidesHash(gfHash()));
      toTop();
      return;
    }
    const o = e.target.closest<HTMLElement>("[data-open]");
    if (o) {
      openCard(o.dataset.open ?? "", o);
      return;
    }
    if (e.target.closest("#sheet-x")) {
      closeCard();
      return;
    }
    if (e.target === sheet) {
      const box = sheet.getBoundingClientRect();
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)
        closeCard();
    }
  });

  // Guides
  const guides = Array.from(page.querySelectorAll<HTMLElement>(".gi")).map(function (li) {
    return {
      el: li,
      own: li.hasAttribute("data-own"),
      st: (li.dataset.st ?? "").split(" ").filter(Boolean),
      k: li.getAttribute("data-k"),
      c: (li.dataset.c ?? "").split(" ").filter(Boolean),
      q: li.dataset.q ?? "",
    };
  });
  const gq = $("gq", HTMLInputElement),
    sel = $("f-prod", HTMLSelectElement);
  let gf = { src: "", st: "", k: "", app: "", mine: true };
  const gfHash = function () {
    return { src: gf.src, st: gf.st, k: gf.k, app: gf.app, q: gq.value.trim() };
  };
  const covered = Array.from(sel.options, (option) => option.value).filter(Boolean);
  function chip(attr: string, key: string, label: string, pre: string) {
    return (
      '<button type="button" class="chip" ' +
      attr +
      '="' +
      key +
      '" aria-pressed="false">' +
      (pre || "") +
      label +
      ' <span class="sn"></span></button>'
    );
  }
  const BOOK = '<svg class="hi" aria-hidden="true"><use href="#hi-ours"/></svg>';
  $("f-src").innerHTML = SRC.map(function (s) {
    return chip("data-fsrc", s[0], s[1], s[0] === "own" ? BOOK : "");
  }).join("");
  $("f-st").innerHTML = STEPS.map(function (s) {
    return chip("data-fs", s[0], s[1], '<span class="dot s-' + s[0] + '" aria-hidden="true"></span>');
  }).join("");
  $("f-k").innerHTML = KINDS.map(function (k) {
    return chip(
      "data-fk",
      k[0],
      k[1],
      '<svg class="hi" aria-hidden="true"><use href="#hi-' +
        (k[0] === "video" ? "video" : "article") +
        '"/></svg>',
    );
  }).join("");
  $("f-app").insertAdjacentHTML(
    "afterbegin",
    '<button type="button" class="chip" data-fm="1" aria-pressed="false"><span class="fm-l">My apps</span> <span class="sn"></span></button>',
  );

  type Guide = (typeof guides)[number];
  type GuideFilterKey = "src" | "st" | "k" | "app" | "mine";
  function gmatch(g: Guide, skip?: GuideFilterKey) {
    const ids = cur(),
      text = gq.value.trim();
    if (skip !== "st" && gf.st && g.st.indexOf(gf.st) === -1) return false;
    if (skip !== "src" && gf.src && (gf.src === "own") !== g.own) return false;
    if (skip !== "k" && gf.k && g.k !== gf.k) return false;
    if (skip !== "app" && gf.app && g.c.indexOf(gf.app) === -1) return false;
    if (
      skip !== "mine" &&
      gf.mine &&
      ids.length &&
      !g.own &&
      !g.c.some(function (c) {
        return ids.indexOf(c) !== -1;
      })
    )
      return false;
    if (text && !fuzzy(text, g.q)) return false;
    return true;
  }
  function cnt(test: (guide: Guide) => boolean, skip: GuideFilterKey) {
    return guides.filter(function (g) {
      return gmatch(g, skip) && test(g);
    }).length;
  }
  function setChip(b: HTMLElement, n: number, on: boolean, show: boolean) {
    requireElement(b, ".sn").textContent = String(n);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.hidden = !show;
  }
  const renderGuides = () => {
    const list = cur();
    Array.from(page.querySelectorAll<HTMLButtonElement>("[data-fsrc]")).forEach(function (b) {
      const k = b.getAttribute("data-fsrc") ?? "";
      setChip(
        b,
        cnt(function (g) {
          return (k === "own") === g.own;
        }, "src"),
        gf.src === k,
        true,
      );
    });
    Array.from(page.querySelectorAll<HTMLButtonElement>("[data-fs]")).forEach(function (b) {
      const k = b.getAttribute("data-fs") ?? "",
        n = cnt(function (g) {
          return g.st.indexOf(k) !== -1;
        }, "st");
      setChip(b, n, gf.st === k, n > 0 || gf.st === k);
    });
    Array.from(page.querySelectorAll<HTMLButtonElement>("[data-fk]")).forEach(function (b) {
      const k = b.getAttribute("data-fk") ?? "",
        n = cnt(function (g) {
          return g.k === k;
        }, "k");
      setChip(b, n, gf.k === k, n > 0 || gf.k === k);
    });
    const fm = requireElement(page, "[data-fm]");
    requireElement(fm, ".fm-l").textContent = showing === "shared" ? "Shared apps" : "My apps";
    setChip(
      fm,
      cnt(function (g) {
        return g.c.some(function (c) {
          return list.indexOf(c) !== -1;
        });
      }, "mine"),
      gf.mine && list.length > 0,
      list.length > 0,
    );
    let opts = '<option value="">Any app</option>';
    covered.forEach(function (c) {
      const n = cnt(function (g) {
        return g.c.indexOf(c) !== -1;
      }, "app");
      if (n || gf.app === c)
        opts +=
          '<option value="' +
          c +
          '"' +
          (gf.app === c ? " selected" : "") +
          ">" +
          esc(apps[c] ? apps[c].n : c) +
          " (" +
          n +
          ")</option>";
    });
    sel.innerHTML = opts;
    sel.value = gf.app;
    sel.classList.toggle("on", !!gf.app);
    let shown = 0;
    guides.forEach(function (g) {
      const ok = gmatch(g);
      g.el.hidden = !ok;
      if (ok) shown++;
    });
    ["g-own", "g-other"].forEach(function (id) {
      const h = $(id),
        ul = h.nextElementSibling;
      if (!(ul instanceof HTMLElement)) return;
      h.hidden = ul.hidden = !ul.querySelector(".gi:not([hidden])");
    });
    const filtered = !!(
      gf.src ||
      gf.st ||
      gf.k ||
      gf.app ||
      gq.value.trim() ||
      (gf.mine && list.length)
    );
    $("gcount").textContent = countText(shown, guides.length);
    $("greset").hidden = !filtered;
    $("gnone").hidden = shown > 0;
  };
  function guidesChanged() {
    renderGuides();
    if (active === "guides") address(guidesHash(gfHash()));
  }
  filters.addEventListener("click", function (e) {
    const b = e.target instanceof Element ? e.target.closest("button") : null;
    if (!b) return;
    const pairs = [
      ["data-fsrc", "src"],
      ["data-fs", "st"],
      ["data-fk", "k"],
    ] as const;
    for (const [attr, key] of pairs) {
      const value = b.getAttribute(attr);
      if (value === null) continue;
      gf[key] = gf[key] === value ? "" : value;
      guidesChanged();
      return;
    }
    if (b.hasAttribute("data-fm")) {
      gf.mine = !gf.mine;
      guidesChanged();
    }
  });
  sel.addEventListener("change", function () {
    gf.app = sel.value;
    guidesChanged();
  });
  gq.addEventListener("input", guidesChanged);
  $("greset").addEventListener("click", function () {
    gf = { src: "", st: "", k: "", app: "", mine: false };
    gq.value = "";
    guidesChanged();
    gq.focus();
  });

  // A part box fades at the bottom while more rows follow.
  const fades = () => {
    Array.from(page.querySelectorAll(".part-box .rows")).forEach(function (r) {
      r.classList.toggle("more", r.scrollTop + r.clientHeight < r.scrollHeight - 4);
    });
  };
  page.addEventListener(
    "scroll",
    function (e) {
      if (e.target instanceof Element && e.target.classList.contains("rows")) fades();
    },
    true,
  );
  window.addEventListener("resize", fades);

  function land(hash: string, first: boolean) {
    const h = parseHash(hash);
    if (h.stack) {
      shared = known(h.stack);
      showing = shared.length && shared.join() !== mine.join() ? "shared" : "mine";
      if (!shared.length) shared = null;
    }
    const f = h.f;
    if (f) {
      gf = {
        src: f.src,
        st: f.st,
        k: KINDS.some((k) => k[0] === f.k) ? f.k : "",
        app: covered.includes(f.app) ? f.app : "",
        mine: !f.app,
      };
      gq.value = f.q;
    }
    const target = h.row ? document.getElementById(h.row) : null;
    const tabName = h.tab || (target && panels[1].contains(target) ? "guides" : "help");
    if (h.open && !apps[h.open]) {
      window.location.replace("links#" + h.open);
      return;
    }
    tab(tabName);
    render();
    if (target && target !== panels[0]) {
      if (target.classList.contains("row")) {
        const box = target.parentElement;
        if (box) box.scrollTop = target.offsetTop - box.offsetTop - 8;
        fades();
        target.classList.add("hit");
        setTimeout(function () {
          target.classList.remove("hit");
        }, 2400);
      }
      target.scrollIntoView({ block: "start", behavior: "instant" });
    } else if (!first || h.tab) {
      toTop();
      // The browser jumps to the old anchor once the page has loaded; the tabs stay in view instead.
      if (first && document.readyState !== "complete")
        window.addEventListener(
          "load",
          function () {
            window.requestAnimationFrame(function () {
              toTop();
            });
          },
          { once: true },
        );
    }
    if (h.open) openCard(h.open, null);
  }
  window.addEventListener("hashchange", function () {
    land(window.location.hash, false);
  });
  land(window.location.hash, true);
}

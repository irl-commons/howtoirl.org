export interface GuideFilters {
  src: string;
  st: string;
  k: string;
  app: string;
  q: string;
}

export type Tab = "help" | "guides";

interface HelpAddress {
  tab: Tab | "";
  stack: string[] | null;
  f: GuideFilters | null;
  open: string;
  row: string;
}


const OLD_PART: Record<string, string> = {
  camera: "sender",
  sender: "sender",
  connections: "connections",
  receiver: "receiver",
  platform: "receiver",
  obs: "tools",
  tools: "tools",
};

const HELP_IDS = new Set(["start-here", "where-to-ask", "my-stack", "listed"]);

// Typo-tolerant matching, word by word: skipped letters, one wrong, missing, extra or swapped letter, and names
// typed without their spaces or dots ("irlpro", "streamerbot").
function inOrder(q: string, w: string) {
  let j = 0,
    gaps = 0,
    last = -1;
  for (let i = 0; i < q.length; i++) {
    const p = w.indexOf(q[i], j);
    if (p < 0) return 0;
    if (last >= 0) gaps += p - last - 1;
    last = p;
    j = p + 1;
  }
  return gaps <= q.length ? 100 - gaps * 4 : 0;
}
function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++e > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
      i += 2;
      j += 2;
    } else {
      i++;
      j++;
    }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}
export function fuzzy(q: string, s: string): number {
  q = String(q || "")
    .toLowerCase()
    .trim();
  s = String(s || "").toLowerCase();
  if (!q) return 1;
  const k = s.indexOf(q);
  if (k >= 0) return 200 - k;
  const sq = q.replace(/[^a-z0-9]/g, ""),
    ss = s.replace(/[^a-z0-9]/g, "");
  if (sq && ss.indexOf(sq) !== -1) return 150;
  // Several words: each one has to match on its own ("obs studo").
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words.reduce(function (low, w) {
      return Math.min(low, fuzzy(w, s));
    }, Infinity);
  }
  let best = 0;
  s.split(/[^a-z0-9+]+/).forEach(function (w) {
    if (!w) return;
    const sc = Math.max(
      inOrder(q, w),
      (q.length > 3 && oneEdit(q, w.slice(0, q.length + 1))) || oneEdit(q, w) ? 90 : 0,
    );
    if (sc > best) best = sc;
  });
  return best;
}

// What an address asks for. tab: "help" or "guides"; stack: the apps of a shared link; f: guide filters;
// open: an app card to open; row: an element to scroll to.
export function parseHash(hash: string): HelpAddress {
  const raw = String(hash || "").replace(/^#/, "");
  const out: HelpAddress = { tab: "", stack: null, f: null, open: "", row: "" };
  if (!raw) return out;
  const stack = /(?:^|[?&])stack=([a-z0-9,-]*)/.exec(raw);
  if (stack) {
    out.tab = "help";
    out.stack = stack[1].split(",").filter(Boolean);
    return out;
  }
  const ask = /^ask-([a-z0-9-]+)$/.exec(raw);
  if (ask) {
    out.tab = "help";
    out.open = ask[1];
    return out;
  }
  const app = /^app-([a-z0-9-]+)$/.exec(raw);
  if (app) {
    out.tab = "help";
    out.row = raw;
    return out;
  }
  if (HELP_IDS.has(raw)) {
    out.tab = "help";
    out.row = raw === "start-here" || raw === "my-stack" || raw === "listed" ? "" : raw;
    return out;
  }
  const f = { src: "", st: "", k: "", app: "", q: "" };
  const one = /^(guides-|kind-|for-)([a-z0-9-]+)$/.exec(raw);
  if (one) {
    if (one[1] === "guides-") f.st = Object.hasOwn(OLD_PART, one[2]) ? OLD_PART[one[2]] : "";
    else if (one[1] === "kind-") f.k = one[2];
    else f.app = one[2];
    out.tab = "guides";
    out.f = f;
    return out;
  }
  if (raw === "guides") {
    out.tab = "guides";
    out.f = f;
    return out;
  }
  const query =
    raw.indexOf("?") !== -1 ? raw.slice(raw.indexOf("?") + 1) : raw.indexOf("=") !== -1 ? raw : "";
  if (query) {
    query.split("&").forEach(function (pair) {
      const i = pair.indexOf("=");
      if (i < 1) return;
      let key = pair.slice(0, i),
        v = pair.slice(i + 1);
      try {
        v = decodeURIComponent(v.replace(/\+/g, " "));
      } catch {
        return;
      }
      if (key === "part") f.st = Object.hasOwn(OLD_PART, v) ? OLD_PART[v] : "";
      else if ((key === "kind" || key === "for") && /^[a-z0-9-]+$/.test(v))
        f[key === "kind" ? "k" : "app"] = v;
      else if (key === "from" && (v === "own" || v === "other")) f.src = v;
      else if (key === "q") f.q = v.slice(0, 80);
    });
    out.tab = "guides";
    out.f = f;
    return out;
  }
  if (/^[a-z0-9-]+$/.test(raw)) out.row = raw;
  return out;
}

// The address for a set of guide filters: "#guides", one filter as its own anchor, or "#guides?…".
export function guidesHash(f: GuideFilters) {
  const set = [];
  if (f.src) set.push(["from", f.src, ""]);
  if (f.st) set.push(["part", f.st, "guides-"]);
  if (f.k) set.push(["kind", f.k, "kind-"]);
  if (f.app) set.push(["for", f.app, "for-"]);
  if (!f.q && set.length === 0) return "#guides";
  if (!f.q && set.length === 1 && set[0][2]) return "#" + set[0][2] + set[0][1];
  const parts = set.map(function (x) {
    return x[0] + "=" + x[1];
  });
  if (f.q) parts.push("q=" + encodeURIComponent(f.q));
  return "#guides?" + parts.join("&");
}

export function countText(shown: number, total: number) {
  return shown === total ? "All " + total + " guides" : shown + " of " + total + " guides";
}

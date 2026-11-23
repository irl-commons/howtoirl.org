// A moved page's data-moved names the page file it moved to; pages are served without ".html", the home page at "./".
export function movedUrl(target: string | null, hash: string) {
  if (!target || !/^[a-z0-9-]+\.html$/.test(target)) return null;
  const page = target.replace(/\.html$/, "");
  return (page === "index" ? "./" : page) + (/^#[A-Za-z0-9_-]+$/.test(hash || "") ? hash : "");
}

// The phone platform an answer's iPhone/Android switch starts on; iPhone when the visitor's isn't offered or known.
export function pickPlatform(ua: string, offered: (string | null)[]) {
  const mine = /Android/i.test(ua || "") ? "android" : "ios";
  return offered.indexOf(mine) >= 0 ? mine : offered[0];
}

export function hashId(hash: string | null) {
  let raw = String(hash || "").replace(/^#/, "");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return "";
  }
  return /^[A-Za-z][A-Za-z0-9_.:-]*$/.test(raw) ? raw : "";
}

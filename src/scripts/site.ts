import { movedUrl } from "./addresses.ts";
import { initTheme, readTheme, storageOrNull } from "./theme.ts";
import { initBeta, initFold, initNav, initPermalinks, landTarget } from "./page-controls.ts";
import { initClear, initWords } from "./search.ts";
import { initBack, initChecklists, initCopy, initMoved, initPlatforms } from "./answers.ts";
import { initCalc } from "./data-calculator.ts";
import { initHelp } from "./help.ts";

const root = document.documentElement;
const movedTo = movedUrl(root.getAttribute("data-moved"), window.location.hash);
if (movedTo) {
  window.location.replace(movedTo);
} else {
  root.classList.add("fold-js");
  const theme = readTheme(storageOrNull());
  if (theme !== "auto") root.setAttribute("data-theme", theme);
  try {
    storageOrNull()?.removeItem("osb.stack.v1");
  } catch {}
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}

function start() {
  if (!initMoved()) {
    initFold();
    initCopy();
    initChecklists();
    initBack();
    initPlatforms();
    initTheme();
    initNav();
    initBeta();
    initWords();
    initClear();
    initPermalinks();
    initCalc();
    landTarget();
  }
  initHelp();
}

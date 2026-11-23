import type model from "../../shared/data-use.json";
import { requireElement, requireId } from "./dom.ts";

// The build supplies this model in #calc's data-model attribute.
type DataModel = typeof model;
const MODES = ["single", "bonded", "redundant"] as const;
type Mode = (typeof MODES)[number];

function isMode(value: string): value is Mode {
  return MODES.some((mode) => mode === value);
}

export function dataUse(
  m: DataModel,
  hours: number,
  videoMbps: number,
  audioKbps: number,
  mode: Mode,
  links: number,
  lossPct: number,
  recordMbps?: number | null,
) {
  if (!isMode(mode)) throw new Error("unknown mode " + mode);
  const secs = hours * 3600;
  const n = mode === "single" ? 1 : Math.floor(links);
  const copies = mode === "redundant" ? n : 1;
  const p = lossPct / 100;
  const ts = m.ts,
    pk = m.packet,
    rs = m.resend,
    ct = m.control,
    sl = m.srtla;
  const media = videoMbps * 1e6 + audioKbps * 1e3;
  const stream = (media * ts.packet_bytes) / (ts.packet_bytes - ts.header_bytes) + ts.fixed_kbps * 1e3;
  const ratio =
    (pk.payload_bytes + pk.srt_header_bytes + pk.udp_header_bytes + pk.ip_header_bytes) /
    pk.payload_bytes;
  let resend, nakShare;
  if (mode === "redundant") {
    const pLost = Math.pow(p, n); // a packet is resent only when every copy is lost
    resend = (rs.factor * pLost) / (1 - pLost);
    nakShare = pLost;
  } else {
    resend = (rs.factor * p) / (1 - p) + (mode === "bonded" ? rs.bonded_reorder : 0);
    nakShare = p + (mode === "bonded" ? rs.bonded_reorder : 0);
  }
  const sent = stream * ratio * (1 + resend);
  const acksUp = ct.up_kbps_per_link * 1e3 * n;
  const acksDown =
    ct.ack_down_kbps_per_link * 1e3 * n + ct.nak_down_share_per_loss * nakShare * stream * copies;
  let srtlaAcks = 0,
    keepalives = 0;
  if (mode === "bonded") {
    const packets = (stream * (1 + resend)) / (pk.payload_bytes * 8);
    srtlaAcks = (packets / sl.ack_every_packets) * sl.ack_bytes * 8;
    keepalives = 2 * n * sl.keepalive_kbps * 1e3;
  }
  const parts = {
    media: media * copies,
    packing: (stream - media) * copies,
    headers: stream * (ratio - 1) * copies,
    resends: stream * ratio * resend * copies,
    control: acksUp + acksDown + srtlaAcks,
    keepalives: keepalives,
  };
  const total =
    parts.media + parts.packing + parts.headers + parts.resends + parts.control + parts.keepalives;
  const toBytes = function (bps: number) {
    return (bps * secs) / 8;
  };
  const out = Object.fromEntries(Object.entries(parts).map(([key, bps]) => [key, toBytes(bps)]));
  return {
    total: toBytes(total),
    up: toBytes(sent * copies + acksUp + keepalives / 2),
    down: toBytes(acksDown + srtlaAcks + keepalives / 2),
    per_link: toBytes(total / n),
    links: n,
    parts: out,
    overhead_pct: (total / media / copies - 1) * 100,
    recording:
      recordMbps === null || recordMbps === undefined
        ? null
        : toBytes(recordMbps * 1e6 + audioKbps * 1e3 + m.mp4.fixed_kbps * 1e3),
  };
}

function group(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function fmtSize(b: number, m: DataModel) {
  const halfUp = function (x: number) {
    return Math.floor(x + 0.5);
  };
  const gb = b / m.units.gb_bytes;
  if (gb < 0.995) {
    if (!(b > 0)) return "0 MB";
    return group(Math.max(halfUp(b / m.units.mb_bytes / 10) * 10, 10)) + " MB";
  }
  if (gb < 99.95) {
    const tenths = halfUp(gb * 10);
    return Math.floor(tenths / 10) + "." + (tenths % 10) + " GB";
  }
  return group(halfUp(gb)) + " GB";
}

export function readNumber(text: string) {
  const t = String(text || "")
    .trim()
    .replace(",", ".");
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? parseFloat(t) : NaN;
}

export function initCalc() {
  const box = document.getElementById("calc");
  if (!box) return;
  const serialized = box.dataset.model;
  if (!serialized) return;
  let m: DataModel;
  try {
    m = JSON.parse(serialized) as DataModel;
  } catch {
    return;
  }
  const el = requireId;
  const input = (id: string) => requireId(id, HTMLInputElement);
  const form = el("calc-form");
  const lim = m.limits;
  const fields = {
    dur: input("calc-dur"),
    unit: requireId("calc-dur-unit", HTMLSelectElement),
    video: input("calc-video"),
    audio: input("calc-audio"),
    links: input("calc-links"),
    loss: input("calc-loss"),
    rec: input("calc-rec"),
    recVideo: input("calc-rec-video"),
  };
  const radios = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="calc-mode"]'));
  const mediaHow = requireElement(el("calc-row-media"), "span");
  const mediaHowText = mediaHow.textContent;
  let last = "";

  function mode(): Mode {
    const value = radios.find((radio) => radio.checked)?.value;
    return value && isMode(value) ? value : "bonded";
  }

  function read() {
    const bad: string[] = [];
    const check = function (input: HTMLInputElement, ok: boolean, msg: string) {
      const fine = ok;
      input.setAttribute("aria-invalid", fine ? "false" : "true");
      if (!fine) bad.push(msg);
    };
    const dur = readNumber(fields.dur.value),
      video = readNumber(fields.video.value),
      audio = readNumber(fields.audio.value);
    let links = readNumber(fields.links.value),
      loss = readNumber(fields.loss.value);
    const hours = fields.unit.value === "min" ? dur / 60 : dur;
    check(
      fields.dur,
      hours > 0 && hours <= lim.hours_max,
      "Enter a stream length up to " + lim.hours_max + " hours.",
    );
    check(
      fields.video,
      video > 0 && video <= lim.video_mbps_max,
      "Enter a video bitrate between 0 and " + lim.video_mbps_max + " Mbit/s.",
    );
    check(
      fields.audio,
      audio >= 0 && audio <= lim.audio_kbps_max,
      "Enter an audio bitrate up to " + lim.audio_kbps_max + " kbit/s (0 for none).",
    );
    const md = mode();
    if (md === "single") {
      fields.links.setAttribute("aria-invalid", "false");
      links = 1;
    } else
      check(
        fields.links,
        links >= lim.links_min && links <= lim.links_max && Math.floor(links) === links,
        "Enter " + lim.links_min + " to " + lim.links_max + " links.",
      );
    check(
      fields.loss,
      loss >= 0 && loss < lim.loss_pct_max,
      "Enter a loss below " + lim.loss_pct_max + " %.",
    );
    let rec: number | null = null;
    if (fields.rec.checked) {
      const rv = fields.recVideo.value.trim() === "" ? video : readNumber(fields.recVideo.value);
      check(
        fields.recVideo,
        rv > 0 && rv <= lim.video_mbps_max,
        "Enter a recording bitrate between 0 and " + lim.video_mbps_max + " Mbit/s, or leave it empty.",
      );
      rec = rv;
    } else {
      fields.recVideo.setAttribute("aria-invalid", "false");
    }
    return bad.length
      ? { error: bad[0] }
      : { hours: hours, video: video, audio: audio, mode: md, links: links, loss: loss, rec: rec };
  }

  function render(announce: boolean) {
    const md = mode();
    fields.links.disabled = md === "single";
    el("calc-rec-row").hidden = !fields.rec.checked;
    const v = read();
    const err = el("calc-error");
    if (v.error !== undefined) {
      err.textContent = v.error;
      err.hidden = false;
      el("calc-out").classList.add("is-stale");
      if (announce) el("calc-status").textContent = v.error;
      return;
    }
    err.hidden = true;
    el("calc-out").classList.remove("is-stale");
    const r = dataUse(m, v.hours, v.video, v.audio, v.mode, v.links, v.loss, v.rec);
    const f = function (b: number) {
      return fmtSize(b, m);
    };
    el("calc-total").textContent = f(r.total);
    el("calc-total-what").textContent = "of mobile data, upload and download together";
    const per = el("calc-per-link");
    if (v.mode === "bonded") {
      per.textContent =
        "Split evenly over " +
        r.links +
        " links: about " +
        f(r.per_link) +
        " each. One link can end up carrying most of it, so size each plan for the whole stream.";
    } else if (v.mode === "redundant") {
      per.textContent =
        "Each of the " +
        r.links +
        " links: about " +
        f(r.per_link) +
        ". Every link carries the whole stream.";
    } else {
      per.textContent = "All of it on one connection.";
    }
    el("calc-dir").textContent = "Upload " + f(r.up) + ", download " + f(r.down) + ". Plans count both.";
    const recOut = el("calc-rec-out");
    recOut.hidden = r.recording === null;
    recOut.textContent =
      r.recording === null
        ? ""
        : "Recording: " +
          f(r.recording) +
          " of storage on the phone or box (MP4). It uses no mobile data.";
    mediaHow.textContent = v.mode === "redundant" ? mediaHowText + ", once for each link" : mediaHowText;
    Object.entries(r.parts).forEach(function ([k, bytes]) {
      el("calc-part-" + k).textContent = f(bytes);
      el("calc-row-" + k).hidden = k === "keepalives" && v.mode !== "bonded";
    });
    el("calc-part-total").textContent = f(r.total);
    const summary = "Data used: " + f(r.total) + ". " + per.textContent;
    if (announce && summary !== last) {
      el("calc-status").textContent = summary;
      last = summary;
    }
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    render(true);
  });
  form.addEventListener("input", function () {
    render(false);
  });
  form.addEventListener("change", function () {
    render(true);
  });
  box.hidden = false;
  const nojs = document.getElementById("calc-nojs");
  if (nojs) nojs.hidden = true;
  render(false);
}

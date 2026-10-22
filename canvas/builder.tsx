import { useState, useEffect, useRef, useGrokTheme } from "grok/canvas";
import type { CSSProperties, ReactNode, ChangeEvent, PointerEvent } from "grok/canvas";

type Style = "Keynote" | "Bold launch" | "Minimal" | "Playful" | "Describe my own";
type Fg = "Phone" | "Laptop" | "Browser window" | "Product shot" | "Logo only";
type Music = "My own song" | "Royalty-free pick";
type Len = 15 | 30 | 45;
type Aspect = "16:9" | "9:16" | "1:1";
type CapStyle = "Bold pop-in" | "Word highlight" | "Lower third";
type Step = "Style" | "Foreground" | "Sound" | "Finish" | "Send";
type PtrKind = "down" | "move" | "up";
type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
type Drag = { from: number; x: number; startX: number; moved: boolean };
type Preset = { name: string; code: string };

const STYLES: [Style, string][] = [
  ["Keynote", "Clean, calm, keynote pacing"],
  ["Bold launch", "Big type, punchy color, fast cuts"],
  ["Minimal", "Quiet stage, the product does the talking"],
  ["Playful", "Bright accents and bouncy motion"],
  ["Describe my own", "Tell the bot the vibe in your words"],
];
const FGS: [Fg, string][] = [
  ["Phone", "Your app inside a phone frame"],
  ["Laptop", "Your product on a laptop screen"],
  ["Browser window", "Your site in a clean browser window"],
  ["Product shot", "A physical product on a soft stage"],
  ["Logo only", "Just your mark and the words"],
];
const MUSICS: [Music, string][] = [
  ["Royalty-free pick", "The bot picks a track to fit the style"],
  ["My own song", "Use a track you have the rights to"],
];
const LENS: Len[] = [15, 30, 45];
const ASPECTS: [Aspect, string][] = [["16:9", "Landscape"], ["9:16", "Vertical"], ["1:1", "Square"]];
const CAPSTYLES: CapStyle[] = ["Bold pop-in", "Word highlight", "Lower third"];
const STEPS: Step[] = ["Style", "Foreground", "Sound", "Finish", "Send"];
// Accent palette: only ever painted inside <canvas>.
const ACCENTS: [string, string][] = [
  ["Blue", "#1d9bf0"], ["Yellow", "#ffd400"], ["Pink", "#f91880"],
  ["Purple", "#7856ff"], ["Orange", "#ff7a00"], ["Green", "#00ba7c"],
];
const CAPTIONS = ["Meet your new favorite tool.", "Plan your week in seconds.", "Everything, in one place.", "Try it free today."];
const BPM = 120;
const BEAT = 60 / BPM;
const MAIL_URL = "https://x.ai/bot/HdN8nshqGbNy_Le0fSi_6";

function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // WCAG: pick whichever ink has the higher contrast ratio on this fill.
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#000000" : "#ffffff";
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pad2 = (n: number) => String(Math.floor(Math.max(0, n))).padStart(2, "0");

// ---------- character drawing (canvas only) ----------
function eyesAndDot(ctx: CanvasRenderingContext2D, X: (v: number) => number, k: number, dot: string, ring: string) {
  ctx.fillStyle = "#101010";
  const eye = (x: number, y: number, rx: number, ry: number) => {
    ctx.beginPath(); ctx.ellipse(X(x), X(y), rx * k, ry * k, (-37 * Math.PI) / 180, 0, Math.PI * 2); ctx.fill();
  };
  eye(22.74, 14.6, 1.8, 4.7);
  eye(30.5, 11.2, 1.55, 4.6);
  ctx.beginPath(); ctx.arc(X(34), X(33), 4.3 * k, 0, Math.PI * 2);
  ctx.fillStyle = dot; ctx.fill();
  ctx.lineWidth = 1.2 * k; ctx.strokeStyle = ring; ctx.stroke();
}

function promoSprite(S: number, ms: number, dot: string, ring: string, edge: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const k = S / 46;
  const X = (v: number) => (v + 2) * k;
  const stops: [number, number, number][] = [[196, 246, 255], [209, 184, 255], [255, 191, 230], [255, 241, 176], [168, 255, 217]];
  const cx = 5 + 0.3 * 32, cy = 4 + 0.25 * 32, per = 0.28 * 32;
  const ph = ms / 1400;
  const img = ctx.createImageData(S, S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const ux = px / k - 2, uy = py / k - 2;
    const dx = ux - 21, dy = uy - 20;
    if (dx * dx + dy * dy > 256) continue;
    const ang = Math.atan2(uy - cy, ux - cx);
    let t = (Math.hypot(ux - cx, uy - cy) + 0.4 * Math.sin(ang * 5 + ph * 2)) / per - ph * 0.5;
    t = ((t % 2) + 2) % 2; if (t > 1) t = 2 - t;
    const s = t * 4, i = Math.min(3, Math.floor(s)), w = s - i;
    const a = stops[i], b = stops[i + 1];
    const o = (py * S + px) * 4;
    img.data[o] = a[0] + (b[0] - a[0]) * w;
    img.data[o + 1] = a[1] + (b[1] - a[1]) * w;
    img.data[o + 2] = a[2] + (b[2] - a[2]) * w;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.beginPath(); ctx.arc(X(21), X(20), 16 * k, 0, Math.PI * 2); ctx.clip();
  const T = ctx.createRadialGradient(X(16.5), X(13.6), 0, X(16.5), X(13.6), 25 * k);
  T.addColorStop(0.45, "rgba(59,42,110,0)");
  T.addColorStop(0.92, "rgba(59,42,110,0.55)");
  T.addColorStop(1, "rgba(59,42,110,0.33)");
  ctx.fillStyle = T; ctx.fillRect(0, 0, S, S);
  const H = ctx.createRadialGradient(X(15.9), X(12.6), 0, X(15.9), X(12.6), 7 * k);
  H.addColorStop(0, "rgba(255,255,255,0.85)");
  H.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = H; ctx.fillRect(0, 0, S, S);
  ctx.restore();
  ctx.strokeStyle = edge; ctx.lineWidth = 1 * k; ctx.beginPath(); ctx.arc(X(21), X(20), 15.5 * k, 0, Math.PI * 2); ctx.stroke();
  eyesAndDot(ctx, X, k, dot, ring);
  return c;
}

function drawMailBall(ctx: CanvasRenderingContext2D, S: number, dot: string, ring: string, edge: string) {
  const k = S / 46;
  const X = (v: number) => (v + 2) * k;
  ctx.save();
  ctx.scale(k, k); ctx.translate(2, 2);
  ctx.beginPath(); ctx.arc(21, 20, 16, 0, Math.PI * 2); ctx.save(); ctx.clip();
  ctx.fillStyle = "#fffaf0"; ctx.fillRect(0, 0, 46, 46);
  const tri = (d: string, deg: number, ox: number, oy: number, col: string) => {
    ctx.save(); ctx.translate(ox, oy); ctx.rotate((deg * Math.PI) / 180); ctx.translate(-ox, -oy);
    ctx.fillStyle = col; ctx.fill(new Path2D(d)); ctx.restore();
  };
  tri("M10 10.8L12.78 15.6L7.22 15.6Z", 15, 10, 14, "#EA4335");
  tri("M11.5 26.2L13.94 30.4L9.06 30.4Z", -20, 11.5, 29, "#34A853");
  tri("M34 24.1L36.09 27.7L31.91 27.7Z", 40, 34, 26.5, "#FBBC05");
  tri("M19 19.3L20.65 22.15L17.35 22.15Z", 25, 19, 21.2, "#EA4335");
  const sq = (d: string, col: string, wdt: number) => {
    ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(new Path2D(d));
  };
  sq("M6 23q2-2 4 0t4 0", "#4285F4", 1.9);
  sq("M15 33q1.5-2 3 0t3 0", "#EA4335", 1.7);
  sq("M20 26.5l2 2.5l2-2.5l2 2.5", "#34A853", 1.7);
  ([[17, 28, 1.5, "#FBBC05"], [28.5, 31.5, 1.3, "#EA4335"], [31, 24.5, 1.25, "#4285F4"], [7.5, 18.5, 1.15, "#34A853"], [24, 34, 1.15, "#FBBC05"], [12, 9.5, 1.05, "#4285F4"]] as [number, number, number, string][])
    .forEach(([x, y, r, col]: [number, number, number, string]) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
  ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(21, 20, 15.6, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  eyesAndDot(ctx, X, k, dot, ring);
}

// ---------- pure scene drawing ----------
type StageP = {
  W: number; H: number; A: string; style: Style; time: number; len: number; sceneLen: number;
  slot: number; scene: number; caps: boolean; capStyle: CapStyle; beat: boolean;
  font: string; sub: string;
};
function drawStage(ctx: CanvasRenderingContext2D, p: StageP) {
  const { W, H, A, time } = p;
  const narrow = W < 480;
  ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, col: string, a: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col + a); g.addColorStop(1, col + "00");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  const M = Math.max(W, H);
  if (p.style === "Keynote") glow(W * 0.5, H * 1.05, M * 0.6, A, "55");
  if (p.style === "Bold launch") {
    ctx.fillStyle = A; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(W * (0.62 + 0.02 * Math.sin(time * 2)), 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * 0.42, H); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (p.style === "Playful") ACCENTS.forEach(([, c]: [string, string], i: number) => {
    glow(W * (0.5 + 0.38 * Math.cos(time * 0.6 + i)), H * (0.5 + 0.36 * Math.sin(time * 0.8 + i * 1.7)), M * 0.22, c, "66");
  });
  if (p.style === "Describe my own") {
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    glow(W * 0.2, H * 0.2, M * 0.5, A, "33");
  }
  ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
  const cols = Math.max(4, Math.round(W / 70)), rows = Math.max(4, Math.round(H / 70));
  for (let i = 1; i < cols; i++) { const x = Math.round((W * i) / cols) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let i = 1; i < rows; i++) { const y = Math.round((H * i) / rows) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  if (p.caps) {
    const words = CAPTIONS[p.scene].split(" ");
    const into = Math.max(0, (time - p.slot * p.sceneLen) * 3);
    let fs = Math.max(17, Math.min(26, W / (narrow ? 15 : 30)));
    if (p.capStyle === "Lower third") {
      fs = Math.max(15, fs * 0.8);
      ctx.font = `700 ${fs}px ${p.font}`;
      const maxW = W * 0.8 - 40;
      let cap = CAPTIONS[p.scene];
      while (ctx.measureText(cap).width > maxW && fs > 13) { fs -= 1; ctx.font = `700 ${fs}px ${p.font}`; }
      while (ctx.measureText(cap).width > maxW && cap.length > 4) cap = cap.slice(0, -2);
      if (cap !== CAPTIONS[p.scene]) cap = cap.trimEnd() + "…";
      const pw = Math.min(W - 32, Math.max(ctx.measureText(cap).width, 80) + 36);
      const ph = fs * 2.5 + 16;
      const slide = clamp(into / 1.5, 0, 1);
      const x = 16 - (1 - slide) * 30, y = H - 44 - ph;
      ctx.globalAlpha = slide;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.beginPath(); ctx.roundRect(x, y, pw, ph, 10); ctx.fill();
      ctx.fillStyle = A; ctx.fillRect(x, y + 8, 4, ph - 16);
      ctx.fillStyle = "#ffffff"; ctx.textBaseline = "alphabetic"; ctx.fillText(cap, x + 18, y + 8 + fs);
      ctx.font = `500 ${Math.round(fs * 0.75)}px ${p.font}`; ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText(p.sub, x + 18, y + 8 + fs * 2.2);
      ctx.globalAlpha = 1;
    } else {
      if (p.capStyle === "Bold pop-in") fs *= 1.1;
      ctx.font = `800 ${fs}px ${p.font}`; ctx.textBaseline = "alphabetic";
      const maxW = W - 48;
      const lines: number[][] = [[]];
      let cw = 0;
      words.forEach((wd: string, i: number) => {
        const ww = ctx.measureText(wd + " ").width;
        if (cw + ww > maxW && lines[lines.length - 1].length) { lines.push([]); cw = 0; }
        lines[lines.length - 1].push(i); cw += ww;
      });
      const lh = fs * 1.3;
      const base = H - 52 - (lines.length - 1) * lh;
      const cur = Math.min(words.length - 1, Math.floor(into));
      lines.forEach((ln: number[], li: number) => {
        const ws = ln.map((i: number) => ctx.measureText(words[i] + " ").width);
        let x = (W - ws.reduce((a: number, c: number) => a + c, 0)) / 2;
        ln.forEach((i: number, k2: number) => {
          const y = base + li * lh;
          const wW = ctx.measureText(words[i]).width;
          if (p.capStyle === "Bold pop-in") {
            const pr = clamp(into - i, 0, 1);
            const sc = pr >= 1 ? 1 : 0.6 + 0.5 * Math.sin((pr * Math.PI) / 2) - 0.1 * pr;
            ctx.save(); ctx.globalAlpha = pr; ctx.translate(x + wW / 2, y - fs * 0.35); ctx.scale(sc, sc);
            ctx.fillStyle = i >= words.length - 2 ? A : "#ffffff";
            ctx.fillText(words[i], -wW / 2, fs * 0.35); ctx.restore();
          } else {
            if (i === cur) {
              ctx.fillStyle = A; ctx.beginPath(); ctx.roundRect(x - 5, y - fs * 0.95, wW + 10, fs * 1.25, 6); ctx.fill();
              ctx.fillStyle = inkFor(A);
            } else ctx.fillStyle = i < cur ? "#ffffff" : "rgba(255,255,255,0.55)";
            ctx.fillText(words[i], x, y);
          }
          x += ws[k2];
        });
      });
    }
  }
  const bp = (time % BEAT) / BEAT;
  if (p.beat && bp < 0.15) { ctx.fillStyle = A; ctx.fillRect(0, H - 3, W, 3); }
}

type TlP = { W: number; H: number; A: string; time: number; len: number; sceneLen: number; slot: number; order: number[]; beat: boolean; drag: Drag | null; font: string };
function tlGeom(W: number) { const L = W < 480 ? 50 : 62; return { L, tw: W - L - 10 }; }
function dragTarget(d: Drag, W: number, len: number, sceneLen: number): number {
  const { L, tw } = tlGeom(W);
  const s = ((d.x - L) / tw) * len;
  return clamp(Math.floor(s / sceneLen), 0, 3);
}
function moveItem(arr: number[], from: number, to: number): number[] {
  const a = arr.slice(); const [it] = a.splice(from, 1); a.splice(to, 0, it); return a;
}
function drawTimeline(ctx: CanvasRenderingContext2D, p: TlP) {
  const { W, H, A, len, time } = p;
  const narrow = W < 480;
  const { L, tw } = tlGeom(W);
  const X = (s: number) => L + (s / len) * tw;
  ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, H);
  ctx.font = `600 11px ${p.font}`; ctx.textBaseline = "middle";
  const lw = ctx.measureText("0:00").width + 8;
  const stepS = [1, 3, 5, 10, 15, 20, 30].find((s: number) => (s / len) * tw >= lw * 1.6) ?? len;
  const endX = X(len);
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (let s = 0; s <= len; s += stepS) {
    const x = Math.round(X(s)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, H); ctx.stroke();
    if (s < len && x + 3 + lw > endX - lw) continue;
    ctx.textAlign = s === len ? "right" : "left";
    ctx.fillText(`0:${pad2(s)}`, s === len ? x - 3 : x + 3, 8);
  }
  if (len % stepS !== 0) { ctx.textAlign = "right"; ctx.fillText(`0:${pad2(len)}`, endX - 3, 8); }
  ctx.textAlign = "left";
  const rowsT: [string, number, number][] = [["Video", 22, 28], ["Audio", 56, 32], ["Beat", 94, 14]];
  rowsT.forEach(([n, y, h]: [string, number, number]) => {
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillText(n, 8, y + h / 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(L, y + h + 2, tw, 1);
  });
  let ord = p.order;
  let tgt = -1;
  if (p.drag && p.drag.moved) { tgt = dragTarget(p.drag, W, len, p.sceneLen); ord = moveItem(p.order, p.drag.from, tgt); }
  const clip = (x0: number, x1: number, sceneIdx: number, on: boolean, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = on ? A : "rgba(255,255,255,0.16)";
    ctx.beginPath(); ctx.roundRect(x0, 22, Math.max(4, x1 - x0), 28, 14); ctx.fill();
    ctx.fillStyle = on ? inkFor(A) : "rgba(255,255,255,0.85)";
    const lab = narrow || x1 - x0 < 70 ? `${sceneIdx + 1}` : `Scene ${sceneIdx + 1}`;
    ctx.fillText(lab, x0 + 10, 36);
    ctx.globalAlpha = 1;
  };
  for (let i = 0; i < 4; i++) {
    const x0 = X(i * p.sceneLen) + 1, x1 = X((i + 1) * p.sceneLen) - 1;
    if (p.drag && p.drag.moved && i === tgt) {
      ctx.strokeStyle = A; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.roundRect(x0, 22, x1 - x0, 28, 14); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    clip(x0, x1, ord[i], !p.drag && i === p.slot, 1);
  }
  if (p.drag && p.drag.moved) {
    const cw = (p.sceneLen / len) * tw - 2;
    const gx = clamp(p.drag.x - cw / 2, L, L + tw - cw);
    clip(gx, gx + cw, p.order[p.drag.from], true, 0.9);
  }
  const bars = Math.max(1, Math.floor(tw / 3));
  for (let i = 0; i < bars; i++) {
    const s = (i / bars) * len;
    const env = 0.35 + 0.65 * Math.abs(Math.sin(s * Math.PI * (BPM / 60))) ** 3;
    const n = Math.sin(i * 12.9898) * Math.sin(i * 0.37);
    const h = Math.max(1, 30 * env * (0.4 + 0.6 * Math.abs(n)));
    ctx.fillStyle = s <= time ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)";
    ctx.fillRect(L + i * 3, 72 - h / 2, 2, h);
  }
  if (p.beat) {
    for (let k = 0; k * BEAT <= len + 1e-6; k++) {
      const x = Math.round(X(k * BEAT));
      const down = k % 4 === 0;
      ctx.fillStyle = A; ctx.globalAlpha = k * BEAT <= time ? 1 : 0.45;
      ctx.fillRect(Math.min(x, L + tw - 2), down ? 94 : 99, down ? 2 : 1, down ? 14 : 8);
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillText("Off", L, 101);
  }
  const px = Math.round(X(time));
  ctx.fillStyle = A; ctx.fillRect(px - 1, 14, 2, H - 14);
  ctx.beginPath(); ctx.arc(px, 14, 5, 0, Math.PI * 2); ctx.fill();
}

// ---------- setup code ----------
type Setup = { si: number; fi: number; ai: number; li: number; mi: number; ci: number; acc: number; flags: number; order: number[] };
function encode(s: Setup): string {
  return `PR-${s.si}${s.fi}${s.ai}${s.li}${s.mi}${s.ci}${s.acc}${s.flags.toString(16).padStart(2, "0")}${s.order.join("")}`;
}
function decode(code: string): Setup | null {
  const m = /^PR-([0-4])([0-4])([0-2])([0-2])([0-1])([0-2])([0-5])([0-9a-f]{2})([0-3]{4})$/i.exec(code.trim());
  if (!m) return null;
  const order = m[9].split("").map((c: string) => Number(c));
  if (new Set(order).size !== 4) return null;
  return { si: +m[1], fi: +m[2], ai: +m[3], li: +m[4], mi: +m[5], ci: +m[6], acc: +m[7], flags: parseInt(m[8], 16), order };
}

// ---------- small canvas components ----------
function Paint({ draw, style, onPtr, label }: { draw: DrawFn; style?: CSSProperties; onPtr?: (kind: PtrKind, x: number, y: number, w: number) => void; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ro = new ResizeObserver((es: ResizeObserverEntry[]) => {
      const r = es[0].contentRect;
      setSize([r.width, r.height]);
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || size[0] < 1 || size[1] < 1) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size[0] * dpr); c.height = Math.round(size[1] * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size[0], size[1]);
    draw(ctx, size[0], size[1]);
  });
  const ev = (kind: PtrKind) => (e: PointerEvent) => {
    if (!onPtr) return;
    if (kind === "move" && e.buttons === 0) return;
    const el = e.currentTarget as HTMLCanvasElement;
    const r = el.getBoundingClientRect();
    if (kind === "down") { try { el.setPointerCapture((e.nativeEvent as unknown as { pointerId: number }).pointerId); } catch { /* ignore */ } }
    onPtr(kind, e.clientX - r.left, e.clientY - r.top, r.width);
  };
  return (
    <canvas ref={ref} aria-label={label} role={label ? "img" : undefined}
      onPointerDown={onPtr ? ev("down") : undefined}
      onPointerMove={onPtr ? ev("move") : undefined}
      onPointerUp={onPtr ? ev("up") : undefined}
      onPointerCancel={onPtr ? ev("up") : undefined}
      style={{ display: "block", width: "100%", height: "100%", cursor: onPtr ? "pointer" : "inherit", touchAction: onPtr ? "pan-y" : "auto", ...style }} />
  );
}

function Fill({ color, text, font, size }: { color: string; text?: string; font?: string; size?: number }) {
  return (
    <Paint style={{ position: "absolute", inset: 0 }} draw={(ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
      if (text) {
        ctx.fillStyle = inkFor(color);
        ctx.font = `700 ${size ?? 15}px ${font ?? "sans-serif"}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, w / 2, h / 2 + 0.5);
      }
    }} />
  );
}

function Mascot({ dot, ring, edge, size }: { dot: string; ring: string; edge: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 132; c.height = 132;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const loop = (ms: number) => {
      ctx.clearRect(0, 0, 132, 132);
      ctx.drawImage(promoSprite(132, ms, dot, ring, edge), 0, 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dot, ring, edge]);
  return <canvas ref={ref} style={{ width: size, height: size, display: "block", flexShrink: 0 }} />;
}

function MailBall({ dot, ring, edge, size }: { dot: string; ring: string; edge: string; size: number }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <Paint draw={(ctx: CanvasRenderingContext2D, w: number) => drawMailBall(ctx, w, dot, ring, edge)} label=".mail character" />
    </div>
  );
}

function Icon({ step, color }: { step: Step; color: string }) {
  const p = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" style={{ flexShrink: 0 }}>
      {step === "Style" && <g {...p}><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.6-.9 1.2-1.8-.5-1.1.2-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></g>}
      {step === "Foreground" && <g {...p}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></g>}
      {step === "Sound" && <g {...p}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></g>}
      {step === "Finish" && <g {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" /><path d="M19 17v4M17 19h4" /></g>}
      {step === "Send" && <g {...p}><path d="M4 12l16-8-6 16-2.5-6.5Z" /><path d="M11.5 13.5L20 4" /></g>}
    </svg>
  );
}

let audioCtx: AudioContext | null = null;
function tick() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 1400; g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.06);
  } catch { /* audio unavailable */ }
}

export default function App() {
  const t = useGrokTheme();
  const dv = t.dataviz;
  const [step, setStep] = useState<Step>("Style");
  const [style, setStyle] = useState<Style>("Keynote");
  const [custom, setCustom] = useState<string>("");
  const [fg, setFg] = useState<Fg>("Browser window");
  const [link, setLink] = useState<string>("");
  const [music, setMusic] = useState<Music>("Royalty-free pick");
  const [len, setLen] = useState<Len>(30);
  const [aspect, setAspect] = useState<Aspect>(() => (typeof window !== "undefined" && window.innerWidth < 600 ? "9:16" : "16:9"));
  const [capStyle, setCapStyle] = useState<CapStyle>("Word highlight");
  const [order, setOrder] = useState<number[]>([0, 1, 2, 3]);
  const [brand, setBrand] = useState<boolean>(true);
  const [caps, setCaps] = useState<boolean>(true);
  const [beat, setBeat] = useState<boolean>(true);
  const [copy, setCopy] = useState<boolean>(false);
  const [remember, setRemember] = useState<boolean>(true);
  const [pack, setPack] = useState<boolean>(false);
  const [sound, setSound] = useState<boolean>(false);
  const [acc, setAcc] = useState<number>(0);
  const [shown, setShown] = useState<boolean>(false);
  const [playing, setPlaying] = useState<boolean>(true);
  const [time, setTime] = useState<number>(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [scrub, setScrub] = useState<boolean>(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [codeIn, setCodeIn] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [w, setW] = useState<number>(1000);
  const [stageW, setStageW] = useState<number>(600);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const A = ACCENTS[acc][1];

  useEffect(() => {
    const ro = new ResizeObserver((es: ResizeObserverEntry[]) => {
      es.forEach((e: ResizeObserverEntry) => {
        if (e.target === rootRef.current) setW(e.contentRect.width);
        if (e.target === stageRef.current) setStageW(e.contentRect.width);
      });
    });
    if (rootRef.current) ro.observe(rootRef.current);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const d = Math.min(0.1, (now - last) / 1000); last = now;
      setTime((v: number) => (v + d) % len);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, len]);

  const phone = w < 600;
  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p: boolean) => !p); }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        setPlaying(false);
        setTime((v: number) => clamp((Math.round(v / BEAT) + dir) * BEAT, 0, len - 0.001));
        if (sound) tick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone, len, sound]);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(""), 2200);
    return () => clearTimeout(id);
  }, [note]);

  const font = t.font.family;
  const line = `1px solid ${t.border.subtle}`;
  const muted = t.text.secondary;
  const label: CSSProperties = { fontFamily: font, fontSize: 13, fontWeight: 700, color: muted };

  // ---- derived
  const sceneLen = len / 4;
  const slot = clamp(Math.floor(time / sceneLen), 0, 3);
  const scene = order[slot];
  const aspectRatio = aspect === "16:9" ? 16 / 9 : aspect === "9:16" ? 9 / 16 : 1;
  const stageH = stageW / aspectRatio;
  const stageNarrow = stageW < 480;
  const host = (() => { try { return link.trim() ? new URL(link.trim().startsWith("http") ? link.trim() : `https://${link.trim()}`).host : ""; } catch { return ""; } })();

  // ---- request text
  const styleName = style === "Describe my own" ? (custom.trim() || "my own style") : style;
  const aspectName = ASPECTS.find(([a]: [Aspect, string]) => a === aspect)?.[1].toLowerCase() ?? "";
  const reqParts: string[] = [
    styleName, `${fg} foreground`, `${aspect} ${aspectName}`, `${len} seconds`,
    music === "My own song" ? "my own song" : "a royalty-free music pick",
    `${ACCENTS[acc][0].toLowerCase()} accent`,
  ];
  if (brand) reqParts.push("brand colors from my logo");
  reqParts.push(caps ? `captions on (${capStyle.toLowerCase()} style)` : "no captions");
  if (beat) reqParts.push("cuts on the beat");
  reqParts.push(`scene order ${order.map((i: number) => i + 1).join("-")}`);
  if (link.trim()) reqParts.push(`product link ${link.trim()}`);
  if (remember) reqParts.push("remember my logo, colors and song for next time");
  if (pack) reqParts.push("offer a launch-day pack after (thumbnail, post still, and ask me before writing an X thread)");
  if (copy) reqParts.push("offer post copy after");
  const last = reqParts.length - 1;
  const request = `Make my .promo: ${reqParts.map((s: string, i: number) => (i === last ? `and ${s}` : s)).join(", ")}. Show me preview stills first.`;
  const renderMin = Math.ceil(len / 15) + 1;
  const renderLine = `${len}s · ${aspect} ${aspectName} · ${styleName}${caps ? ` · ${capStyle.toLowerCase()} captions` : ""} · about ${renderMin} min to render`;

  const setup: Setup = {
    si: STYLES.findIndex(([s]: [Style, string]) => s === style), fi: FGS.findIndex(([f]: [Fg, string]) => f === fg),
    ai: ASPECTS.findIndex(([a]: [Aspect, string]) => a === aspect), li: LENS.indexOf(len),
    mi: MUSICS.findIndex(([m]: [Music, string]) => m === music), ci: CAPSTYLES.indexOf(capStyle), acc,
    flags: [brand, caps, beat, copy, remember, pack].reduce((a: number, b: boolean, i: number) => a | (b ? 1 << i : 0), 0),
    order,
  };
  const code = encode(setup);
  const apply = (s: Setup) => {
    setStyle(STYLES[s.si][0]); setFg(FGS[s.fi][0]); setAspect(ASPECTS[s.ai][0]); setLen(LENS[s.li]);
    setMusic(MUSICS[s.mi][0]); setCapStyle(CAPSTYLES[s.ci]); setAcc(s.acc); setOrder(s.order);
    const f = (i: number) => (s.flags & (1 << i)) !== 0;
    setBrand(f(0)); setCaps(f(1)); setBeat(f(2)); setCopy(f(3)); setRemember(f(4)); setPack(f(5));
    setTime(0);
  };
  const surprise = () => {
    const ord = [1, 2, 3];
    for (let i = 2; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; }
    apply({
      si: Math.floor(Math.random() * 4), fi: Math.floor(Math.random() * 5), ai: Math.floor(Math.random() * 3), li: Math.floor(Math.random() * 3),
      mi: 0, ci: Math.floor(Math.random() * 3), acc: Math.floor(Math.random() * 6),
      flags: 1 | 2 | 4 | 16 | (Math.random() < 0.5 ? 8 : 0) | (Math.random() < 0.3 ? 32 : 0), order: [0, ...ord],
    });
    setPlaying(true);
    setNote("Surprise picks applied");
  };
  const make = () => { setShown(true); setStep("Send"); };
  const copyText = (s: string, msg: string) => {
    try { void navigator.clipboard.writeText(s).then(() => setNote(msg), () => setNote("Select the text to copy it")); }
    catch { setNote("Select the text to copy it"); }
  };

  // ---- timeline pointer
  const onTl = (kind: PtrKind, x: number, y: number, W: number) => {
    const { L, tw } = tlGeom(W);
    const s = clamp(((x - L) / tw) * len, 0, len - 0.001);
    if (kind === "down") {
      if (y >= 18 && y <= 54 && x >= L) {
        setDrag({ from: clamp(Math.floor(s / sceneLen), 0, 3), x, startX: x, moved: false });
      } else if (y >= 88 && beat && x >= L) {
        setTime(clamp(Math.round(s / BEAT) * BEAT, 0, len - 0.001)); setPlaying(false);
        if (sound) tick();
      } else { setScrub(true); setTime(s); }
      return;
    }
    if (kind === "move") {
      if (drag) setDrag({ ...drag, x, moved: drag.moved || Math.abs(x - drag.startX) > 6 });
      else if (scrub) setTime(s);
      return;
    }
    if (drag) {
      if (drag.moved) {
        const to = dragTarget({ ...drag, x }, W, len, sceneLen);
        setOrder(moveItem(order, drag.from, to)); setTime(to * sceneLen + 0.01);
      } else setTime(drag.from * sceneLen + 0.01);
    }
    setDrag(null); setScrub(false);
  };

  // ---- UI atoms
  const accentBtn = (text: string, onClick: () => void): ReactNode => (
    <button onClick={onClick} aria-label={text} style={{
      position: "relative", overflow: "hidden", borderRadius: t.radius.full, border: "none", cursor: "pointer",
      padding: "0 20px", minHeight: 40, background: t.bg.base, fontFamily: font, fontSize: 15, fontWeight: 700,
    }}>
      <Fill color={A} text={text} font={font} />
      <span style={{ opacity: 0 }}>{text}</span>
    </button>
  );
  const quietBtn = (text: string, onClick: () => void, key?: string): ReactNode => (
    <button key={key} onClick={onClick} style={{
      minHeight: 36, padding: "0 16px", borderRadius: t.radius.full, border: `1px solid ${t.border.default}`, background: t.bg.base,
      color: t.text.primary, fontFamily: font, fontSize: 15, fontWeight: 700, cursor: "pointer",
    }}>{text}</button>
  );
  const chip = (text: string, on: boolean, onClick: () => void): ReactNode => (
    <button key={text} onClick={onClick} aria-pressed={on} style={{
      position: "relative", overflow: "hidden", minHeight: 36, padding: "0 16px", borderRadius: t.radius.full,
      border: on ? "none" : `1px solid ${t.border.default}`, background: t.bg.base, color: t.text.primary,
      fontFamily: font, fontSize: 14, fontWeight: 700, cursor: "pointer",
    }}>
      {on && <Fill color={A} text={text} font={font} size={14} />}
      <span style={{ opacity: on ? 0 : 1 }}>{text}</span>
    </button>
  );
  const chipRow = (kids: ReactNode, pad?: string): ReactNode => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: pad ?? "0 16px 16px" }}>{kids}</div>
  );
  const radio = (on: boolean): ReactNode => on ? (
    <span style={{ position: "relative", width: 22, height: 22, flexShrink: 0, borderRadius: t.radius.full, overflow: "hidden" }}>
      <Paint style={{ position: "absolute", inset: 0 }} draw={(ctx: CanvasRenderingContext2D, w: number, h: number) => {
        ctx.fillStyle = A; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = inkFor(A); ctx.beginPath(); ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2); ctx.fill();
      }} />
    </span>
  ) : (
    <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: t.radius.full, boxSizing: "border-box", border: `2px solid ${t.border.strong}` }} />
  );
  const sw = (on: boolean): ReactNode => (
    <span style={{ width: 44, height: 26, flexShrink: 0, borderRadius: t.radius.full, position: "relative", overflow: "hidden", background: t.fill.secondaryHover, boxShadow: on ? "none" : `inset 0 0 0 1px ${t.border.strong}` }}>
      {on ? (
        <Paint style={{ position: "absolute", inset: 0 }} draw={(ctx: CanvasRenderingContext2D, w: number, h: number) => {
          ctx.fillStyle = A; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = inkFor(A); ctx.beginPath(); ctx.arc(w - 13, h / 2, 10, 0, Math.PI * 2); ctx.fill();
        }} />
      ) : (
        <span style={{ position: "absolute", top: 3, left: 3, width: 20, height: 20, borderRadius: t.radius.full, background: t.text.secondary }} />
      )}
    </span>
  );
  const rowBtn = (key: string, title: string, sub: string, right: ReactNode, onClick: () => void): ReactNode => (
    <button key={key} onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 60, textAlign: "left", padding: "12px 16px",
      background: t.bg.base, border: "none", borderBottom: line, cursor: "pointer", fontFamily: font, color: t.text.primary,
    }}>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 13, color: muted }}>{sub}</span>
      </span>
      {right}
    </button>
  );
  const inputS: CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "12px 18px", borderRadius: t.radius.full,
    border: `1px solid ${t.border.default}`, background: t.bg.subtle, color: t.text.primary, fontFamily: font, fontSize: 15, outlineColor: t.border.focus,
  };
  const header = (h: string, sub: string): ReactNode => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "16px 16px 12px", borderBottom: line }}>
      <span style={{ fontSize: 20, fontWeight: 700 }}>{h}</span>
      <span style={{ fontSize: 13, color: muted }}>{sub}</span>
    </div>
  );
  const groupLabel = (h: string, sub?: string): ReactNode => (
    <div style={{ padding: "16px 16px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{h}</span>
      {sub && <span style={{ fontSize: 13, color: muted }}>{sub}</span>}
    </div>
  );

  // ---- device mock
  const pctW = (desk: number, narrow: number) => (stageNarrow ? narrow : desk) / 100;
  const devFrac: Record<Fg, number> = { "Phone": pctW(22, 40), "Laptop": pctW(56, 76), "Browser window": pctW(56, 84), "Product shot": pctW(34, 56), "Logo only": 0.6 };
  const devW = stageW * devFrac[fg];
  const devH: Record<Fg, number> = { "Phone": devW * 2, "Laptop": 96 + 18, "Browser window": 96 + 20, "Product shot": devW * 0.7 + 14, "Logo only": 62 };
  const capZone = !caps ? 40 : capStyle === "Lower third" ? 120 : stageNarrow ? 104 : 88;
  const boxH = Math.max(40, stageH - 40 - capZone);
  const fit = Math.min(1, boxH / devH[fg], fg === "Logo only" ? (stageW - 32) / 220 : 1);
  const pulse = beat ? 1 + 0.025 * Math.max(0, 1 - ((time % BEAT) / BEAT) * 3) : 1;
  const drift = Math.sin(time * 0.8) * 4;
  const tile = (i: number): ReactNode => (
    <div key={i} style={{ flex: 1, height: 30, borderRadius: t.radius.sm, background: brand ? dv.blueTint : t.fill.secondary, opacity: scene % 3 === i ? 1 : 0.7 }} />
  );
  const screen = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10 }}>
      <div style={{ position: "relative", overflow: "hidden", width: `${40 + scene * 10}%`, height: 8, borderRadius: 4, background: t.text.primary, transition: "width 400ms" }}>
        {brand && <Fill color={A} />}
      </div>
      <div style={{ width: "75%", height: 6, borderRadius: 4, background: t.border.default }} />
      <div style={{ display: "flex", gap: 6 }}>{[0, 1, 2].map((i: number) => tile(i))}</div>
    </div>
  );
  const frameBase: CSSProperties = { background: t.bg.elevated, border: `1px solid ${t.border.default}`, overflow: "hidden", boxSizing: "border-box" };
  const device = (() => {
    switch (fg) {
      case "Phone": return (
        <div style={{ ...frameBase, width: devW, height: devW * 2, borderRadius: 18, borderWidth: 4, borderColor: t.border.strong }}>
          <div style={{ width: "36%", height: 6, margin: "6px auto 0", borderRadius: 4, background: t.border.strong }} />
          {screen}
        </div>);
      case "Laptop": return (
        <div style={{ width: devW, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ ...frameBase, width: "100%", borderRadius: "8px 8px 0 0", borderWidth: 5, borderColor: t.border.strong }}>{screen}</div>
          <div style={{ width: "118%", height: 8, borderRadius: "0 0 8px 8px", background: t.border.strong }} />
        </div>);
      case "Browser window": return (
        <div style={{ ...frameBase, width: devW, borderRadius: t.radius.md }}>
          <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: t.bg.subtle, borderBottom: line }}>
            {[0, 1, 2].map((i: number) => <span key={i} style={{ width: 7, height: 7, borderRadius: 9, background: t.border.strong }} />)}
          </div>
          {screen}
        </div>);
      case "Product shot": return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: devW }}>
          <div style={{ position: "relative", overflow: "hidden", width: "70%", aspectRatio: "1 / 1", borderRadius: t.radius.xl, background: t.bg.elevated, border: `1px solid ${t.border.default}` }}>
            {brand && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${30 + 20 * Math.sin(time)}%`, opacity: 0.85 }}><Fill color={A} /></div>}
          </div>
          <div style={{ width: "100%", height: 8, marginTop: 6, borderRadius: "50%", background: t.fill.pressed }} />
        </div>);
      default: return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderRadius: t.radius.full, background: t.bg.elevated, border: `1px solid ${t.border.default}` }}>
          <div style={{ position: "relative", overflow: "hidden", width: 30, height: 30, borderRadius: t.radius.full, background: t.text.primary }}>{brand && <Fill color={A} />}</div>
          <span style={{ fontFamily: font, fontWeight: 700, fontSize: 18, color: t.text.primary }}>{host || "yourbrand"}</span>
        </div>);
    }
  })();

  const hud = (s: string, pos: CSSProperties): ReactNode => (
    <span style={{ position: "absolute", ...pos, fontFamily: font, fontSize: 12, fontWeight: 700, color: t.text.onColor, opacity: 0.85, zIndex: 2, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>
  );
  const tc = (s: number) => `0:${pad2(s)}.${pad2((s % 1) * 30)}`;
  const tMinus = `T-0:${pad2(len - time)}`;
  const stageMax = aspect === "16:9" ? "100%" : aspect === "1:1" ? "min(100%, 64vh)" : "min(100%, calc(64vh * 9 / 16))";

  const readout = (k: string, v: string): ReactNode => (
    <div key={k} style={{ flex: "1 1 96px", padding: "10px 14px", borderRight: line, borderBottom: line, display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={label}>{k}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: t.text.primary, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );

  const player = (
    <div style={{ display: "flex", flexDirection: "column", border: line, borderRadius: t.radius.xl, overflow: "hidden", background: t.bg.base }}>
      <div style={{ position: "relative" }}>
        <Paint style={{ position: "absolute", inset: 0 }} draw={(ctx: CanvasRenderingContext2D, W: number, H: number) => { ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, H); }} />
        <div ref={stageRef} style={{ position: "relative", width: stageMax, margin: "0 auto", aspectRatio: aspect.replace(":", " / "), overflow: "hidden" }}>
          <Paint style={{ position: "absolute", inset: 0 }} label="Live preview" draw={(ctx: CanvasRenderingContext2D, W: number, H: number) => drawStage(ctx, {
            W, H, A, style, time, len, sceneLen, slot, scene, caps, capStyle, beat, font, sub: host || "yourproduct.com",
          })} />
          {hud(stageNarrow ? `Scene ${slot + 1}/4` : `Scene ${slot + 1} of 4 · ${styleName}`, { top: 14, left: 16 })}
          {hud(tMinus, { top: 14, right: 16 })}
          {hud(stageNarrow ? (playing ? "● Rec" : "Paused") : `${playing ? "● Rec" : "Paused"} · ${aspect} · 30 fps`, { bottom: 14, left: 16 })}
          <div style={{ position: "absolute", top: 40, left: 0, right: 0, height: boxH, display: "flex", alignItems: "center", justifyContent: "center", transform: `translateY(${drift}px) scale(${fit * pulse})` }}>
            {device}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: line }}>
        <button onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"} style={{ width: 40, height: 40, borderRadius: t.radius.full, border: `1px solid ${t.border.default}`, background: t.bg.base, color: t.text.primary, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
          {playing ? "❚❚" : "▶"}
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text.primary, fontVariantNumeric: "tabular-nums" }}>{tc(time)}</span>
        <span style={{ fontSize: 15, color: muted, fontVariantNumeric: "tabular-nums" }}>/ 0:{pad2(len)}</span>
        <span style={{ ...label, marginLeft: "auto", fontWeight: 500 }}>{phone ? "Drag scenes to reorder" : "Drag scenes · tap a beat · Space, ← →"}</span>
      </div>
      <div style={{ height: 116, borderTop: line }}>
        <Paint draw={(ctx: CanvasRenderingContext2D, W: number, H: number) => drawTimeline(ctx, { W, H, A, time, len, sceneLen, slot, order, beat, drag, font })} onPtr={onTl} label="Timeline" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", borderTop: line, marginBottom: -1, marginRight: -1 }}>
        {readout("Time", tc(time))}
        {readout("Tempo", beat ? `${BPM} bpm` : "Free")}
        {readout("Now playing", `Scene ${scene + 1}`)}
        {readout("Order", order.map((i: number) => i + 1).join(" · "))}
      </div>
    </div>
  );

  const requestCard = (
    <div style={{ border: line, borderRadius: t.radius.xl, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 15, fontWeight: 700 }}>Paste this in your bot chat</span>
      <div style={{ fontSize: 15, lineHeight: 1.5, wordBreak: "break-word", userSelect: "all", color: t.text.primary }}>{request}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{quietBtn("Copy request", () => copyText(request, "Request copied"))}</div>
    </div>
  );

  const accentPicker = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "0 16px 16px", borderBottom: line }}>
      {ACCENTS.map(([name]: [string, string], i: number) => (
        <button key={name} onClick={() => setAcc(i)} title={name} aria-label={`${name} accent`} aria-pressed={acc === i} style={{
          position: "relative", width: 44, height: 44, borderRadius: t.radius.full, overflow: "hidden", cursor: "pointer", padding: 0,
          border: `2px solid ${acc === i ? t.text.primary : t.bg.base}`, background: t.bg.base,
        }}>
          <span style={{ position: "absolute", inset: 3, borderRadius: t.radius.full, overflow: "hidden" }}><Fill color={ACCENTS[i][1]} /><span style={{ position: "absolute", inset: 0, borderRadius: t.radius.full, boxShadow: `inset 0 0 0 1px ${t.border.strong}` }} /></span>
        </button>
      ))}
    </div>
  );

  const inspector = (() => {
    switch (step) {
      case "Style": return (<>
        {header("Style", "Look, captions and accent")}
        {STYLES.map(([s, d]: [Style, string]) => rowBtn(s, s, d, radio(style === s), () => setStyle(s)))}
        {style === "Describe my own" && (
          <div style={{ padding: "12px 16px", borderBottom: line }}>
            <input style={inputS} value={custom} placeholder="Moody film grain, slow push-ins"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCustom(e.target.value)} />
          </div>
        )}
        {rowBtn("caps", "Captions", "Words on screen, synced to the voice", sw(caps), () => setCaps(!caps))}
        {caps && chipRow(CAPSTYLES.map((c: CapStyle) => chip(c, capStyle === c, () => setCapStyle(c))), "12px 16px 16px")}
        {groupLabel("Accent", "Buttons, highlights and the playhead")}
        {accentPicker}
      </>);
      case "Foreground": return (<>
        {header("Foreground", "What sits center stage")}
        {FGS.map(([f, d]: [Fg, string]) => rowBtn(f, f, d, radio(fg === f), () => setFg(f)))}
      </>);
      case "Sound": return (<>
        {header("Sound", "Music, length and timing")}
        {MUSICS.map(([m, d]: [Music, string]) => rowBtn(m, m, d, radio(music === m), () => setMusic(m)))}
        {groupLabel("Length", "The timeline stretches to match")}
        {chipRow(LENS.map((l: Len) => chip(`${l}s`, len === l, () => { setLen(l); setTime(0); })))}
        <div style={{ borderTop: line }} />
        {rowBtn("beat", "Cuts on the beat", "Scene changes land on the music", sw(beat), () => setBeat(!beat))}
        {rowBtn("tick", "Tick sound", "A soft click when you jump to a beat", sw(sound), () => { setSound(!sound); if (!sound) tick(); })}
      </>);
      case "Finish": return (<>
        {header("Finish", "Brand and what comes after")}
        {rowBtn("b", "Brand colors from logo", "Pull the palette from your logo", sw(brand), () => setBrand(!brand))}
        {rowBtn("r", "Remember my brand", "The bot saves your logo, colors and song for next time", sw(remember), () => setRemember(!remember))}
        {rowBtn("l", "Launch-day pack", "Thumbnail, post still, and an X thread if you say yes", sw(pack), () => setPack(!pack))}
        {rowBtn("p", "Post copy", "A ready-to-post caption after the video", sw(copy), () => setCopy(!copy))}
      </>);
      default: return (<>
        {header("Send", "Save this setup or share it as a code")}
        <div style={{ padding: 16, fontSize: 15, color: muted, borderBottom: line }}>
          {shown ? "Your request is under the preview, ready to paste." : "Tap Make my .promo when you're happy with the preview."}
        </div>
        {groupLabel("Saved setups", "Kept while this page is open")}
        {chipRow(<>
          {presets.map((p: Preset, i: number) => (
            <span key={p.code + i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {quietBtn(p.name, () => { const s = decode(p.code); if (s) { apply(s); setNote(`Loaded ${p.name}`); } })}
              <button aria-label={`Remove ${p.name}`} onClick={() => setPresets(presets.filter((_: Preset, j: number) => j !== i))} style={{ width: 32, height: 32, borderRadius: t.radius.full, border: "none", background: t.bg.base, color: muted, cursor: "pointer", fontSize: 16 }}>×</button>
            </span>
          ))}
          {quietBtn("Save this setup", () => { setPresets([...presets, { name: `${style === "Describe my own" ? "Custom" : style} · ${len}s · ${aspect}`, code }]); setNote("Setup saved"); }, "save")}
        </>)}
        <div style={{ borderTop: line }} />
        {groupLabel("Setup code", "Share it, or paste one to load it")}
        <div style={{ padding: "0 16px 16px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 17, fontWeight: 700, userSelect: "all", letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums" }}>{code}</span>
          {quietBtn("Copy code", () => copyText(code, "Code copied"))}
        </div>
        <div style={{ padding: "0 16px 16px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          <div style={{ flex: "1 1 180px" }}>
            <input style={inputS} value={codeIn} placeholder="Paste a code, e.g. PR-0021021370123"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCodeIn(e.target.value)} />
          </div>
          {quietBtn("Load", () => { const s = decode(codeIn); if (s) { apply(s); setNote("Code loaded"); setCodeIn(""); } else setNote("That code doesn't look right"); })}
        </div>
      </>);
    }
  })();

  const badge: Record<Step, string> = {
    Style: style === "Describe my own" ? "Custom" : style,
    Foreground: fg,
    Sound: `${len}s`,
    Finish: `${[brand, remember, pack, copy].filter((b: boolean) => b).length} on`,
    Send: shown ? "Ready" : "",
  };
  const stepTab = (s: Step, compact: boolean): ReactNode => {
    const on = step === s;
    const col = on ? t.text.primary : muted;
    return (
      <button key={s} onClick={() => setStep(s)} title={s} aria-current={on ? "page" : undefined} style={{
        display: "flex", flexDirection: compact ? "column" : "row", alignItems: "center", justifyContent: "center", gap: compact ? 2 : 8,
        flex: compact ? 1 : "0 0 auto", minHeight: compact ? 56 : 52, padding: compact ? "6px 2px 8px" : "0 14px", cursor: "pointer",
        border: "none", background: t.bg.base, color: col, position: "relative",
        fontFamily: font, fontSize: compact ? 11 : 15, fontWeight: on ? 700 : 500,
      }}>
        <Icon step={s} color={col} />
        {s}
        {!compact && badge[s] !== "" && (
          <span style={{ fontSize: 13, fontWeight: 500, padding: "2px 10px", borderRadius: t.radius.full, background: t.fill.secondary, color: muted }}>{badge[s]}</span>
        )}
        {on && (
          <span style={{ position: "absolute", left: "25%", right: "25%", height: 4, borderRadius: t.radius.full, overflow: "hidden", ...(compact ? { top: 0 } : { bottom: 0 }) }}>
            <Fill color={A} />
          </span>
        )}
      </button>
    );
  };

  return (
    <div ref={rootRef} style={{ fontFamily: font, fontSize: 15, color: t.text.primary, background: t.bg.base, minHeight: "100%", paddingBottom: phone ? 72 : 0 }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: line, background: t.bg.base }}>
        <Mascot dot={t.text.primary} ring={t.bg.base} edge={t.border.strong} size={36} />
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: t.text.primary }}>.promo</span>
        <span style={{ flex: 1 }} />
        {accentBtn("Make my .promo", make)}
      </div>

      {!phone && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, padding: "0 12px", borderBottom: line }}>
          {STEPS.map((s: Step) => stepTab(s, false))}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 420px", minWidth: 0, padding: phone ? 12 : 20, display: "flex", flexDirection: "column", gap: 14, borderRight: phone ? "none" : line }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{link.trim() ? "Your product" : "Start from a link"}</span>
            <input style={inputS} value={link} placeholder="Paste your product URL, e.g. yourproduct.com" aria-label="Product link"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setLink(e.target.value)} />
            <span style={{ fontSize: 13, color: muted }}>{host ? `The bot will pull visuals and copy from ${host}.` : "Optional. The bot pulls visuals and copy from it."}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {ASPECTS.map(([a, n]: [Aspect, string]) => chip(phone ? a : `${a} ${n}`, aspect === a, () => setAspect(a)))}
            <span style={{ flex: 1 }} />
            {quietBtn("Surprise me", surprise)}
          </div>
          {player}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <span style={{ flex: "1 1 220px", fontSize: 13, color: muted }}>{renderLine}</span>
            {accentBtn("Make my .promo", make)}
          </div>
          {shown && requestCard}
          {note && <span role="status" style={{ fontSize: 13, fontWeight: 700, color: t.text.primary }}>{note}</span>}
        </div>
        <div style={{ flex: "1 1 300px", minWidth: 0, borderTop: phone ? line : "none" }}>
          {inspector}
        </div>
      </div>

      <div style={{ padding: phone ? "24px 12px" : "32px 20px", borderTop: line }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 16, border: line, borderRadius: t.radius.xl, maxWidth: 720, margin: "0 auto" }}>
          <MailBall dot={t.text.primary} ring={t.bg.base} edge={t.border.strong} size={40} />
          <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, color: muted }}>More from the maker</span>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: t.text.primary }}>.mail</span>
            <span style={{ fontSize: 13, color: muted }}>Your bot's own inbox: digests, sorting, reply drafts you approve</span>
          </div>
          <a href={MAIL_URL} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 18px", borderRadius: t.radius.full,
            border: `1px solid ${t.border.default}`, color: t.text.primary, fontWeight: 700, fontSize: 15, textDecoration: "none",
          }}>Try .mail</a>
          <span style={{ flexBasis: "100%", fontSize: 12, color: muted, userSelect: "all", wordBreak: "break-all" }}>{MAIL_URL}</span>
        </div>
      </div>

      {phone && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 6, display: "flex", borderTop: line, background: t.bg.base, padding: "0 4px" }}>
          {STEPS.map((s: Step) => stepTab(s, true))}
        </div>
      )}
    </div>
  );
}

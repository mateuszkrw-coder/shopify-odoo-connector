/* Tiny deterministic motion-graphics toolkit for Canvas 2D.
   Every frame is a pure function of time `t` (seconds): no state, no clocks,
   so any frame can be rendered in any order and sub-frames can be blended
   for real motion blur. */
'use strict';

const W = 1920, H = 1080, FPS = 60, DUR = 15;

const P = {
  ink: '#0B0D18', ink2: '#12152B', ink3: '#1B1F3D', line: '#2A2F57',
  paper: '#F6F3EC', paper2: '#E7E2D6', paper3: '#D6D0C2',
  muted: '#8C91B5', inkText: '#14162A', inkMuted: '#6A6E8A',
  green: '#95BF47', greenD: '#4E7A2E', greenL: '#B7D87A',
  purple: '#714B67', purpleL: '#CB9DC0', purpleD: '#3D2438', purpleM: '#5B3A53',
  yellow: '#FFD43B', coral: '#FF6B5B',
};

/* ---------- math ---------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, f) => a + (b - a) * f;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const TAU = Math.PI * 2;

function cubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sx = u => ((ax * u + bx) * u + cx) * u;
  const sy = u => ((ay * u + by) * u + cy) * u;
  const dsx = u => (3 * ax * u + 2 * bx) * u + cx;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - x, d = dsx(u);
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    if (Math.abs(sx(u) - x) > 1e-4) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 40; i++) { u = (lo + hi) / 2; if (sx(u) < x) lo = u; else hi = u; }
    }
    return sy(u);
  };
}

const E = {
  linear: x => x,
  inQuad: x => x * x,
  outQuad: x => 1 - (1 - x) * (1 - x),
  inOutQuad: x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: x => x * x * x,
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inOutCubic: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inQuart: x => x * x * x * x,
  outQuart: x => 1 - Math.pow(1 - x, 4),
  inOutQuart: x => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outQuint: x => 1 - Math.pow(1 - x, 5),
  inOutQuint: x => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
  inExpo: x => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
  outExpo: x => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inOutExpo: x => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: x => { if (x <= 0) return 0; if (x >= 1) return 1; const s = 1.70158; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
  outBackSoft: x => { if (x <= 0) return 0; if (x >= 1) return 1; const s = 1.1; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
  inBack: x => { const s = 1.70158; return (s + 1) * x * x * x - s * x * x; },
  // designer curves
  swift: cubicBezier(0.16, 1, 0.3, 1),     // snappy ease-out
  glide: cubicBezier(0.65, 0, 0.35, 1),    // symmetric ease-in-out
  punch: cubicBezier(0.7, 0, 0.84, 0),     // hard ease-in for exits
};

// tween: value from v0 -> v1 while t moves a -> b
const tw = (t, a, b, v0, v1, ease = E.swift) => lerp(v0, v1, ease(prog(t, a, b)));

// keyframes: [[time, value], [time, value, easeIntoThisKey], ...]
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return lerp(v0, v1, (e || E.inOutCubic)(prog(t, t0, t1)));
    }
  }
  return keys[keys.length - 1][1];
}

// damped spring step response (0 -> 1 with overshoot), dt in seconds
function spring(dt, zeta = 0.5, omega = 16) {
  if (dt <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * dt) * (Math.cos(wd * dt) + (zeta * omega / wd) * Math.sin(wd * dt));
}

// decaying wobble (0 at rest), for follow-through / shakes
function wobble(dt, amp = 1, freq = 9, decay = 7) {
  if (dt <= 0) return 0;
  return amp * Math.exp(-decay * dt) * Math.sin(TAU * freq * dt);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- color ---------- */
const _hex = new Map();
function rgbOf(c) {
  let v = _hex.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _hex.set(c, v);
  }
  return v;
}
function mix(c1, c2, f) {
  f = clamp(f);
  const a = rgbOf(c1), b = rgbOf(c2);
  const h = i => Math.round(lerp(a[i], b[i], f)).toString(16).padStart(2, '0');
  return '#' + h(0) + h(1) + h(2);
}
function rgba(c, al) {
  const a = rgbOf(c);
  return `rgba(${a[0]},${a[1]},${a[2]},${clamp(al)})`;
}

/* ---------- canvas helpers ---------- */
function xf(ctx, o, fn) {
  ctx.save();
  if (o.x || o.y) ctx.translate(o.x || 0, o.y || 0);
  if (o.r) ctx.rotate(o.r);
  const sx = o.sx ?? o.s ?? 1, sy = o.sy ?? o.s ?? 1;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (o.a !== undefined) ctx.globalAlpha *= clamp(o.a);
  fn();
  ctx.restore();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}

function polyRound(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  const m = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
  ctx.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.arcTo(p[0], p[1], q[0], q[1], r);
  }
  ctx.closePath();
}

// stroke a polyline partially (0..1 of its length)
function strokePartial(ctx, pts, p) {
  if (p <= 0) return;
  let total = 0;
  const seg = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let left = total * clamp(p);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const d = seg[i - 1], f = Math.min(1, left / d);
    ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f));
    left -= d;
  }
  ctx.stroke();
}

// sample a cubic bezier into points
function bezierPts(p0, p1, p2, p3, n = 40) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    out.push([
      v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
      v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1],
    ]);
  }
  return out;
}
function pointAt(pts, p) {
  let total = 0;
  const seg = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let left = total * clamp(p);
  for (let i = 1; i < pts.length; i++) {
    if (left <= seg[i - 1]) {
      const f = seg[i - 1] ? left / seg[i - 1] : 0;
      return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)];
    }
    left -= seg[i - 1];
  }
  return pts[pts.length - 1];
}

/* ---------- type ---------- */
const FAM = { sans: '"SG", sans-serif', mono: '"JBM", monospace' };
function setFont(ctx, size, weight = 700, fam = 'sans', tracking = 0) {
  ctx.font = `${weight} ${size}px ${FAM[fam]}`;
  ctx.letterSpacing = `${tracking}px`;
}

const _lay = new Map();
// kerning-aware per-character x offsets + visual width
function layout(ctx, s) {
  const key = ctx.font + '|' + ctx.letterSpacing + '|' + s;
  let L = _lay.get(key);
  if (!L) {
    const tr = parseFloat(ctx.letterSpacing) || 0;
    const xs = [];
    for (let i = 0; i < s.length; i++) {
      xs.push(ctx.measureText(s.slice(0, i + 1)).width - ctx.measureText(s[i]).width);
    }
    L = { xs, w: ctx.measureText(s).width - tr };
    _lay.set(key, L);
  }
  return L;
}

function text(ctx, s, x, y, o = {}) {
  setFont(ctx, o.size || 40, o.weight || 700, o.fam || 'sans', o.tracking || 0);
  const L = layout(ctx, s);
  let x0 = x;
  if (o.align === 'center') x0 = x - L.w / 2;
  else if (o.align === 'right') x0 = x - L.w;
  ctx.fillStyle = o.color || P.paper;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(s, x0, y);
  return L.w;
}

function textWidth(ctx, s, size, weight = 700, fam = 'sans', tracking = 0) {
  setFont(ctx, size, weight, fam, tracking);
  return layout(ctx, s).w;
}

/* per-character animated text.
   fn(i, n, ch) -> {dx, dy, s, r, a, color} or null to skip. */
function charText(ctx, s, x, y, o, fn) {
  setFont(ctx, o.size, o.weight || 700, o.fam || 'sans', o.tracking || 0);
  const L = layout(ctx, s);
  let x0 = x;
  if (o.align === 'center') x0 = x - L.w / 2;
  else if (o.align === 'right') x0 = x - L.w;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ' ') continue;
    const st = fn(i, s.length, ch) || {};
    if (st.a !== undefined && st.a <= 0.001) continue;
    ctx.save();
    const cw = ctx.measureText(ch).width;
    const cx = x0 + L.xs[i] + cw / 2, cy = y;
    ctx.translate(cx + (st.dx || 0), cy + (st.dy || 0));
    if (st.r) ctx.rotate(st.r);
    if (st.s !== undefined && st.s !== 1) ctx.scale(st.s, st.s);
    if (st.a !== undefined) ctx.globalAlpha *= st.a;
    ctx.fillStyle = st.color || o.color || P.paper;
    ctx.fillText(ch, -cw / 2, 0);
    ctx.restore();
  }
  return { x0, w: L.w };
}

// masked rise: characters slide up from below a clip line, and out through the top
function riseText(ctx, s, x, y, o, t, tIn, tOut = Infinity) {
  const size = o.size;
  const stagger = o.stagger ?? 0.012, dur = o.dur ?? 0.6, outDur = o.outDur ?? 0.32;
  const setW = textWidth(ctx, s, size, o.weight || 700, o.fam || 'sans', o.tracking || 0);
  let x0 = x;
  if (o.align === 'center') x0 = x - setW / 2;
  else if (o.align === 'right') x0 = x - setW;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - size, y - size * 1.05, setW + size * 2, size * 1.38);
  ctx.clip();
  charText(ctx, s, x, y, o, (i, n) => {
    const pin = (o.ease || E.swift)(prog(t, tIn + i * stagger, tIn + i * stagger + dur));
    const pout = E.inExpo(prog(t, tOut + i * stagger * 0.6, tOut + i * stagger * 0.6 + outDur));
    if (pin <= 0) return { a: 0 };
    const dy = (1 - pin) * size * 1.25 - pout * size * 1.35;
    return { dy, r: (1 - pin) * (o.tilt || 0) };
  });
  ctx.restore();
}

// monospace segments [[text, color], ...]; reveal = number of visible chars (fractional ok)
function mono(ctx, segs, x, y, o = {}) {
  const size = o.size || 26;
  setFont(ctx, size, o.weight || 500, 'mono', o.tracking || 0);
  const adv = ctx.measureText('M').width;
  let i = 0;
  const reveal = o.reveal ?? Infinity;
  const total = segs.reduce((n, s) => n + s[0].length, 0);
  let x0 = x;
  if (o.align === 'center') x0 = x - (total * adv - (o.tracking || 0)) / 2;
  else if (o.align === 'right') x0 = x - (total * adv - (o.tracking || 0));
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const [str, color] of segs) {
    for (const ch of str) {
      if (i >= reveal) break;
      const cx = x0 + i * adv;
      if (ch === '→') {
        drawArrowGlyph(ctx, cx, y - size * 0.32, adv, size, color);
      } else if (ch !== ' ') {
        ctx.fillStyle = color;
        ctx.fillText(ch, cx, y);
      }
      i++;
    }
  }
  if (o.caret && reveal < total + 1) {
    const cx = x0 + Math.min(Math.floor(reveal), total) * adv;
    ctx.fillStyle = o.caretColor || P.yellow;
    ctx.fillRect(cx + 2, y - size * 0.78, Math.max(3, size * 0.12), size * 0.95);
  }
  return { w: total * adv, adv };
}

function drawArrowGlyph(ctx, x, y, adv, size, color) {
  const lw = Math.max(2, size * 0.085);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const x1 = x + adv * 0.1, x2 = x + adv * 0.9, hs = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.moveTo(x2 - hs, y - hs);
  ctx.lineTo(x2, y);
  ctx.lineTo(x2 - hs, y + hs);
  ctx.stroke();
  ctx.restore();
}

/* ---------- icons (centered at 0,0; s = nominal size) ---------- */
function iconBag(ctx, s, body, handle, band) {
  const top = -s * 0.2, h = s * 0.66, w1 = s * 0.74, w2 = s * 0.82;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = handle;
  ctx.lineWidth = s * 0.075;
  ctx.beginPath();
  ctx.arc(0, top + s * 0.02, s * 0.19, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = body;
  polyRound(ctx, [[-w1 / 2, top], [w1 / 2, top], [w2 / 2, top + h], [-w2 / 2, top + h]], s * 0.07);
  ctx.fill();
  if (band) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = band;
    ctx.fillRect(-s, top, s * 2, h * 0.16);
    ctx.restore();
  }
  ctx.restore();
}

function iconLens(ctx, s, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || s * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.3, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = (lw || s * 0.1) * 1.25;
  ctx.beginPath();
  ctx.moveTo(s * 0.22, s * 0.22);
  ctx.lineTo(s * 0.44, s * 0.44);
  ctx.stroke();
  ctx.restore();
}

function iconCheck(ctx, s, color, lw, p = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || s * 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokePartial(ctx, [[-s * 0.32, s * 0.02], [-s * 0.1, s * 0.24], [s * 0.34, -s * 0.22]], p);
  ctx.restore();
}

function iconPerson(ctx, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -s * 0.17, s * 0.17, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, s * 0.33, s * 0.32, s * 0.24, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function iconTag(ctx, s, color, holeColor) {
  ctx.save();
  ctx.fillStyle = color;
  polyRound(ctx, [[-s * 0.4, -s * 0.24], [s * 0.14, -s * 0.24], [s * 0.4, 0], [s * 0.14, s * 0.24], [-s * 0.4, s * 0.24]], s * 0.06);
  ctx.fill();
  ctx.fillStyle = holeColor;
  ctx.beginPath();
  ctx.arc(s * 0.12, 0, s * 0.065, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function iconDoc(ctx, s, color, lineColor) {
  ctx.save();
  ctx.fillStyle = color;
  rrect(ctx, -s * 0.3, -s * 0.38, s * 0.6, s * 0.76, s * 0.07);
  ctx.fill();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, -s * 0.15); ctx.lineTo(s * 0.15, -s * 0.15);
  ctx.moveTo(-s * 0.15, 0); ctx.lineTo(s * 0.15, 0);
  ctx.moveTo(-s * 0.15, s * 0.15); ctx.lineTo(s * 0.04, s * 0.15);
  ctx.stroke();
  ctx.restore();
}

function iconSkip(ctx, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  rrect(ctx, -s * 0.11, s * 0.08, s * 0.22, s * 0.22, s * 0.04);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, s * 0.1, s * 0.32, Math.PI * 1.02, Math.PI * 1.92);
  ctx.stroke();
  const ex = Math.cos(Math.PI * 1.92) * s * 0.32, ey = s * 0.1 + Math.sin(Math.PI * 1.92) * s * 0.32;
  ctx.beginPath();
  ctx.moveTo(ex - s * 0.17, ey - s * 0.02);
  ctx.lineTo(ex + s * 0.01, ey + s * 0.02);
  ctx.lineTo(ex + s * 0.02, ey - s * 0.16);
  ctx.stroke();
  ctx.restore();
}

function iconCursor(ctx, s, fill, stroke) {
  ctx.save();
  const pts = [[0, 0], [0, 0.74], [0.19, 0.57], [0.31, 0.86], [0.43, 0.81], [0.31, 0.53], [0.54, 0.53]].map(p => [p[0] * s, p[1] * s]);
  polyRound(ctx, pts, s * 0.03);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = s * 0.05;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/* ---------- effects ---------- */
// deterministic particle burst
function burst(ctx, t, t0, x, y, o = {}) {
  const dt = t - t0, life = o.life ?? 0.9;
  if (dt <= 0 || dt > life) return;
  const r = rng(o.seed ?? 1);
  const n = o.count ?? 16;
  const colors = o.colors || [P.yellow];
  for (let i = 0; i < n; i++) {
    const ang = (o.angle ?? 0) + (r() - 0.5) * (o.spread ?? TAU);
    const sp = (o.speed ?? 700) * (0.45 + r() * 0.75);
    const k = 1 - Math.pow(2, -7 * dt / life);           // drag-like travel
    const px = x + Math.cos(ang) * sp * k * life * 0.35;
    const py = y + Math.sin(ang) * sp * k * life * 0.35 + (o.gravity ?? 0) * dt * dt;
    const sz = (o.size ?? 10) * (0.5 + r() * 0.8) * (1 - E.inQuad(prog(dt, life * 0.35, life)));
    if (sz <= 0.3) continue;
    const kind = Math.floor(r() * 3);
    const rot = r() * TAU + dt * (r() - 0.5) * 16;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.fillStyle = colors[i % colors.length];
    ctx.strokeStyle = colors[i % colors.length];
    if (kind === 0) { ctx.beginPath(); ctx.arc(0, 0, sz * 0.5, 0, TAU); ctx.fill(); }
    else if (kind === 1) { ctx.fillRect(-sz / 2, -sz / 2, sz, sz); }
    else { ctx.lineWidth = Math.max(1.5, sz * 0.3); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-sz * 0.7, 0); ctx.lineTo(sz * 0.7, 0); ctx.stroke(); }
    ctx.restore();
  }
}

// expanding ring pulse
function ring(ctx, t, t0, x, y, o = {}) {
  const dt = t - t0, dur = o.dur ?? 0.5;
  if (dt <= 0 || dt > dur) return;
  const p = dt / dur;
  ctx.save();
  ctx.strokeStyle = o.color || P.yellow;
  ctx.globalAlpha *= (1 - p) * (o.alpha ?? 1);
  ctx.lineWidth = (o.lw ?? 6) * (1 - p * 0.7);
  ctx.beginPath();
  ctx.arc(x, y, lerp(o.r0 ?? 10, o.r1 ?? 90, E.outCubic(p)), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// screen shake offset
function shake(t, t0, amp = 14, dur = 0.35) {
  const dt = t - t0;
  if (dt <= 0 || dt > dur) return [0, 0];
  const k = amp * Math.pow(1 - dt / dur, 2);
  return [Math.sin(dt * 91) * k, Math.cos(dt * 73 + 1.3) * k * 0.7];
}

// radial "impact" lines around a hit (elliptical so they hug wide shapes)
function impact(ctx, t, t0, x, y, o = {}) {
  const dt = t - t0, dur = o.dur ?? 0.3;
  if (dt <= 0 || dt > dur) return;
  const p = dt / dur, n = o.count ?? 10;
  const r0 = o.r0 ?? 40, r1 = o.r1 ?? 150, ex = o.ex ?? 1, ey = o.ey ?? 1;
  const tail = lerp(r0, r1, E.outCubic(p));
  const head = lerp(r0, r1, E.outCubic(Math.min(1, p * 1.9))) + 6;
  ctx.save();
  ctx.strokeStyle = o.color || P.yellow;
  ctx.lineCap = 'round';
  ctx.lineWidth = o.lw ?? 6;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (o.rot ?? 0);
    const c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(x + c * tail * ex, y + s * tail * ey);
    ctx.lineTo(x + c * head * ex, y + s * head * ey);
  }
  ctx.stroke();
  ctx.restore();
}

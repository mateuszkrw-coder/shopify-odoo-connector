/* Storyboard — "Shopify → Odoo order connector"
   15 s @ 60 fps, cut to a 120 BPM grid (one beat = 0.5 s, one bar = 2 s).

   0–2    title: a dot stretches into a horizon, the title rises out of it,
          then shrinks into the corner as a persistent label
   2–4    01 fetch orders        (Shopify Admin API)
   4–6    02 never import twice  (client_order_ref check)
   6–8    03 find/create customer (res.partner)
   8–10   04 match SKUs          (product.product.default_code)
   10–12  05 draft quotation     (sale.order.create)
   12–15  end card + recap, collapses back into the opening dot (seamless loop) */
'use strict';

const CARD = { w: 640, hh: 100, bh: 400, r: 26 };
const LOGC = mix(P.paper, P.ink, 0.3);
const SKUS = ['TEE-BLK-M', 'MUG-ENML'];
const CENTER = [960, 540];

const EV = {
  bagIn: 2.05, launch: [2.45, 2.6, 2.75], flight: 0.5, toS3: 3.66, bagOut: 3.52,
  panelIn: 4.1, link: 4.55, linkHit: 4.92, stamp: 5.0, eject: 5.2, checks: [5.18, 5.28], panelOut: 5.45,
  expand: 5.55,
  lensIn: 6.12, scan: 6.45, noMatch: 6.82, plus: 7.02, created: 7.3, newPill: 7.5,
  tiles: [8.16, 8.66], dock: [8.5, 9.0], s5Back: 9.55,
  wipe: 10.0, flip: 10.04, flipEnd: 10.54, draft: 10.62, cursorIn: 10.9, hover: 11.3, click: 11.5, cardOut: 11.82,
  endWipe: 12.0, titleBack: 12.04, sub: 12.36, pipe: 12.52, tags: 13.02, outro: 14.35,
};

const STEPS = [
  { a: 2.0, head: ['Fetch new', 'orders'],
    code: [['GET ', P.yellow], ['/admin/api/2025-01/orders.json', P.paper]] },
  { a: 4.0, head: ['Never import', 'twice'],
    code: [['client_order_ref', P.paper], [' == ', P.muted], ['"#1000"', P.green]] },
  { a: 6.0, head: ['Find or create', 'the customer'],
    code: [['res.partner', P.paper], ['.search(', P.muted], ['email', P.yellow], [')', P.muted]] },
  { a: 8.0, head: ['Match products', 'by SKU'],
    code: [['product.product', P.paper], ['.', P.muted], ['default_code', P.yellow]] },
  { a: 10.0, head: ['Create a draft', 'quotation'],
    code: [['sale.order', P.paper], ['.create(', P.muted], ['…', P.muted], [')', P.muted]] },
];

// the script's real console output, printed as the story unfolds
const LOG = [
  { t: 2.12, cps: 55, segs: [['$ ', P.yellow], ['python shopify_to_odoo.py', P.paper]] },
  { t: 3.05, cps: 220, segs: [['Shopify returned ', LOGC], ['3', P.yellow], [' order(s)', LOGC]] },
  { t: 5.04, cps: 220, segs: [['  Order #1000: already imported — ', LOGC], ['skipped', P.coral]] },
  { t: 7.34, cps: 220, segs: [['  Order #1001: ', LOGC], ['created customer', P.green], [" 'Ada Lovelace'", LOGC]] },
  { t: 10.58, cps: 220, segs: [['  Order #1001 → created Odoo ', LOGC], ['S00042', P.yellow]] },
];

/* ======================================================================= */
/* background                                                              */
/* ======================================================================= */
let _grid = null;
function gridLayer() {
  if (_grid) return _grid;
  _grid = document.createElement('canvas');
  _grid.width = W; _grid.height = H;
  const g = _grid.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.075)';
  for (let y = 36; y < H; y += 48) for (let x = 24; x < W; x += 48) {
    g.beginPath(); g.arc(x, y, 1.7, 0, TAU); g.fill();
  }
  return _grid;
}

function drawBackground(ctx, t) {
  ctx.fillStyle = P.ink;
  ctx.fillRect(0, 0, W, H);
  // Odoo purple wipe, led by a yellow rim that swells and thins out
  if (t >= EV.wipe && t < EV.endWipe + 0.7) {
    const p = prog(t, EV.wipe, EV.wipe + 0.52);
    const r = 2300 * E.inOutQuart(p), rim = 90 * Math.sin(Math.PI * p);
    ctx.fillStyle = P.yellow; ctx.beginPath(); ctx.arc(1380, 560, r + rim, 0, TAU); ctx.fill();
    ctx.fillStyle = P.purple; ctx.beginPath(); ctx.arc(1380, 560, r, 0, TAU); ctx.fill();
  }
  // back to ink, growing out of the corner label as it returns to centre stage
  if (t >= EV.endWipe && t < EV.endWipe + 0.7) {
    const p = prog(t, EV.endWipe, EV.endWipe + 0.58);
    const r = 2400 * E.inOutQuart(p), rim = 90 * Math.sin(Math.PI * p);
    ctx.fillStyle = P.yellow; ctx.beginPath(); ctx.arc(190, 80, r + rim, 0, TAU); ctx.fill();
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(190, 80, r, 0, TAU); ctx.fill();
  }
  ctx.drawImage(gridLayer(), 0, 0);
}

const onPurple = t => t >= EV.wipe + 0.3 && t < EV.endWipe + 0.3;

/* ======================================================================= */
/* title lockup: intro → corner label → end card → collapse                */
/* ======================================================================= */
const TITLE = { size: 150, track: -5, gap: 50, arrow: 190, anchorY: 492, horizon: 48 };

function titleMetrics(ctx) {
  const wS = textWidth(ctx, 'Shopify', TITLE.size, 700, 'sans', TITLE.track);
  const wO = textWidth(ctx, 'Odoo', TITLE.size, 700, 'sans', TITLE.track);
  const TW = wS + TITLE.gap * 2 + TITLE.arrow + wO;
  return { wS, wO, TW, a0: wS + TITLE.gap, a1: wS + TITLE.gap + TITLE.arrow, xO: wS + TITLE.gap * 2 + TITLE.arrow };
}

function outroK(t) { return 1 - E.inBack(prog(t, EV.outro, EV.outro + 0.46)); }

function drawTitleGroup(ctx, t) {
  const m = titleMetrics(ctx);
  const full = { x: 960 - m.TW / 2, y: TITLE.anchorY, s: 1 };
  const hud = { x: 120, y: 94, s: 0.2 };
  const end = { x: 960 - m.TW * 0.8 / 2, y: 420, s: 0.8 };
  let st = full;
  if (t >= 1.6 && t < EV.titleBack) {
    const p = E.inOutExpo(prog(t, 1.6, 2.02));
    st = { x: lerp(full.x, hud.x, p), y: lerp(full.y, hud.y, p), s: lerp(1, hud.s, p) };
  } else if (t >= EV.titleBack) {
    const p = E.glide(prog(t, EV.titleBack, EV.titleBack + 0.6));
    st = { x: lerp(hud.x, end.x, p), y: lerp(hud.y, end.y, p), s: lerp(hud.s, end.s, p) };
  }
  const k = outroK(t);
  if (k <= 0.002) return;
  const intro = t < 1.6;
  const odooColor = mix(P.purpleL, P.paper, onPurple(t) ? 1 : 0);

  ctx.save();
  if (k !== 1) { ctx.translate(CENTER[0], CENTER[1]); ctx.scale(k, k); ctx.translate(-CENTER[0], -CENTER[1]); }
  ctx.translate(st.x, st.y);
  ctx.scale(st.s, st.s);

  // --- words rising out of the horizon
  const size = TITLE.size;
  const wordOpts = { size, weight: 700, tracking: TITLE.track };
  if (intro) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-200, -size * 1.4, m.TW + 400, size * 1.4 + TITLE.horizon);
    ctx.clip();
    const rise = (t0, i) => {
      const p = E.swift(prog(t, t0 + i * 0.032, t0 + i * 0.032 + 0.62));
      return { dy: (1 - p) * size * 1.3, r: (1 - p) * 0.25 };
    };
    charText(ctx, 'Shopify', 0, 0, { ...wordOpts, color: P.green }, i => rise(0.26, i));
    charText(ctx, 'Odoo', m.xO, 0, { ...wordOpts, color: odooColor }, i => rise(0.4, i));
    ctx.restore();
  } else {
    text(ctx, 'Shopify', 0, 0, { ...wordOpts, color: P.green });
    text(ctx, 'Odoo', m.xO, 0, { ...wordOpts, color: odooColor });
  }

  // --- the connector: dot → horizon line → arrow
  const ay = -52;
  ctx.fillStyle = P.yellow;
  ctx.strokeStyle = P.yellow;
  ctx.lineCap = 'round';
  if (intro && t < 0.14) {
    const q = E.outQuad(prog(t, 0, 0.12));
    ctx.save();
    ctx.translate(m.TW / 2, TITLE.horizon);
    ctx.scale(1 + 0.4 * q, 1 - 0.3 * q);
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    ctx.restore();
  } else if (intro) {
    const ext = E.swift(prog(t, 0.12, 0.5));
    // gather in between the words first, then rise to arrow height
    const retX = E.swift(prog(t, 0.56, 0.9));
    const retY = E.swift(prog(t, 0.72, 1.02));
    const half = lerp(13 * 1.4, m.TW / 2 + 40, ext);
    let x0 = m.TW / 2 - half, x1 = m.TW / 2 + half;
    x0 = lerp(x0, m.a0, retX);
    x1 = lerp(x1, m.a1, retX);
    const y = lerp(TITLE.horizon, ay, retY);
    const th = lerp(lerp(18, 6, ext), 11, retY);
    ctx.lineWidth = th;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    const hp = E.outBack(prog(t, 0.9, 1.12));
    if (hp > 0.001) drawArrowHead(ctx, x1, y, 36 * hp, 11);
    // data packets riding the arrow
    if (t > 1.02) drawPackets(ctx, t, m.a0 + 12, m.a1 - 30, ay, 1.02, 0.5);
  } else {
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(m.a0, ay); ctx.lineTo(m.a1, ay); ctx.stroke();
    drawArrowHead(ctx, m.a1, ay, 36, 11);
    if (t > EV.titleBack + 0.5) drawPackets(ctx, t, m.a0 + 12, m.a1 - 30, ay, EV.titleBack + 0.5, 0.6);
  }

  // --- intro subtitle, decoded from scrambled glyphs
  if (t < 1.75) {
    const sub = 'ORDER CONNECTOR  ·  PYTHON';
    const out = E.inExpo(prog(t, 1.5, 1.68));
    const glyphs = '#%&*+=?@ABCDEFGHJKLMNPRSTUVXYZ0123456789/<>';
    const seg = [];
    for (let i = 0; i < sub.length; i++) {
      const ti = 0.8 + i * 0.016;
      let ch = sub[i];
      if (ch !== ' ' && t < ti) {
        if (t < ti - 0.22) ch = ' ';
        else ch = glyphs[Math.floor(rng(i * 97 + Math.floor(t * 30))() * glyphs.length)];
      }
      const color = i >= 20 ? P.yellow : (t < ti ? P.muted : mix(P.muted, P.paper, 0.35));
      seg.push([ch, color]);
    }
    ctx.save();
    ctx.globalAlpha *= 1 - out;
    mono(ctx, seg, m.TW / 2, 150 + out * 30, { size: 30, weight: 500, tracking: 7, align: 'center' });
    ctx.restore();
  }
  ctx.restore();
}

function drawArrowHead(ctx, x, y, len, lw) {
  ctx.save();
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - len, y - len);
  ctx.lineTo(x, y);
  ctx.lineTo(x - len, y + len);
  ctx.stroke();
  ctx.restore();
}

function drawPackets(ctx, t, x0, x1, y, t0, period) {
  const span = x1 - x0;
  for (let n = 0; n < 3; n++) {
    const u = ((t - t0) / period + n / 3) % 1;
    if (t - t0 < (n / 3) * period) continue;
    const a = Math.sin(Math.PI * u);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.arc(x0 + span * u, y, 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/* ======================================================================= */
/* left column: step headline + code chip                                  */
/* ======================================================================= */
function drawSteps(ctx, t) {
  STEPS.forEach((st, i) => {
    const a = st.a, out = a + 1.66;
    if (t < a - 0.01 || t > a + 2.1) return;
    const purple = i === 4;
    const x = 120;
    // label "01 / 05"
    const lp = E.swift(prog(t, a + 0.02, a + 0.5));
    const lo = E.inExpo(prog(t, out - 0.02, out + 0.26));
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 10, 318, 400, 44); ctx.clip();
    mono(ctx, [[`0${i + 1}`, P.yellow], [' / 05', purple ? mix(P.paper, P.purple, 0.4) : P.muted]],
      x, 352 + (1 - lp) * 44 - lo * 48, { size: 24, weight: 600, tracking: 3 });
    ctx.restore();
    // headline
    const hopt = { size: 96, weight: 700, tracking: -3, color: P.paper, stagger: 0.013, dur: 0.62 };
    riseText(ctx, st.head[0], x, 462, hopt, t, a + 0.07, out);
    riseText(ctx, st.head[1], x, 560, hopt, t, a + 0.14, out + 0.04);
    // code chip
    setFont(ctx, 26, 500, 'mono');
    const adv = ctx.measureText('M').width;
    const len = st.code.reduce((n, s) => n + s[0].length, 0);
    const cw = len * adv + 44;
    const open = E.swift(prog(t, a + 0.26, a + 0.66)) * (1 - E.inExpo(prog(t, out + 0.02, out + 0.28)));
    if (open > 0.002) {
      const w = cw * open;
      ctx.save();
      ctx.fillStyle = purple ? 'rgba(20,8,20,0.28)' : P.ink2;
      rrect(ctx, x, 600, w, 58, 12); ctx.fill();
      ctx.strokeStyle = purple ? 'rgba(255,255,255,0.2)' : P.line;
      ctx.lineWidth = 2; ctx.stroke();
      ctx.clip();
      const reveal = (t - (a + 0.36)) * 75;
      mono(ctx, st.code, x + 22, 638, { size: 26, weight: 500, reveal, caret: reveal < len + 2 && reveal > 0 });
      ctx.restore();
    }
  });
}

/* ======================================================================= */
/* the order card                                                          */
/* ======================================================================= */
function drawCard(ctx, c) {
  const w = CARD.w, hh = CARD.hh, h = hh + c.bodyH;
  const flip = c.flip || 0;
  const fx = Math.max(0.002, Math.abs(Math.cos(Math.PI * flip)));
  const back = flip > 0.5;
  ctx.save();
  ctx.translate(c.x, c.y);
  if (c.r) ctx.rotate(c.r);
  ctx.scale(c.s * fx, c.s);
  ctx.globalAlpha *= clamp(c.a ?? 1);
  ctx.translate(-w / 2, -h / 2);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rrect(ctx, 0, 14, w, h, CARD.r); ctx.fill();

  ctx.save();
  rrect(ctx, 0, 0, w, h, CARD.r);
  ctx.clip();
  ctx.fillStyle = P.paper;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = back ? P.purpleD : P.green;
  ctx.fillRect(0, 0, w, hh);
  if (back) drawBackHeader(ctx, c); else drawFrontHeader(ctx, c);
  if (c.bodyH > 1) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, hh, w, c.bodyH); ctx.clip();
    if (back) drawBackBody(ctx, c); else drawFrontBody(ctx, c);
    ctx.restore();
  }
  if (flip > 0 && flip < 1) {
    ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - fx)})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  if (c.outline) {
    ctx.strokeStyle = c.outline[0];
    ctx.globalAlpha *= c.outline[1];
    ctx.lineWidth = 7;
    rrect(ctx, -5, -5, w + 10, h + 10, CARD.r + 5); ctx.stroke();
    ctx.globalAlpha /= c.outline[1] || 1;
  }
  if (back && c.t >= EV.draft) drawDraftBadge(ctx, c.t);
  if (c.stamp > 0) drawStamp(ctx, c);
  if (c.checkS > 0.001) {
    xf(ctx, { x: w - 62, y: hh / 2, s: c.checkS }, () => {
      ctx.fillStyle = P.yellow;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
      iconCheck(ctx, 40, P.inkText, 7, clamp(c.checkS * 1.2));
    });
  }
  ctx.restore();
}

function drawFrontHeader(ctx, c) {
  const hh = CARD.hh;
  xf(ctx, { x: 48, y: hh / 2 + 2 }, () => iconBag(ctx, 50, P.inkText, P.inkText, null));
  text(ctx, `Order ${c.num}`, 90, hh / 2 + 14, { size: 40, weight: 700, color: P.inkText, tracking: -1 });
  const la = c.labelA ?? 1;
  if (la > 0.01) {
    ctx.save();
    ctx.globalAlpha *= la * 0.62;
    mono(ctx, [['SHOPIFY', P.inkText]], CARD.w - 34, hh / 2 + 8, { size: 20, weight: 700, tracking: 2, align: 'right' });
    ctx.restore();
  }
}

function drawBackHeader(ctx, c) {
  const hh = CARD.hh;
  xf(ctx, { x: 48, y: hh / 2 }, () => iconDoc(ctx, 54, P.paper, P.purpleD));
  text(ctx, 'S00042', 90, hh / 2 + 14, { size: 40, weight: 700, color: P.paper, tracking: -1 });
  ctx.save();
  ctx.globalAlpha *= 0.62;
  mono(ctx, [['QUOTATION', P.paper]], CARD.w - 34, hh / 2 + 8, { size: 20, weight: 700, tracking: 2, align: 'right' });
  ctx.restore();
}

function avatarAL(ctx, x, y, s = 1) {
  xf(ctx, { x, y, s }, () => {
    ctx.fillStyle = P.purple;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
    text(ctx, 'AL', 0, 10, { size: 28, weight: 700, color: P.paper, align: 'center', tracking: -0.5 });
  });
}

function drawFrontBody(ctx, c) {
  const t = c.t, hh = CARD.hh, w = CARD.w;
  const ax = 70, ay = hh + 56;
  const created = t >= EV.created;

  // search highlight behind the email
  if (t >= EV.scan && t < EV.plus + 0.2) {
    const hp = E.outCubic(prog(t, EV.scan, EV.noMatch));
    const fade = 1 - prog(t, EV.noMatch + 0.1, EV.plus + 0.15);
    const col = t < EV.noMatch ? P.yellow : P.coral;
    ctx.fillStyle = rgba(col, 0.4 * fade);
    rrect(ctx, 116, hh + 64, 212 * hp, 32, 7); ctx.fill();
  }
  if (!created) {
    ctx.fillStyle = P.paper2;
    ctx.beginPath(); ctx.arc(ax, ay, 34, 0, TAU); ctx.fill();
    text(ctx, '?', ax, ay + 11, { size: 32, weight: 700, color: P.inkMuted, align: 'center' });
    ctx.fillStyle = P.paper2;
    rrect(ctx, 124, hh + 24, 200, 22, 11); ctx.fill();
  } else {
    avatarAL(ctx, ax, ay, lerp(0.3, 1, spring(t - EV.created, 0.42, 17)));
    riseText(ctx, 'Ada Lovelace', 124, hh + 48,
      { size: 32, weight: 600, tracking: -0.5, color: P.inkText, stagger: 0.02, dur: 0.5 }, t, EV.created + 0.02);
    if (t > EV.newPill) {
      const nx = 124 + textWidth(ctx, 'Ada Lovelace', 32, 600, 'sans', -0.5) + 18;
      xf(ctx, { x: nx + 34, y: hh + 37, s: spring(t - EV.newPill, 0.45, 18) }, () => {
        ctx.fillStyle = P.yellow;
        rrect(ctx, -34, -16, 68, 32, 16); ctx.fill();
        mono(ctx, [['NEW', P.inkText]], 0, 7, { size: 18, weight: 700, align: 'center', tracking: 1 });
      });
    }
  }
  mono(ctx, [['ada@example.com', P.inkMuted]], 124, hh + 88, { size: 22, weight: 500 });
  ctx.fillStyle = P.paper3;
  ctx.fillRect(36, hh + 116, w - 72, 2);

  const items = [['2×', 'Black Tee (M)'], ['1×', 'Enamel Mug']];
  const pulse = prog(t, 8.04, 8.16) * (1 - prog(t, 8.34, 8.5));
  items.forEach((it, k) => {
    const cy = hh + 162 + k * 80;
    mono(ctx, [[it[0], P.inkMuted]], 36, cy + 9, { size: 26, weight: 600 });
    text(ctx, it[1], 94, cy + 11, { size: 30, weight: 500, color: P.inkText, tracking: -0.3 });
    const sp = E.inOutCubic(prog(t, EV.dock[k] + 0.1, EV.dock[k] + 0.38));
    drawSkuChip(ctx, SKUS[k], w - 36, cy, sp, pulse, t - (EV.dock[k] + 0.24));
  });
  ctx.fillStyle = P.paper3;
  ctx.fillRect(36, hh + 320, w - 72, 2);
  text(ctx, 'Total', 36, hh + 374, { size: 28, weight: 500, color: P.inkMuted });
  text(ctx, '$64.00', w - 36, hh + 376, { size: 36, weight: 700, color: P.inkText, align: 'right', tracking: -0.5 });
}

function drawSkuChip(ctx, sku, right, cy, p, pulse, sinceMatch) {
  setFont(ctx, 22, 600, 'mono');
  const adv = ctx.measureText('M').width;
  const matched = p > 0.5;
  const extra = matched ? 30 : 0;
  const cw = sku.length * adv + 28 + extra, ch = 44;
  const cx = right - cw / 2;
  const sy = Math.max(0.02, Math.abs(Math.cos(Math.PI * p)));
  xf(ctx, { x: cx, y: cy, sy }, () => {
    if (!matched) {
      ctx.fillStyle = rgba(P.green, 0.16);
      rrect(ctx, -cw / 2, -ch / 2, cw, ch, 10); ctx.fill();
      ctx.strokeStyle = P.greenD; ctx.lineWidth = 2.5; ctx.stroke();
      mono(ctx, [[sku, P.greenD]], -cw / 2 + 14, 8, { size: 22, weight: 600 });
    } else {
      ctx.fillStyle = P.purple;
      rrect(ctx, -cw / 2, -ch / 2, cw, ch, 10); ctx.fill();
      xf(ctx, { x: -cw / 2 + 25, y: 0 }, () => iconCheck(ctx, 24, P.yellow, 4.5, clamp(sinceMatch / 0.2)));
      mono(ctx, [[sku, P.paper]], -cw / 2 + 14 + extra, 8, { size: 22, weight: 600 });
    }
  });
  if (pulse > 0) {
    ctx.strokeStyle = rgba(P.yellow, pulse);
    ctx.lineWidth = 4;
    rrect(ctx, right - cw - 7, cy - ch / 2 - 7, cw + 14, ch + 14, 15); ctx.stroke();
  }
}

function drawBackBody(ctx, c) {
  const t = c.t, hh = CARD.hh, w = CARD.w;
  avatarAL(ctx, 70, hh + 56, 1);
  text(ctx, 'Ada Lovelace', 124, hh + 48, { size: 32, weight: 600, tracking: -0.5, color: P.inkText });
  // the Shopify order number lives on in client_order_ref
  setFont(ctx, 22, 500, 'mono');
  const adv = ctx.measureText('M').width;
  const hx = 124 + 17 * adv - 4;
  const hp = E.swift(prog(t, EV.flipEnd + 0.1, EV.flipEnd + 0.45));
  ctx.fillStyle = rgba(P.yellow, 0.85);
  rrect(ctx, hx, hh + 68, (5 * adv + 8) * hp, 28, 5); ctx.fill();
  mono(ctx, [['client_order_ref ', P.inkMuted], ['#1001', P.inkText]], 124, hh + 88, { size: 22, weight: 500 });
  ctx.fillStyle = P.paper3;
  ctx.fillRect(36, hh + 116, w - 72, 2);
  const items = [['2×', 'Black Tee (M)'], ['1×', 'Enamel Mug']];
  items.forEach((it, k) => {
    const cy = hh + 162 + k * 80;
    mono(ctx, [[it[0], P.inkMuted]], 36, cy + 9, { size: 26, weight: 600 });
    text(ctx, it[1], 94, cy + 11, { size: 30, weight: 500, color: P.inkText, tracking: -0.3 });
    drawSkuChip(ctx, SKUS[k], w - 36, cy, 1, 0, 1);
  });
  ctx.fillStyle = P.paper3;
  ctx.fillRect(36, hh + 320, w - 72, 2);
  // Confirm button — the human step
  const hov = E.swift(prog(t, EV.hover, EV.hover + 0.15));
  xf(ctx, { x: 36 + 88, y: hh + 364, s: 1 + 0.05 * hov }, () => {
    ctx.fillStyle = mix(P.purple, '#8E6283', hov);
    rrect(ctx, -88, -28, 176, 56, 13); ctx.fill();
    text(ctx, 'Confirm', 0, 10, { size: 27, weight: 600, color: P.paper, align: 'center', tracking: -0.3 });
  });
  text(ctx, '$64.00', w - 36, hh + 376, { size: 36, weight: 700, color: P.inkText, align: 'right', tracking: -0.5 });
}

function drawDraftBadge(ctx, t) {
  const s = spring(t - EV.draft, 0.4, 17);
  xf(ctx, { x: CARD.w - 84, y: 2, s, r: 0.1 + wobble(t - EV.draft, 0.1, 3, 6) }, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    rrect(ctx, -76, -22, 152, 50, 12); ctx.fill();
    ctx.fillStyle = P.yellow;
    rrect(ctx, -76, -28, 152, 50, 12); ctx.fill();
    text(ctx, 'DRAFT', 0, 5, { size: 26, weight: 700, color: P.inkText, align: 'center', tracking: 3 });
  });
}

function drawStamp(ctx, c) {
  const p = c.stamp;
  const sc = lerp(2.6, 1, E.inQuart(clamp(p))) + wobble(c.t - (EV.stamp + 0.12), 0.08, 5, 9);
  xf(ctx, { x: CARD.w - 170, y: CARD.hh / 2, s: sc, r: -0.13, a: clamp(p * 3) }, () => {
    ctx.fillStyle = rgba(P.paper, 0.92);
    rrect(ctx, -150, -40, 300, 80, 12); ctx.fill();
    ctx.strokeStyle = P.coral;
    ctx.lineWidth = 6; rrect(ctx, -150, -40, 300, 80, 12); ctx.stroke();
    ctx.lineWidth = 2.5; rrect(ctx, -140, -30, 280, 60, 7); ctx.stroke();
    text(ctx, 'SKIPPED', 0, 14, { size: 40, weight: 700, color: P.coral, align: 'center', tracking: 5 });
  });
}

/* ---------- card choreography ---------- */
function miniState(k, t) {
  const L = EV.launch[k];
  if (t < L) return null;
  const slot2 = [1520, 440 + 120 * k], slot3 = [1210, 440 + 120 * k];
  const mouth = [1090, 575], ctrl = [1290, 250 + 60 * k];
  const p = prog(t, L, L + EV.flight);
  const e = E.outCubic(p);
  let x = (1 - e) * (1 - e) * mouth[0] + 2 * (1 - e) * e * ctrl[0] + e * e * slot2[0];
  let y = (1 - e) * (1 - e) * mouth[1] + 2 * (1 - e) * e * ctrl[1] + e * e * slot2[1];
  const s = lerp(0.08, 0.72, E.outBack(p));
  let r = lerp(-0.75, 0, E.outCubic(p)) + wobble(t - (L + EV.flight * 0.8), 0.05, 2.6, 6);
  const mv = E.inOutExpo(prog(t, EV.toS3 + 0.05 * k, EV.toS3 + 0.52 + 0.05 * k));
  x = lerp(x, slot3[0], mv);
  y = lerp(y, slot3[1], mv);
  r += -0.08 * Math.sin(Math.PI * mv);
  const c = { x, y, s, r, a: 1, num: ['#1000', '#1001', '#1002'][k], t, bodyH: 0, flip: 0, labelA: 1, checkS: 0, stamp: 0 };
  if (k === 0) {
    const hit = prog(t, EV.linkHit, EV.linkHit + 0.06) * (1 - prog(t, EV.eject, EV.eject + 0.2));
    if (hit > 0) c.outline = [P.coral, hit];
    c.stamp = prog(t, EV.stamp - 0.12, EV.stamp);
    const pe = prog(t, EV.eject, EV.eject + 0.55);
    c.y += 760 * E.inQuad(pe);
    c.x -= 90 * pe;
    c.r -= 0.55 * E.inQuad(pe);
    c.a = 1 - prog(t, EV.eject + 0.35, EV.eject + 0.55);
    if (pe >= 1) return null;
  } else {
    const tc = EV.checks[k - 1];
    c.checkS = t > tc ? spring(t - tc, 0.42, 18) : 0;
    c.labelA = 1 - prog(t, tc - 0.05, tc + 0.05);
  }
  if (k === 2) {
    const po = prog(t, EV.panelOut, EV.panelOut + 0.38);
    c.y += 130 * E.inBack(po);
    c.x -= 40 * po;
    c.s *= 1 - 0.2 * po;
    c.a = 1 - E.inQuad(po);
    if (po >= 1) return null;
  }
  return c;
}

function heroX(t) {
  return kf(t, [[8.0, 1380], [8.4, 1250, E.glide], [EV.s5Back, 1250], [EV.s5Back + 0.4, 1380, E.glide]]);
}

function heroState(t) {
  const c = miniState(1, t);
  if (!c) return null;
  const pe = E.inOutExpo(prog(t, EV.expand, EV.expand + 0.62));
  c.x = lerp(c.x, 1380, pe);
  c.y = lerp(c.y, 560, pe);
  c.s = lerp(c.s, 1, pe);
  c.r = lerp(c.r, 0, pe);
  c.checkS *= 1 - prog(t, EV.expand, EV.expand + 0.14);
  c.labelA = Math.max(c.labelA, prog(t, EV.expand + 0.1, EV.expand + 0.3));
  c.bodyH = CARD.bh * E.swift(prog(t, EV.expand + 0.1, EV.expand + 0.72));
  if (t >= 8.0) c.x = heroX(t);
  const fp = E.inOutCubic(prog(t, EV.flip, EV.flipEnd));
  c.flip = fp;
  c.y -= 44 * Math.sin(Math.PI * fp);
  c.s *= 1 + 0.06 * Math.sin(Math.PI * fp);
  const po = prog(t, EV.cardOut, EV.cardOut + 0.42);
  if (po >= 1) return null;
  c.y += 950 * E.inBack(po);
  c.r += 0.22 * E.inQuad(po);
  return c;
}

/* ======================================================================= */
/* stage props                                                             */
/* ======================================================================= */
function drawBag(ctx, t, layer) {
  if (t < EV.bagIn || t > EV.bagOut + 0.4) return;
  let s = spring(t - EV.bagIn, 0.42, 15);
  let r = -0.3 * (1 - spring(t - EV.bagIn, 0.35, 12));
  let sx = 1, sy = 1;
  for (const L of EV.launch) {
    const b = Math.sin(Math.PI * prog(t, L - 0.04, L + 0.16));
    sx += 0.07 * b; sy -= 0.11 * b;
  }
  const po = prog(t, EV.bagOut, EV.bagOut + 0.3);
  s *= 1 - E.inBack(po);
  r += 0.4 * po;
  if (s <= 0.001) return;
  const bx = 1090, by = 600, S = 250;
  ctx.save();
  ctx.translate(bx, by + S * 0.46);
  ctx.rotate(r);
  ctx.scale(s * sx, s * sy);
  ctx.translate(0, -S * 0.46);
  if (layer === 'back') {
    ctx.strokeStyle = P.greenD;
    ctx.lineWidth = S * 0.075;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -S * 0.2 + S * 0.02, S * 0.19, Math.PI, 0);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    polyRound(ctx, [[-S * 0.37, -S * 0.2 + 14], [S * 0.37, -S * 0.2 + 14], [S * 0.41, S * 0.46 + 14], [-S * 0.41, S * 0.46 + 14]], S * 0.07);
    ctx.fill();
    iconBag(ctx, S, P.green, 'rgba(0,0,0,0)', P.greenL);
    // a little "new order" glint
    xf(ctx, { x: 0, y: S * 0.14 }, () => {
      ctx.fillStyle = P.inkText;
      ctx.beginPath(); ctx.arc(-S * 0.1, 0, S * 0.028, 0, TAU); ctx.arc(S * 0.1, 0, S * 0.028, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.inkText; ctx.lineWidth = S * 0.028; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, S * 0.03, S * 0.07, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    });
    text(ctx, 'Shopify', 0, S * 0.46 + 70, { size: 38, weight: 700, color: P.green, align: 'center', tracking: -1 });
    // "3 new orders" notification badge, counting down as each order flies out
    const left = 3 - EV.launch.filter(L => t >= L + 0.02).length;
    const bs = spring(t - 2.26, 0.4, 18) * (1 - E.inBack(prog(t, EV.launch[2], EV.launch[2] + 0.16)));
    if (t > 2.26 && bs > 0.001) {
      const tick = Math.max(...EV.launch.map(L => (t >= L ? Math.sin(Math.PI * prog(t, L, L + 0.14)) : 0)));
      xf(ctx, { x: S * 0.38, y: -S * 0.2, s: bs * (1 + 0.18 * tick) }, () => {
        ctx.fillStyle = P.coral;
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
        ctx.strokeStyle = P.ink; ctx.lineWidth = 5; ctx.stroke();
        text(ctx, String(Math.max(1, left)), 0, 12, { size: 34, weight: 700, color: P.paper, align: 'center' });
      });
    }
  }
  ctx.restore();
}

function drawOdooPanel(ctx, t) {
  if (t < EV.panelIn || t > EV.panelOut + 0.4) return;
  const x = tw(t, EV.panelIn, EV.panelIn + 0.45, 2160, 1690) + tw(t, EV.panelOut, EV.panelOut + 0.35, 0, 560, E.inExpo);
  const y = 560, w = 250, h = 270;
  xf(ctx, { x, y }, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    rrect(ctx, -w / 2, -h / 2 + 14, w, h, 22); ctx.fill();
    ctx.fillStyle = P.ink2;
    rrect(ctx, -w / 2, -h / 2, w, h, 22); ctx.fill();
    ctx.strokeStyle = P.purple; ctx.lineWidth = 3; ctx.stroke();
    text(ctx, 'Odoo', -w / 2 + 26, -h / 2 + 54, { size: 34, weight: 700, color: P.purpleL, tracking: -1 });
    mono(ctx, [['imported', P.muted]], -w / 2 + 26, -h / 2 + 86, { size: 18, weight: 500 });
    ['#998', '#999', '#1000'].forEach((ref, i) => {
      const ry = -h / 2 + 136 + i * 46;
      const ap = E.swift(prog(t, EV.panelIn + 0.14 + i * 0.06, EV.panelIn + 0.54 + i * 0.06));
      const hit = i === 2 ? prog(t, EV.linkHit, EV.linkHit + 0.06) : 0;
      xf(ctx, { x: (1 - ap) * 40, a: ap }, () => {
        if (hit > 0) {
          ctx.fillStyle = rgba(P.coral, 0.22 * hit);
          rrect(ctx, -w / 2 + 12, ry - 29, w - 24, 40, 9); ctx.fill();
        }
        const col = hit > 0.5 ? P.coral : P.paper;
        ctx.fillStyle = hit > 0.5 ? P.coral : P.purpleL;
        ctx.beginPath(); ctx.arc(-w / 2 + 34, ry - 9, 5, 0, TAU); ctx.fill();
        mono(ctx, [[ref, col]], -w / 2 + 52, ry, { size: 26, weight: 600 });
      });
    });
  });
}

function drawLink1000(ctx, t) {
  if (t < EV.link || t > EV.eject + 0.3) return;
  const pts = bezierPts([1450, 440], [1530, 440], [1500, 638], [1574, 638], 36);
  const p = E.swift(prog(t, EV.link, EV.linkHit));
  const fade = 1 - prog(t, EV.eject - 0.05, EV.eject + 0.15);
  const col = t < EV.linkHit ? P.yellow : P.coral;
  ctx.save();
  ctx.globalAlpha *= fade;
  ctx.strokeStyle = col;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.setLineDash([2, 12]);
  strokePartial(ctx, pts, p);
  ctx.setLineDash([]);
  const hp = pointAt(pts, p);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(hp[0], hp[1], 9, 0, TAU); ctx.fill();
  ctx.restore();
  ring(ctx, t, EV.linkHit, 1574, 629, { color: P.coral, r0: 10, r1: 60, lw: 5, dur: 0.4 });
}

function drawLens(ctx, t) {
  if (t < EV.lensIn || t > EV.plus + 0.14) return;
  const pin = E.swift(prog(t, EV.lensIn, EV.scan));
  let x = lerp(1880, 1236, pin), y = lerp(1060, 487, pin);
  x += 128 * E.inOutSine(prog(t, EV.scan, EV.noMatch));
  x += wobble(t - EV.noMatch, 16, 7, 7);
  const pm = E.inOutCubic(prog(t, EV.plus - 0.1, EV.plus + 0.08));
  x = lerp(x, 1130, pm); y = lerp(y, 466, pm);
  const s = 1 - E.inBack(prog(t, EV.plus - 0.04, EV.plus + 0.12));
  const r = lerp(0.6, 0, pin) + wobble(t - EV.noMatch, 0.14, 7, 7);
  const col = mix(P.yellow, P.coral, prog(t, EV.noMatch, EV.noMatch + 0.06));
  if (s > 0.001) {
    xf(ctx, { x, y, s, r }, () => {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.arc(4, 12, 40, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(col, 0.16);
      ctx.beginPath(); ctx.arc(0, 0, 38, 0, TAU); ctx.fill();
      iconLens(ctx, 126, col, 11);
    });
  }
  // status tag riding with the lens
  const la = E.swift(prog(t, EV.scan - 0.05, EV.scan + 0.12)) * (1 - prog(t, EV.plus - 0.12, EV.plus));
  if (la > 0.01) {
    const miss = t >= EV.noMatch;
    const segs = miss ? [['0 results', P.coral]] : [['searching…', P.paper]];
    xf(ctx, { x: x + 62, y: y - 16, a: la }, () => chipLabel(ctx, segs, 0, 0, 20));
  }
}

function chipLabel(ctx, segs, x, y, size) {
  setFont(ctx, size, 600, 'mono');
  const adv = ctx.measureText('M').width;
  const len = segs.reduce((n, s) => n + s[0].length, 0);
  const w = len * adv + 28, h = size + 22;
  ctx.fillStyle = P.ink;
  rrect(ctx, x, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = rgba(P.paper, 0.18); ctx.lineWidth = 2; ctx.stroke();
  mono(ctx, segs, x + 14, y + size * 0.36, { size, weight: 600 });
}

function drawPlus(ctx, t) {
  if (t >= EV.plus && t < EV.created + 0.22) {
    const s = spring(t - EV.plus, 0.4, 20) * (1 - E.inBack(prog(t, EV.created - 0.02, EV.created + 0.18)));
    const sq = Math.sin(Math.PI * prog(t, EV.created - 0.16, EV.created));
    if (s > 0.001) xf(ctx, { x: 1130, y: 466, sx: s * (1 + 0.16 * sq), sy: s * (1 - 0.16 * sq) }, () => {
      ctx.fillStyle = P.yellow;
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.inkText; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.moveTo(0, -15); ctx.lineTo(0, 15); ctx.stroke();
    });
  }
  ring(ctx, t, EV.created, 1130, 466, { color: P.yellow, r0: 34, r1: 120, lw: 7, dur: 0.5 });
  burst(ctx, t, EV.created, 1130, 466, { seed: 7, count: 16, colors: [P.yellow, P.purpleL, P.green, P.paper], speed: 640, size: 12, life: 0.6 });
}

function drawTiles(ctx, t) {
  for (let k = 0; k < 2; k++) {
    const tin = EV.tiles[k], dock = EV.dock[k];
    if (t < tin || t > dock + 0.42) continue;
    const cx = heroX(t);
    const rowY = 560 - 250 + CARD.hh + 162 + k * 80;
    const dockX = cx + 320 + 34 + 125;
    let x = lerp(2120, dockX, E.swift(prog(t, tin, dock)));
    const pm = E.inOutCubic(prog(t, dock + 0.08, dock + 0.32));
    const chipX = cx + 320 - 36 - 82;
    x = lerp(x, chipX, pm);
    const s = lerp(1, 0.64, pm);
    const a = 1 - prog(t, dock + 0.24, dock + 0.34);
    // plug line
    const plug = prog(t, dock - 0.06, dock) * (1 - prog(t, dock + 0.06, dock + 0.16));
    if (plug > 0) {
      ctx.save();
      ctx.strokeStyle = rgba(P.yellow, plug);
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + 290, rowY); ctx.lineTo(dockX - 125, rowY); ctx.stroke();
      ctx.restore();
    }
    xf(ctx, { x, y: rowY, s, a }, () => {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      rrect(ctx, -125, -32 + 10, 250, 64, 14); ctx.fill();
      ctx.fillStyle = P.purple;
      rrect(ctx, -125, -32, 250, 64, 14); ctx.fill();
      ctx.strokeStyle = P.purpleL; ctx.lineWidth = 2; ctx.stroke();
      xf(ctx, { x: -90, y: 0 }, () => iconTag(ctx, 44, P.paper, P.purple));
      mono(ctx, [[SKUS[k], P.paper]], -60, 8, { size: 22, weight: 600 });
    });
    ring(ctx, t, dock, cx + 320, rowY, { color: P.yellow, r0: 8, r1: 80, lw: 6, dur: 0.42 });
    burst(ctx, t, dock, cx + 320, rowY, { seed: 20 + k, count: 12, colors: [P.yellow, P.purpleL, P.paper], speed: 800, size: 10, life: 0.55 });
  }
  // tiny "odoo product" caption above the incoming tiles
  const ca = E.swift(prog(t, EV.tiles[0], EV.tiles[0] + 0.3)) * (1 - prog(t, EV.dock[1] + 0.2, EV.dock[1] + 0.4));
  if (ca > 0.01) {
    const cx = heroX(t) + 320 + 34 + 125;
    ctx.save();
    ctx.globalAlpha *= ca;
    mono(ctx, [['odoo products', P.purpleL]], cx - 125, 500, { size: 20, weight: 600 });
    ctx.restore();
  }
}

function drawCursor(ctx, t) {
  if (t < EV.cursorIn || t > EV.cardOut + 0.3) return;
  const p = E.swift(prog(t, EV.cursorIn, EV.hover + 0.02));
  let x = lerp(1990, 1190, p) - 50 * Math.sin(Math.PI * p);
  let y = lerp(1120, 782, p) + 24 * Math.sin(Math.PI * p);
  const out = prog(t, EV.cardOut - 0.02, EV.cardOut + 0.28);
  x += 260 * E.inQuad(out); y += 380 * E.inQuad(out);
  ring(ctx, t, EV.click, 1184, 774, { color: P.yellow, r0: 30, r1: 130, lw: 6, dur: 0.55 });
  xf(ctx, { x, y, a: 1 - out }, () => iconCursor(ctx, 58, P.paper, P.inkText));
  const la = E.swift(prog(t, EV.hover + 0.06, EV.hover + 0.3)) * (1 - prog(t, EV.cardOut - 0.06, EV.cardOut + 0.08));
  if (la > 0.01) {
    xf(ctx, { x: x + 52, y: y + 84, a: la, s: lerp(0.85, 1, la) }, () =>
      chipLabel(ctx, [['you review ', P.paper], ['→', P.yellow], [' confirm', P.paper]], 0, 0, 24));
  }
}

function drawStage(ctx, t) {
  const [sx, sy] = shake(t, EV.stamp, 8, 0.3);
  ctx.save();
  ctx.translate(sx, sy);
  drawBag(ctx, t, 'back');
  drawOdooPanel(ctx, t);
  drawLink1000(ctx, t);
  for (const k of [0, 2]) { const c = miniState(k, t); if (c) drawCard(ctx, c); }
  const hero = heroState(t);
  if (hero) drawCard(ctx, hero);
  drawBag(ctx, t, 'front');
  ctx.restore();
  impact(ctx, t, EV.stamp, 1318, 440, { color: P.coral, r0: 70, r1: 150, ex: 1.7, ey: 0.75, count: 12, lw: 6, dur: 0.32, rot: 0.26 });
  drawLens(ctx, t);
  drawPlus(ctx, t);
  drawTiles(ctx, t);
  burst(ctx, t, EV.flipEnd, 1380, 330, { seed: 42, count: 34, colors: [P.yellow, P.green, P.paper, P.purpleL], speed: 1700, size: 15, life: 1.1, angle: -Math.PI / 2, spread: Math.PI * 1.1, gravity: 1100 });
  drawCursor(ctx, t);
}

/* ======================================================================= */
/* end card                                                                */
/* ======================================================================= */
const NODES = [
  { label: 'fetch', color: P.green, icon: (ctx, c) => iconBag(ctx, 60, c, c, null) },
  { label: 'dedupe', color: P.coral, icon: (ctx, c) => iconSkip(ctx, 62, c) },
  { label: 'customer', color: P.yellow, icon: (ctx, c) => iconPerson(ctx, 58, c) },
  { label: 'sku', color: P.yellow, icon: (ctx, c) => iconTag(ctx, 60, c, P.ink2) },
  { label: 'quote', color: P.purpleL, icon: (ctx, c) => iconDoc(ctx, 60, c, P.ink2) },
];

function drawEnd(ctx, t) {
  if (t < EV.sub - 0.05) return;
  const k = outroK(t);
  if (k <= 0.002) return;
  ctx.save();
  ctx.translate(CENTER[0], CENTER[1]); ctx.scale(k, k); ctx.translate(-CENTER[0], -CENTER[1]);

  riseText(ctx, 'Order Connector', 960, 522, { size: 64, weight: 500, tracking: -1.5, color: P.paper, align: 'center', stagger: 0.018, dur: 0.6 }, t, EV.sub);

  // pipeline recap
  const y = 676, x0 = 540, dx = 210, x1 = x0 + dx * 4;
  const lp = E.glide(prog(t, EV.pipe, EV.pipe + 0.72));
  ctx.lineCap = 'round';
  ctx.strokeStyle = P.line; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, E.swift(prog(t, EV.pipe - 0.1, EV.pipe + 0.4))), y); ctx.stroke();
  ctx.strokeStyle = P.yellow; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, lp), y); ctx.stroke();
  if (t > EV.pipe + 0.72) {
    for (let n = 0; n < 6; n++) {
      const u = ((t - EV.pipe) * 0.55 + n / 6) % 1;
      ctx.fillStyle = rgba(P.yellow, Math.sin(Math.PI * u));
      ctx.fillRect(lerp(x0, x1, u) - 6, y - 6, 12, 12);
    }
  }
  NODES.forEach((n, i) => {
    const tn = EV.pipe + 0.06 + i * 0.13;
    const s = spring(t - tn, 0.42, 16);
    if (s <= 0.001) return;
    const nx = x0 + dx * i;
    xf(ctx, { x: nx, y, s }, () => {
      ctx.fillStyle = P.ink2;
      ctx.beginPath(); ctx.arc(0, 0, 58, 0, TAU); ctx.fill();
      ctx.strokeStyle = n.color; ctx.lineWidth = 4; ctx.stroke();
      n.icon(ctx, n.color);
    });
    const la = E.swift(prog(t, tn + 0.08, tn + 0.45));
    ctx.save();
    ctx.globalAlpha *= la;
    mono(ctx, [[n.label, P.muted]], nx, y + 100 + (1 - la) * 14, { size: 22, weight: 500, align: 'center' });
    ctx.restore();
  });

  // stack tags
  const tags = ['Python', 'Shopify Admin API', 'Odoo XML-RPC'];
  setFont(ctx, 22, 500, 'mono');
  const adv = ctx.measureText('M').width;
  const widths = tags.map(s => s.length * adv + 44);
  let tx = 960 - (widths.reduce((a, b) => a + b, 0) + 18 * (tags.length - 1)) / 2;
  tags.forEach((tag, i) => {
    const s = spring(t - (EV.tags + i * 0.08), 0.45, 16);
    const w = widths[i];
    if (s > 0.001) xf(ctx, { x: tx + w / 2, y: 872, s }, () => {
      ctx.fillStyle = P.ink2;
      rrect(ctx, -w / 2, -24, w, 48, 24); ctx.fill();
      ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = [P.yellow, P.green, P.purpleL][i];
      ctx.beginPath(); ctx.arc(-w / 2 + 20, 0, 5, 0, TAU); ctx.fill();
      mono(ctx, [[tag, P.paper]], -w / 2 + 32, 8, { size: 22, weight: 500 });
    });
    tx += w + 18;
  });
  // repo footer
  const fa = E.swift(prog(t, EV.tags + 0.35, EV.tags + 0.8));
  if (fa > 0.01) {
    ctx.save();
    ctx.globalAlpha *= fa;
    mono(ctx, [['github.com/', P.muted], ['mateuszkrw-coder', P.paper], ['/shopify-odoo-connector', P.muted]],
      960, 1012 + (1 - fa) * 12, { size: 20, weight: 500, align: 'center' });
    ctx.restore();
  }
  ctx.restore();
}

function drawLoopDot(ctx, t) {
  if (t < EV.outro + 0.26) return;
  const s = lerp(spring(t - (EV.outro + 0.26), 0.5, 20), 1, prog(t, 14.9, 15));
  ctx.fillStyle = P.yellow;
  ctx.beginPath(); ctx.arc(CENTER[0], CENTER[1], 13 * s, 0, TAU); ctx.fill();
}

/* ======================================================================= */
/* HUD: step dots, terminal output, timecode, progress                      */
/* ======================================================================= */
function drawHUD(ctx, t) {
  const a = prog(t, 1.85, 2.25) * (1 - prog(t, 11.86, 12.12));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  // step dots
  const acts = [0, 1, 2, 3, 4].map(i => {
    const s0 = 2 + 2 * i;
    return E.inOutCubic(prog(t, s0 - 0.12, s0 + 0.18) * (1 - prog(t, s0 + 1.88, s0 + 2.18)));
  });
  const ws = acts.map(v => lerp(12, 48, v));
  let x = 1800 - (ws.reduce((p, q) => p + q, 0) + 14 * 4);
  acts.forEach((v, i) => {
    const done = t > 2 + 2 * i + 2.0;
    ctx.fillStyle = mix(done ? mix(P.paper, P.ink, 0.35) : mix(P.paper, P.ink, 0.72), P.yellow, v);
    rrect(ctx, x, 73, ws[i], 12, 6); ctx.fill();
    x += ws[i] + 14;
  });
  // timecode
  const ss = Math.floor(t), ff = Math.floor((t % 1) * 30);
  mono(ctx, [['● ', P.coral], [`00:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, onPurple(t) ? mix(P.paper, P.purple, 0.35) : P.muted]],
    1800, 1012, { size: 20, weight: 500, align: 'right' });
  // progress
  ctx.fillStyle = P.yellow;
  ctx.fillRect(0, H - 6, W * (t / DUR), 6);
  ctx.restore();
  drawTerminal(ctx, t, a);
}

function drawTerminal(ctx, t, a) {
  const LB = 1012, LH = 36;
  let newest = -1;
  LOG.forEach((L, j) => { if (t >= L.t) newest = j; });
  LOG.forEach((L, j) => {
    if (t < L.t) return;
    let up = 0;
    for (let m = j + 1; m < LOG.length; m++) up += E.swift(prog(t, LOG[m].t, LOG[m].t + 0.32));
    const age = Math.max(0, 1 - 0.3 * up) * (1 - prog(up, 2.6, 3.2));
    if (age <= 0.01) return;
    const fresh = E.swift(prog(t, L.t, L.t + 0.22));
    const reveal = (t - L.t) * L.cps;
    const len = L.segs.reduce((n, s) => n + s[0].length, 0);
    const blink = Math.floor(t * 2.6) % 2 === 0;
    ctx.save();
    ctx.globalAlpha *= a * age * fresh;
    mono(ctx, L.segs, 120, LB - up * LH + (1 - fresh) * 14, {
      size: 22, weight: 500, reveal, caret: j === newest && (reveal < len || blink),
    });
    ctx.restore();
  });
}

/* ======================================================================= */
function drawFrame(ctx, tRaw) {
  const t = ((tRaw % DUR) + DUR) % DUR;
  ctx.save();
  drawBackground(ctx, t);
  drawSteps(ctx, t);
  drawStage(ctx, t);
  drawEnd(ctx, t);
  drawTitleGroup(ctx, t);
  drawLoopDot(ctx, t);
  drawHUD(ctx, t);
  ctx.restore();
  if (window.DEBUG) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W / 2 - 90, 0, 180, 40);
    mono(ctx, [[t.toFixed(3) + 's', '#ffffff']], W / 2, 28, { size: 22, align: 'center' });
  }
}

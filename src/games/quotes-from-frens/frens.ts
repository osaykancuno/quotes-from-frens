// The cast of QUOTES FROM FRENS: original characters drawn in the JPEG Frens manner (flat color, thick ink line, big heads),
// as busts centred on (x, y) at scale `s`; `t` (seconds) animates them. Pure canvas drawing, no image: the game's
// wall posters, its end card and the promo film all draw from here.
export const CAST = ['hodl', 'webhead', 'captain', 'panic', 'native', 'melty', 'burn', 'ethfur', 'nofud', 'pumpkin'] as const;
export type CastName = (typeof CAST)[number];

const INK = '#0B0B0B', CHALK = '#F2F0EB', PINK = '#ff4fa3', ORANGE = '#ff8a2a', YELLOW = '#ffd23f', SKY = '#3fa9f5',
  PURPLE = '#a46cff', RED = '#e8344e', BLOND = '#f0d27a', GREEN_TEE = '#c6f432';
const AN = 'Anton, Impact, "Arial Narrow", sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';

type G = CanvasRenderingContext2D;
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const circle = (g: G, x: number, y: number, r: number): void => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); };
const oval = (g: G, x: number, y: number, rx: number, ry: number, rot = 0): void => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
function fs(g: G, fill: string, lw = 3): void { g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(); }
function label(g: G, s: string, x: number, y: number, size: number, col: string, font = AN, rot = 0): void {
  g.save(); g.translate(x, y); g.rotate(rot); g.font = `${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(s, 0, 0); g.restore();
}
/** Shoulders and chest: a rounded bust from y = 6 down to y = 72. */
function bust(g: G, fill: string, w = 38): void {
  g.beginPath(); g.moveTo(-w, 72); g.quadraticCurveTo(-w - 2, 10, 0, 6); g.quadraticCurveTo(w + 2, 10, w, 72); g.closePath(); fs(g, fill);
}
/** A wide grin with a row of teeth (the scenes' signature mouth). */
function grin(g: G, y: number, w: number, open = 10): void {
  g.beginPath(); g.moveTo(-w, y); g.quadraticCurveTo(0, y + open + 14, w, y); g.quadraticCurveTo(0, y + 6, -w, y); g.closePath(); fs(g, '#7a1030', 3);
  g.fillStyle = CHALK; g.fillRect(-w * 0.75, y + 1, w * 1.5, 5);
  g.strokeStyle = INK; g.lineWidth = 1.2; for (let i = -w * 0.6; i <= w * 0.6; i += w * 0.3) { g.beginPath(); g.moveTo(i, y + 1); g.lineTo(i, y + 6); g.stroke(); }
}

const DRAW: Record<CastName, (g: G, t: number) => void> = {
  /** Pink round head, HODL glasses, big grin, orange hoodie, party hat. */
  hodl(g, t) {
    bust(g, ORANGE, 34);
    g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(-7, 12); g.lineTo(-8, 30); g.moveTo(7, 12); g.lineTo(8, 30); g.stroke();
    circle(g, 0, -24, 30); fs(g, PINK); circle(g, -30, -22, 6); fs(g, PINK, 2); circle(g, 30, -22, 6); fs(g, PINK, 2);
    rr(g, -27, -42, 24, 17, 5); fs(g, YELLOW); rr(g, 3, -42, 24, 17, 5); fs(g, YELLOW);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-25, -40, 20, 12); g.fillRect(5, -40, 20, 12);
    label(g, 'HO', -15, -33.5, 13, SKY); label(g, 'DL', 15, -33.5, 13, RED);
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(-3, -36); g.lineTo(3, -36); g.stroke();
    grin(g, -16, 17);
    g.beginPath(); g.moveTo(-14, -50); g.lineTo(4, -92); g.lineTo(18, -48); g.closePath(); fs(g, SKY);
    g.fillStyle = CHALK; for (const [dx, dy] of [[0, -62], [8, -72], [-4, -76], [8, -58]] as const) { circle(g, dx, dy, 2.2); g.fill(); }
    circle(g, 4, -94 + Math.sin(t * 6) * 1.5, 5); fs(g, CHALK, 2);
  },
  /** Blue box head, black spiky crest, a VR visor that reads NO FLOOR, headphones, red plaid shirt. */
  webhead(g, t) {
    bust(g, '#c8302f', 38);
    g.strokeStyle = 'rgba(11,11,11,0.45)'; g.lineWidth = 2;
    for (let x = -30; x <= 30; x += 10) { g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 72); g.stroke(); }
    for (let y = 24; y <= 68; y += 12) { g.beginPath(); g.moveTo(-36, y); g.lineTo(36, y); g.stroke(); }
    rr(g, -10, 6, 20, 10, 3); fs(g, '#3a7fd0', 2);
    g.beginPath(); g.moveTo(-18, -66); g.lineTo(-12, -92); g.lineTo(-4, -70); g.lineTo(2, -98); g.lineTo(8, -70); g.lineTo(16, -90); g.lineTo(20, -64); g.closePath(); fs(g, '#1a1a1a');
    rr(g, -30, -70, 60, 72, 9); fs(g, '#3f8ff0');
    g.beginPath(); g.arc(0, -40, 40, Math.PI * 1.05, Math.PI * 1.95); g.lineWidth = 7; g.strokeStyle = INK; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#2b5fb8'; g.stroke();
    for (const sd of [-1, 1]) { rr(g, sd * 34 - 9, -46, 18, 26, 7); fs(g, '#2b5fb8'); }
    rr(g, -28, -54, 56, 22, 7); fs(g, '#15161c');
    const glow = 0.75 + 0.25 * Math.sin(t * 5);
    g.globalAlpha = glow; label(g, 'NO FLOOR', 0, -43, 10, '#7ff0e0', MONO); g.globalAlpha = 1;
    oval(g, 0, -14, 15, 9); fs(g, '#d0283c', 3);
    rr(g, -10, -18, 20, 8, 2); fs(g, CHALK, 1.5);
    g.strokeStyle = INK; g.lineWidth = 1.2; for (let i = -5; i <= 5; i += 5) { g.beginPath(); g.moveTo(i, -18); g.lineTo(i, -10); g.stroke(); }
  },
  /** One big LFG eye in a lumpy head, thick pink lips, a captain's hat, a sailor shirt. */
  captain(g, t) {
    bust(g, CHALK, 38);
    g.save(); g.beginPath(); g.moveTo(-38, 72); g.quadraticCurveTo(-40, 10, 0, 6); g.quadraticCurveTo(40, 10, 38, 72); g.closePath(); g.clip();
    g.fillStyle = '#2b4a8c'; for (let y = 20; y < 72; y += 12) g.fillRect(-40, y, 80, 5); g.restore();
    g.beginPath(); g.moveTo(-14, 8); g.lineTo(0, 26); g.lineTo(14, 8); g.closePath(); fs(g, RED, 2.5);
    oval(g, 0, -24, 32, 36); fs(g, '#8a7a55');
    g.fillStyle = 'rgba(11,11,11,0.18)'; for (const [dx, dy] of [[-18, -6], [16, -30], [20, 2], [-10, -40]] as const) { circle(g, dx, dy, 2.5); g.fill(); }
    circle(g, 0, -30, 16); fs(g, CHALK); circle(g, 0, -30, 11); fs(g, '#13202c', 2);
    label(g, 'LFG', 0, -30, 8, '#7fd7ff', MONO);
    const blink = Math.sin(t * 2.3) > 0.97;
    if (blink) { g.fillStyle = '#8a7a55'; circle(g, 0, -30, 17); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(-15, -30); g.lineTo(15, -30); g.stroke(); }
    oval(g, 0, -4, 15, 8); fs(g, '#f27aa0'); g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(-12, -4); g.lineTo(12, -4); g.stroke();
    g.beginPath(); g.moveTo(-34, -52); g.quadraticCurveTo(0, -60, 34, -52); g.lineTo(30, -46); g.quadraticCurveTo(0, -52, -30, -46); g.closePath(); fs(g, '#1a1a1a');
    g.beginPath(); g.moveTo(-28, -54); g.quadraticCurveTo(-30, -84, 0, -86); g.quadraticCurveTo(30, -84, 28, -54); g.closePath(); fs(g, CHALK);
    g.strokeStyle = '#d4a72c'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -78); g.lineTo(0, -62); g.moveTo(-6, -72); g.lineTo(6, -72); g.stroke();
    g.beginPath(); g.arc(0, -66, 6, 0.2, Math.PI - 0.2); g.stroke();
  },
  /** A chalk-white face, black spiky tufts at the sides, tired yellow eyes, a neon tee: EVERYBODY PANIC. */
  panic(g, t) {
    bust(g, GREEN_TEE, 38);
    label(g, 'EVERYBODY', 0, 34, 9, RED, AN); label(g, 'PANIC', 0, 45, 11, RED, AN);
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(sd * 22, -50);
      for (let i = 0; i < 6; i++) { const a = -1.2 + i * 0.45; g.lineTo(sd * (26 + Math.cos(a) * 26 + (i % 2) * 8), -34 + Math.sin(a) * 26); }
      g.lineTo(sd * 22, -14); g.closePath(); fs(g, '#1a1a1a');
    }
    circle(g, 0, -28, 30); fs(g, '#f4f2ec');
    const look = Math.sin(t * 1.4) * 1.5;
    for (const ex of [-12, 12]) { oval(g, ex, -32, 9, 7); fs(g, '#1a1a1a', 2); g.fillStyle = YELLOW; oval(g, ex + look, -31, 4, 2.6); g.fill(); g.fillStyle = '#f4f2ec'; g.fillRect(ex - 10, -41, 20, 5); }
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(-12, -6); g.quadraticCurveTo(0, -14, 12, -6); g.stroke();
    g.strokeStyle = '#c03040'; g.lineWidth = 2; g.beginPath(); g.moveTo(-10, -7); g.quadraticCurveTo(0, -13, 10, -7); g.stroke();
  },
  /** A pink grinning devil of a native: blond swept hair scrawled STAY HUNGRY, a cigar, IMMORTAL GAINS tee. */
  native(g, t) {
    bust(g, CHALK, 38);
    label(g, 'IMMORTAL', 0, 34, 10, INK, AN); label(g, 'GAINS', 0, 46, 10, INK, AN);
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 24, -36); g.lineTo(sd * 40, -54); g.lineTo(sd * 28, -20); g.closePath(); fs(g, '#f06aa8'); }
    oval(g, 0, -26, 27, 33); fs(g, '#f06aa8');
    g.beginPath(); g.moveTo(-28, -36); g.quadraticCurveTo(-34, -72, 2, -70); g.quadraticCurveTo(36, -72, 30, -36); g.quadraticCurveTo(14, -54, -6, -48); g.quadraticCurveTo(-18, -44, -28, -36); g.closePath(); fs(g, BLOND);
    label(g, 'STAY HUNGRY', 2, -58, 9, INK, AN, -0.12);
    for (const ex of [-10, 10]) { oval(g, ex, -30, 6, 3); fs(g, '#f3e07a', 2); g.fillStyle = INK; g.fillRect(ex - 7, -34, 14, 2.5); }
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(-12, -12); g.quadraticCurveTo(2, -4, 14, -14); g.stroke();
    g.fillStyle = CHALK; g.beginPath(); g.moveTo(-8, -10); g.lineTo(-6, -5); g.lineTo(-4, -9); g.fill();
    g.save(); g.translate(12, -11); g.rotate(-0.25); rr(g, 0, -3, 24, 7, 3); fs(g, '#7a4a2a', 2); g.fillStyle = ORANGE; g.fillRect(22, -2, 3, 5); g.restore();
    g.strokeStyle = 'rgba(242,240,235,0.6)'; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i < 5; i++) { const y = -18 - i * 8 - (t * 20) % 8, x = 40 + Math.sin(t * 3 + i) * 4; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
  },
  /** An orange blob melting in the heat: big round eyes, sweat, an ice-cream cone upside down on its head. */
  melty(g, t) {
    g.beginPath(); g.moveTo(-36, 72);
    for (let x = -36; x < 36; x += 12) g.quadraticCurveTo(x + 6, 72 + 6 + Math.sin(t * 3 + x) * 3, x + 12, 72);
    g.lineTo(34, 10); g.quadraticCurveTo(36, -62, 0, -62); g.quadraticCurveTo(-36, -62, -34, 10); g.closePath(); fs(g, '#f5a524');
    g.fillStyle = 'rgba(11,11,11,0.35)'; g.font = `7px ${MONO}`; g.textAlign = 'center'; g.save(); g.translate(-2, -48); g.rotate(-0.12); g.fillText('here for', 0, -4); g.fillText('the JPEGs', 0, 5); g.restore();
    for (const ex of [-13, 13]) { circle(g, ex, -26, 12); fs(g, CHALK); circle(g, ex + 2, -24, 5); g.fillStyle = INK; g.fill(); }
    oval(g, 0, 2, 14, 11); fs(g, '#7a1a20');
    g.fillStyle = CHALK; g.fillRect(-8, -7, 4, 5); g.fillRect(4, -7, 4, 5);
    g.fillStyle = '#c84a30'; oval(g, -2, 12, 4, 6); g.fill();
    g.fillStyle = '#9fd8f5'; for (const [dx, dy] of [[-28, -30], [26, -40], [30, -10]] as const) { const d = (t * 30 + dx) % 20; oval(g, dx, dy + d, 3, 5); g.fill(); }
    g.beginPath(); g.moveTo(-8, -56); g.lineTo(10, -56); g.lineTo(2, -88); g.closePath(); fs(g, '#e0b06a', 2.5);
    g.strokeStyle = 'rgba(11,11,11,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-4, -60); g.lineTo(6, -74); g.moveTo(6, -60); g.lineTo(-1, -70); g.stroke();
    g.beginPath(); g.moveTo(-14, -58); g.quadraticCurveTo(1, -48, 16, -58); g.quadraticCurveTo(14, -66, 1, -64); g.quadraticCurveTo(-12, -66, -14, -58); g.closePath(); fs(g, '#f37fb0', 2.5);
  },
  /** A pink skull with lightning eyes and a blond mullet, holding a torch: the BURN one. */
  burn(g, t) {
    bust(g, '#8c3a7a', 36);
    g.fillStyle = '#2a9d8f'; g.fillRect(-36, 30, 72, 10);
    g.beginPath(); g.moveTo(-34, -34); g.quadraticCurveTo(-42, 8, -30, 26); g.lineTo(30, 26); g.quadraticCurveTo(42, 8, 34, -34); g.closePath(); fs(g, BLOND, 2.5);
    oval(g, 0, -24, 28, 33); fs(g, '#f06aa8');
    g.beginPath(); g.moveTo(-30, -40); g.quadraticCurveTo(0, -70, 30, -40); g.quadraticCurveTo(0, -54, -30, -40); g.closePath(); fs(g, BLOND, 2.5);
    for (const ex of [-11, 11]) {
      circle(g, ex, -26, 9); fs(g, INK, 2);
      g.beginPath(); g.moveTo(ex + 2, -33); g.lineTo(ex - 3, -25); g.lineTo(ex + 1, -25); g.lineTo(ex - 2, -18); g.lineTo(ex + 4, -28); g.lineTo(ex, -28); g.closePath();
      g.fillStyle = Math.sin(t * 8 + ex) > 0 ? YELLOW : '#fff3a0'; g.fill();
    }
    g.beginPath(); g.moveTo(-3, -12); g.lineTo(3, -12); g.lineTo(0, -8); g.closePath(); g.fillStyle = INK; g.fill();
    rr(g, -14, -6, 28, 12, 3); fs(g, CHALK, 2.5); g.strokeStyle = INK; g.lineWidth = 1.5; for (let i = -7; i <= 7; i += 7) { g.beginPath(); g.moveTo(i, -6); g.lineTo(i, 6); g.stroke(); }
    label(g, 'BURN', 0, -82, 22, INK, AN, -0.06);
  },
  /** A black furry one with four ETH eyes, a pink cap turned back, a rainbow tongue. */
  ethfur(g, t) {
    const fur = (cx: number, cy: number, r: number): void => {
      g.beginPath(); for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2, rr2 = r + (i % 2 ? 4 : -1); g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); } g.closePath(); fs(g, '#151515', 3);
    };
    fur(0, 44, 38); fur(0, -24, 32);
    g.beginPath(); g.moveTo(-30, -36); g.quadraticCurveTo(-26, -66, 4, -64); g.quadraticCurveTo(30, -62, 30, -38); g.closePath(); fs(g, PINK);
    rr(g, -44, -40, 26, 8, 4); fs(g, PINK, 2.5);
    for (const [ex, ey] of [[-10, -34], [10, -34], [-10, -16], [10, -16]] as const) { circle(g, ex, ey, 8); fs(g, CHALK, 2); circle(g, ex, ey, 5.5); g.fillStyle = '#20232a'; g.fill(); label(g, 'ETH', ex, ey, 4.5, CHALK, MONO); }
    oval(g, 0, 4, 14, 9); fs(g, '#7a1a20');
    const wag = Math.sin(t * 6) * 0.15, cols = [RED, ORANGE, YELLOW, '#4cd964', SKY, PURPLE];
    g.save(); g.translate(0, 8); g.rotate(wag); cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(-9 + i * 3, 0, 3, 22 - Math.abs(i - 2.5) * 2); }); g.restore();
  },
  /** A purple glitching head with NO / FUD eyes and a low battery, white shirt and tie. */
  nofud(g, t) {
    g.beginPath(); g.moveTo(-34, 72); g.lineTo(-28, 10); g.lineTo(28, 10); g.lineTo(34, 72); g.closePath(); fs(g, CHALK);
    g.beginPath(); g.moveTo(-5, 12); g.lineTo(5, 12); g.lineTo(3, 60); g.lineTo(-3, 60); g.closePath(); fs(g, '#3e6b3a', 2);
    const gl = Math.sin(t * 23) > 0.5 ? 5 : 0;
    oval(g, gl, -24, 30, 34); fs(g, PURPLE);
    g.fillStyle = 'rgba(70,230,255,0.6)'; g.fillRect(-34 - gl, -30, 64, 5); g.fillStyle = 'rgba(255,79,163,0.6)'; g.fillRect(-28 + gl, -8, 60, 4);
    for (const [ex, w] of [[-13, 'NO'], [13, 'FUD']] as const) { circle(g, ex, -28, 12); fs(g, INK, 2); circle(g, ex, -28, 9.5); fs(g, CHALK, 1.5); label(g, w, ex, -28, 8, INK, MONO); }
    rr(g, -15, -8, 30, 11, 5); fs(g, SKY, 2.5); g.fillStyle = CHALK; g.fillRect(-10, -6, 20, 3);
    rr(g, -16, -78, 32, 14, 2); fs(g, CHALK, 2.5); g.fillStyle = RED; g.fillRect(-13, -75, 6, 8); g.fillStyle = INK; g.fillRect(16, -74, 3, 6);
  },
  /** An orange pumpkin head in a spiked helmet, pizza-slice eyes, a pacifier. */
  pumpkin(g) {
    bust(g, '#5a6b3a', 34);
    oval(g, 0, -18, 32, 30); fs(g, ORANGE);
    g.beginPath(); g.arc(0, -24, 33, Math.PI, 0); g.closePath(); fs(g, '#2b2b2b');
    for (const a of [-2.8, -2.4, -2.0, -1.57, -1.15, -0.75, -0.35]) {
      const sx = Math.cos(a) * 32, sy = -24 + Math.sin(a) * 32;
      g.beginPath(); g.moveTo(sx - 4, sy); g.lineTo(sx + Math.cos(a) * 12, sy + Math.sin(a) * 12); g.lineTo(sx + 4, sy); g.closePath(); fs(g, '#9a9a9a', 1.5);
    }
    for (const ex of [-13, 13]) { g.beginPath(); g.moveTo(ex - 9, -16); g.lineTo(ex + 9, -16); g.lineTo(ex, -2); g.closePath(); fs(g, '#ffcf6b', 2); g.fillStyle = RED; circle(g, ex - 2, -12, 2); g.fill(); circle(g, ex + 3, -10, 1.6); g.fill(); }
    circle(g, 0, 6, 7); fs(g, '#8fd0c0', 2.5); circle(g, 0, 12, 4); g.lineWidth = 2.5; g.strokeStyle = YELLOW; g.stroke();
  },
};

/** Draws one of the cast as a bust centred on (x, y), `s` times its natural size (about 80 × 170 px). */
export function drawCast(g: G, name: CastName, x: number, y: number, s: number, t: number): void {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 74, 40, 8, 0, 0, Math.PI * 2); g.fill();
  DRAW[name](g, t);
  g.restore();
}

/** A small campfire (for the trio's scene), its base at (x, y). */
export function drawCampfire(g: G, x: number, y: number, s: number, t: number): void {
  g.save(); g.translate(x, y); g.scale(s, s);
  for (const r of [-0.35, 0.35]) { g.save(); g.rotate(r); rr(g, -40, -8, 80, 16, 7); fs(g, '#7a4a2a', 3); g.restore(); }
  for (let i = 0; i < 5; i++) {
    const fx = -20 + i * 10, fh = 34 + 24 * Math.abs(Math.sin(t * 7 + i * 1.9));
    g.beginPath(); g.moveTo(fx - 9, -4); g.quadraticCurveTo(fx - 6, -4 - fh * 0.6, fx, -4 - fh); g.quadraticCurveTo(fx + 6, -4 - fh * 0.6, fx + 9, -4); g.closePath();
    g.fillStyle = [ORANGE, YELLOW, PINK, YELLOW, ORANGE][i] as string; g.fill();
  }
  g.restore();
}

// QUOTES FROM FRENS: the browser side. The page never judges a word itself: it draws the platform's authoritative state,
// advanced to the current server tick with the very module the verifier runs (core.ts), and putting a tile in a blank
// is one ordered input sent to the server. The look is the JPEG Frens world: a purple workshop at night, a paper sign
// with the phrase, word tiles on a workbench, thick ink outlines, pink, orange and blue. The phrases are signed by
// JPEG-FRENS (panel 32 of the wall) and the people of the wall walk by the workshop (display only).
import type { EndStats, GameAdapter, Stage, StageIO } from '../../shell/adapter.js';
import { createSavedRoundParser } from '../../shell/saved-round.js';
import { scoringConfiguration } from '../../shell/config.js';
import { ELIG } from '../../generated/wall.js';
import { infoOf, wallIsLive } from '../../shell/wall-data.js';
import { loadPeople, onPeople, sheetOfName } from '../../shell/people.js';
import { drawSprite, stepAt, DIR } from '../../share/sprite.js';
import { fnv1a } from '../../common/det.js';
import { drawCampfire, drawCast, type CastName } from './frens.js';
import { PHRASES, RULES, WORDS, createEngine, difficulty, inputSchema, scoreOf, snapshotSchema, stateSchema, tileWord, type PfState } from './engine.js';

const engine = createEngine();
const W = 450, H = 800, HUD = 92, TICK_MS = 50;
const SIGN_Y = HUD + 30;                          // top of the paper sign

/* The palette of the JPEG Frens scenes, plus the arcade's ink, chalk and blue. */
const INK = '#0B0B0B', CHALK = '#F2F0EB', BLUE = '#2E7FD6';
const NIGHT = '#241a3d', BRICK = '#30254f', MORTAR = '#1f1735', LAVENDER = '#b9a7e8', PAPER = '#efe4c6';
const PINK = '#ff4fa3', ORANGE = '#ff8a2a', YELLOW = '#ffd23f', SKY = '#3fa9f5', GREEN = '#4cd964', PURPLE = '#a46cff', RED = '#e8344e', WOOD = '#8a5a34';
const TILE_COLORS = [YELLOW, SKY, PINK, GREEN, ORANGE, PURPLE] as const;
const F_ANTON = 'Anton, Impact, "Arial Narrow", sans-serif', F_MONO = '"IBM Plex Mono", ui-monospace, monospace';
const COARSE = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
const fmtClock = (ticks: number): string => { const s = Math.max(0, Math.ceil(ticks * TICK_MS / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** "#3" -> 3; "—" or "Not top 10" -> undefined (as in src/share/end-screen.ts, without pulling its card art in). */
const rankOf = (rank: string | undefined): number | undefined => { const m = rank ? /^#(\d+)$/.exec(rank) : null; return m ? Number(m[1]) : undefined; };

/** The name this game stars: JPEG-FRENS, panel 32 of the wall. It signs every phrase. */
export const STAR_PANEL = 32;
/** The official phrase a run's end card carries (display only; a pure function of the seed). */
export const sharePhrase = (seed: number): string => PHRASES[fnv1a(`quotes-from-frens:share:${seed}`) % PHRASES.length] as string;

type Mode = 'idle' | 'play' | 'end';
/** The posters on the workshop wall: the cast (frens.ts) three at a time, on its backdrop; the last one by a campfire. */
const POSTERS: { cast: [CastName, CastName, CastName]; bg: string; fire?: boolean }[] = [
  { cast: ['webhead', 'captain', 'panic'], bg: '#3a2c6e' },
  { cast: ['native', 'hodl', 'nofud'], bg: '#6a2c5e' },
  { cast: ['melty', 'burn', 'ethfur'], bg: '#1e1640', fire: true },
  { cast: ['pumpkin', 'webhead', 'native'], bg: '#2c4a6e' },
  { cast: ['captain', 'panic', 'melty'], bg: '#5e3a2c' },
];
type Rect = { x: number; y: number; w: number; h: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Popup = { x: number; y: number; text: string; color: string; t: number };

function createStage(host: HTMLElement, io: StageIO): Stage {
  host.classList.add('ub-arena', 'own-end');
  host.replaceChildren();
  const canvas = document.createElement('canvas');
  canvas.className = 'ub-canvas pf-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'QUOTES FROM FRENS workshop. Drag a word tile into a blank of the phrase, or tap a tile to fill the first blank. Keys 1 to 9 pick a tile.');
  const soundButton = document.createElement('button');
  soundButton.type = 'button'; soundButton.className = 'ub-sound secondary';
  const endPanel = document.createElement('section');
  endPanel.className = 'end-panel pf-end'; endPanel.hidden = true; endPanel.setAttribute('aria-label', 'Your run');
  host.append(canvas, endPanel, soundButton);
  // `let`: the end card borrows the drawing helpers for a moment (drawCard points ctx at its own canvas)
  let ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  /* ------------------------------ stage state ------------------------------ */
  let mode: Mode = 'idle';
  let practice = false;
  let final: { score: number } | null = null;
  let base: PfState | null = null;            // the authoritative view the local copy was cloned from
  let local: PfState | null = null;           // that view, stepped to the current server tick
  let particles: Particle[] = [], popups: Popup[] = [];
  let shake = 0, flash = 0, glow = 0, burn = 0, frenJump = 0, frenOuch = 0, lastFrame = performance.now();
  let banner: { text: string; sub: string; color: string; t: number } | null = null;
  // high-water marks: an effect already shown is not shown again when the copy is rebuilt from a new snapshot
  let seen = { primed: false, done: 0, missed: 0, wrong: 0, words: 0, dealt: -1, ten: false };
  let lastTile = -1, wrongTile = -1, wrongT = 0;
  let dirty = true, DPRc = 1;
  // what the last frame drew, for hit-testing a drop or a tap
  let blankRects: Rect[] = [], tileRects: (Rect | null)[] = [];
  let drag: { id: number; tile: number; sx: number; sy: number; x: number; y: number; moved: number } | null = null;

  /* --------------------------------- audio --------------------------------- */
  let AC: AudioContext | null = null, muted = false;
  try { muted = localStorage.getItem('otw_arcade_muted') === '1'; } catch { /* storage unavailable */ }
  const syncSound = (): void => { soundButton.textContent = muted ? 'SOUND OFF' : 'SOUND ON'; };
  soundButton.addEventListener('click', () => { muted = !muted; try { localStorage.setItem('otw_arcade_muted', muted ? '1' : '0'); } catch { /* ignore */ } syncSound(); initAudio(); });
  syncSound();
  function initAudio(): void {
    try {
      if (!AC) { const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; AC = new Ctor(); }
      if (AC.state === 'suspended') void AC.resume();
    } catch { /* no audio */ }
  }
  function tone(f: number, d: number, type: OscillatorType, vol: number, slide?: number, delay = 0): void {
    if (muted || !AC) return;
    const t0 = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + d);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(AC.destination); o.start(t0); o.stop(t0 + d + 0.02);
  }
  const SND = {
    pick: () => tone(420, 0.04, 'triangle', 0.05, 520),
    word: () => { tone(660, 0.07, 'square', 0.06); tone(880, 0.09, 'square', 0.06, 0, 0.06); },
    wrong: () => { tone(160, 0.18, 'sawtooth', 0.09, 110); },
    done: () => { tone(90, 0.5, 'sawtooth', 0.08, 300); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.1, 0, 0.1 + i * 0.07)); },
    burnt: () => { tone(140, 0.5, 'sawtooth', 0.1, 50); },
    tick: () => tone(1200, 0.02, 'square', 0.03),
    warn: () => { tone(740, 0.1, 'square', 0.06); tone(740, 0.1, 'square', 0.06, 0, 0.15); },
    end: () => [784, 659, 523, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, 0, i * 0.12)),
    wreck: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.1, 0, i * 0.14)),
  };
  const buzz = (ms: number): void => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } };

  /* ------------------------------ draw helpers ----------------------------- */
  function rr(x: number, y: number, w: number, h: number, r: number): void {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const circle = (x: number, y: number, r: number): void => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  /** Fill the current path, then outline it in ink (the cartoon line of the Frens). */
  function fs(fill: string, lw = 3): void { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
  function mono(s: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = 'left', weight = 500): void {
    ctx.font = `${weight} ${size}px ${F_MONO}`; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
  }
  /** Poster type: Anton with an ink outline and a hard ink shadow, like the scenes' signs. */
  function poster(s: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = 'center', shadow = true): void {
    ctx.font = `${size}px ${F_ANTON}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const lw = Math.max(3, size / 7), o = Math.max(2, size / 16);
    if (shadow) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.strokeText(s, x + o, y + o); ctx.fillStyle = INK; ctx.fillText(s, x + o, y + o); }
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  function fitSize(s: string, maxW: number, maxSize: number): number {
    ctx.font = `100px ${F_ANTON}`; const w = ctx.measureText(s).width || 1; return Math.min(maxSize, 100 * maxW / w);
  }
  function textW(s: string, size: number): number { ctx.font = `${size}px ${F_ANTON}`; return ctx.measureText(s).width; }
  function burst(x: number, y: number, colors: readonly string[], n: number, speed = 220, life = 0.6, size = 5): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life, max: life, color: colors[i % colors.length] as string, size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  const popup = (x: number, y: number, text: string, color: string): void => { popups.push({ x, y, text, color, t: 0 }); };
  const say = (text: string, sub: string, color: string): void => { banner = { text, sub, color, t: 0 }; };

  /* ------------------------------ characters ------------------------------- */
  /** The Fren: a pink round head with HODL glasses and a big grin, in an orange hoodie. */
  function drawFren(x: number, y: number, s: number, mood: 'happy' | 'ouch' | 'cheer'): void {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 40, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
    // hoodie
    ctx.beginPath(); ctx.moveTo(-28, 40); ctx.quadraticCurveTo(-30, 2, 0, 0); ctx.quadraticCurveTo(30, 2, 28, 40); ctx.closePath(); fs(ORANGE);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(-7, 20); ctx.moveTo(6, 6); ctx.lineTo(7, 20); ctx.stroke();
    if (mood === 'cheer') { for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 30, -14, 7, 9, side * 0.4, 0, Math.PI * 2); fs(PINK, 2.5); } }
    // head
    circle(0, -22, 23); fs(PINK);
    circle(-23, -20, 5); fs(PINK, 2); circle(23, -20, 5); fs(PINK, 2);
    rr(-21, -35, 19, 13, 4); fs(YELLOW, 2.5); rr(2, -35, 19, 13, 4); fs(YELLOW, 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-19, -33, 15, 9); ctx.fillRect(4, -33, 15, 9);
    ctx.font = `10px ${F_ANTON}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = SKY; ctx.fillText('HO', -11.5, -28); ctx.fillStyle = RED; ctx.fillText('DL', 11.5, -28);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-2, -30); ctx.lineTo(2, -30); ctx.stroke();
    if (mood === 'ouch') { circle(0, -10, 6); fs('#7a1030', 2.5); }
    else {
      const big = mood === 'cheer' ? 5 : 0;
      ctx.beginPath(); ctx.moveTo(-13, -15); ctx.quadraticCurveTo(0, 2 + big, 13, -15); ctx.quadraticCurveTo(0, -9, -13, -15); ctx.closePath(); fs('#7a1030', 2.5);
      ctx.fillStyle = CHALK; ctx.fillRect(-10, -14.5, 20, 4);
      ctx.strokeStyle = INK; ctx.lineWidth = 1; for (let i = -6; i <= 6; i += 4) { ctx.beginPath(); ctx.moveTo(i, -14.5); ctx.lineTo(i, -10.5); ctx.stroke(); }
    }
    ctx.restore();
  }
  /** The forge: a brick furnace whose fire flares when a phrase gets finished. */
  function drawForge(x: number, y: number, heat: number, t: number): void {
    ctx.save(); ctx.translate(x, y);
    rr(-46, -70, 92, 96, 10); fs('#5b4a7e');
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    for (let r = 0; r < 5; r++) { const yy = -66 + r * 18; ctx.beginPath(); ctx.moveTo(-44, yy); ctx.lineTo(44, yy); ctx.stroke();
      for (let c = 0; c < 4; c++) { const xx = -44 + ((r % 2) * 11) + c * 22; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 18); ctx.stroke(); } }
    ctx.beginPath(); ctx.moveTo(-28, 26); ctx.lineTo(-28, -24); ctx.arc(0, -24, 28, Math.PI, 0); ctx.lineTo(28, 26); ctx.closePath(); fs('#160f26');
    const h = 18 + heat * 34;
    for (let i = 0; i < 5; i++) {
      const fx = -18 + i * 9, fh = h * (0.6 + 0.4 * Math.abs(Math.sin(t * 7 + i * 1.7)));
      ctx.beginPath(); ctx.moveTo(fx - 6, 24); ctx.quadraticCurveTo(fx - 4, 24 - fh * 0.6, fx, 24 - fh); ctx.quadraticCurveTo(fx + 4, 24 - fh * 0.6, fx + 6, 24); ctx.closePath();
      ctx.fillStyle = i % 2 ? PINK : YELLOW; ctx.fill();
    }
    rr(-50, 22, 100, 10, 3); fs('#3d3060', 2.5);
    ctx.restore();
  }

  /* ------------------------------ the workshop ----------------------------- */
  function drawRoom(t: number, seed: number): void {
    ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H);
    // brick by brick
    ctx.fillStyle = BRICK;
    for (let r = 0; r * 26 < H; r++) for (let c = -1; c * 52 < W; c++) { const x = c * 52 + (r % 2) * 26, y = r * 26; ctx.fillRect(x + 2, y + 2, 48, 22); }
    ctx.fillStyle = MORTAR; ctx.globalAlpha = 0.35; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    // the lamp and its light, like the clinic scene
    const g = ctx.createRadialGradient(W / 2, HUD + 10, 20, W / 2, HUD + 160, 360);
    g.addColorStop(0, 'rgba(255,230,200,0.20)'); g.addColorStop(1, 'rgba(255,230,200,0)');
    ctx.fillStyle = g; ctx.fillRect(0, HUD, W, H - HUD);
    // party leftovers: balloons on the strings
    for (const [bx, by, c] of [[26, 150, PURPLE], [46, 176, PINK], [W - 30, 160, SKY], [W - 52, 186, PURPLE]] as const) {
      ctx.strokeStyle = 'rgba(242,240,235,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, by + 13); ctx.quadraticCurveTo(bx + 4, by + 40, bx, by + 70); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(bx, by + Math.sin(t * 1.5 + bx) * 3, 12, 15, 0, 0, Math.PI * 2); fs(c, 2.5);
    }
    // the floor and the people of the wall walking by (their sprites, display only)
    ctx.fillStyle = '#1b1430'; ctx.fillRect(0, H - 92, W, 92);
    ctx.fillStyle = INK; ctx.fillRect(0, H - 92, W, 3);
    if (ELIG.length) {
      for (let k = 0; k < 3; k++) {
        const pos = ELIG[fnv1a(`quotes-from-frens:walker:${seed}:${k}`) % ELIG.length] as number, who = infoOf(pos);
        const sheet = who.name ? sheetOfName(who.name) : null;
        if (!sheet) continue;
        const speed = 22 + k * 9, span = W + 120, dirRight = k % 2 === 0;
        const p = ((t * speed + k * 170) % span) - 60, x = dirRight ? p : W - p;
        drawSprite(ctx, sheet, x - 22, H - 66, 44, stepAt(performance.now() + k * 90), dirRight ? DIR.RIGHT : DIR.LEFT);
      }
    }
  }

  /* --------------------------- the sign and the bench --------------------------- */
  /** Lays out the phrase's words on the sign (uppercase Anton), wrapping lines; returns rects for every word. */
  function layoutPhrase(words: readonly string[], maxW: number): { size: number; lines: { idx: number; w: number }[][]; lineH: number } {
    for (let size = 32; size >= 18; size -= 2) {
      const lines: { idx: number; w: number }[][] = [[]];
      let lineW = 0;
      const gap = size * 0.32;
      for (let i = 0; i < words.length; i++) {
        const w = Math.max(textW((words[i] as string).toUpperCase(), size) + 14, 40);
        const line = lines[lines.length - 1] as { idx: number; w: number }[];
        if (line.length && lineW + gap + w > maxW) { lines.push([{ idx: i, w }]); lineW = w; }
        else { line.push({ idx: i, w }); lineW += (line.length > 1 ? gap : 0) + w; }
      }
      if (lines.length <= 4) return { size, lines, lineH: size * 1.55 };
    }
    return { size: 18, lines: [words.map((w, idx) => ({ idx, w: textW(w.toUpperCase(), 18) + 14 }))], lineH: 28 };
  }

  function drawSign(S: PfState, t: number): number {
    const play = S.play, words = WORDS[play.phrase] as readonly string[];
    const L = layoutPhrase(words, 360), gap = L.size * 0.32;
    const cardH = 70 + L.lines.length * L.lineH, cardY = SIGN_Y, cardX = 24, cardW = W - 48;
    signBottom = cardY + cardH;
    ctx.save();
    ctx.translate(W / 2, cardY + cardH / 2); ctx.rotate(-0.012); ctx.translate(-W / 2, -(cardY + cardH / 2));
    if (glow > 0) { ctx.shadowColor = ORANGE; ctx.shadowBlur = 40 * glow; }
    rr(cardX + 6, cardY + 6, cardW, cardH, 6); ctx.fillStyle = INK; ctx.fill();
    rr(cardX, cardY, cardW, cardH, 6); fs(play.result === 2 ? '#7c6a55' : PAPER, 3.5);
    ctx.shadowBlur = 0;
    // tape
    for (const tx of [cardX + 40, cardX + cardW - 40]) { ctx.save(); ctx.translate(tx, cardY); ctx.rotate(tx < W / 2 ? -0.3 : 0.3); ctx.fillStyle = 'rgba(242,240,235,0.55)'; ctx.fillRect(-22, -8, 44, 16); ctx.restore(); }
    mono(`PHRASE ${play.done + play.missed + 1}`, cardX + 16, cardY + 20, 10, '#6b5d45', 'left', 500);
    const star = infoOf(STAR_PANEL).name;
    if (star) mono(`— ${star}`, cardX + cardW - 16, cardY + cardH - 18, 10, '#6b5d45', 'right', 500);
    // the words; blanks as dashed slots sized to the missing word
    blankRects = [];
    const slotOf = new Map(play.blanks.map((w, i) => [w, i]));
    L.lines.forEach((line, li) => {
      const lineW = line.reduce((a, b) => a + b.w, 0) + gap * (line.length - 1);
      let x = W / 2 - lineW / 2;
      const y = cardY + 44 + li * L.lineH + L.lineH / 2;
      for (const { idx, w } of line) {
        const text = (words[idx] as string).toUpperCase(), slot = slotOf.get(idx);
        if (slot === undefined) { ctx.font = `${L.size}px ${F_ANTON}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK; ctx.fillText(text, x + w / 2, y + 2); }
        else {
          const r = { x, y: y - L.size * 0.68, w, h: L.size * 1.36 };
          blankRects[slot] = r;
          if (play.filled[slot] === 1) {
            rr(r.x, r.y, r.w, r.h, 6); fs(TILE_COLORS[slot % TILE_COLORS.length] as string, 2.5);
            ctx.font = `${L.size}px ${F_ANTON}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK; ctx.fillText(text, x + w / 2, y + 2);
          } else {
            const hot = drag && drag.moved > 8 && inside(drag.x, drag.y, r);
            const bad = wrongT > 0 && wrongTile >= 0 && hotSlot === slot;
            rr(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = bad ? 'rgba(232,52,78,0.35)' : hot ? 'rgba(46,127,214,0.25)' : 'rgba(11,11,11,0.06)'; ctx.fill();
            ctx.setLineDash([7, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = hot ? BLUE : INK; ctx.stroke(); ctx.setLineDash([]);
            mono('?', x + w / 2, y + 1, 14, 'rgba(11,11,11,0.35)', 'center', 500);
          }
        }
        x += w + gap;
      }
    });
    if (play.result === 1) {                              // finished: the stamp
      const k = clamp((S.tick - (play.breakUntil - RULES.breakTicks)) / 4, 0, 1);
      ctx.save(); ctx.translate(cardX + cardW - 92, cardY + cardH / 2); ctx.rotate(-0.22); ctx.scale(1.6 - 0.6 * k, 1.6 - 0.6 * k); ctx.globalAlpha = k;
      rr(-76, -22, 152, 44, 6); ctx.lineWidth = 4; ctx.strokeStyle = RED; ctx.stroke();
      ctx.font = `22px ${F_ANTON}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = RED; ctx.fillText('FREN APPROVED', 0, 2);
      ctx.restore();
    }
    if (play.streak >= 3 && play.result === 0) {           // FREN FRENZY: the sign burns pink at the edges
      ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 10); rr(cardX - 4, cardY - 4, cardW + 8, cardH + 8, 9); ctx.lineWidth = 6; ctx.strokeStyle = PINK; ctx.stroke(); ctx.restore();
      if (Math.random() < 0.7) particles.push({ x: cardX + Math.random() * cardW, y: cardY + (Math.random() < 0.5 ? 0 : cardH), vx: 0, vy: -80 - Math.random() * 80, life: 0.5, max: 0.5, color: Math.random() < 0.5 ? PINK : ORANGE, size: 5 });
    }
    if (play.result === 2) {                              // burnt: char and smoke
      ctx.fillStyle = 'rgba(30,20,10,0.45)'; rr(cardX, cardY, cardW, cardH, 6); ctx.fill();
      if (Math.random() < 0.6) particles.push({ x: cardX + Math.random() * cardW, y: cardY + cardH, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 60, life: 0.8, max: 0.8, color: '#4a4050', size: 6 + Math.random() * 6 });
    }
    ctx.restore();
    // the fuse: it burns from the right towards the left
    const fy = cardY + cardH + 22;
    if (play.result === 0) {
      const total = Math.max(1, play.deadline - play.dealt), left = clamp((play.deadline - S.tick) / total, 0, 1), x1 = 30 + (W - 60) * left;
      ctx.strokeStyle = '#4a3d6e'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(30, fy); ctx.lineTo(W - 30, fy); ctx.stroke();
      ctx.strokeStyle = left < 0.25 ? RED : '#d8c39a'; ctx.beginPath(); ctx.moveTo(30, fy); ctx.lineTo(x1, fy); ctx.stroke(); ctx.lineCap = 'butt';
      circle(x1, fy, 7 + Math.sin(t * 30) * 2); ctx.fillStyle = YELLOW; ctx.fill(); circle(x1, fy, 4); ctx.fillStyle = CHALK; ctx.fill();
      if (Math.random() < 0.8) particles.push({ x: x1, y: fy, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 80, life: 0.3, max: 0.3, color: Math.random() < 0.5 ? YELLOW : ORANGE, size: 3 });
    }
    return fy + 24;
  }
  let hotSlot = -1, signBottom = SIGN_Y + 160;
  /** A Fren of the cast pops up and says the finished quote (the game's name: quotes from Frens). */
  let cameo: { name: CastName; quote: string; t: number } | null = null;
  const CAMEO_CAST: CastName[] = ['webhead', 'captain', 'panic', 'native', 'melty', 'burn', 'ethfur', 'nofud', 'pumpkin'];
  const inside = (x: number, y: number, r: Rect): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  /** The workbench and its tiles, in the bench's display order; the dragged tile is drawn last, under the finger. */
  /** Draws the bench under the sign, sized to its tiles (rows centred), and returns its bottom edge. */
  function drawBench(S: PfState, top: number, t: number): number {
    const play = S.play;
    tileRects = play.tiles.map(() => null);
    const size = 24, h = 46, gap = 10, maxW = W - 64;
    // the rows first (in display order), to size the bench and centre each row on it
    const rowsW: number[] = [0];
    for (const ti of play.order) {
      const tile = play.tiles[ti]; if (!tile) continue;
      const w = Math.max(56, textW(tileWord(tile).toUpperCase(), size) + 26), cur = rowsW[rowsW.length - 1] as number;
      if (cur > 0 && cur + gap + w > maxW) rowsW.push(w); else rowsW[rowsW.length - 1] = cur + (cur > 0 ? gap : 0) + w;
    }
    const rows = Math.max(2, rowsW.length), benchY = top + 6, benchH = rows * h + (rows - 1) * gap + 36;
    rr(14, benchY, W - 28, benchH, 12); fs(WOOD, 3.5);
    ctx.strokeStyle = 'rgba(11,11,11,0.25)'; ctx.lineWidth = 2;
    for (let y = benchY + 26; y < benchY + benchH - 10; y += 30) { ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y + Math.sin(y) * 3); ctx.stroke(); }
    let row = 0;
    const rowX = (r: number): number => W / 2 - (rowsW[r] ?? 0) / 2;
    let x = rowX(0), y = benchY + 18 + ((rows - rowsW.length) * (h + gap)) / 2;
    play.order.forEach((ti, pos) => {
      const tile = play.tiles[ti]; if (!tile) return;
      const text = tileWord(tile).toUpperCase(), w = Math.max(56, textW(text, size) + 26);
      if (x > rowX(row) && x + w > rowX(row) + (rowsW[row] ?? 0) + 1) { row++; x = rowX(row); y += h + gap; }
      const r = { x, y, w, h };
      x += w + gap;
      if (tile[2] === 1) return;                        // already in the sign
      tileRects[ti] = r;
      if (drag && drag.tile === ti && drag.moved > 8) return;
      const shakeX = wrongT > 0 && wrongTile === ti ? Math.sin(t * 60) * 5 * wrongT : 0;
      drawTile(text, r.x + shakeX, r.y, r.w, r.h, TILE_COLORS[ti % TILE_COLORS.length] as string, pos < 9 && !COARSE ? String(pos + 1) : pos === 9 && !COARSE ? '0' : '');
    });
    if (drag && drag.moved > 8) {
      const tile = play.tiles[drag.tile], r = tileRects[drag.tile];
      if (tile && r) drawTile(tileWord(tile).toUpperCase(), drag.x - r.w / 2, drag.y - r.h / 2 - 10, r.w, r.h, TILE_COLORS[drag.tile % TILE_COLORS.length] as string, '', true);
    }
    return benchY + benchH;
  }
  /** A framed poster of three of the cast, taped to the wall, `h` px tall, centred on (cx, cy). */
  function drawPoster(index: number, cx: number, cy: number, h: number, rot: number): void {
    const poster = POSTERS[((index % POSTERS.length) + POSTERS.length) % POSTERS.length] as (typeof POSTERS)[number];
    const w = h * 400 / 230, t = performance.now() / 1000;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    rr(-w / 2 - 8 + 7, -h / 2 - 8 + 7, w + 16, h + 16, 6); ctx.fillStyle = INK; ctx.fill();
    rr(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 6); fs('#3a2c5c', 3);
    ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
    ctx.fillStyle = poster.bg; ctx.fillRect(-w / 2, -h / 2, w, h);
    if (poster.fire) { ctx.fillStyle = '#e9e4f5'; ctx.beginPath(); ctx.arc(w * 0.3, -h * 0.28, h * 0.22, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = 'rgba(255,255,255,0.07)'; for (let i = -6; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, h * 0.6); ctx.lineTo(i * w * 0.16, -h / 2); ctx.lineTo(i * w * 0.16 + w * 0.07, -h / 2); ctx.closePath(); ctx.fill(); } }
    const s = h / 200;
    poster.cast.forEach((name, i) => drawCast(ctx, name, (i - 1) * w * 0.32, h * 0.12, s, t + i));
    if (poster.fire) drawCampfire(ctx, 0, h * 0.5, s * 0.8, t);
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(-w / 2, -h / 2, w, h);
    for (const tx of [-w / 2 + 18, w / 2 - 18]) { ctx.save(); ctx.translate(tx, -h / 2 - 8); ctx.rotate(tx < 0 ? -0.5 : 0.5); ctx.fillStyle = 'rgba(242,240,235,0.6)'; ctx.fillRect(-16, -6, 32, 12); ctx.restore(); }
    ctx.restore();
  }
  function drawTile(text: string, x: number, y: number, w: number, h: number, color: string, key: string, lifted = false): void {
    const o = lifted ? 7 : 4;
    rr(x + o, y + o, w, h, 8); ctx.fillStyle = INK; ctx.fill();
    rr(x, y, w, h, 8); fs(color, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(x + 6, y + 5, w * 0.4, 5, 2.5); ctx.fill();
    ctx.font = `24px ${F_ANTON}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK; ctx.fillText(text, x + w / 2, y + h / 2 + 2);
    if (key) mono(key, x + w - 8, y + 9, 9, 'rgba(11,11,11,0.55)', 'right', 500);
  }

  /* --------------------------------- the HUD -------------------------------- */
  function heart(x: number, y: number, s: number, fill: string): void {
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.4, x, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
    fs(fill, 2.5);
  }
  /** The cameo: a Fren of the cast rises from the floor and says the quote in a speech bubble. */
  function drawCameo(c: { name: CastName; quote: string; t: number }, benchBottom: number): void {
    const up = c.t < 0.2 ? ease(c.t / 0.2) : c.t > 0.95 ? 1 - ease((c.t - 0.95) / 0.2) : 1;   // about the pause between two phrases
    if (up <= 0) return;
    const baseY = H - 96, x = W / 2 + 120, y = baseY - 70 * up;
    ctx.save(); ctx.beginPath(); ctx.rect(0, benchBottom, W, baseY - benchBottom); ctx.clip();
    drawCast(ctx, c.name, x, y, 1.05, performance.now() / 1000);
    ctx.restore();
    // the bubble
    const words = c.quote.toUpperCase().split(' '), lines: string[] = [''];
    for (const w of words) { const cur = lines[lines.length - 1] as string; if (textW(`${cur} ${w}`.trim(), 17) > 200) lines.push(w); else lines[lines.length - 1] = `${cur} ${w}`.trim(); }
    const bw = 224, bh = 22 + lines.length * 21, bx = Math.max(12, x - bw - 30), by = Math.max(benchBottom + 8, y - 120 - bh / 2);
    ctx.save(); ctx.globalAlpha = clamp(up * 1.4, 0, 1);
    rr(bx + 5, by + 5, bw, bh, 12); ctx.fillStyle = INK; ctx.fill();
    rr(bx, by, bw, bh, 12); fs(CHALK, 3);
    ctx.beginPath(); ctx.moveTo(bx + bw - 30, by + bh - 1); ctx.lineTo(bx + bw + 10, by + bh + 22); ctx.lineTo(bx + bw - 6, by + bh - 1); ctx.closePath(); fs(CHALK, 3);
    ctx.fillStyle = CHALK; ctx.fillRect(bx + bw - 28, by + bh - 4, 20, 5);
    lines.forEach((l, i) => { ctx.font = `17px ${F_ANTON}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK; ctx.fillText(l, bx + bw / 2, by + 20 + i * 21); });
    ctx.restore();
  }
  const ease = (k: number): number => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  function drawHud(S: PfState): void {
    const play = S.play;
    ctx.fillStyle = '#1b1430'; ctx.fillRect(0, 0, W, HUD);
    ctx.fillStyle = INK; ctx.fillRect(0, HUD - 3, W, 3);
    const left = S.startTick === null ? S.rules.roundTicks : Math.max(0, S.rules.roundTicks - (S.tick - S.startTick));
    const urgent = left <= 200 && S.started;
    ctx.fillStyle = urgent ? RED : YELLOW; ctx.fillRect(0, HUD, W * left / S.rules.roundTicks, 5);
    // the score, big, under the page's own corner (← and the PRACTICE label live top-left)
    const score = scoreOf(play);
    poster(fmt(score), 16, 64, Math.min(36, fitSize(fmt(score), 140, 36)), CHALK, 'left', false);
    const pulse = urgent ? 1 + 0.06 * Math.sin(performance.now() / 80) : 1;
    ctx.save(); ctx.translate(W / 2, 36); ctx.scale(pulse, pulse);
    rr(-58, -24, 116, 48, 24); fs(INK, 3);
    ctx.font = `34px ${F_ANTON}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = urgent ? RED : YELLOW;
    ctx.fillText(urgent ? (left * TICK_MS / 1000).toFixed(1) : fmtClock(left), 0, 2);
    ctx.restore();
    const streak = Math.min(play.streak, RULES.streakCap);
    rr(W / 2 - 56, 68, 112, 18, 9); fs(streak >= 3 ? PINK : streak >= 1 ? YELLOW : CHALK, 2);
    mono(play.streak >= 3 ? `FRENZY ×${(1 + 0.2 * streak).toFixed(1)}` : `STREAK ×${(1 + 0.2 * streak).toFixed(1)}`, W / 2, 77.5, 10, INK, 'center', 500);
    mono(`${play.done} DONE`, W - 16, 24, 13, YELLOW, 'right', 500);
    for (let i = 0; i < RULES.lives; i++) heart(W - 70 + i * 24, 58, 8.5, i < play.lives ? PINK : '#4a3d6e');
  }

  /* -------------------------------- drawing --------------------------------- */
  function draw(): void {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    const t = performance.now() / 1000;
    ctx.save();
    if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const S = mode === 'play' ? local : null;
    drawRoom(t, S ? S.seed : 7);
    const fmood = frenOuch > 0 ? 'ouch' : frenJump > 0 ? 'cheer' : 'happy';
    drawFren(72, H - 58 - Math.max(0, Math.sin(frenJump * Math.PI)) * 22, 1.05, fmood);
    drawForge(W - 150, H - 58, clamp(glow, 0, 1), t);   // left of the SOUND button of the bottom-right corner
    if (S && S.started && S.play.phrase >= 0) {
      const benchTop = drawSign(S, t);
      const benchBottom = drawBench(S, benchTop, t);
      const hint = !hintSeen && S.tick - (S.startTick ?? 0) < 160;
      const top = benchBottom + (hint ? 30 : 6), room = H - 140 - top;   // the wall between the bench and the forge: a poster of the Frens
      if (room >= 80) drawPoster(S.play.done + S.play.missed, W / 2, top + room / 2 + 4, Math.min(room - 30, 170), (S.play.phrase % 2 ? 1 : -1) * 0.025);
      if (cameo) drawCameo(cameo, benchBottom);
      if (hint) mono(COARSE ? 'DRAG A WORD INTO A BLANK · OR TAP IT' : 'DRAG A WORD INTO A BLANK · CLICK IT · OR PRESS 1–9', W / 2, benchBottom + 16, 11, CHALK, 'center', 500);
    } else if (mode === 'idle') {
      // the attract mode: the Frens' scenes on the wall and an official phrase on the sign, slowly cycling
      drawPoster(Math.floor(t / 4), W / 2, 520, 190, -0.03);
      const p = PHRASES[Math.floor(t / 4) % PHRASES.length] as string;
      ctx.save(); ctx.translate(W / 2, 260); ctx.rotate(-0.02);
      rr(-195 + 6, -70 + 6, 390, 140, 6); ctx.fillStyle = INK; ctx.fill(); rr(-195, -70, 390, 140, 6); fs(PAPER, 3.5);
      const words = p.toUpperCase().split(' '), lines: string[] = [''];
      for (const w of words) { const cur = lines[lines.length - 1] as string; if (textW(`${cur} ${w}`.trim(), 28) > 350) lines.push(w); else lines[lines.length - 1] = `${cur} ${w}`.trim(); }
      lines.forEach((line, i) => { ctx.font = `28px ${F_ANTON}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK; ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * 36); });
      ctx.restore();
    }
    for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
    for (const p of popups) { ctx.globalAlpha = clamp(1.4 - p.t * 1.4, 0, 1); poster(p.text, p.x, p.y, 22, p.color, 'center', false); }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = `rgba(232,52,78,${flash * 1.4})`; ctx.fillRect(0, 0, W, H); }
    if (burn > 0) { ctx.fillStyle = `rgba(255,138,42,${burn * 0.35})`; ctx.fillRect(0, 0, W, H); }
    if (S) {
      const left = S.startTick === null ? S.rules.roundTicks : S.rules.roundTicks - (S.tick - S.startTick);
      if (S.started && !S.gameOver && left <= 200) {
        const a = 0.2 + 0.14 * Math.sin(performance.now() / 110);
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
        g.addColorStop(0, 'rgba(232,52,78,0)'); g.addColorStop(1, `rgba(232,52,78,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      drawHud(S);
    }
    if (banner) {
      const b = banner, a = b.t < 0.15 ? b.t / 0.15 : b.t > 0.85 ? (1.1 - b.t) / 0.25 : 1, s = b.t < 0.15 ? 0.6 + 2.6 * b.t : 1;
      ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.translate(W / 2, mode === 'play' ? signBottom + 74 : H * 0.5);   // under the sign: its stamp stays visible ctx.rotate(-0.05); ctx.scale(s, s);
      poster(b.text, 0, 0, fitSize(b.text, W - 60, 64), b.color);
      if (b.sub) mono(b.sub.toUpperCase(), 0, 44, 13, CHALK, 'center', 500);
      ctx.restore();
    }
  }
  let hintSeen = false;
  try { hintSeen = localStorage.getItem('wall-arcade:quotes-from-frens:hint') === '1'; } catch { /* storage unavailable */ }

  /* ------------------------ effects from state changes ------------------------ */
  // Effects come from the counters of the state the player sees: a counter above its high-water mark is news.
  function react(S: PfState): void {
    const play = S.play, e = S.startTick === null ? 0 : S.tick - S.startTick;
    if (!seen.primed) {                                   // the first view of a run (or of a recovered run): no fireworks for the past
      seen = { ...seen, primed: true, done: play.done, missed: play.missed, wrong: play.wrong, words: play.words, dealt: play.dealt };
      if (S.started && e < 40) say('GO!', 'complete the phrases', GREEN);
    }
    if (play.words > seen.words && play.result === 0) {
      seen.words = play.words; SND.word();
      const r = blankRects[play.filled.lastIndexOf(1)]; if (r) burst(r.x + r.w / 2, r.y + r.h / 2, [YELLOW, CHALK], 8, 140, 0.4, 4);
    }
    seen.words = Math.max(seen.words, play.words);
    if (play.done > seen.done) {
      seen.done = play.done; glow = 1.4; frenJump = 1; SND.done(); buzz(25);
      burst(W / 2, HUD + 110, [ORANGE, YELLOW, PINK, CHALK], 42, 340, 0.9, 6);
      const fuse = Math.max(1, play.deadline - play.dealt), left = (play.deadline - S.tick) / fuse;
      const lines = ['TOASTY!', 'THE FORGE IS LIT', 'FOR THE CULTURE', 'YOUR MOVE.', 'YOU’RE EARLY. AGAIN.'];
      const shout = play.streak === 3 ? 'FREN FRENZY!' : left > 0.6 ? 'LIGHTNING!' : left < 0.15 ? 'CLUTCH!' : lines[(play.done - 1) % lines.length] as string;
      say(shout, `streak ×${(1 + 0.2 * Math.min(play.streak - 1, RULES.streakCap)).toFixed(1)}`, play.streak >= 3 ? PINK : YELLOW);
      if (play.streak >= 3) shake = Math.max(shake, 6);
      cameo = { name: CAMEO_CAST[(play.done * 7 + S.seed) % CAMEO_CAST.length] as CastName, quote: PHRASES[play.phrase] as string, t: 0 };
    }
    if (play.missed > seen.missed) {
      seen.missed = play.missed; burn = 1; shake = 12; frenOuch = 0.8; SND.burnt(); buzz(60);
      popup(W / 2, HUD + 150, `${RULES.score.missed} · FUSE OUT`, RED);
      say('BURNT', play.lives > 0 ? `${play.lives} ${play.lives === 1 ? 'life' : 'lives'} left` : 'out of lives', RED);
    }
    if (play.wrong > seen.wrong) {
      seen.wrong = play.wrong; wrongTile = lastTile; wrongT = 1; flash = 0.18; frenOuch = 0.5; SND.wrong(); buzz(30);
      const r = tileRects[lastTile]; popup(r ? r.x + r.w / 2 : W / 2, r ? r.y - 6 : H / 2, `${RULES.score.wrong}`, RED);
    }
    if (play.dealt !== seen.dealt) { seen.dealt = play.dealt; drag = null; }
    if (S.started && !S.gameOver && !seen.ten && e >= S.rules.roundTicks - 200 && e < S.rules.roundTicks - 180) { seen.ten = true; say('FINAL 10 SECONDS', 'things might get a little toasty', PINK); SND.warn(); }
    if (S.started && e > 200 && !hintSeen) { hintSeen = true; try { localStorage.setItem('wall-arcade:quotes-from-frens:hint', '1'); } catch { /* ignore */ } }
  }

  /* --------------------------------- input --------------------------------- */
  function canPlay(): boolean { return mode === 'play' && local !== null && local.started && !local.gameOver && local.play.result === 0 && io.canInput(); }
  /** Sends one placement, and plays it on the local copy right away (the same rules decide the same way). */
  function put(tile: number, slot: number): void {
    if (!canPlay() || !local) return;
    initAudio();
    lastTile = tile; hotSlot = slot;
    const input = { action: 'place', tile, slot };
    io.sendInput(input);
    engine.applyInputInPlace(local, input, Math.max(local.tick, io.estimatedTick()));
  }
  const firstEmpty = (): number => (local ? local.play.filled.indexOf(0) : -1);
  addEventListener('keydown', (e) => {
    if (mode !== 'play' || !local) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const m = /^(Digit|Numpad)(\d)$/.exec(e.code);
    if (!m) return;
    const pos = m[2] === '0' ? 9 : Number(m[2]) - 1, tile = local.play.order[pos], slot = firstEmpty();
    if (tile !== undefined && slot >= 0 && local.play.tiles[tile]?.[2] === 0) { e.preventDefault(); SND.pick(); put(tile, slot); }
  });
  const point = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
  canvas.addEventListener('pointerdown', (e) => {
    initAudio();
    if (!canPlay()) return;
    const [x, y] = point(e);
    const tile = tileRects.findIndex((r) => r !== null && inside(x, y, r));
    if (tile < 0) return;
    e.preventDefault();
    drag = { id: e.pointerId, tile, sx: x, sy: y, x, y, moved: 0 };
    SND.pick();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const [x, y] = point(e);
    drag.x = x; drag.y = y; drag.moved = Math.max(drag.moved, Math.hypot(x - drag.sx, y - drag.sy));
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    if (!local) return;
    if (d.moved <= 8) { const slot = firstEmpty(); if (slot >= 0) put(d.tile, slot); return; }   // a tap: the first blank
    const slot = blankRects.findIndex((r, i) => r && local?.play.filled[i] === 0 && inside(d.x, d.y - 10, { x: r.x - 10, y: r.y - 14, w: r.w + 20, h: r.h + 28 }));
    if (slot >= 0) put(d.tile, slot);
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------------------- layout and main loop ------------------------ */
  const frameEl = host.parentElement ?? host;
  function layout(): void {
    const availW = frameEl.clientWidth || W, availH = frameEl.clientHeight || H;
    const cssW = Math.max(220, Math.floor(Math.min(availW, availH * W / H)));
    const cssH = Math.floor(cssW * H / W);
    DPRc = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    host.style.width = `${cssW}px`; host.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * DPRc); canvas.height = Math.round(cssH * DPRc);
    dirty = true;
  }
  new ResizeObserver(() => layout()).observe(frameEl);
  layout();
  void Promise.race([
    Promise.all([document.fonts.load('40px Anton'), document.fonts.load('500 12px "IBM Plex Mono"')]),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]).then(() => { dirty = true; }).catch(() => undefined);
  void loadPeople();
  onPeople(() => { dirty = true; });

  let liveSeen = wallIsLive(), lastTickSound = -1;
  function frame(now: number): void {
    requestAnimationFrame(frame);
    if (wallIsLive() !== liveSeen) { liveSeen = wallIsLive(); dirty = true; }
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.97; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    if (particles.length > 500) particles.splice(0, particles.length - 500);
    for (const p of popups) { p.t += dt; p.y -= 50 * dt; }
    popups = popups.filter((p) => p.t < 1);
    if (banner) { banner.t += dt; if (banner.t > 1.1) banner = null; }
    if (cameo) { cameo.t += dt; if (cameo.t > 1.15) cameo = null; }   // about the pause between two phrases
    if (shake > 0.2) shake *= Math.pow(0.02, dt); else shake = 0;
    flash = Math.max(0, flash - dt); burn = Math.max(0, burn - dt * 1.5); glow = Math.max(0, glow - dt * 0.9);
    frenJump = Math.max(0, frenJump - dt * 1.8); frenOuch = Math.max(0, frenOuch - dt); wrongT = Math.max(0, wrongT - dt * 2.5);
    if (mode === 'play' && local) {
      const tickNow = Math.max(local.tick, io.estimatedTick());
      if (tickNow > local.tick && !local.gameOver) engine.advanceInPlace(local, tickNow);
      react(local);
      const p = local.play, leftFuse = p.deadline - local.tick;     // the last three seconds of a fuse tick
      if (p.result === 0 && leftFuse > 0 && leftFuse <= 60 && Math.floor(leftFuse / 10) !== lastTickSound) { lastTickSound = Math.floor(leftFuse / 10); SND.tick(); }
      draw();
    } else if (mode === 'idle') draw();
    else if (dirty || particles.length) { draw(); dirty = false; }
  }
  requestAnimationFrame(frame);

  /* ------------------------------- end screen -------------------------------- */
  let endStats: EndStats | null = null;
  function cardPlayer(): string | undefined {
    if (endStats?.player) return endStats.player;
    const address = io.playerAddress?.();
    return address && /^0x[0-9a-f]{40}$/i.test(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : undefined;
  }
  /** The card: a 1080 × 1080 picture of the run in the Frens' purple, with one official phrase, drawn here. */
  function drawCard(score: number, S: PfState | null): HTMLCanvasElement {
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080;
    const g = cv.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = NIGHT; g.fillRect(0, 0, 1080, 1080);
    g.fillStyle = BRICK;
    for (let r = 0; r * 60 < 1080; r++) for (let c = -1; c * 120 < 1080; c++) g.fillRect(c * 120 + (r % 2) * 60 + 4, r * 60 + 4, 112, 52);
    const big = (s: string, x: number, y: number, size: number, col: string): void => {
      g.font = `${size}px ${F_ANTON}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const o = size / 16; g.lineWidth = size / 7; g.strokeStyle = INK; g.strokeText(s, x + o, y + o); g.fillStyle = INK; g.fillText(s, x + o, y + o);
      g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y);
    };
    const line = (s: string, y: number, size: number, col: string): void => { g.font = `500 ${size}px ${F_MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(s, 540, y); };
    big('QUOTES FROM FRENS', 540, 120, 130, YELLOW);
    const keep = ctx; ctx = g;
    try { drawFren(200, 420, 3.4, 'cheer'); } finally { ctx = keep; }
    const scoreText = fmt(score);
    g.font = `170px ${F_ANTON}`;
    big(scoreText, 690, 360, Math.min(170, 170 * 560 / Math.max(1, g.measureText(scoreText).width)), CHALK);
    if (S) {
      const p = S.play;
      const secs = p.end === 1 ? S.rules.roundTicks * TICK_MS / 1000 : Math.max(0, (S.tick - (S.startTick ?? S.tick)) * TICK_MS / 1000);
      g.font = `500 28px ${F_MONO}`; g.textAlign = 'center'; g.fillStyle = LAVENDER;
      g.fillText(`${p.done} PHRASES · BEST STREAK ${p.bestStreak}`, 690, 470);
      g.fillText(`${secs.toFixed(1)} S${p.end === 1 && p.missed === 0 ? ' · NO PHRASE LOST' : ''}`, 690, 512);
      // the official phrase of this run, on the paper sign
      const quote = sharePhrase(S.seed).toUpperCase(), words = quote.split(' '), lines: string[] = [''];
      g.font = `58px ${F_ANTON}`;
      for (const w of words) { const cur = lines[lines.length - 1] as string; if (g.measureText(`${cur} ${w}`.trim()).width > 820) lines.push(w); else lines[lines.length - 1] = `${cur} ${w}`.trim(); }
      const sh = 80 + lines.length * 70, sy = 640;
      g.save(); g.translate(540, sy + sh / 2); g.rotate(-0.02);
      g.fillStyle = INK; g.fillRect(-450 + 12, -sh / 2 + 12, 900, sh); g.fillStyle = PAPER; g.fillRect(-450, -sh / 2, 900, sh);
      g.lineWidth = 7; g.strokeStyle = INK; g.strokeRect(-450, -sh / 2, 900, sh);
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * 70));
      g.restore();
    }
    const rank = practice ? undefined : rankOf(endStats?.rank), player = cardPlayer();
    const who = [player, rank ? `#${rank} THIS WEEK` : '', practice ? 'PRACTICE · NOT RECORDED' : ''].filter(Boolean).join(' · ');
    if (who) line(who.toUpperCase(), 955, 28, practice ? SKY : YELLOW);
    line('A REMIX THE WALL EXPERIMENT · NFC SUMMIT 2027 · LISBON', 1025, 22, CHALK);
    return cv;
  }
  function renderEnd(): void {
    const S = local, score = final ? final.score : (S ? engine.score(S) : 0);
    const card = drawCard(score, S);
    card.className = 'end-card';
    card.setAttribute('role', 'img');
    card.setAttribute('aria-label', `Your card: ${score} points.`);
    const parts: HTMLElement[] = [card];
    if (!practice && S) {
      const text = `Just scored ${fmt(score)} in Quotes from Frens. ${sharePhrase(S.seed)} ${location.origin}/`;
      const post = document.createElement('a');
      post.className = 'end-post'; post.textContent = 'Post on X'; post.target = '_blank'; post.rel = 'noopener';
      post.href = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
      parts.push(post);
    }
    const wall = document.createElement('a');
    wall.className = 'end-wall'; wall.href = 'https://onthewall.nfcsummit.com'; wall.target = '_blank'; wall.rel = 'noopener';
    wall.textContent = 'A Remix The Wall experiment · NFC Summit 2027 · Lisbon';
    parts.push(wall);
    endPanel.replaceChildren(...parts);
    endPanel.hidden = false;
  }

  function resetRunMemory(): void {
    seen = { primed: false, done: 0, missed: 0, wrong: 0, words: 0, dealt: -1, ten: false };
    particles = []; popups = []; banner = null; cameo = null; shake = 0; flash = 0; glow = 0; burn = 0; frenJump = 0; frenOuch = 0;
    drag = null; lastTile = -1; wrongTile = -1; wrongT = 0; hotSlot = -1;
    endStats = null; final = null; endPanel.hidden = true;
  }

  return {
    setMessage(_text: string, extra?: { final?: number; view?: unknown; practice?: boolean; idle?: boolean }): void {
      dirty = true;
      if (extra?.idle) { mode = 'idle'; endPanel.hidden = true; return; }
      if (extra && typeof extra.final === 'number') {
        final = { score: extra.final };
        practice = Boolean(extra.practice);
        if (extra.view && typeof extra.view === 'object') local = engine.clone(extra.view as PfState);
        mode = 'end';
        if (local?.play.end === 2) SND.wreck(); else SND.end();
        renderEnd();
      } else if (mode !== 'end') mode = 'idle';
    },
    hideRun(): void { if (mode === 'play') { mode = local && local.gameOver ? 'end' : 'idle'; if (mode === 'end') renderEnd(); dirty = true; } },
    endStats(stats: EndStats): void { endStats = stats; if (mode === 'end') renderEnd(); },
    showRun(view: PfState, info?: { practice?: boolean }): void {
      const nextPractice = Boolean(info?.practice);
      if (mode !== 'play' || nextPractice !== practice) { resetRunMemory(); mode = 'play'; base = null; practice = nextPractice; }
      if (view !== base) { base = view; local = engine.clone(view); }
    },
  };
}

export const quotesFromFrensAdapter: GameAdapter = {
  id: 'quotes-from-frens',
  title: 'QUOTES FROM FRENS',
  heading: 'Finish the phrase',
  tagline: 'Drag the missing words into the official JPEG Frens phrases before the fuse burns out. 90 seconds.',
  lede: 'An official JPEG Frens phrase appears with words missing. Drag the right word tiles into the blanks (or tap a tile to fill the first blank) before the fuse burns out. A full phrase scores, more with a streak and with time to spare; a wrong word costs 30 points; a burnt phrase costs 100 points and one of your three lives. The phrases come faster and more mixed as the clock runs out. Ninety seconds on the server clock, one credit per run, and a big bonus if you lose no phrase.',
  stateSchema: stateSchema as never,
  snapshotSchema: snapshotSchema as never,
  parseSavedRound: createSavedRoundParser(stateSchema as never, inputSchema as never),
  applyInput: (state: PfState, input: unknown, tick: number) => engine.applyInput(state, input, tick),
  scoreOf: (state: PfState) => engine.score(state),
  statusLine(state: PfState, tick: number): string {
    if (state.gameOver) return 'Waiting for the platform’s recorded result…';
    if (!state.started) return 'Starting your server-validated round…';
    const left = state.startTick === null ? 0 : Math.max(0, state.rules.roundTicks - (tick - state.startTick));
    return `Phrase ${state.play.done + state.play.missed + 1} · ${fmtClock(left)} left on the server clock`;
  },
  createStage,
  diagSummary: (state: PfState) => ({ tick: state.tick, phrase: state.play.phrase, filled: state.play.filled, lives: state.play.lives, done: state.play.done, d: difficulty(state.tick - (state.startTick ?? state.tick), state.rules.roundTicks) }),
  practice: {
    createRun: (seed: number) => engine.createRun(seed, scoringConfiguration('quotes-from-frens')),
    advance: (state: PfState, tick: number) => engine.advance(state, tick),
  },
};

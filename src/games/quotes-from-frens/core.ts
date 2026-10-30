// QUOTES FROM FRENS: the deterministic rules, shared by the browser (prediction, practice) and the server verifier (zod-free).
//
// An official JPEG Frens phrase appears with words missing; word tiles lie on the workbench, the right ones mixed with
// words from other phrases. The player puts a tile in a blank ({action:'place', tile, slot}); the server checks the
// word. A full phrase scores, a wrong word costs points, a phrase whose fuse burns out costs a life. Ninety seconds on
// the platform's 50 ms ticks; integer arithmetic only, a seeded generator whose state lives in the run state, a state
// that round-trips through JSON exactly, no clock, no network.

/* ============================== THE PHRASES =================================
   The collection's official phrases, word for word (their order is part of the rules: a phrase is its index). */
export const PHRASES: readonly string[] = [
  'The Hype Left. We Didn\'t.',
  'Friendship is temporary. Rarity is forever.',
  'Came for JPEGs. Stayed for Frens.',
  'The JPEG is only the beginning.',
  'Once a JPEG Fren, always a JPEG Fren.',
  'You’re early. Again.',
  'NFTs aren’t dead.',
  'We are JPEG Frens.',
  'For the culture.',
  'The forge is lit.',
  'Things might get a little toasty.',
  'We don’t make the rules. Actually, we do.',
  'Collect. Burn. Forge. Customize. Repeat.',
  'Built to change. Designed to never be finished. Shaped by Frens.',
  'Welcome to the Workshop.',
  'Apparently we don’t know when to stop.',
  'Brick by brick. Burn by burn. Fren by Fren.',
  'The supply gets smaller. The world gets bigger.',
  'Your move.',
  'Natives: Somehow still functioning.',
  'Creatures: Don’t ask.',
  'Webheads: Raised online. Never offline.',
  'Weirdos: No explanation available.',
];
/** Each phrase as its words (punctuation stays on the word: "Left." is not "Left"). */
export const WORDS: readonly (readonly string[])[] = PHRASES.map((p) => p.split(' '));
export const PHRASE_COUNT = PHRASES.length;

/* ================================ RULES ====================================
   Difficulty `d` (0..1000) is a convex curve of the time since the start; each phrase takes its parameters from `d`
   when it is dealt: more blanks, more decoy words, a shorter fuse, and late in the run the tiles reshuffle. */
export const RULES = {
  lives: 3,
  maxBlanks: 5, maxTiles: 12,
  blanks: [1, 4] as const,          // blanks at d = 0 and d = 1000 (+1 now and then, never all the words)
  extraBlankPct: 30,
  decoys: [2, 7] as const,          // wrong words on the bench
  fuse: [240, 90] as const,         // ticks a phrase lasts at d = 0 and d = 1000 …
  fusePerBlank: 22,                 // … plus this per blank
  breakTicks: 22,                   // the moment between two phrases (the toast, or the ashes)
  mixFrom: 550, mixEvery: 80,       // from d = 550 the bench reshuffles every 80 ticks
  score: { word: 10, phrase: 100, perBlank: 25, wrong: -30, missed: -100, finish: 500, perLife: 250, clean: 2000 },
  timeBonusDiv: 4,                  // + (ticks left on the fuse) / 4 for a finished phrase
  streakCap: 5,                     // a phrase pays ×(1 + 0.2 × streak), streak capped at 5
} as const;
export const ROUND_TICKS = 1800, MAX_TICKS = 1900;

/* ============================ TYPES & VALIDATION =============================
   Hand-written and dependency-free, so the verifier module stays small and starts fast. engine.ts holds the
   equivalent zod schemas for the page; tests/quotes-from-frens.test.ts checks they agree. */
export type PfConfig = { game: 'quotes-from-frens'; maxTicks: number; roundTicks: number };
/** A word tile: [phrase, word index in that phrase, used (0 or 1)]. */
export type Tile = [number, number, number];
export type Play = {
  rng: number;            // generator state (uint32)
  deck: number[];         // the phrases in the order this run deals them
  deckPos: number;
  phrase: number;         // the phrase on the card (-1 before the start)
  blanks: number[];       // word indices of the blanks, ascending
  filled: number[];       // 1 per blank once the right word is in it
  tiles: Tile[];          // the bench
  order: number[];        // the bench's display order (a permutation of the tile indices)
  dealt: number;          // tick the phrase appeared
  deadline: number;       // tick its fuse burns out
  result: number;         // 0 on the card, 1 finished, 2 burnt (shown until `breakUntil`)
  breakUntil: number;
  mix: number;            // 1: this phrase's bench reshuffles
  lastMix: number;
  lives: number; streak: number; bestStreak: number;
  done: number; missed: number; wrong: number; words: number;
  pts: number;            // points so far (can dip below zero; the official score never does)
  bonus: number;          // end-of-run bonus, set once
  end: number;            // 0 running, 1 the clock ran out, 2 no lives left, 3 never started
};
export type PfState = { tick: number; gameOver: boolean; started: boolean; startTick: number | null; seed: number; rules: PfConfig; play: Play };
export type PfInput = { action: 'start' } | { action: 'place'; tile: number; slot: number };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const MAX_INT = Number.MAX_SAFE_INTEGER;
const BIG = 1_000_000_000;
function exactKeys(v: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(v);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(v, k));
}
const fail = (what: string): never => { throw new Error(`Invalid QUOTES FROM FRENS ${what}`); };

export function parseSeed(seed: unknown): number { return isInt(seed, 0, 0xffffffff) ? seed : fail('seed'); }
/** The scoring config (extra keys are dropped, like a non-strict object schema). */
export function parseConfig(value: unknown): PfConfig {
  if (!isObject(value) || value.game !== 'quotes-from-frens' || !isInt(value.maxTicks, 1, 100_000) || !isInt(value.roundTicks, 1, 100_000)
    || value.maxTicks < value.roundTicks) return fail('config');
  return { game: 'quotes-from-frens', maxTicks: value.maxTicks, roundTicks: value.roundTicks };
}
/** An input, or null when it is not one (unknown action, extra field, out-of-range number). */
export function parseInput(value: unknown): PfInput | null {
  if (!isObject(value)) return null;
  if (value.action === 'start') return exactKeys(value, ['action']) ? { action: 'start' } : null;
  if (value.action === 'place' && exactKeys(value, ['action', 'tile', 'slot'])
    && isInt(value.tile, 0, RULES.maxTiles - 1) && isInt(value.slot, 0, RULES.maxBlanks - 1)) return { action: 'place', tile: value.tile, slot: value.slot };
  return null;
}
const PLAY_KEYS = ['rng', 'deck', 'deckPos', 'phrase', 'blanks', 'filled', 'tiles', 'order', 'dealt', 'deadline', 'result', 'breakUntil',
  'mix', 'lastMix', 'lives', 'streak', 'bestStreak', 'done', 'missed', 'wrong', 'words', 'pts', 'bonus', 'end'] as const;
const STATE_KEYS = ['tick', 'gameOver', 'started', 'startTick', 'seed', 'rules', 'play'] as const;
const isTile = (t: unknown): t is Tile => Array.isArray(t) && t.length === 3 && isInt(t[0], 0, PHRASE_COUNT - 1)
  && isInt(t[1], 0, (WORDS[t[0] as number] as readonly string[]).length - 1) && isInt(t[2], 0, 1);
/** A run state as the coordinator hands it back: strict shape, bounded numbers, a coherent card. Throws otherwise. */
export function checkState(value: unknown): PfState {
  if (!isObject(value) || !exactKeys(value, STATE_KEYS)) return fail('state');
  const p = value.play;
  if (!isObject(p) || !exactKeys(p, PLAY_KEYS)) return fail('state');
  const { deck, blanks, filled, tiles, order } = p;
  if (!isInt(p.rng, 0, 0xffffffff) || !isInt(p.deckPos, 0, PHRASE_COUNT) || !isInt(p.phrase, -1, PHRASE_COUNT - 1)
    || !isInt(p.dealt, 0, MAX_INT) || !isInt(p.deadline, 0, MAX_INT) || !isInt(p.result, 0, 2) || !isInt(p.breakUntil, 0, MAX_INT)
    || !isInt(p.mix, 0, 1) || !isInt(p.lastMix, 0, MAX_INT) || !isInt(p.lives, 0, RULES.lives) || !isInt(p.streak, 0, BIG)
    || !isInt(p.bestStreak, 0, BIG) || !isInt(p.done, 0, BIG) || !isInt(p.missed, 0, BIG) || !isInt(p.wrong, 0, BIG)
    || !isInt(p.words, 0, BIG) || !isInt(p.pts, -BIG, BIG) || !isInt(p.bonus, 0, BIG) || !isInt(p.end, 0, 3)) return fail('state');
  if (!Array.isArray(deck) || deck.length !== PHRASE_COUNT || !deck.every((i) => isInt(i, 0, PHRASE_COUNT - 1))
    || new Set(deck).size !== PHRASE_COUNT) return fail('state');
  const words = p.phrase >= 0 ? (WORDS[p.phrase] as readonly string[]).length : 0;
  if (!Array.isArray(blanks) || blanks.length > RULES.maxBlanks || !blanks.every((b) => isInt(b, 0, Math.max(0, words - 1)))
    || (p.phrase >= 0 && (blanks.length === 0 || blanks.length >= words)) || (p.phrase < 0 && blanks.length !== 0)) return fail('state');
  for (let i = 1; i < blanks.length; i++) if ((blanks[i] as number) <= (blanks[i - 1] as number)) return fail('state');
  if (!Array.isArray(filled) || filled.length !== blanks.length || !filled.every((f) => isInt(f, 0, 1))) return fail('state');
  if (!Array.isArray(tiles) || tiles.length > RULES.maxTiles || !tiles.every(isTile)) return fail('state');
  if (!Array.isArray(order) || order.length !== tiles.length || !order.every((i) => isInt(i, 0, tiles.length - 1))
    || new Set(order).size !== order.length) return fail('state');
  const { tick, gameOver, started, startTick, seed } = value;
  if (!isInt(tick, 0, MAX_INT) || typeof gameOver !== 'boolean' || typeof started !== 'boolean'
    || (startTick !== null && !isInt(startTick, 0, MAX_INT)) || !isInt(seed, 0, 0xffffffff)) return fail('state');
  const rules = parseConfig(value.rules);
  if (started !== (startTick !== null) || (startTick !== null && startTick > tick) || tick > rules.maxTicks
    || gameOver !== (p.end !== 0) || (started && !gameOver && p.phrase < 0)) return fail('timeline');
  return {
    tick, gameOver, started, startTick, seed, rules,
    play: {
      rng: p.rng, deck: (deck as number[]).slice(), deckPos: p.deckPos, phrase: p.phrase, blanks: (blanks as number[]).slice(),
      filled: (filled as number[]).slice(), tiles: (tiles as Tile[]).map((t) => t.slice() as Tile), order: (order as number[]).slice(),
      dealt: p.dealt, deadline: p.deadline, result: p.result, breakUntil: p.breakUntil, mix: p.mix, lastMix: p.lastMix,
      lives: p.lives, streak: p.streak, bestStreak: p.bestStreak, done: p.done, missed: p.missed, wrong: p.wrong, words: p.words,
      pts: p.pts, bonus: p.bonus, end: p.end,
    },
  };
}

/* ============================== ARITHMETIC ================================== */
/** One step of mulberry32 on a generator state kept in the play (uint32 out, state updated). */
export function nextRand(play: Play): number {
  const a = (play.rng + 0x6D2B79F5) | 0;
  play.rng = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}
const below = (play: Play, n: number): number => nextRand(play) % n;
const lerp = (range: readonly [number, number], d: number): number => range[0] + Math.floor((range[1] - range[0]) * d / 1000);
function shuffle(play: Play, list: number[]): void {
  for (let i = list.length - 1; i > 0; i--) { const j = below(play, i + 1); const t = list[i] as number; list[i] = list[j] as number; list[j] = t; }
}
/** FNV-1a of a string: the run's first generator state. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Difficulty 0..1000 after `e` ticks of a round of `round` ticks: convex, gentle start and a hard end. */
export function difficulty(e: number, round: number): number {
  const p = Math.max(0, Math.min(1000, Math.floor(e * 1000 / round)));
  return Math.floor(p * (p + 500) / 1500);
}
/** The word a tile carries, and the word a blank of the card wants. */
export const tileWord = (t: Tile): string => (WORDS[t[0]] as readonly string[])[t[1]] as string;
export const blankWord = (play: Play, slot: number): string => (WORDS[play.phrase] as readonly string[])[play.blanks[slot] as number] as string;
/** The official score so far: points plus the end bonus, never below zero. */
export const scoreOf = (play: Play): number => Math.max(0, play.pts + play.bonus);

/* ================================ ENGINE ==================================== */
export function createEngine() {
  function newPlay(seed: number): Play {
    const play: Play = {
      rng: hash(`quotes-from-frens:${seed}`), deck: Array.from({ length: PHRASE_COUNT }, (_, i) => i), deckPos: 0, phrase: -1,
      blanks: [], filled: [], tiles: [], order: [], dealt: 0, deadline: 0, result: 0, breakUntil: 0, mix: 0, lastMix: 0,
      lives: RULES.lives, streak: 0, bestStreak: 0, done: 0, missed: 0, wrong: 0, words: 0, pts: 0, bonus: 0, end: 0,
    };
    shuffle(play, play.deck);
    return play;
  }

  /** Puts the next phrase of the deck on the card, with its blanks and its bench of tiles. */
  function deal(state: PfState): void {
    const play = state.play;
    const e = state.tick - (state.startTick as number), d = difficulty(e, state.rules.roundTicks);
    if (play.deckPos >= PHRASE_COUNT) { play.deckPos = 0; const last = play.deck[PHRASE_COUNT - 1] as number; shuffle(play, play.deck);
      if (play.deck[0] === last) { play.deck[0] = play.deck[1] as number; play.deck[1] = last; } }   // never the same phrase twice in a row
    const phrase = play.deck[play.deckPos++] as number, words = WORDS[phrase] as readonly string[];
    // the blanks
    let count = lerp(RULES.blanks, d) + (below(play, 100) < RULES.extraBlankPct ? 1 : 0);
    count = Math.max(1, Math.min(count, RULES.maxBlanks, words.length - 1));
    const idx = Array.from({ length: words.length }, (_, i) => i);
    shuffle(play, idx);
    const blanks = idx.slice(0, count).sort((a, b) => a - b);
    // the bench: the right words, then decoys whose text matches no blank
    const tiles: Tile[] = blanks.map((w) => [phrase, w, 0]);
    const wanted = new Set(blanks.map((w) => words[w] as string));
    const decoys = Math.min(lerp(RULES.decoys, d), RULES.maxTiles - tiles.length);
    for (let tries = 0; tiles.length < count + decoys && tries < 60; tries++) {
      const p = below(play, PHRASE_COUNT), ws = WORDS[p] as readonly string[], w = below(play, ws.length), text = ws[w] as string;
      if (wanted.has(text) || tiles.some((t) => tileWord(t) === text)) continue;
      tiles.push([p, w, 0]);
    }
    const order = Array.from({ length: tiles.length }, (_, i) => i);
    shuffle(play, order);
    play.phrase = phrase; play.blanks = blanks; play.filled = blanks.map(() => 0); play.tiles = tiles; play.order = order;
    play.dealt = state.tick; play.deadline = state.tick + lerp(RULES.fuse, d) + RULES.fusePerBlank * count;
    play.result = 0; play.breakUntil = 0; play.mix = d >= RULES.mixFrom ? 1 : 0; play.lastMix = state.tick;
  }

  /** The end of the clock: the finish bonus, paid once. */
  function finish(state: PfState): void {
    const play = state.play, s = RULES.score;
    play.bonus = s.finish + play.lives * s.perLife + (play.missed === 0 ? s.clean : 0);
    play.end = 1; state.gameOver = true;
  }

  /** One server tick of a started run that is not over. */
  function runTick(state: PfState): void {
    const play = state.play;
    if (play.result !== 0) {                                   // between two phrases
      if (state.tick >= play.breakUntil) deal(state);
      return;
    }
    if (state.tick >= play.deadline) {                         // the fuse burnt out
      play.result = 2; play.breakUntil = state.tick + RULES.breakTicks;
      play.missed++; play.lives--; play.streak = 0; play.pts += RULES.score.missed;
      if (play.lives <= 0) { play.end = 2; state.gameOver = true; }
      return;
    }
    if (play.mix && state.tick - play.lastMix >= RULES.mixEvery) { shuffle(play, play.order); play.lastMix = state.tick; }
  }

  /** Puts tile `tile` in blank `slot`. A wrong word costs points; the last right word finishes the phrase. */
  function place(state: PfState, tileIndex: number, slot: number): void {
    const play = state.play;
    if (play.result !== 0) return;                             // nothing to fill between two phrases
    const tile = play.tiles[tileIndex];
    if (!tile || tile[2] === 1 || slot >= play.blanks.length || play.filled[slot] === 1) return;   // no such tile or blank: a no-op
    if (tileWord(tile) !== blankWord(play, slot)) {
      play.wrong++; play.streak = 0; play.pts += RULES.score.wrong;
      return;
    }
    tile[2] = 1; play.filled[slot] = 1; play.words++; play.pts += RULES.score.word;
    if (play.filled.every((f) => f === 1)) {
      const s = RULES.score, left = Math.max(0, play.deadline - state.tick);
      const base = s.phrase + s.perBlank * play.blanks.length + Math.floor(left / RULES.timeBonusDiv);
      play.pts += Math.floor(base * (10 + 2 * Math.min(play.streak, RULES.streakCap)) / 10);
      play.streak++; play.bestStreak = Math.max(play.bestStreak, play.streak); play.done++;
      play.result = 1; play.breakUntil = state.tick + RULES.breakTicks;
    }
  }

  /* ----------------------- run lifecycle (coordinator contract) ----------------------- */
  function endTickOf(state: PfState): number {
    return state.startTick === null ? state.rules.maxTicks : Math.min(state.rules.maxTicks, state.startTick + state.rules.roundTicks);
  }
  /** Mutating advance (the browser's prediction uses it directly). */
  function advanceInPlace(state: PfState, serverTick: number): PfState {
    if (!Number.isSafeInteger(serverTick) || serverTick < state.tick) {
      throw new Error('serverTick must be a nonnegative safe integer and must not move backwards');
    }
    if (state.gameOver) return state;
    const endTick = endTickOf(state);
    const target = Math.min(serverTick, endTick);
    if (!state.started) state.tick = target;
    else while (state.tick < target && !state.gameOver) { state.tick++; runTick(state); }
    if (!state.gameOver && state.tick >= endTick) {
      if (state.started) finish(state);
      else { state.play.end = 3; state.gameOver = true; }
    }
    return state;
  }
  const clone = (state: PfState): PfState => structuredClone(state);

  function createRun(seed: unknown, config: unknown): PfState {
    const validSeed = parseSeed(seed);
    const rules = parseConfig(config);
    return { tick: 0, gameOver: false, started: false, startTick: null, seed: validSeed, rules, play: newPlay(validSeed) };
  }
  function advance(state: PfState, serverTick: number): PfState {
    if (!Number.isSafeInteger(serverTick) || serverTick < state.tick) {
      throw new Error('serverTick must be a nonnegative safe integer and must not move backwards');
    }
    if (state.gameOver || serverTick === state.tick) return state;
    return advanceInPlace(clone(state), serverTick);
  }
  function applyInputInPlace(state: PfState, input: unknown, serverTick: number): PfState {
    advanceInPlace(state, serverTick);
    if (state.gameOver) return state;
    const action = parseInput(input);
    if (!action) return state;
    if (action.action === 'start') {
      if (!state.started) { state.started = true; state.startTick = state.tick; deal(state); }
      return state;
    }
    if (!state.started) return state;
    place(state, action.tile, action.slot);
    return state;
  }
  function applyInput(state: PfState, input: unknown, serverTick: number): PfState {
    return applyInputInPlace(clone(state), input, serverTick);
  }
  const view = (state: PfState): PfState => state;
  const isFinished = (state: PfState): boolean => state.gameOver;
  const score = (state: PfState): number => scoreOf(state.play);

  return { createRun, advance, applyInput, view, isFinished, score, advanceInPlace, applyInputInPlace, place, deal, clone, endTickOf, newPlay };
}
export type QuotesFromFrensEngine = ReturnType<typeof createEngine>;

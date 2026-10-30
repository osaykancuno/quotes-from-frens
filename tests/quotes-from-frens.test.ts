import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { mulberry32 } from '../src/common/det.js';
import {
  PHRASES, PHRASE_COUNT, RULES, WORDS, blankWord, checkState, createEngine, difficulty, inputSchema, parseInput, scoreOf, snapshotSchema, stateSchema,
  tileWord, type PfState,
} from '../src/games/quotes-from-frens/engine.js';
import { scoringConfiguration, type Configuration } from '../src/shell/config.js';
import { packageGame } from '../scripts/package-game.js';
import { Coordinator, loadBuiltVerifier } from './helpers/coordinator.js';

const engine = createEngine();
const CONFIG = scoringConfiguration('quotes-from-frens');
const roundtrip = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const started = (seed: number, at = 0): PfState => engine.applyInput(engine.createRun(seed, CONFIG), { action: 'start' }, at);
/** The right tile for a blank (what a perfect player would pick), or -1. */
const rightTile = (s: PfState, slot: number): number => s.play.tiles.findIndex((t) => t[2] === 0 && tileWord(t) === blankWord(s.play, slot));
const wrongTile = (s: PfState, slot: number): number => s.play.tiles.findIndex((t) => t[2] === 0 && tileWord(t) !== blankWord(s.play, slot));

/**
 * A modelled player: it needs `read` ticks to read a new phrase, then `perWord` ticks per word plus 2 per tile still on
 * the bench (finding it) and 8 more when the bench reshuffles; `errPct` of its picks are wrong. One input per tick at
 * most, like the platform. Every input it sends is legal: the platform accepts a bot's inputs like anyone's.
 */
function playRun(seed: number, read: number, perWord: number, errPct: number): { state: PfState; inputs: { input: unknown; tick: number }[] } {
  const rnd = mulberry32(seed * 7 + 1);
  let s = engine.applyInput(engine.createRun(seed, CONFIG), { action: 'start' }, 1);
  const inputs: { input: unknown; tick: number }[] = [{ input: { action: 'start' }, tick: 1 }];
  let tick = 1, busyUntil = 1 + read, seenCard = s.play.dealt;
  while (!s.gameOver) {
    tick++;
    const p = s.play;
    if (p.result === 0 && p.dealt !== seenCard) { seenCard = p.dealt; busyUntil = tick + read; }
    if (p.result === 0 && tick >= busyUntil) {
      const slot = p.filled.indexOf(0);
      let tile = rightTile(s, slot);
      if (rnd() * 100 < errPct) { const w = wrongTile(s, slot); if (w >= 0) tile = w; }
      const input = { action: 'place', tile, slot };
      s = engine.applyInput(s, input, tick); inputs.push({ input, tick });
      busyUntil = tick + perWord + p.tiles.filter((t) => t[2] === 0).length * 2 + p.mix * 8;
      continue;
    }
    s = engine.advance(s, tick);
  }
  return { state: s, inputs };
}

test('quotes-from-frens: the 23 official phrases, word for word', () => {
  assert.equal(PHRASE_COUNT, 23);
  assert.ok(PHRASES.includes('The Hype Left. We Didn\'t.'));
  assert.ok(PHRASES.includes('Built to change. Designed to never be finished. Shaped by Frens.'));
  assert.ok(PHRASES.includes('Weirdos: No explanation available.'));
  for (const words of WORDS) assert.ok(words.length >= 2, 'every phrase has a word to fill and one to keep');
});

test('quotes-from-frens: createRun validates the seed and the scoring config; start deals the first phrase', () => {
  const run = engine.createRun(42, CONFIG);
  assert.equal(run.rules.game, 'quotes-from-frens'); assert.equal(run.started, false); assert.equal(run.play.phrase, -1); assert.equal(engine.score(run), 0);
  for (const seed of [-1, 1.5, 2 ** 32, '1', null]) assert.throws(() => engine.createRun(seed, CONFIG));
  assert.throws(() => engine.createRun(1, { ...CONFIG, game: 'full-row' }));
  assert.throws(() => engine.createRun(1, { ...CONFIG, maxTicks: 5 }));
  const s = started(42, 3);
  assert.ok(s.play.phrase >= 0); assert.equal(s.play.dealt, 3); assert.ok(s.play.deadline > 3);
  assert.ok(s.play.blanks.length >= 1 && s.play.blanks.length < (WORDS[s.play.phrase] as string[]).length);
  for (let slot = 0; slot < s.play.blanks.length; slot++) assert.ok(rightTile(s, slot) >= 0, 'every blank has its word on the bench');
  assert.deepEqual([...s.play.order].sort((a, b) => a - b), s.play.tiles.map((_, i) => i));
});

test('quotes-from-frens: decoys never carry the text of a blank, so a word is right or wrong without ambiguity', () => {
  for (let seed = 1; seed <= 15; seed++) {
    let s = started(seed);
    for (let k = 0; k < 10 && !s.gameOver; k++) {
      const wanted = new Set(s.play.blanks.map((_, i) => blankWord(s.play, i)));
      const right = s.play.tiles.filter((t) => t[0] === s.play.phrase && s.play.blanks.includes(t[1]));
      assert.equal(right.length, s.play.blanks.length);
      for (const t of s.play.tiles) if (!right.includes(t)) assert.ok(!wanted.has(tileWord(t)), `decoy ${tileWord(t)}`);
      s = engine.advance(s, s.play.deadline + RULES.breakTicks + 1);     // burn it and see the next one
      s.play.lives = RULES.lives;
    }
  }
});

test('quotes-from-frens: the right word fills its blank, the last one finishes the phrase; a wrong word costs 30', () => {
  let s = started(7);
  const blanks = s.play.blanks.length;
  const bad = wrongTile(s, 0);
  const afterWrong = engine.applyInput(s, { action: 'place', tile: bad, slot: 0 }, 5);
  assert.equal(afterWrong.play.wrong, 1); assert.equal(afterWrong.play.pts, RULES.score.wrong); assert.equal(afterWrong.play.filled[0], 0);
  assert.equal(scoreOf(afterWrong.play), 0, 'the official score never goes below zero');
  for (let slot = 0; slot < blanks; slot++) s = engine.applyInput(s, { action: 'place', tile: rightTile(s, slot), slot }, 5 + slot);
  assert.equal(s.play.result, 1); assert.equal(s.play.done, 1); assert.equal(s.play.words, blanks); assert.equal(s.play.streak, 1);
  const left = s.play.deadline - (5 + blanks - 1);
  assert.equal(s.play.pts, blanks * RULES.score.word + RULES.score.phrase + RULES.score.perBlank * blanks + Math.floor(left / RULES.timeBonusDiv));
  // between two phrases nothing can be placed; then the next phrase comes
  assert.deepEqual(engine.applyInput(s, { action: 'place', tile: 0, slot: 0 }, s.tick + 1), engine.advance(s, s.tick + 1));
  const next = engine.advance(s, s.play.breakUntil);
  assert.equal(next.play.result, 0); assert.notEqual(next.play.phrase, s.play.phrase, 'never the same phrase twice in a row');
});

test('quotes-from-frens: a streak multiplies a finished phrase (×1.2 per phrase, capped at ×2)', () => {
  let s = started(11), gains: number[] = [];
  for (let k = 0; k < 7; k++) {
    const before = s.play.pts, blanks = s.play.blanks.length;
    for (let slot = 0; slot < blanks; slot++) s = engine.applyInput(s, { action: 'place', tile: rightTile(s, slot), slot }, s.tick + 1);
    const left = s.play.deadline - s.tick, base = RULES.score.phrase + RULES.score.perBlank * blanks + Math.floor(left / RULES.timeBonusDiv);
    gains.push(s.play.pts - before - blanks * RULES.score.word);
    assert.equal(s.play.pts - before - blanks * RULES.score.word, Math.floor(base * (10 + 2 * Math.min(k, 5)) / 10));
    s = engine.advance(s, s.play.breakUntil);
  }
  assert.equal(s.play.bestStreak, 7);
  assert.ok(gains.length === 7);
});

test('quotes-from-frens: illegal or forged inputs are no-ops (time still moves); nothing counts before the start', () => {
  const s0 = engine.createRun(5, CONFIG);
  assert.deepEqual(engine.applyInput(s0, { action: 'place', tile: 0, slot: 0 }, 3), engine.advance(s0, 3));
  const s = started(5);
  const right = rightTile(s, 0);
  const forged: unknown[] = [
    { action: 'place', tile: right, slot: 0, score: 9999 }, { action: 'place', tile: right }, { action: 'place', slot: 0 },
    { action: 'place', tile: 12, slot: 0 }, { action: 'place', tile: -1, slot: 0 }, { action: 'place', tile: right, slot: 5 },
    { action: 'place', tile: 1.5, slot: 0 }, { action: 'place', tile: String(right), slot: 0 }, { action: 'place', tile: right, slot: 0, word: 'The' },
    { action: 'finish' }, { action: 'start', startTick: 0 }, { action: 'hit', targetId: 1 }, 'place', 7, null, [], {},
  ];
  for (const input of forged) {
    assert.equal(parseInput(input), null, JSON.stringify(input));
    assert.equal(inputSchema.safeParse(input).success, false, `zod agrees: ${JSON.stringify(input)}`);
    assert.deepEqual(engine.applyInput(s, input, 10), engine.advance(s, 10), `ignored: ${JSON.stringify(input)}`);
  }
  // a legal-looking input on a tile or blank that does not exist, or a blank already filled: also a no-op
  const out = s.play.tiles.length;
  if (out < RULES.maxTiles) assert.deepEqual(engine.applyInput(s, { action: 'place', tile: out, slot: 0 }, 10), engine.advance(s, 10));
  const filled = engine.applyInput(s, { action: 'place', tile: right, slot: 0 }, 10);
  assert.deepEqual(engine.applyInput(filled, { action: 'place', tile: right, slot: 0 }, 11), engine.advance(filled, 11), 'a used tile cannot score twice');
});

test('quotes-from-frens: a burnt fuse costs a life and 100 points; three of them end the run with no finish bonus', () => {
  let s = started(13);
  s = engine.advance(s, s.play.deadline);
  assert.equal(s.play.result, 2); assert.equal(s.play.missed, 1); assert.equal(s.play.lives, 2); assert.equal(s.play.pts, RULES.score.missed);
  for (let k = 0; k < 2; k++) { s = engine.advance(s, s.play.breakUntil); s = engine.advance(s, s.play.deadline); }
  assert.equal(s.gameOver, true); assert.equal(s.play.end, 2); assert.equal(s.play.bonus, 0); assert.equal(engine.score(s), 0);
});

test('quotes-from-frens: start once; the server clock ends the run and pays the finish bonus once; then nothing moves', () => {
  const s = started(9, 4);
  assert.equal(engine.applyInput(s, { action: 'start' }, 50).startTick, 4, 'a second start does not move the deadline');
  assert.throws(() => engine.advance(engine.advance(s, 20), 10), /backwards/);
  const { state } = playRun(9, 20, 10, 0);
  assert.equal(state.play.end, 1); assert.equal(state.tick, CONFIG.roundTicks + 1);
  assert.equal(state.play.bonus, RULES.score.finish + state.play.lives * RULES.score.perLife + (state.play.missed === 0 ? RULES.score.clean : 0));
  assert.deepEqual(engine.applyInput(state, { action: 'place', tile: 0, slot: 0 }, CONFIG.maxTicks), state);
  const never = engine.advance(engine.createRun(3, CONFIG), CONFIG.maxTicks);
  assert.equal(never.gameOver, true); assert.equal(never.play.end, 3); assert.equal(engine.score(never), 0, 'a run never started scores nothing');
});

test('quotes-from-frens: the difficulty grows: more blanks, more decoys, shorter fuses, a reshuffling bench at the end', () => {
  assert.equal(difficulty(0, CONFIG.roundTicks), 0); assert.equal(difficulty(CONFIG.roundTicks, CONFIG.roundTicks), 1000);
  const stats = (from: number, to: number) => {
    let s = started(21), blanks = 0, tiles = 0, fuse = 0, mix = 0, n = 0, dealt = -1;
    while (s.tick < to && !s.gameOver) {
      s = engine.advance(s, s.tick + 1); s.play.lives = RULES.lives;
      if (s.play.result === 0 && s.play.dealt !== dealt) {
        dealt = s.play.dealt;
        if (s.tick - (s.startTick ?? 0) >= from) { n++; blanks += s.play.blanks.length; tiles += s.play.tiles.length; fuse += (s.play.deadline - s.play.dealt) / s.play.blanks.length; mix += s.play.mix; }
      }
    }
    return { blanks: blanks / n, tiles: tiles / n, fusePerBlank: fuse / n, mix: mix / n };
  };
  const early = stats(0, 400), late = stats(1300, 1800);
  assert.ok(late.blanks > early.blanks && late.tiles > early.tiles && late.fusePerBlank < early.fusePerBlank, JSON.stringify({ early, late }));
  assert.equal(early.mix, 0); assert.equal(late.mix, 1);
});

test('quotes-from-frens: the hand-written state check and the zod schema are the same check; states round-trip through JSON', () => {
  const { state } = playRun(101, 30, 20, 10);
  for (const s of [engine.createRun(1, CONFIG), started(2), engine.advance(started(3), 600), state]) {
    assert.deepEqual(checkState(roundtrip(s)), s);
    assert.equal(stateSchema.safeParse(roundtrip(s)).success, true);
  }
  const s = started(4);
  const bad: ((x: any) => void)[] = [
    (x) => { x.extra = 1; }, (x) => { x.play.extra = 1; }, (x) => { x.play.lives = 4; }, (x) => { x.play.phrase = 23; },
    (x) => { x.play.blanks = []; }, (x) => { x.play.blanks = [...x.play.blanks].reverse().concat([0]); }, (x) => { x.play.filled = [1]; x.play.filled.push(0, 0, 0, 0, 0); },
    (x) => { x.play.tiles[0] = [0, 99, 0]; }, (x) => { x.play.tiles[0] = [0, 0, 2]; }, (x) => { x.play.order = x.play.order.map(() => 0); },
    (x) => { x.play.deck[0] = x.play.deck[1]; }, (x) => { x.play.pts = 1.5; }, (x) => { x.play.end = 1; },
    (x) => { x.startTick = x.tick + 1; }, (x) => { x.started = false; }, (x) => { x.rules.game = 'full-row'; }, (x) => { x.tick = 5000; },
  ];
  for (const mutate of bad) {
    const copy = roundtrip(s) as any; mutate(copy);
    assert.throws(() => checkState(copy), `checkState refuses ${mutate.toString()}`);
    assert.equal(stateSchema.safeParse(copy).success, false, `zod refuses ${mutate.toString()}`);
  }
  const snapshot = { runId: '6f1d2c3b-1a2b-4c3d-8e9f-0a1b2c3d4e5f', configDigest: 'a'.repeat(64), serverTick: s.tick, inputSeq: 1, inputTick: 0,
    expiresAt: new Date().toISOString(), state: roundtrip(s), result: null };
  assert.equal(snapshotSchema.safeParse(snapshot).success, true);
});

test('quotes-from-frens: quick players lose nothing, slow ones lose phrases, an idle one is out; states stay small', () => {
  const rows: string[] = [];
  let quickClean = 0, slowLost = 0, quick = 0, slow = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const q = playRun(seed, 30, 16, 5).state, sl = playRun(seed, 60, 36, 15).state, idle = playRun(seed, 1e9, 1, 0).state;
    assert.equal(idle.play.end, 2, 'nobody survives without playing'); assert.equal(engine.score(idle), 0);
    if (q.play.end === 1 && q.play.missed === 0) quickClean++;
    if (sl.play.missed > 0) slowLost++;
    quick += engine.score(q); slow += engine.score(sl);
    assert.ok(JSON.stringify(q).length < 4_000);
    if (seed <= 4) rows.push(`seed ${seed}: quick ${engine.score(q)} (${q.play.done} phrases) · slow ${engine.score(sl)} (${sl.play.done} phrases, ${sl.play.missed} lost) · idle out at ${((idle.tick - 1) / 20).toFixed(0)} s`);
  }
  console.log(`  ${rows.join('\n  ')}`);
  assert.ok(quickClean >= 7, `quick players finish clean (${quickClean}/8)`);
  assert.ok(slowLost >= 3, `slow players lose phrases (${slowLost}/8)`);
  assert.ok(quick > slow, 'skill pays');
});

/* ======================== the BUILT verifier (what Studio runs) ======================== */
const DEPLOY: Configuration = {
  appId: '00000000-0000-4000-8000-00000000fc02', groupId: '60faaf46-ba4b-460c-a82a-adb852371a94',
  studioUrl: 'https://studio.superrare.com', apiUrl: 'https://api.superrare.com', connectUrl: 'https://connect.superrare.com',
  appOrigin: 'https://quotes-from-frens.example.com', display: 'embed', game: 'quotes-from-frens', hubUrl: 'https://6972mvu4.srstudio.dev/',
};
async function built() {
  const files = unzipSync(zipSync(await packageGame(DEPLOY)));
  const verifier = await loadBuiltVerifier(files['server-verifier.js'] as Uint8Array);
  return { files, verifier, config: JSON.parse(strFromU8(files['scoring-config.json'] as Uint8Array)) as Record<string, unknown> };
}

test('quotes-from-frens: the archive has the root layout, the credit line, a zod-free verifier under 256 KB', async () => {
  const { files, config } = await built();
  for (const required of ['index.html', 'config.json', 'server-verifier.js', 'scoring-config.json']) assert.ok(files[required], `missing ${required}`);
  assert.deepEqual(config, CONFIG);
  const source = files['server-verifier.js'] as Uint8Array;
  assert.ok(source.byteLength < 256_000);
  assert.ok(!/zod|ZodError|\$ZodType/.test(new TextDecoder().decode(source)), 'zod-free verifier');
  const html = strFromU8(files['index.html'] as Uint8Array);
  assert.ok(html.includes('<title>QUOTES FROM FRENS · THE WALL ARCADE</title>'));
  assert.ok(/href="https:\/\/onthewall\.nfcsummit\.com"[^>]*>A Remix The Wall experiment · NFC Summit 2027 · Lisbon</i.test(html), 'the credit line, linked');
  const publicConfig = strFromU8(files['config.json'] as Uint8Array);
  assert.ok(!/secret|token|private|treasury|0x[0-9a-fA-F]{40}/i.test(publicConfig));
  assert.ok(publicConfig.includes('60faaf46-ba4b-460c-a82a-adb852371a94'), "the arcade's shared credit group");
});

test('quotes-from-frens: whole runs through the BUILT verifier equal the engine, replay exactly, stay small and fast', async () => {
  const { verifier, config } = await built();
  for (const seed of [123456, 0, 0xfeedface]) {
    const { state: local, inputs } = playRun(seed, 30, 20, 10);
    const run = new Coordinator<PfState>(verifier, config, seed);
    await run.create();
    for (const { input, tick } of inputs) await run.input(input, tick);
    await run.advanceTo(local.tick);
    assert.deepEqual(run.state, local, 'bundled verifier state equals the engine run in-process');
    assert.equal(await run.isFinished(), true); assert.equal(await run.score(), engine.score(local));
    console.log(`  quotes-from-frens built verifier (seed ${seed}): ${run.calls} calls, score ${await run.score()}, ${local.play.done} phrases, largest state ${run.largestState} B`);
    assert.ok(run.largestState < 4_000);
  }
  const lump = new Coordinator<PfState>(verifier, config, 7);
  await lump.create(); await lump.input({ action: 'start' });
  const warm = new Coordinator<PfState>(verifier, config, 8); await warm.create(); await warm.input({ action: 'start' }); await warm.advanceTo(CONFIG.roundTicks);
  await lump.advanceTo(CONFIG.roundTicks + 1);
  assert.equal(lump.state.gameOver, true);
  console.log(`  quotes-from-frens: one call from start to the end: ${lump.worstMs.toFixed(2)} ms`);
  assert.ok(lump.worstMs < 10, `worst call ${lump.worstMs} ms`);
});

test('quotes-from-frens: the BUILT verifier refuses forged requests and ignores forged inputs', async () => {
  const { verifier, config } = await built();
  const run = new Coordinator<PfState>(verifier, config, 3);
  const state = await run.create();
  const post = (payload: unknown) => verifier.fetch(new Request('https://verifier.invalid/v1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
  assert.equal((await post({ version: 1, op: 'submitScore', score: 999999 })).status, 400);
  assert.equal((await post({ version: 1, op: 'score', state: { ...state, play: { ...state.play, bonus: 999999, end: 1 } } })).status, 400, 'an incoherent state is refused');
  assert.equal((await post({ version: 1, op: 'advance', state, serverTick: -1 })).status, 400);
  await run.input({ action: 'start' });
  const before = run.state;
  await run.input({ action: 'place', tile: 0, slot: 0, score: 1_000_000 });
  assert.equal(await run.score(), engine.score(engine.advance(before, run.tick)), 'a score field in an input is not a score');
});

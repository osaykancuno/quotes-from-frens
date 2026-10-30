# QUOTES FROM FRENS

A 90-second word game for THE WALL ARCADE, made of the official JPEG Frens phrases, in the world of JPEG Frens (a
purple workshop at night, a paper sign, word tiles on a workbench, ink outlines, the forge). It stars **JPEG-FRENS**
(panel 32 of the wall): every phrase on the sign is signed with its name. The people of the wall walk by the workshop
with their sprites (people.json, display only).

## The rules (`src/games/quotes-from-frens/core.ts`)

- The 23 official phrases, word for word. A phrase appears on the sign with words missing; the bench holds the missing
  words mixed with words of other phrases (never one that reads like a missing word).
- One input: `{"action":"place","tile":0..11,"slot":0..4}` puts a tile in a blank. The server compares the words. A tap
  on a tile fills the first blank (the page sends the same input); keys 1–9 and 0 pick a tile by its place on the bench.
- A phrase has a fuse. All blanks filled before it burns out: the phrase is finished. The fuse burns out: one of three
  lives is lost. No lives left: the run is over. Otherwise the run lasts 90 seconds (1,800 server ticks).
- It gets harder as the clock runs out (difficulty is a convex curve of the time since the start): from 1 to 4–5
  blanks, from 2 to 7 decoy words, a shorter fuse (240 → 90 ticks, plus 22 per blank), and from about the middle of the
  run the bench reshuffles every 4 seconds. Phrases come in a shuffled deck, never the same twice in a row.
- Score: +10 per right word; a finished phrase +100, +25 per blank, + (ticks left on the fuse) / 4, all × the streak
  (×1.2 per phrase finished in a row, up to ×2); a wrong word −30 (and the streak resets); a burnt phrase −100. At the
  90-second mark: +500, +250 per life left, and +2,000 if no phrase burnt. Never below zero. The verifier's `score` is
  the official one.

Calibration (`tests/quotes-from-frens.test.ts`, players modelled with a reading time, a time per word that grows with the
words on the bench and a share of wrong picks): a quick player finishes every run without losing a phrase (about
10,000 points); a slow one loses one or two phrases late in the run (about 3,500); a player who does nothing is out in
about 40 seconds with 0.

## Files

| | |
| --- | --- |
| `src/games/quotes-from-frens/core.ts` | the phrases and the rules, zod-free (the verifier runs them) |
| `src/games/quotes-from-frens/engine.ts` | the schemas the page needs (they call core.ts's own checks) |
| `src/games/quotes-from-frens/client.ts` | the canvas stage, drag and drop, the end card, the adapter |
| `src/verifiers/quotes-from-frens.ts` | the verifier (`POST /v1`, protocol 1) |
| `src/entries/quotes-from-frens.ts` | the page's entry |
| `scripts/quotes-from-frens-config.ts` | writes `deploy/quotes-from-frens.config.json` from the bootstrap's answer |
| `tests/quotes-from-frens.test.ts` | rules, forged inputs, timing, replay, the built verifier |

Fun on top of the rules (display only, nothing changes the score): every finished quote is said by a Fren of the cast
(`frens.ts`, original drawings) who pops up with it in a speech bubble; the sign gets a FREN APPROVED stamp; three
quotes in a row start a FREN FRENZY (the sign burns pink, the streak pill says FRENZY); a quote finished with most of
its fuse left shouts LIGHTNING!, one saved in the last moments CLUTCH!. The wall's posters show the cast.

The end card carries one official phrase (picked by the run's seed) and POST ON X shares
"Just scored N in Quotes from Frens. <that phrase>" with the game's address.

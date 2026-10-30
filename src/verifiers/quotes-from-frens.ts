// QUOTES FROM FRENS's verifier: the rules (core.ts) behind the protocol envelope, without a schema library, so a cold
// isolate starts fast (the same choice as FULL ROW's).
import { checkState, createEngine } from '../games/quotes-from-frens/core.js';
import { makePlainVerifier } from './protocol-plain.js';

const engine = createEngine();
export default makePlainVerifier({
  checkState,
  createRun: engine.createRun, advance: engine.advance, applyInput: engine.applyInput,
  view: engine.view, isFinished: engine.isFinished, score: engine.score,
});

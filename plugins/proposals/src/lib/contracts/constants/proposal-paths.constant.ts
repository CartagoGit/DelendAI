/**
 * proposal-paths.constant.ts — x00153 S6.
 *
 * Single source of truth for every workspace-relative path that the
 * proposals plugin uses to persist operational state (peer-review log,
 * validate log, audit log, etc.). Before this file, the same path
 * constants were declared in two places (authoring.tool.ts and
 * proposal-transition.tool.ts), with one of them shadowing the other
 * and a half-applied move during a 2-commit series landing a00074 S5
 * producing a path-doubled, wrong-file `PEER_REVIEW_LOG_RELATIVE_PATH`
 * that broke 8 review→done tests.
 *
 * Every tool/service that needs a proposals-state path MUST import
 * the constant from this module. The only way to add a new proposals
 * state file is to declare its path here, so a `grep -r 'const
 * PEER_REVIEW_LOG_RELATIVE_PATH\|const VALIDATE_LOG_RELATIVE_PATH'
 * plugins/proposals/src` returns exactly 1 hit per constant and the
 * companion spec asserts that.
 */
import { join } from 'node:path';

/** Peer-review log — every `proposal_review { action: 'submit'|'approve'|'request_changes' }` appends one line. */
export const PEER_REVIEW_LOG_RELATIVE_PATH = join(
	'.cache',
	'delendai',
	'results',
	'logs',
	'peer-review.jsonl',
);

/** Validate log — every successful `bun run validate` run appends one line. Used by `proposal_transition`'s `validateEvidence` freshness check. */
export const VALIDATE_LOG_RELATIVE_PATH = join(
	'.cache',
	'delendai',
	'results',
	'logs',
	'validate.jsonl',
);

/**
 * Forced-regression audit log — every `done → review` move with
 * `force: true` records one line so the state-machine guards (a00074
 * S1) have a persistent trace.
 */
export const FORCED_REGRESSION_LOG_RELATIVE_PATH = join(
	'.cache',
	'delendai',
	'results',
	'logs',
	'forced-regressions.jsonl',
);

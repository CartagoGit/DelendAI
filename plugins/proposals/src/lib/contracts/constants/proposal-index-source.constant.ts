/**
 * proposal-index-source.constant.ts — where the proposal index is read
 * from, as one taxonomy stated once.
 */

import type { IProposalIndexSource } from '../interfaces/proposal-index-source.interface';

// ---------------------------------------------------------------------------
// S2 — source selection.
//
// `readProposalIndex` keeps its exact signature; what changes is where
// the entries come from. One taxonomy, three meanings, no overlap:
//
//   'json' — `<cacheDir>/proposals/index.json` and nothing else. The
//            one-line rollback.
//   'auto' — prefer the SQLite projection; serve JSON whenever SQL cannot
//            serve or disagrees with it. The DEFAULT. Every fallback is
//            logged ONCE per index path — this is the hot read path of 9
//            call sites and a per-call warning would drown the log.
//   'sql'  — the SQLite projection is the authority. If it cannot serve,
//            the read THROWS `ProposalIndexSqlUnavailableError`; if JSON
//            disagrees, SQL is served and the divergence reported.
//
// WHY `sql` stopped falling back: it used to behave exactly like `auto`,
// differing only in the wording of a warning. So pinning `sql` to prove
// production ran on SQL proved nothing — a run that silently read the
// legacy index looked identical to one that did not. The default moved
// from `sql` to `auto` in the same change, which leaves every unpinned
// caller reading exactly what it read before.
// ---------------------------------------------------------------------------

/**
 * The source used when neither the caller nor the environment says
 * otherwise: prefer SQL, with the parity-checked JSON fallback. Strict
 * SQL is something an operator opts into, because it turns "the database
 * is not built yet" from a notice into a failure.
 */
export const DEFAULT_PROPOSAL_INDEX_SOURCE: IProposalIndexSource = 'auto';

/**
 * Environment switch: the one-line rollback / roll-forward.
 *
 *   DELENDAI_PROPOSAL_INDEX_SOURCE=json   JSON only
 *   DELENDAI_PROPOSAL_INDEX_SOURCE=auto   prefer SQL, fall back to JSON (default)
 *   DELENDAI_PROPOSAL_INDEX_SOURCE=sql    SQL only; a read SQL cannot serve throws
 */
export const PROPOSAL_INDEX_SOURCE_ENV_VAR = 'DELENDAI_PROPOSAL_INDEX_SOURCE';

/** Environment override for the database path (tests, odd layouts). */
export const PROPOSAL_INDEX_DB_PATH_ENV_VAR = 'DELENDAI_PROPOSALS_DB_PATH';

/**
 * proposal-index-source.constant.ts — where the proposal index is read
 * from, as one taxonomy stated once.
 */

import type { IProposalIndexSource } from '../interfaces/proposal-index-source.interface';

// ---------------------------------------------------------------------------
// S4 phase 2 — source selection.
//
// `readProposalIndex` keeps its exact signature; what changes is where
// the entries come from. One taxonomy, three meanings, no overlap:
//
//   'json' — `<cacheDir>/proposals/index.json` and nothing else. The
//            one-line rollback.
//   'auto' — prefer the SQLite projection; serve JSON whenever SQL cannot
//            serve or disagrees with it. Every fallback is logged ONCE
//            per index path — this is the hot read path of 9 call sites
//            and a per-call warning would drown the log.
//   'sql'  — the SQLite projection is the authority. THE DEFAULT. If the
//            database is MISSING, or exists but was never stamped by a
//            reconcile, the read rebuilds the projection from markdown
//            (the leveller, `reconcileProjection` — it never throws) and
//            reads again before giving up; a database that exists but
//            cannot be OPENED (corrupt, locked, truncated) is never
//            rebuilt over — that would erase the evidence — so it still
//            THROWS `ProposalIndexSqlUnavailableError`. If JSON
//            disagrees with a projection that DID serve, SQL is served
//            and the divergence reported, never silently overridden.
//
// Three storage modes described elsewhere in other words are these,
// and there is deliberately no second switch for them: `shadow` is
// `auto`, `sql-primary-compare` is `sql` (served from SQLite, parity
// compared and divergence reported), and `sql-only` is also `sql` — a
// database that cannot be made to serve is an error, never a silent
// fall back to JSON.
//
// WHY `sql` can be the default now: q00022 S4 phase 2 was blocked twice.
// First, `sql` used to fall back exactly like `auto`, so pinning it to
// prove production ran on SQL proved nothing — that is fixed (`sql`
// throws instead of quietly reading JSON). Second, `ProposalsSqliteDriver`
// needed `bun:sqlite`, so a Node host would refuse every read under
// `sql` where `auto` degraded to JSON — f00641 added a `node:sqlite`
// adapter behind the same loader, so the database now opens on either
// runtime. What remained was the case `auto`'s fallback quietly covered:
// a workspace whose database was never built (a fresh clone, a
// consumer project, a host that never ran the leveller). Rebuilding
// on-demand from markdown — always legitimate, because the markdown is
// the authority `sql` still defers to for its own data — closes that
// gap without reopening the "prove nothing" hole: a corrupt file still
// throws, so pinning `sql` still proves the read is not quietly serving
// something it should have rejected.
// ---------------------------------------------------------------------------

/**
 * The source used when neither the caller nor the environment says
 * otherwise: the SQLite projection is the authority, rebuilding itself
 * from markdown on demand when it has never been built. `json` stays the
 * one-line rollback; `auto` stays selectable for a caller that still
 * wants the parity-checked JSON fallback instead of a rebuild-or-throw.
 */
export const DEFAULT_PROPOSAL_INDEX_SOURCE: IProposalIndexSource = 'sql';

/**
 * Environment switch: the one-line rollback / roll-forward.
 *
 *   DELENDAI_PROPOSAL_INDEX_SOURCE=json   JSON only
 *   DELENDAI_PROPOSAL_INDEX_SOURCE=auto   prefer SQL, fall back to JSON
 *   DELENDAI_PROPOSAL_INDEX_SOURCE=sql    SQL only, rebuilding from markdown
 *                                         first when it was never built (default)
 */
export const PROPOSAL_INDEX_SOURCE_ENV_VAR = 'DELENDAI_PROPOSAL_INDEX_SOURCE';

/** Environment override for the database path (tests, odd layouts). */
export const PROPOSAL_INDEX_DB_PATH_ENV_VAR = 'DELENDAI_PROPOSALS_DB_PATH';

/** The registry's old committed name, beside the proposals it listed. */
export const LEGACY_REGISTRY_FILE = 'index.json';

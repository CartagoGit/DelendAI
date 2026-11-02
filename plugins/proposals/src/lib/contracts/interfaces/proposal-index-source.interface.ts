/**
 * proposal-index-source.interface.ts — the vocabulary of where the
 * proposal index is read from, and why a strict read can fail.
 */

/** Where `readProposalIndex` reads from. */
export type IProposalIndexSource = 'json' | 'sql' | 'auto';

/**
 * Why a read pinned to `sql` could not be answered from SQL.
 *
 *   - `unavailable` — no database could be resolved or opened, or this
 *     runtime has no `bun:sqlite`.
 *   - `unstamped` — the projection exists but no reconcile ever recorded
 *     the commit it reflects, so nothing vouches for its contents.
 */
export type IProposalIndexSqlFailure = 'unavailable' | 'unstamped';

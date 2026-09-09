/**
 * ids.ts — deterministic identity for the multi-agent work model.
 *
 * WHY this file exists: the operational SQLite database is a
 * MATERIALIZED VIEW that any machine must be able to rebuild from the
 * forge plus the durable journal. A rebuild can only be idempotent if
 * every row's identity is a pure function of facts the rebuild can
 * re-observe — never of an autoincrement, a clock read, or a random
 * id. Every natural key in the work model is computed here and
 * nowhere else, so "insert twice, get one row" is a property of the
 * data rather than a discipline the callers have to remember.
 *
 * The forms are intentionally human-readable up to the point where a
 * field could contain a delimiter; past that they are SHA-256 digests
 * over a canonical, unambiguous encoding.
 */
import { createHash } from 'node:crypto';

/** SHA-256 hex of a UTF-8 string. */
const sha256Hex = (value: string): string =>
	createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * Length-prefixed join. `a|b` and `ab|` are distinct encodings here,
 * so no combination of field values can collide by accident.
 */
const canonicalJoin = (parts: readonly string[]): string =>
	parts.map((part) => `${String(part.length)}:${part}`).join('|');

/** The forge-side identity of a repository. */
export interface IRepositoryKey {
	readonly forge: string;
	readonly owner: string;
	readonly name: string;
}

/** `github:acme/widgets` — stable across clones and machines. */
export const repositoryUid = (key: IRepositoryKey): string =>
	`${key.forge}:${key.owner}/${key.name}`;

/**
 * The natural key of a work unit: one (repository, proposal, slice)
 * run. Mirrors the `UNIQUE (repository_id, proposal_uid, slice_uid)`
 * constraint so the text uid and the composite index can never
 * disagree.
 */
export const workUnitUid = (args: {
	readonly repository: IRepositoryKey;
	readonly proposalUid: string;
	readonly sliceUid: string;
}): string =>
	`${repositoryUid(args.repository)}#${args.proposalUid}/${args.sliceUid}`;

/**
 * The spec's four-part checkpoint identity,
 * `(repository, proposal, slice, generation)`, as one string.
 */
export const generationUid = (args: {
	readonly workUnitUid: string;
	readonly generation: number;
}): string => `${args.workUnitUid}@${String(args.generation)}`;

/**
 * A lease id derived from who took it, where, and when. Deterministic
 * so a reconciler that re-reads the same acquisition (from the journal
 * or from a heartbeat file) recreates the row instead of a duplicate.
 */
export const leaseId = (args: {
	readonly ownerAgentId: string;
	readonly machineId: string;
	readonly sessionId: string;
	readonly acquiredAt: number;
}): string =>
	sha256Hex(
		canonicalJoin([
			'lease',
			args.ownerAgentId,
			args.machineId,
			args.sessionId,
			String(args.acquiredAt),
		]),
	).slice(0, 32);

/**
 * Canonical file scope: sorted, de-duplicated, so two agents that
 * observed the same change set in a different order produce the same
 * digest.
 */
export const canonicalFileScope = (
	paths: readonly string[],
): readonly string[] => [...new Set(paths)].sort();

/** Digest over the canonical file scope. */
export const fileScopeDigest = (paths: readonly string[]): string =>
	sha256Hex(canonicalJoin(['scope', ...canonicalFileScope(paths)]));

/** The identifying content of a coordination journal event. */
export interface IJournalEventIdentity {
	readonly eventKind: string;
	readonly repositoryUid?: string | undefined;
	readonly workUnitUid?: string | undefined;
	readonly generation?: number | undefined;
	readonly actorAgentId?: string | undefined;
	readonly occurredAt: number;
	/** Canonical JSON payload — already serialised by the caller. */
	readonly payloadJson: string;
}

/**
 * The deterministic id of a journal event. Two writers that observed
 * the SAME event produce the same id, so replaying an exported
 * journal into a fresh database is a no-op for anything already
 * present. This is what makes the journal safe to ship between
 * machines while the database file itself never is.
 */
export const journalEventId = (event: IJournalEventIdentity): string =>
	sha256Hex(
		canonicalJoin([
			'journal',
			event.eventKind,
			event.repositoryUid ?? '',
			event.workUnitUid ?? '',
			event.generation === undefined ? '' : String(event.generation),
			event.actorAgentId ?? '',
			String(event.occurredAt),
			event.payloadJson,
		]),
	);

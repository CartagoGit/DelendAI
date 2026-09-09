/**
 * fingerprint.ts — why a warm boot is cheap and a cold boot is complete.
 *
 * Startup reconciliation is only acceptable if it does not become a full
 * rebuild on every launch. But "skip work" needs a justification that
 * survives a machine swap, a schema bump and a policy edit, so the
 * decision is taken from an explicit fingerprint rather than from a
 * timestamp or a "we did this recently" flag:
 *
 *   reconciler version + schema version + policy digest + per-ref SHAs +
 *   the forge's own ETag.
 *
 * If any of those changed, the assumption that last run's conclusions
 * still hold is gone, and the boot rebuilds. If none changed, the refs
 * whose SHA is identical are not re-read at all, and the forge is asked
 * conditionally.
 *
 * WHY it is stored in the coordination journal instead of a new table:
 * the journal is already the durable, append-only, idempotent record this
 * subsystem is required to import, and it already carries a
 * `reconciliation-outcome` event kind. Adding a table for a cache cursor
 * would put boot state somewhere no other machine can see.
 */

import { createHash } from 'node:crypto';

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { STARTUP_RECONCILER_VERSION } from './contracts';
import type { IObservedRef } from './seams';
import type { IStartupJournalPort } from './state-ports';

/** The event kind a boot's fingerprint is stored under. */
export const FINGERPRINT_EVENT_KIND = 'reconciliation-outcome' as const;

/** Marker inside the payload so other outcome events are not mistaken for one. */
export const FINGERPRINT_MARKER = 'startup-reconciler/fingerprint';

/** What a previous boot concluded, as far as this boot can trust it. */
export interface IPreviousRun {
	readonly digest: string;
	readonly schemaVersion: number;
	readonly policyDigest: string;
	readonly reconcilerVersion: number;
	readonly integrationSha: string;
	readonly forgeEtag: string;
	/** Ref name to the SHA the last run examined. */
	readonly refs: Readonly<Record<string, string>>;
}

const sha256 = (value: string): string =>
	createHash('sha256').update(value, 'utf8').digest('hex');

/** Digest of the resolved policy: any axis change invalidates the cache. */
export const policyDigest = (policy: IResolvedDevelopmentPolicy): string =>
	sha256(JSON.stringify(policy));

/** Digest over the observed ref inventory (names and SHAs, sorted). */
export const refInventoryDigest = (refs: readonly IObservedRef[]): string =>
	sha256(
		[...refs]
			.sort((left, right) => (left.name < right.name ? -1 : 1))
			.map((ref) => `${ref.name}=${ref.sha}`)
			.join('\n'),
	);

/** The inputs a boot's conclusions depend on. */
export interface IFingerprintInput {
	readonly schemaVersion: number;
	readonly policyDigest: string;
	readonly integrationSha: string;
	readonly forgeEtag: string;
	readonly refs: readonly IObservedRef[];
}

/** The single string the next boot compares against. */
export const computeFingerprint = (input: IFingerprintInput): string =>
	sha256(
		[
			`v=${String(STARTUP_RECONCILER_VERSION)}`,
			`schema=${String(input.schemaVersion)}`,
			`policy=${input.policyDigest}`,
			`integration=${input.integrationSha}`,
			`forge=${input.forgeEtag}`,
			`refs=${refInventoryDigest(input.refs)}`,
		].join('|'),
	);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const asString = (value: unknown, fallback = ''): string =>
	typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
	typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asRefMap = (value: unknown): Readonly<Record<string, string>> => {
	const record = asRecord(value);
	if (record === undefined) return {};
	const out: Record<string, string> = {};
	for (const [key, entry] of Object.entries(record)) {
		if (typeof entry === 'string') out[key] = entry;
	}
	return out;
};

/**
 * The most recent fingerprint THIS machine wrote. Deliberately per
 * machine: another machine's conclusions say nothing about which refs
 * this clone already has, and trusting them is how a "warm" boot skips
 * work it never did.
 */
export const readPreviousRun = (
	journal: IStartupJournalPort,
	machineId: string,
): IPreviousRun | undefined => {
	let latest: IPreviousRun | undefined;
	let latestAt = Number.NEGATIVE_INFINITY;
	for (const event of journal.listAll()) {
		if (event.eventKind !== FINGERPRINT_EVENT_KIND) continue;
		if (event.machineId !== machineId) continue;
		const payload = asRecord(event.payload);
		if (payload === undefined) continue;
		if (payload.marker !== FINGERPRINT_MARKER) continue;
		if (event.occurredAt < latestAt) continue;
		latestAt = event.occurredAt;
		latest = {
			digest: asString(payload.digest),
			schemaVersion: asNumber(payload.schemaVersion),
			policyDigest: asString(payload.policyDigest),
			reconcilerVersion: asNumber(payload.reconcilerVersion),
			integrationSha: asString(payload.integrationSha),
			forgeEtag: asString(payload.forgeEtag),
			refs: asRefMap(payload.refs),
		};
	}
	return latest;
};

/**
 * `full` on a fresh machine, after a schema migration, after a policy
 * change, or after the reconciler itself changed — anything else may
 * take the incremental path.
 */
export const decideMode = (
	previous: IPreviousRun | undefined,
	current: { readonly schemaVersion: number; readonly policyDigest: string },
): 'full' | 'incremental' => {
	if (previous === undefined) return 'full';
	if (previous.reconcilerVersion !== STARTUP_RECONCILER_VERSION)
		return 'full';
	if (previous.schemaVersion !== current.schemaVersion) return 'full';
	if (previous.policyDigest !== current.policyDigest) return 'full';
	return 'incremental';
};

/** The payload written back at the end of a run. */
export const fingerprintPayload = (input: {
	readonly digest: string;
	readonly schemaVersion: number;
	readonly policyDigest: string;
	readonly integrationSha: string;
	readonly forgeEtag: string;
	readonly refs: readonly IObservedRef[];
}): Readonly<Record<string, unknown>> => ({
	marker: FINGERPRINT_MARKER,
	digest: input.digest,
	schemaVersion: input.schemaVersion,
	policyDigest: input.policyDigest,
	reconcilerVersion: STARTUP_RECONCILER_VERSION,
	integrationSha: input.integrationSha,
	forgeEtag: input.forgeEtag,
	refs: Object.fromEntries(input.refs.map((ref) => [ref.name, ref.sha])),
});

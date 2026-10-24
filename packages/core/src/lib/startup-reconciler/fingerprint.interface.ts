/**
 * Contract shapes for `./fingerprint`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `fingerprint.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `fingerprint.ts`, so no import site changes.
 */

import type { IObservedRef } from './seams.interface';

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

/** The inputs a boot's conclusions depend on. */
export interface IFingerprintInput {
	readonly schemaVersion: number;
	readonly policyDigest: string;
	readonly integrationSha: string;
	readonly forgeEtag: string;
	readonly refs: readonly IObservedRef[];
}

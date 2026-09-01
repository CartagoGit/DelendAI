/**
 * x00072 SEC-001 S2 — Trust fingerprint for the stdio child launch.
 *
 * `globalState` remembers a SHA-256 fingerprint of the launch
 * (`command | args[] | cwd`) the user has already approved. Any change
 * to that explicit launch invalidates the stored fingerprint and forces
 * a re-approval.
 *
 * Pure helpers only — no VS Code imports. Tests cover new, matching, and
 * changed explicit launch fingerprints.
 */

import { createHash } from 'node:crypto';

export const TRUST_FINGERPRINT_KEY = 'mcp-vertex.trust.fingerprint';
export interface IServerLaunch {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string;
}

/** Hex SHA-256 of the canonical (command|args|cwd) projection. */
export const computeLaunchFingerprint = (launch: IServerLaunch): string => {
	const canonical = JSON.stringify({
		command: launch.command,
		args: [...launch.args],
		cwd: launch.cwd ?? '',
	});
	return createHash('sha256').update(canonical).digest('hex');
};

export interface ITrustState {
	readonly fingerprint: string | undefined;
}

export interface IFingerprintStore {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

const readState = (store: IFingerprintStore): ITrustState => ({
	fingerprint: store.get<string>(TRUST_FINGERPRINT_KEY),
});

export const isLaunchApproved = (
	store: IFingerprintStore,
	launch: IServerLaunch,
): boolean => {
	const state = readState(store);
	const expected = computeLaunchFingerprint(launch);
	return state.fingerprint === expected;
};

export const recordApproval = async (
	store: IFingerprintStore,
	launch: IServerLaunch,
): Promise<void> => {
	await store.update(TRUST_FINGERPRINT_KEY, computeLaunchFingerprint(launch));
};

/** Erase any cached approval (used by invalidation paths). */
export const clearApproval = async (
	store: IFingerprintStore,
): Promise<void> => {
	await store.update(TRUST_FINGERPRINT_KEY, undefined);
};

/** Human-readable one-liner used in the QuickPick. */
export const describeLaunch = (launch: IServerLaunch): string => {
	const args = launch.args.length === 0 ? '' : ` ${launch.args.join(' ')}`;
	const cwd = launch.cwd === undefined ? '' : ` (cwd=${launch.cwd})`;
	return `${launch.command}${args}${cwd}`;
};

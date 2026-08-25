/**
 * policy-store.ts — durable runtime override for the test policy
 * (f00115 S1).
 *
 * One JSON file under the plugin's private cache dir. All writes go
 * through `withFileMutex` + `writeFileAtomic` (repo rule #4 for
 * persisted state); a corrupt or schema-invalid file is quarantined
 * aside and treated as absent — corrupt ≠ empty.
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
	quarantineCorruptFile,
	redactSecrets,
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { isTestPolicyMode, type ITestPolicyMode } from './policy';

export interface IPolicyOverride {
	readonly mode: ITestPolicyMode;
	/** Optional operator note ("spike week", "release hardening", …). */
	readonly reason?: string;
	/** ISO timestamp of when the override was set. */
	readonly setAt: string;
}

const STORE_FILE = 'policy.json';

const storePath = (storeDir: string): string => join(storeDir, STORE_FILE);

const parseOverride = (raw: string): IPolicyOverride | null => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== 'object') return null;
	const record = parsed as Record<string, unknown>;
	if (!isTestPolicyMode(record.mode)) return null;
	if (typeof record.setAt !== 'string') return null;
	return {
		mode: record.mode,
		setAt: record.setAt,
		...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
	};
};

/**
 * Read the persisted override, or `null` when none exists. A file that
 * exists but does not parse into a valid override is moved aside
 * (quarantined) so the corrupt payload stays inspectable, and the read
 * reports "no override" instead of guessing.
 */
export const readPolicyOverride = async (
	storeDir: string,
): Promise<IPolicyOverride | null> => {
	const path = storePath(storeDir);
	let raw: string;
	try {
		raw = (await new SafeWorkspaceReader(storeDir).readText(STORE_FILE))
			.content;
	} catch {
		return null;
	}
	const parsed = parseOverride(raw);
	if (parsed === null) {
		await quarantineCorruptFile(path);
		return null;
	}
	return parsed;
};

/** Persist a new override (serialized under the file's mutex). */
export const writePolicyOverride = async (
	storeDir: string,
	override: { readonly mode: ITestPolicyMode; readonly reason?: string },
): Promise<IPolicyOverride> => {
	// x00190: `reason` is free text an agent supplies and a durable,
	// later-re-surfaced value (get_test_policy echoes it back verbatim
	// as `overrideReason` to every future caller) — exactly the shape
	// `redactSecrets` exists to guard (repo rule: secrets never persisted
	// un-redacted).
	const redactedReason =
		override.reason !== undefined
			? redactSecrets(override.reason).text
			: undefined;
	const record: IPolicyOverride = {
		mode: override.mode,
		setAt: new Date().toISOString(),
		...(redactedReason !== undefined ? { reason: redactedReason } : {}),
	};
	const path = storePath(storeDir);
	await withFileMutex(path, async () => {
		await writeFileAtomic(path, `${JSON.stringify(record, null, '\t')}\n`);
	});
	return record;
};

/** Remove the override so the policy falls back to config/default. */
export const clearPolicyOverride = async (storeDir: string): Promise<void> => {
	const path = storePath(storeDir);
	await withFileMutex(path, async () => {
		await rm(path, { force: true });
	});
};

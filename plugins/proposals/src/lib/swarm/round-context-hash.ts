/**
 * round-context-hash.ts
 *
 * Hashing + time helpers shared by the round-context digest, sources and
 * resume modules (N20 split of the former monolithic `round-context.ts`).
 *
 * Hashing choice: `node:crypto.createHash('sha256')` truncated to the
 * first 8 bytes (16 hex chars) and prefixed with `rh-`. The 8-byte
 * truncation keeps the digest compact; SHA-256 guarantees collision
 * resistance within the workspace. `node:crypto` is implemented by both
 * Bun and Node, so the helpers run identically under Vitest (Node) and
 * the production MCP server (Bun) without branching on the runtime.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CORE_DOCS } from './round-context-types';

/**
 * Format a 64-bit (8-byte) hash digest as a 16-char zero-padded hex
 * string with the `rh-` prefix. The prefix preserves the previous
 * `Bun.hash.rapidhash`-shaped output so any digest persisted before
 * the algorithm change is still recognisable, even though the value
 * itself will differ.
 */
const formatRapidHash = (hexBytes: string): string => `rh-${hexBytes}`;

/** Fingerprint of arbitrary text as `rh-<16 hex>` (SHA-256, first 8 bytes). */
export const computeFingerprint = (text: string): string => {
	const full = createHash('sha256').update(text).digest('hex');
	return formatRapidHash(full.slice(0, 16));
};

/** Whole minutes elapsed since `timestamp`, or `null` when unparseable. */
export const computeAgeMinutes = (timestamp: string | null): number | null => {
	if (timestamp === null) return null;
	const parsed = Date.parse(timestamp);
	if (Number.isNaN(parsed)) return null;
	return Math.floor((Date.now() - parsed) / 60_000);
};

/**
 * Compute the live `rh-<hex>` hashes for the 4 core docs at
 * `monorepoRoot`. Files that do not exist are recorded as the literal
 * string `'rh-missing'`. This keeps the digest schema stable even when
 * the workspace is partially provisioned.
 *
 * Algorithm: SHA-256 of the file content, truncated to the first 8
 * bytes (16 hex chars). Implemented via `node:crypto` so the helper
 * runs identically in Bun (production) and Node (Vitest). The output
 * is NOT byte-compatible with the previous `Bun.hash.rapidhash`-based
 * implementation; any pre-existing digest on disk will report stale
 * on its first recompute. That is acceptable: digests are advisory
 * caches, not authoritative state.
 */
export const computeCoreDocHashes = async (
	monorepoRoot: string,
	// the doc list is host policy; the default keeps the
	// historical the host project set for compatibility, hosts may inject
	// their own (e.g. extra skill docs).
	coreDocs: readonly string[] = CORE_DOCS,
): Promise<Record<string, string>> => {
	const result: Record<string, string> = {};
	await Promise.all(
		coreDocs.map(async (rel) => {
			const abs = join(monorepoRoot, rel);
			const content = await readFile(abs, 'utf8').catch(() => null);
			if (content === null) {
				result[rel] = 'rh-missing';
				return;
			}
			// SHA-256 -> take the first 8 bytes (16 hex chars) -> prefix
			// with `rh-` to keep the previous wire format.
			const full = createHash('sha256').update(content).digest('hex');
			result[rel] = formatRapidHash(full.slice(0, 16));
		}),
	);
	return result;
};

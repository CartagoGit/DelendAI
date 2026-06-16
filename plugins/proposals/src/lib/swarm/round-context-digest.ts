/**
 * round-context-digest.ts
 *
 * The digest lifecycle for the Agent Swarm Governor (N20 split of the
 * former monolithic `round-context.ts`): build a well-formed digest,
 * decide whether a persisted one is stale, and read/write it atomically.
 *
 * The round-context digest is a small JSON document published at
 * `.cache/round-context.digest.json` that captures a stable view of the
 * current round (active proposal, current task, active locks, active
 * subagents, and hashes of the core docs). Any subagent that needs to
 * read those core docs MUST consult the digest first; if its hashes
 * match the current core-doc hashes of the on-disk files, the cached
 * view is still valid and the read can be skipped.
 *
 * This module is filesystem-aware for read/write (atomic .tmp + rename);
 * the hashing/snapshot logic it depends on lives in the sibling
 * `round-context-hash.ts` / `round-context-sources.ts` modules.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import { ROUND_CONTEXT_DIGEST_VERSION } from './round-context-types';
import type {
	IRoundContextDigest,
	IRoundContextDigestInput,
	IRoundContextSources,
} from './round-context-types';

/**
 * Build a well-formed `IRoundContextDigest` from its input parts.
 *
 * Stamps `createdAt` with the current UTC ISO 8601 timestamp and pins
 * `digestVersion` to `1`. The function is pure (no side effects, no
 * filesystem access).
 */
export const buildRoundContextDigest = (
	input: IRoundContextDigestInput
): IRoundContextDigest => ({
	roundId: input.roundId,
	activeProposalId: input.activeProposalId,
	currentTaskId: input.currentTaskId,
	activeLocks: input.activeLocks,
	activeAgents: input.activeAgents,
	coreDocHashes: input.coreDocHashes,
	sources: input.sources,
	chatContext: input.chatContext,
	checkpoint: input.checkpoint,
	proposalPortfolio: input.proposalPortfolio,
	resumeHint: input.resumeHint,
	createdAt: new Date().toISOString(),
	digestVersion: ROUND_CONTEXT_DIGEST_VERSION,
});

/**
 * Compare the digest's recorded `coreDocHashes` against `currentHashes`
 * (typically the live hashes returned by `computeCoreDocHashes`).
 *
 * Returns `true` if any recorded key is missing from the current map or
 * any value differs. Returns `false` only when every recorded key is
 * present and identical.
 */
export const isDigestStale = (
	digest: IRoundContextDigest,
	currentHashes: Readonly<Record<string, string>>,
	currentSources: IRoundContextSources = digest.sources
): boolean => {
	for (const [key, recorded] of Object.entries(digest.coreDocHashes)) {
		const live = currentHashes[key];
		if (live !== recorded) return true;
	}
	for (const [key, recorded] of Object.entries(digest.sources)) {
		const live = currentSources[key as keyof IRoundContextSources];
		if (
			live === undefined ||
			live.state !== recorded.state ||
			live.fingerprint !== recorded.fingerprint ||
			live.temporallyStale
		) {
			return true;
		}
	}
	return false;
};

/**
 * Read a digest from disk.
 *
 * Returns `null` (not an error) when the file does not exist. Throws if
 * the file exists but is malformed or fails a `JSON.parse` — that is a
 * real corruption signal the caller should surface.
 */
export const readRoundContextDigest = async (
	path: string
): Promise<IRoundContextDigest | null> => {
	if (!existsSync(path)) return null;
	const raw = readFileSync(path, 'utf8');
	return JSON.parse(raw) as IRoundContextDigest;
};

/**
 * Write a digest to disk atomically.
 *
 * Strategy:
 *   1. Ensure the parent directory exists.
 *   2. Write the JSON to `<path>.tmp` synchronously.
 *   3. Rename the `.tmp` over the final path (single syscall, atomic
 *      on POSIX).
 *   4. Clean up the `.tmp` if rename fails for any reason.
 */
export const writeRoundContextDigest = async (
	digest: IRoundContextDigest,
	path: string
): Promise<void> => {
	const tmpPath = `${path}.tmp`;
	await mkdir(dirname(path), { recursive: true });
	writeFileSync(tmpPath, JSON.stringify(digest, null, 2), 'utf8');
	try {
		await rename(tmpPath, path);
	} catch (err) {
		// Best-effort cleanup of the tmp sidecar so we never leak
		// half-written digests into the workspace.
		try {
			await rm(tmpPath, { force: true });
		} catch {
			// ignore
		}
		throw err;
	}
};

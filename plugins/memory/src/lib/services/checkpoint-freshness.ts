/**
 * Evaluate whether the newest explicit checkpoint is recent enough for a
 * lifecycle boundary. This is deliberately a metadata check, not a claim that
 * the digest semantically covers the current task.
 */
import { stat } from 'node:fs/promises';

import type { ICheckpointAdvisory } from '@mcp-vertex/core/public';

import type { ISessionDigestSelection } from '../contracts/interfaces/session-digest-recall.interface';
import { mapFreshnessToCheckpointAdvisory } from './checkpoint-advisory.service';
import { selectLatestSessionDigest } from './session-digest-recall';
import { readStore } from './store';

export type CheckpointFreshnessState = 'missing' | 'fresh' | 'stale';

export interface ICheckpointFreshness {
	readonly state: CheckpointFreshnessState;
	readonly latestCheckpointAt: string | null;
	readonly ageMs: number | null;
	readonly maxAgeMs: number;
}

export const DEFAULT_CHECKPOINT_MAX_AGE_MS = 30 * 60 * 1000;

const positiveInteger = (value: number, fallback: number): number =>
	Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

/**
 * Classify a durable digest at a caller-supplied time, making the helper pure
 * and deterministic under test. Invalid timestamps are conservative: stale.
 */
export const assessCheckpointFreshness = (
	digest: ISessionDigestSelection | null,
	nowMs: number = Date.now(),
	maxAgeMs: number = DEFAULT_CHECKPOINT_MAX_AGE_MS,
): ICheckpointFreshness => {
	const maximum = positiveInteger(maxAgeMs, DEFAULT_CHECKPOINT_MAX_AGE_MS);
	if (digest === null) {
		return {
			state: 'missing',
			latestCheckpointAt: null,
			ageMs: null,
			maxAgeMs: maximum,
		};
	}
	const createdAtMs = Date.parse(digest.createdAt);
	const ageMs =
		Number.isNaN(createdAtMs) || !Number.isFinite(nowMs)
			? null
			: Math.max(0, nowMs - createdAtMs);
	return {
		state: ageMs !== null && ageMs < maximum ? 'fresh' : 'stale',
		latestCheckpointAt: digest.createdAt,
		ageMs,
		maxAgeMs: maximum,
	};
};

export const readStoreMtimeMs = async (
	absPath: string,
): Promise<number | null> => {
	try {
		return (await stat(absPath)).mtimeMs;
	} catch {
		return null;
	}
};

export const refreshCheckpointFreshnessAdvisory = async (
	absPath: string,
	options: {
		nowMs?: number;
		maxAgeMs?: number;
	} = {},
): Promise<{
	advisory: ICheckpointAdvisory | null;
	freshness: ICheckpointFreshness;
	mtimeMs: number | null;
}> => {
	const [notes, mtimeMs] = await Promise.all([
		readStore(absPath),
		readStoreMtimeMs(absPath),
	]);
	const digest = selectLatestSessionDigest(
		notes.map((note) => ({
			title: note.title,
			body: note.body,
			createdAt: note.createdAt,
		})),
	);
	const freshness = assessCheckpointFreshness(
		digest,
		options.nowMs ?? Date.now(),
		options.maxAgeMs ?? DEFAULT_CHECKPOINT_MAX_AGE_MS,
	);
	return {
		advisory: mapFreshnessToCheckpointAdvisory(freshness),
		freshness,
		mtimeMs,
	};
};

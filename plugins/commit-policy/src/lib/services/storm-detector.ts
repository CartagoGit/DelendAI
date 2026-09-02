/**
 * storm-detector.ts — x00419 S2.
 *
 * Consume the stream of `pipeline.step` / `commit-policy.scope.*`
 * events emitted by the engine and detect **storm patterns** —
 * a single refusal code repeating many times in a short window.
 *
 * Why this exists:
 *   The 2026-09-02 `WORKSPACE_HAS_NO_FILES` log storm was 600+
 *   lines of identical noise that the operator had to read by
 *   hand to spot the bug. That is not sustainable. The detector
 *   counts repeats per (code, trigger) tuple inside a sliding
 *   window and surfaces the result through the
 *   `commit_policy_storms` tool, AND — via the host's
 *   auto-repair proposal creator (see `proposals/src/lib/
 *   auto-work/repair-mode.ts`) — files a `kind: repair`
 *   proposal automatically.
 *
 * Design notes:
 *   - Pure logic. No I/O inside the hot path. The detector
 *     keeps a Map<key, Bucket> in memory and returns the
 *     current state via `snapshot()`. The host is responsible
 *     for persisting / reacting.
 *   - Buckets are bounded: each bucket holds at most
 *     `windowSize` timestamps; older ones are dropped on
 *     every `observe()` call. This keeps memory O(active
 *     keys × windowSize).
 *   - The detector is intentionally conservative about
 *     threshold semantics: it never *triggers* any action.
 *     It only returns `Storm[]` and a `count >= threshold`
 *     flag. The caller decides what to do.
 */

export interface IStormDetectorOptions {
	/** Sliding window in seconds. Default 30. */
	readonly windowSeconds?: number;
	/** Threshold for `count >= threshold` flag. Default 5. */
	readonly threshold?: number;
	/** Cap on sampleProposalIds collected per storm. Default 5. */
	readonly maxSamplesPerStorm?: number;
	/** Cap on active keys kept in memory. Default 256. */
	readonly maxTrackedKeys?: number;
}

/** The shape of an event the detector cares about. */
export interface IStormEvent {
	readonly timestamp: number; // ms since epoch
	readonly code: string; // e.g. 'WORKSPACE_HAS_NO_FILES'
	readonly trigger: string; // 'slice' | 'manual' | 'threshold' | 'interval' | ...
	readonly proposalId?: string;
	readonly sliceId?: string;
	/** Optional short hint from the producer. */
	readonly suggestedFix?: string;
}

export interface IStorm {
	readonly code: string;
	readonly trigger: string;
	readonly count: number;
	readonly windowSeconds: number;
	readonly sampleProposalIds: readonly string[];
	readonly firstSeenAt: number;
	readonly lastSeenAt: number;
	readonly suggestedFix?: string;
	readonly exceedsThreshold: boolean;
}

export interface IStormSnapshot {
	readonly storms: readonly IStorm[];
	readonly totalEventsInWindow: number;
	readonly windowSeconds: number;
	readonly threshold: number;
}

interface IBucket {
	timestamps: number[];
	proposalIds: string[];
	suggestedFix?: string;
	firstSeenAt: number;
}

const DEFAULT_WINDOW_SECONDS = 30;
const DEFAULT_THRESHOLD = 5;
const DEFAULT_MAX_SAMPLES = 5;
const DEFAULT_MAX_KEYS = 256;

export class StormDetector {
	private readonly buckets = new Map<string, IBucket>();
	private readonly windowMs: number;
	private readonly threshold: number;
	private readonly maxSamples: number;
	private readonly maxKeys: number;

	constructor(options: IStormDetectorOptions = {}) {
		this.windowMs =
			(options.windowSeconds ?? DEFAULT_WINDOW_SECONDS) * 1000;
		this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
		this.maxSamples = options.maxSamplesPerStorm ?? DEFAULT_MAX_SAMPLES;
		this.maxKeys = options.maxTrackedKeys ?? DEFAULT_MAX_KEYS;
	}

	observe(event: IStormEvent): void {
		const key = `${event.trigger}\u0000${event.code}`;
		const cutoff = event.timestamp - this.windowMs;

		let bucket = this.buckets.get(key);
		if (bucket === undefined) {
			// Bound memory: evict the oldest bucket if we are at the cap.
			if (this.buckets.size >= this.maxKeys) {
				let oldestKey: string | undefined;
				let oldestTs = Number.POSITIVE_INFINITY;
				for (const [k, b] of this.buckets) {
					if (
						b.timestamps[0] !== undefined &&
						b.timestamps[0] < oldestTs
					) {
						oldestTs = b.timestamps[0];
						oldestKey = k;
					}
				}
				if (oldestKey !== undefined) {
					this.buckets.delete(oldestKey);
				}
			}
			bucket = {
				timestamps: [],
				proposalIds: [],
				firstSeenAt: event.timestamp,
			};
			this.buckets.set(key, bucket);
		}

		// Evict entries older than the window.
		while (
			bucket.timestamps.length > 0 &&
			bucket.timestamps[0] !== undefined &&
			bucket.timestamps[0] < cutoff
		) {
			bucket.timestamps.shift();
		}

		bucket.timestamps.push(event.timestamp);
		if (event.proposalId !== undefined) {
			if (
				bucket.proposalIds.length === 0 ||
				bucket.proposalIds[bucket.proposalIds.length - 1] !==
					event.proposalId
			) {
				bucket.proposalIds.push(event.proposalId);
				if (bucket.proposalIds.length > this.maxSamples) {
					bucket.proposalIds.shift();
				}
			}
		}
		if (
			event.suggestedFix !== undefined &&
			bucket.suggestedFix === undefined
		) {
			bucket.suggestedFix = event.suggestedFix;
		}
	}

	snapshot(now: number = Date.now()): IStormSnapshot {
		const cutoff = now - this.windowMs;
		const storms: IStorm[] = [];

		for (const [key, bucket] of this.buckets) {
			// Evict expired entries.
			while (
				bucket.timestamps.length > 0 &&
				bucket.timestamps[0] !== undefined &&
				bucket.timestamps[0] < cutoff
			) {
				bucket.timestamps.shift();
			}
			if (bucket.timestamps.length === 0) continue;

			const sepIdx = key.indexOf('\u0000');
			const trigger = key.slice(0, sepIdx);
			const code = key.slice(sepIdx + 1);
			const count = bucket.timestamps.length;
			const firstSeenAt = bucket.firstSeenAt;
			const lastSeenAt =
				bucket.timestamps[bucket.timestamps.length - 1] ?? firstSeenAt;

			storms.push({
				code,
				trigger,
				count,
				windowSeconds: Math.round(this.windowMs / 1000),
				sampleProposalIds: [...bucket.proposalIds],
				firstSeenAt,
				lastSeenAt,
				...(bucket.suggestedFix !== undefined
					? { suggestedFix: bucket.suggestedFix }
					: {}),
				exceedsThreshold: count >= this.threshold,
			});
		}

		// Sort by count desc, then by lastSeenAt desc.
		storms.sort((a, b) => {
			if (a.count !== b.count) return b.count - a.count;
			return b.lastSeenAt - a.lastSeenAt;
		});

		const totalEventsInWindow = storms.reduce((sum, s) => sum + s.count, 0);

		return {
			storms,
			totalEventsInWindow,
			windowSeconds: Math.round(this.windowMs / 1000),
			threshold: this.threshold,
		};
	}

	reset(): void {
		this.buckets.clear();
	}

	get trackedKeyCount(): number {
		return this.buckets.size;
	}
}

/**
 * Suggested fix mapping — the detector tries to attribute the storm
 * to a known root cause when the producer did not provide one.
 * Keep the list short and explicit; we want false negatives, not
 * noisy auto-fixes.
 */
export function inferSuggestedFix(code: string): string | undefined {
	switch (code) {
		case 'WORKSPACE_HAS_NO_FILES':
			return 'resolve-scope.ts: files is empty after the stage step. Check whether the resolver is filtering by workspaceDirty.';
		case 'CAUSALITY_VIOLATION':
			return 'engine.ts: staged paths exceeded the resolved scope. Check whether the agent owned the slice files.';
		case 'CROSS_AGENT_CONTAMINATION':
			return 'commit-driver.ts: staged set includes paths from another agent. Review ownership filters.';
		default:
			return undefined;
	}
}

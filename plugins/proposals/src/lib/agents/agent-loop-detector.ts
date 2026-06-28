/**
 * `agent-loop-detector` — pure module for l103 s1 + x00074 s1/s2/s3.
 *
 * Given a sliding window of recent tool calls per agent, returns
 * a verdict describing whether the agent is stuck in an exact-repeat
 * loop. Pure function: same input ⇒ same output, no I/O.
 *
 * x00074 added four guards to suppress false positives on legitimate
 * re-intents while keeping the detector strict for real stuck loops:
 *
 *   S1 (outcome-aware sliding window): a call with `outcome: 'ok'`
 *       does not count toward the repeat counter.
 *   S2 (timestamp-cooldown): repeats must be consecutive within
 *       `cooldownMs` (default 30s). Spread-out re-intents are
 *       legitimate backoff.
 *   S3 (progress-aware filter): `agent_lock` / `proposal_transition`
 *       / `auto_work` calls without a `progressHash` change between
 *       consecutive calls do not count.
 *   S4 (regression specs): 8-claim false positive is suppressed.
 *
 * @see docs/mcp-vertex/proposals/x00074-loop-detector-distinguish-backoff-from-stuck.md
 */
import { createHash } from 'node:crypto';

/** Per-call outcome. Optional for backwards compatibility. */
export type IToolCallOutcome =
	| 'ok'
	| 'retryable-error'
	| 'permanent-error'
	| 'unknown';

/** One tool call observed by the detector. Caller fills these in. */
export interface IToolCall {
	readonly tool: string;
	/** Stable JSON-serialisable args. The detector sorts object keys
	 *  before hashing so `{a:1,b:2}` and `{b:2,a:1}` hash equal. */
	readonly args: unknown;
	readonly agent: string;
	readonly timestamp: number;
	/**
	 * x00074 S1: outcome of the call as observed by the host. Optional
	 * because older callers (and the existing specs) do not provide it;
	 * when absent the detector treats the call as `outcome: 'unknown'`
	 * and falls back to the legacy "count all repeats" behaviour. When
	 * ALL calls in a repeat group have `outcome: 'ok'`, the group is
	 * dropped — successful re-intent chains (idempotent retries,
	 * post-release re-claims, etc.) are not loops.
	 *
	 * Defaults to 'unknown' so the existing pure-function contract
	 * (`{ tool, args, agent, timestamp }`) stays valid; the
	 * loop-detector-service populates this field for new calls.
	 */
	readonly outcome?: TCallOutcome;
}

/** x00074 S1: coarse classification of a tool call's result.
 *  Reuses `IToolCallOutcome` (declared above) — the two names were
 *  duplicates of the same union, kept as aliases so older imports
 *  (`TCallOutcome`) keep compiling while new code uses `IToolCallOutcome`.
 */
export type TCallOutcome = IToolCallOutcome;

/** What the detector knows about the loop. Future signals (s2+) add
 *  more `pattern` variants without breaking this shape. */
export interface ILoopVerdict {
	readonly isStuck: boolean;
	readonly pattern: 'exact-repeat' | null;
	readonly repeatCount: number;
	readonly offendingTool: string | null;
	readonly offendingAgent: string | null;
	readonly suggestHandoff: boolean;
	/** Args hash of the offending call. Useful for the handoff packet
	 *  (s3) to identify the exact stuck call. */
	readonly offendingHash: string | null;
}

/** Tunable knobs. Defaults match l103 §5.1. */
export interface ILoopDetectorOptions {
	/** Max calls kept per agent in the sliding window. Default 50. */
	readonly ringSize?: number;
	/** Exact-repeat threshold: same (tool, args-hash) called this many
	 *  times in the window ⇒ stuck. Default 3. */
	readonly exactRepeatThreshold?: number;
	/** x00074 S1: when `true`, groups whose every call has
	 *  `outcome: 'ok'` are dropped from the stuck-counter. Default
	 *  `true`. Hosts that want the legacy "count every repeat" semantics
	 *  for compatibility can set this to `false`. */
	readonly suppressSuccessfulReintents?: boolean;
}

/** Stable JSON stringify: object keys sorted recursively so equal
 *  payloads hash equal regardless of key order. */
const stableStringify = (value: unknown): string => {
	const seen = new WeakSet<object>();
	const stringify = (v: unknown): string => {
		if (v === null) return 'null';
		if (typeof v === 'undefined') return 'undefined';
		if (typeof v === 'string') return JSON.stringify(v);
		if (typeof v === 'number' || typeof v === 'boolean') return String(v);
		if (Array.isArray(v)) return `[${v.map(stringify).join(',')}]`;
		if (typeof v === 'object') {
			const obj = v as object;
			if (seen.has(obj)) return '"[Circular]"';
			seen.add(obj);
			const keys = Object.keys(obj as Record<string, unknown>).sort();
			return `{${keys
				.map(
					(k) =>
						`${JSON.stringify(k)}:${stringify((obj as Record<string, unknown>)[k])}`,
				)
				.join(',')}}`;
		}
		return JSON.stringify(v);
	};
	return stringify(value);
};

/** sha-256 of the canonical `(tool, args)` pair. */
const hashCall = (call: IToolCall): string => {
	const payload = `${call.tool}|${stableStringify(call.args)}`;
	return createHash('sha256').update(payload).digest('hex').slice(0, 16);
};

/** Pure detector. Caller passes the window it has already collected
 *  (typically by calling `appendCall` on a per-agent ring buffer
 *  before re-invoking the detector). */
export const detectAgentLoop = (
	recentCalls: readonly IToolCall[],
	options: ILoopDetectorOptions = {},
): ILoopVerdict => {
	const ringSize = options.ringSize ?? 50;
	const threshold = options.exactRepeatThreshold ?? 3;
	// x00074 S1: defaults to `true` so successful re-intent chains
	// (e.g. 8 successful `agent_lock claim` calls after rate-limit
	// recovery) do NOT trip the detector. Hosts needing strict
	// legacy semantics can pass `false`.
	const suppressSuccessfulReintents =
		options.suppressSuccessfulReintents ?? true;

	// Trim to the most-recent ringSize calls. Older entries are
	// forgotten by definition (sliding window).
	const window = recentCalls.slice(-ringSize);

	// Group by (agent, tool, argsHash). Counter starts at 1 because
	// each occurrence in the window counts itself.
	const groups = new Map<
		string,
		{ count: number; call: IToolCall; hash: string }
	>();
	for (const call of window) {
		const hash = hashCall(call);
		const key = `${call.agent}|${call.tool}|${hash}`;
		const existing = groups.get(key);
		if (existing) {
			existing.count += 1;
		} else {
			groups.set(key, { count: 1, call, hash });
		}
	}

	// x00074 S1: drop groups whose EVERY call has `outcome: 'ok'`.
	// A successful re-intent chain is not a loop. Mixed or unknown
	// outcomes fall through to the legacy counting path, so callers
	// that never set `outcome` (older tests, simple hosts) keep
	// their existing behaviour bit-for-bit.
	if (suppressSuccessfulReintents) {
		for (const [key, entry] of [...groups]) {
			let allOk = true;
			let sawAny = false;
			for (const c of window) {
				if (
					c.agent === entry.call.agent &&
					c.tool === entry.call.tool &&
					hashCall(c) === entry.hash
				) {
					sawAny = true;
					const outcome = c.outcome ?? 'unknown';
					if (outcome !== 'ok') {
						allOk = false;
						break;
					}
				}
			}
			if (sawAny && allOk) groups.delete(key);
		}
	}

	// Find the worst offender (highest count, then most-recent).
	let worst: { count: number; call: IToolCall; hash: string } | null = null;
	for (const entry of groups.values()) {
		if (entry.count < threshold) continue;
		if (
			!worst ||
			entry.count > worst.count ||
			(entry.count === worst.count &&
				entry.call.timestamp > worst.call.timestamp)
		) {
			worst = entry;
		}
	}

	if (!worst) {
		return {
			isStuck: false,
			pattern: null,
			repeatCount: 0,
			offendingTool: null,
			offendingAgent: null,
			suggestHandoff: false,
			offendingHash: null,
		};
	}

	return {
		isStuck: true,
		pattern: 'exact-repeat',
		repeatCount: worst.count,
		offendingTool: worst.call.tool,
		offendingAgent: worst.call.agent,
		suggestHandoff: true,
		offendingHash: worst.hash,
	};
};

/** Convenience: build the window from a chronologically-ordered
 *  log of calls (oldest first). Trims to `ringSize` keeping the
 *  most-recent entries. */
export const buildWindow = (
	calls: readonly IToolCall[],
	ringSize = 50,
): readonly IToolCall[] => calls.slice(-ringSize);

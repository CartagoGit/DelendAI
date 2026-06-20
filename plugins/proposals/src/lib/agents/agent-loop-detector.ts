/**
 * `agent-loop-detector` — pure module for p103 s1.
 *
 * Given a sliding window of recent tool calls per agent, returns
 * a verdict describing whether the agent is stuck in an exact-repeat
 * loop. Pure function: same input ⇒ same output, no I/O.
 *
 * Why pure first (s1), then I/O later (s2 git diff, s3 handoff packet):
 * - SOLID: one responsibility per slice. This module decides "is
 *   the agent stuck?"; downstream modules decide what to do about
 *   it (write a handoff packet, emit a notification, etc.).
 * - Testability: 6 specs run in milliseconds with no mocks. The
 *   integration with `auto_work` / git / handoff packets gets its
 *   own spec layer when it lands in s2/s3/s4.
 * - Cheap retry semantics: an upstream change (e.g. a different
 *   hash function, or adding Levenshtein in s2-bis) is a single
 *   function signature change with no caller-side blast radius.
 *
 * The detector only flags `exact-repeat`. Near-repeat (Levenshtein
 * similarity) is s2-bis per p103 §5.1.
 *
 * @see docs/proposals/p103-loop-detection-and-handoff.md §5 s1.
 */
import { createHash } from 'node:crypto';

/** One tool call observed by the detector. Caller fills these in. */
export interface IToolCall {
	readonly tool: string;
	/** Stable JSON-serialisable args. The detector sorts object keys
	 *  before hashing so `{a:1,b:2}` and `{b:2,a:1}` hash equal. */
	readonly args: unknown;
	readonly agent: string;
	readonly timestamp: number;
}

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

/** Tunable knobs. Defaults match p103 §5.1. */
export interface ILoopDetectorOptions {
	/** Max calls kept per agent in the sliding window. Default 50. */
	readonly ringSize?: number;
	/** Exact-repeat threshold: same (tool, args-hash) called this many
	 *  times in the window ⇒ stuck. Default 3. */
	readonly exactRepeatThreshold?: number;
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

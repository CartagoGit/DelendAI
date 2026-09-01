/**
 * activation-kpis.ts — f00198 (Track M / q00006 §48).
 *
 * Computes three KPIs over a series of LLM tool-invocation sessions:
 *
 *   - **precision** — of the tools the LLM *did* call, how many were
 *     actually expected for that task. Low precision means the LLM
 *     burns context calling irrelevant tools (over-activation).
 *   - **recall** — of the tools that *should* have been called, how
 *     many the LLM did call. Low recall means the LLM is missing
 *     useful tools (under-activation).
 *   - **churn** — Jaccard distance between consecutive sessions for
 *     the same task. High churn means the LLM picks a different tool
 *     set every time, which hurts reproducibility.
 *
 * The "expected" set is supplied externally (heuristic or human
 * feedback). The store itself never invents expectations.
 *
 * Privacy (R1.1–R1.10): only tool ids (which are already public) and
 * the counters that derive from them. No tool inputs/outputs. No
 * telemetry sink.
 */

import type { DiagnosticResult } from '../contracts/envelopes.contract';

// ---------------------------------------------------------------------------
// Pure math (no I/O).
// ---------------------------------------------------------------------------

/** Set intersection size between two arrays of tool ids. */
export const intersectSize = (
	a: readonly string[],
	b: readonly string[],
): number => {
	const setB = new Set(b);
	let n = 0;
	for (const id of a) if (setB.has(id)) n += 1;
	return n;
};

/** `|A ∩ B| / |A|` — undefined when A is empty. */
export const precision = (
	invoked: readonly string[],
	expected: readonly string[],
): number | undefined => {
	if (invoked.length === 0) return undefined;
	return intersectSize(invoked, expected) / invoked.length;
};

/** `|A ∩ B| / |B|` — undefined when B is empty. */
export const recall = (
	invoked: readonly string[],
	expected: readonly string[],
): number | undefined => {
	if (expected.length === 0) return undefined;
	return intersectSize(invoked, expected) / expected.length;
};

/**
 * Jaccard distance: `1 − |A ∩ B| / |A ∪ B|`. `0` means identical sets,
 * `1` means disjoint. Returns `0` when both are empty (vacuously stable).
 */
export const jaccardDistance = (
	a: readonly string[],
	b: readonly string[],
): number => {
	if (a.length === 0 && b.length === 0) return 0;
	const unionSize = new Set([...a, ...b]).size;
	if (unionSize === 0) return 0;
	return 1 - intersectSize(a, b) / unionSize;
};

// ---------------------------------------------------------------------------
// Accumulator + per-session snapshots.
// ---------------------------------------------------------------------------

export interface ISessionKpis {
	readonly taskId: string;
	readonly invoked: readonly string[];
	readonly expected: readonly string[];
	readonly precision: number | undefined;
	readonly recall: number | undefined;
	/** Diagnostic when either side is empty — surfacing the gap
	 *  to the dashboard without inflating precision/recall. */
	readonly diagnostics: readonly DiagnosticResult[];
}

export interface IAggregateKpis {
	/** Mean precision across sessions with non-empty `invoked`. */
	readonly meanPrecision: number | undefined;
	/** Mean recall across sessions with non-empty `expected`. */
	readonly meanRecall: number | undefined;
	/** Mean churn across consecutive session pairs (per task). */
	readonly meanChurn: number | undefined;
	/** Total sessions recorded. */
	readonly sessionCount: number;
}

export interface IActivationKpis {
	/** Record one finished session. `taskId` groups sessions for
	 *  churn analysis. `expected` may be empty if the user has not
	 *  yet declared expectations for the task. */
	recordSession(input: {
		taskId: string;
		invoked: readonly string[];
		expected: readonly string[];
	}): ISessionKpis;
	/** Aggregate KPIs across all recorded sessions. */
	aggregate(): IAggregateKpis;
	/** Recent per-session KPIs (most-recent last). */
	sessions(): readonly ISessionKpis[];
	/** Dashboard formatter (markdown). */
	formatForDashboard(): string;
	/** Wipe in-memory state. Does not delete on-disk persistence
	 *  (none is written by this module). */
	reset(): void;
}

const mean = (xs: readonly number[]): number | undefined => {
	if (xs.length === 0) return undefined;
	let s = 0;
	for (const x of xs) s += x;
	return s / xs.length;
};

const buildDiagnostics = (
	taskId: string,
	invoked: readonly string[],
	expected: readonly string[],
): readonly DiagnosticResult[] => {
	if (invoked.length === 0 && expected.length === 0) return [];
	const diags: DiagnosticResult[] = [];
	if (invoked.length > 0 && expected.length === 0) {
		diags.push({
			severity: 'info',
			code: 'KPI-NO-EXPECTATIONS',
			message: `session for task "${taskId}" has no expected set; precision reported but recall is undefined`,
			source: 'activation-kpis',
		});
	}
	if (invoked.length === 0 && expected.length > 0) {
		diags.push({
			severity: 'warn',
			code: 'KPI-NO-INVOCATIONS',
			message: `session for task "${taskId}" had no tool invocations but expected ${expected.length}`,
			source: 'activation-kpis',
		});
	}
	return diags;
};

/** Aggregate churn across all recorded sessions, grouped by task. */
const aggregateChurn = (
	sessions: readonly ISessionKpis[],
): number | undefined => {
	const lastByTask = new Map<string, readonly string[]>();
	const churns: number[] = [];
	for (const s of sessions) {
		const prev = lastByTask.get(s.taskId);
		if (prev !== undefined) {
			// Distance 0 (identical set) is a real data point:
			// "the LLM was stable". Include it in the mean.
			churns.push(jaccardDistance(prev, s.invoked));
		}
		lastByTask.set(s.taskId, s.invoked);
	}
	return mean(churns);
};

export const createActivationKpis = (): IActivationKpis => {
	const buf: ISessionKpis[] = [];

	return {
		recordSession({ taskId, invoked, expected }) {
			const kpi: ISessionKpis = {
				taskId,
				invoked: [...invoked],
				expected: [...expected],
				precision: precision(invoked, expected),
				recall: recall(invoked, expected),
				diagnostics: buildDiagnostics(taskId, invoked, expected),
			};
			buf.push(kpi);
			return {
				taskId: kpi.taskId,
				invoked: kpi.invoked,
				expected: kpi.expected,
				precision: kpi.precision,
				recall: kpi.recall,
				diagnostics: kpi.diagnostics,
			};
		},
		aggregate() {
			const precisions: number[] = [];
			const recalls: number[] = [];
			for (const s of buf) {
				if (s.precision !== undefined) precisions.push(s.precision);
				if (s.recall !== undefined) recalls.push(s.recall);
			}
			return {
				meanPrecision: mean(precisions),
				meanRecall: mean(recalls),
				meanChurn: aggregateChurn(buf),
				sessionCount: buf.length,
			};
		},
		sessions() {
			return [...buf];
		},
		formatForDashboard() {
			const agg = this.aggregate();
			const lines: string[] = [];
			lines.push('## Activation KPIs');
			lines.push('');
			lines.push('### Aggregate');
			lines.push('');
			lines.push('| Metric | Value |');
			lines.push('| --- | --- |');
			lines.push(`| sessions | ${agg.sessionCount} |`);
			lines.push(
				`| mean precision | ${agg.meanPrecision?.toFixed(3) ?? '—'} |`,
			);
			lines.push(
				`| mean recall    | ${agg.meanRecall?.toFixed(3) ?? '—'} |`,
			);
			lines.push(
				`| mean churn     | ${agg.meanChurn?.toFixed(3) ?? '—'} |`,
			);
			lines.push('');
			lines.push('### Per session');
			lines.push('');
			lines.push('| task | precision | recall | #invoked | #expected |');
			lines.push('| --- | --- | --- | --- | --- |');
			for (const s of buf) {
				lines.push(
					`| ${s.taskId} | ${s.precision?.toFixed(3) ?? '—'} | ${s.recall?.toFixed(3) ?? '—'} | ${s.invoked.length} | ${s.expected.length} |`,
				);
			}
			return lines.join('\n');
		},
		reset() {
			buf.length = 0;
		},
	};
};

// ---------------------------------------------------------------------------
// Persistence (off by default — the module is process-local; this layer
// exists for callers that want JSON-on-disk. R1.9: no remote sink.)
// ---------------------------------------------------------------------------

export interface IPersistedKpisFile {
	readonly version: 1;
	readonly sessions: readonly ISessionKpis[];
}

export const serializeKpis = (k: IActivationKpis): IPersistedKpisFile => ({
	version: 1,
	sessions: k.sessions(),
});

const isStringArray = (value: unknown): value is readonly string[] =>
	Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const isPersistedKpisFile = (value: unknown): value is IPersistedKpisFile => {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as {
		readonly version?: unknown;
		readonly sessions?: unknown;
	};
	return candidate.version === 1 && Array.isArray(candidate.sessions);
};

export const hydrateKpis = (data: unknown): IActivationKpis => {
	const k = createActivationKpis();
	if (!isPersistedKpisFile(data)) return k;
	for (const s of data.sessions) {
		// Skip sessions whose shape doesn't validate to keep the
		// loader robust against on-disk corruption.
		if (
			typeof s?.taskId === 'string' &&
			isStringArray(s.invoked) &&
			isStringArray(s.expected)
		) {
			k.recordSession({
				taskId: s.taskId,
				invoked: s.invoked,
				expected: s.expected,
			});
		}
	}
	return k;
};

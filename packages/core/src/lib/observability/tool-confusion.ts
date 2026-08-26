/**
 * tool-confusion.ts — f00199 (Track M / q00006 §48).
 *
 * Detects pairs of tools the LLM confuses. When the router records
 * a `tools/call` whose `intendedTool` differs from the actual
 * `toolName`, this module increments the directed edge
 * `confusion[actual][intended]`. After enough signal, `topPairs(n)`
 * surfaces the worst offenders so a maintainer can rename, fuse,
 * or rewrite the description.
 *
 * Privacy (R1.1–R1.10): only tool ids (which are already public)
 * and integer counts. No arguments, no outputs, no paths.
 *
 * Suggested rename candidates (when `confusion[a][b] + confusion[b][a]
 * > threshold`) are computed by `suggestRenames`, which the
 * dashboard surfaces as the "Tool Confusion" section.
 */

export interface IConfusionMatrix {
	/** Directed `actual → intended` counter map. */
	readonly directed: Readonly<
		Record<string, Readonly<Record<string, number>>>
	>;
	/** Total invocations recorded. */
	readonly total: number;
	/** Total directed "confused" invocations (where intended ≠ actual). */
	readonly confused: number;
}

export interface IConfusionPair {
	readonly actual: string;
	readonly intended: string;
	readonly count: number;
}

export interface IRenameSuggestion {
	readonly a: string;
	readonly b: string;
	/** Sum of `confusion[a][b]` + `confusion[b][a]`. */
	readonly symmetricCount: number;
}

/** Suggested minimum symmetric count to surface a rename hint. */
export const DEFAULT_RENAME_THRESHOLD = 5;

export interface IToolConfusion {
	/**
	 * Record one invocation. If `intendedTool` is missing or matches
	 * `toolName`, the call is a clean hit (no confusion).
	 * If they differ, the directed edge increments.
	 */
	recordInvocation(toolName: string, intendedTool?: string): void;
	/** Full directed counter map + totals. */
	snapshot(): IConfusionMatrix;
	/** Top N pairs by count (most-confused first). */
	topPairs(n: number): readonly IConfusionPair[];
	/** Pairs whose symmetric confusion exceeds the threshold. */
	suggestRenames(threshold?: number): readonly IRenameSuggestion[];
	/** Markdown dashboard section. */
	formatForDashboard(opts?: { topN?: number; threshold?: number }): string;
	/** Wipe in-memory counters. */
	reset(): void;
}

/** Internal-only hook used by `hydrateConfusion` to restore the
 *  clean-hit and confused totals that `recordInvocation` does
 *  not see (clean hits). Not part of the public contract. */
interface IInternalToolConfusion extends IToolConfusion {
	_setTotals(total: number, confused: number): void;
}

const bump = (
	map: Record<string, Record<string, number>>,
	from: string,
	to: string,
): void => {
	const inner = map[from] ?? {};
	inner[to] = (inner[to] ?? 0) + 1;
	map[from] = inner;
};

export const createToolConfusion = (): IToolConfusion => {
	const directed: Record<string, Record<string, number>> = {};
	let total = 0;
	let confused = 0;

	const self: IInternalToolConfusion = {
		recordInvocation(toolName, intendedTool) {
			total += 1;
			if (intendedTool === undefined || intendedTool === toolName) return;
			bump(directed, toolName, intendedTool);
			confused += 1;
		},
		_setTotals(t, c) {
			total = t;
			confused = c;
		},
		snapshot() {
			// Deep-freeze so callers cannot mutate the matrix.
			const out: Record<string, Record<string, number>> = {};
			for (const [k, v] of Object.entries(directed)) {
				out[k] = { ...v };
			}
			return {
				directed: out,
				total,
				confused,
			};
		},
		topPairs(n) {
			if (n <= 0) return [];
			const pairs: IConfusionPair[] = [];
			for (const [actual, inner] of Object.entries(directed)) {
				for (const [intended, count] of Object.entries(inner)) {
					pairs.push({ actual, intended, count });
				}
			}
			pairs.sort((a, b) => b.count - a.count);
			return pairs.slice(0, n);
		},
		suggestRenames(threshold = DEFAULT_RENAME_THRESHOLD) {
			const pairs = new Map<string, IRenameSuggestion>();
			for (const [actual, inner] of Object.entries(directed)) {
				for (const [intended, count] of Object.entries(inner)) {
					if (actual === intended) continue;
					const key = [actual, intended].sort().join('\u0000');
					const existing = pairs.get(key);
					if (existing !== undefined) {
						pairs.set(key, {
							a: existing.a,
							b: existing.b,
							symmetricCount: existing.symmetricCount + count,
						});
					} else {
						pairs.set(key, {
							a: actual,
							b: intended,
							symmetricCount: count,
						});
					}
				}
			}
			return [...pairs.values()]
				.filter((p) => p.symmetricCount >= threshold)
				.sort((a, b) => b.symmetricCount - a.symmetricCount);
		},
		formatForDashboard(opts = {}) {
			const topN = opts.topN ?? 5;
			const threshold = opts.threshold ?? DEFAULT_RENAME_THRESHOLD;
			const snap = this.snapshot();
			const lines: string[] = [];
			lines.push('## Tool Confusion');
			lines.push('');
			lines.push(
				`Confused invocations: ${snap.confused} / ${snap.total}` +
					(snap.total === 0
						? ''
						: ` (${((snap.confused / snap.total) * 100).toFixed(1)}%)`),
			);
			lines.push('');
			lines.push(`### Top ${topN} pairs`);
			lines.push('');
			lines.push('| actual | intended | count |');
			lines.push('| --- | --- | --- |');
			const top = this.topPairs(topN);
			if (top.length === 0) {
				lines.push('| — | — | 0 |');
			} else {
				for (const p of top) {
					lines.push(`| ${p.actual} | ${p.intended} | ${p.count} |`);
				}
			}
			lines.push('');
			lines.push(`### Rename suggestions (≥ ${threshold})`);
			lines.push('');
			lines.push('| pair | symmetric count |');
			lines.push('| --- | --- |');
			const suggestions = this.suggestRenames(threshold);
			if (suggestions.length === 0) {
				lines.push('| — | — |');
			} else {
				for (const s of suggestions) {
					lines.push(`| ${s.a} ↔ ${s.b} | ${s.symmetricCount} |`);
				}
			}
			return lines.join('\n');
		},
		reset() {
			for (const k of Object.keys(directed)) delete directed[k];
			total = 0;
			confused = 0;
		},
	};
	return self;
};

// ---------------------------------------------------------------------------
// Persistence (off by default — process-local; R1.9 no remote sink).
// ---------------------------------------------------------------------------

export interface IPersistedConfusionFile {
	readonly version: 1;
	readonly directed: Readonly<
		Record<string, Readonly<Record<string, number>>>
	>;
	readonly total: number;
	readonly confused: number;
}

export const serializeConfusion = (
	c: IToolConfusion,
): IPersistedConfusionFile => {
	const snap = c.snapshot();
	return {
		version: 1,
		directed: snap.directed,
		total: snap.total,
		confused: snap.confused,
	};
};

export const hydrateConfusion = (
	data: IPersistedConfusionFile,
): IToolConfusion => {
	const c = createToolConfusion() as IInternalToolConfusion;
	if (data.version !== 1) return c;
	// Replay each directed event so the matrix is rebuilt exactly.
	for (const [actual, inner] of Object.entries(data.directed)) {
		if (!inner || typeof inner !== 'object') continue;
		for (const [intended, count] of Object.entries(inner)) {
			if (typeof count !== 'number' || count <= 0) continue;
			for (let i = 0; i < count; i += 1) {
				c.recordInvocation(actual, intended);
			}
		}
	}
	// Patch totals with the persisted snapshot — recordInvocation
	// only sees confused events, so clean-hit counts would
	// otherwise be missing.
	const totals = c.snapshot();
	c._setTotals(
		typeof data.total === 'number' ? data.total : totals.total,
		typeof data.confused === 'number' ? data.confused : totals.confused,
	);
	return c;
};

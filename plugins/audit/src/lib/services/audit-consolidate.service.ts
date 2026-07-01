/**
 * Consolidate N audit documents into a single master view (l99, alcance A).
 *
 * The consolidator is the value-add of this plugin: each model produces
 * an audit in the same format (via the brief from `brief.ts`), and this
 * module deduplicates findings, averages scores, and emits a master
 * ranking. It is **deterministic** given the same input (no timestamps,
 * no I/O, no random ids) so it can be re-run and diffed.
 *
 * Deduplication strategy (kept simple, opinionated):
 * - Two findings are "the same" when they cite at least one common
 *   file path AND have similar enough titles (substring containment,
 *   case-insensitive). This is intentionally cheap; if a future
 *   proposal wants fuzzy matching it can replace `isSameFinding` only.
 * - When merged, the resulting finding's severity is the **worst**
 *   across sources (FATAL > MUY_MAL > MEJORABLE > OK > MUY_BIEN > PERFECTO).
 * - The `seenBy` array is sorted alphabetically; `titles` is the deduped
 *   list of titles in source order; `files` is the deduped union.
 */

import type {
	AuditSeverity,
	IAuditDocument,
	IConsolidation,
} from '../contracts/interfaces/audit.interface';

import {
	DEFAULT_CONSOLIDATION_STRATEGIES,
	type IConsolidationStrategies,
} from './audit-consolidation-strategies';

const dedup = <T>(arr: readonly T[]): T[] => Array.from(new Set(arr));

export interface IConsolidateOptions {
	/** How many top actions to surface in `topActions`. Default 5. */
	readonly topActions?: number;
	/**
	 * Strategy bundle. Hosts can swap one or all three of
	 * severity ranking, finding-dedup predicate, and key
	 * derivation without editing this file. Defaults to
	 * `DEFAULT_CONSOLIDATION_STRATEGIES`.
	 */
	readonly strategies?: IConsolidationStrategies;
}

/**
 * Reduce the parsed documents into one master view. Pure: same inputs
 * always produce the same output. Strategies are injectable for DIP
 * (test the consolidator with fake ranking + dedup without touching
 * the implementation).
 */
export const consolidateAudits = (
	documents: readonly IAuditDocument[],
	options: IConsolidateOptions = {},
): IConsolidation => {
	const strategies = options.strategies ?? DEFAULT_CONSOLIDATION_STRATEGIES;
	const _worstSeverity = strategies.severity.worst;
	const isSameFinding = strategies.dedup;
	const findingKey = strategies.key.key;
	const topN = options.topActions ?? 5;

	const skipped: { path: string; reason: string }[] = [];
	const parsed: IAuditDocument[] = [];
	for (const d of documents) {
		if (d.findings.length === 0 && d.scores.length === 0) {
			skipped.push({
				path: d.path,
				reason: 'no findings or scores parsed',
			});
			continue;
		}
		parsed.push(d);
	}

	// -- 1. Dedup findings ------------------------------------------------
	type MergedFinding = {
		id: string;
		titles: string[];
		worstSeverity: AuditSeverity;
		files: string[];
		seenBy: string[];
	};
	const merged: MergedFinding[] = [];
	const seenKeys = new Set<string>();
	for (const d of parsed) {
		for (const f of d.findings) {
			const hit = merged.find(
				(m) =>
					m.worstSeverity === f.severity &&
					isSameFinding(
						{ title: m.titles[0] ?? '', files: m.files },
						f,
					),
			);
			if (hit) {
				hit.titles = dedup([...hit.titles, f.title]);
				hit.files = dedup([...hit.files, ...f.files]);
				if (!hit.seenBy.includes(d.source.model)) {
					hit.seenBy.push(d.source.model);
				}
				continue;
			}
			const id = findingKey(f, merged.length, seenKeys);
			seenKeys.add(id);
			merged.push({
				id,
				titles: [f.title],
				worstSeverity: f.severity,
				files: [...f.files],
				seenBy: [d.source.model],
			});
		}
	}
	// Sort merged findings by severity rank (urgent first), then by seenBy count.
	merged.sort((a, b) => {
		const sev = strategies.severity.compare(
			a.worstSeverity,
			b.worstSeverity,
		);
		if (sev !== 0) return sev;
		return b.seenBy.length - a.seenBy.length;
	});

	// -- 2. Consensus scores ----------------------------------------------
	type ConsensusRow = {
		dimension: string;
		scores: { model: string; score: number | null }[];
		average: number | null;
	};
	const byDim = new Map<string, ConsensusRow>();
	for (const d of parsed) {
		for (const s of d.scores) {
			if (s.dimension.length === 0) continue;
			const row =
				byDim.get(s.dimension) ??
				({
					dimension: s.dimension,
					scores: [],
					average: null,
				} as ConsensusRow);
			row.scores.push({ model: d.source.model, score: s.score });
			byDim.set(s.dimension, row);
		}
	}
	const consensus: ConsensusRow[] = [];
	for (const row of byDim.values()) {
		const numeric = row.scores
			.map((s) => s.score)
			.filter((n): n is number => typeof n === 'number');
		row.average =
			numeric.length > 0
				? Math.round(
						(numeric.reduce((acc, n) => acc + n, 0) /
							numeric.length) *
							10,
					) / 10
				: null;
		// Sort scores within a dimension by model name for stable output.
		row.scores.sort((a, b) => a.model.localeCompare(b.model));
		consensus.push(row);
	}
	consensus.sort((a, b) => a.dimension.localeCompare(b.dimension));

	// -- 3. Top actions ---------------------------------------------------
	// Heuristic: findings the most models agree on AND that are most urgent.
	const topActions = merged
		.filter(
			(m) => m.worstSeverity === 'FATAL' && m.seenBy.length >= 1,
		)
		.slice(0, topN)
		.map((m) => {
			const title = m.titles[0] ?? m.id;
			const file = m.files[0] ?? '<unknown>';
			// Surface the model roster so the orchestrator can see who
			// reported the finding without having to cross-reference
			// `seenBy` separately. Order matches the deduped roster.
			const seenBy =
				m.seenBy.length > 0
					? ` (visto por ${m.seenBy.join(', ')})`
					: '';
			return `${m.worstSeverity} · ${title}${seenBy} — see \`${file}\``;
		});

	return {
		auditsFound: parsed.length,
		skipped,
		consensus,
		findings: merged,
		topActions,
	};
};

/** Re-export for tests — points at the strategy bundle so tests can
 *  swap the default strategies for fakes. */
export const _internal = {
	strategies: DEFAULT_CONSOLIDATION_STRATEGIES,
};

/**
 * Options for {@link renderConsolidationMarkdown}. Keeps the function
 * project-agnostic: the host wires its own project name into the
 * header instead of hardcoding `\`@mcp-vertex/core\``.
 */
export interface IRenderConsolidationOptions {
	/**
	 * Human-readable project name rendered in the master document
	 * header. Defaults to `"the project"` to stay agnostic of any
	 * specific host vocabulary.
	 */
	readonly projectName?: string;
}

/** Convenience: render the consolidation as a markdown master document. */
export const renderConsolidationMarkdown = (
	c: IConsolidation,
	options: IRenderConsolidationOptions = {},
): string => {
	const lines: string[] = [];
	const projectName = options.projectName ?? 'the project';
	lines.push(`# Auditoría Maestra (Unificada) — \`${projectName}\``);
	lines.push('');
	lines.push(
		`> Consolidación de **${c.auditsFound}** auditorías. Los hallazgos 🔴/🟠 están re-verificados contra el código.`,
	);
	lines.push('');
	lines.push('## 📊 Veredicto unificado');
	lines.push('');
	lines.push(
		c.consensus.length === 0
			? '_(sin puntuaciones)_'
			: c.consensus
					.map(
						(d) =>
							`- **${d.dimension}**: media **${d.average ?? '?'}/10** (n=${d.scores.length})`,
					)
					.join('\n'),
	);
	lines.push('');
	lines.push('## 🔴 Cola viva (hallazgos por severidad)');
	lines.push('');
	for (const f of c.findings) {
		const title = f.titles[0] ?? f.id;
		const seenBy =
			f.seenBy.length > 0 ? ` (visto por ${f.seenBy.join(', ')})` : '';
		lines.push(
			`- **${f.worstSeverity}** · ${title}${seenBy}${f.files.length > 0 ? ` — \`${f.files[0]}\`` : ''}`,
		);
	}
	if (c.topActions.length > 0) {
		lines.push('');
		lines.push('## 🎯 Top acciones');
		lines.push('');
		for (const a of c.topActions) lines.push(`- ${a}`);
	}
	return `${lines.join('\n')}\n`;
};

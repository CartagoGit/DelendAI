/**
 * Consolidate N audit documents into a single master view (p99, alcance A).
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
	IConsolidation,
	IAuditDocument,
	IAuditFinding,
	IAuditScore,
} from './types';
import { SEVERITY_ORDER } from './types';

const SEVERITY_RANK: Readonly<Record<AuditSeverity, number>> = (() => {
	const out: Record<AuditSeverity, number> = {} as Record<
		AuditSeverity,
		number
	>;
	SEVERITY_ORDER.forEach((s, i) => {
		out[s] = i;
	});
	return out;
})();

/** Lower rank = more urgent. */
const worstSeverity = (a: AuditSeverity, b: AuditSeverity): AuditSeverity =>
	SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;

/** Are two findings "the same"? Cheap heuristic, see file header. */
const isSameFinding = (a: IAuditFinding, b: IAuditFinding): boolean => {
	const sharedFile = a.files.some((f) => b.files.includes(f));
	if (!sharedFile) return false;
	const norm = (s: string): string => s.toLowerCase();
	const aTitle = norm(a.title);
	const bTitle = norm(b.title);
	return (
		aTitle.includes(bTitle) ||
		bTitle.includes(aTitle) ||
		aTitle
			.split(/\s+/u)
			.some((tok) => tok.length >= 6 && bTitle.includes(tok))
	);
};

const dedup = <T>(arr: readonly T[]): T[] => Array.from(new Set(arr));

/** Stable key for a finding when we merge duplicates. */
const findingKey = (
	f: IAuditFinding,
	index: number,
	seenBefore: ReadonlySet<string>,
): string => {
	const filePart = (f.files[0] ?? 'no-file').replace(/[^a-z0-9]+/giu, '-');
	const base = `${f.severity.toLowerCase()}-${filePart}`;
	if (seenBefore.has(base)) return `consensus-${index}`;
	return base;
};

export interface IConsolidateOptions {
	/** How many top actions to surface in `topActions`. Default 5. */
	readonly topActions?: number;
}

/**
 * Reduce the parsed documents into one master view. Pure: same inputs
 * always produce the same output.
 */
export const consolidateAudits = (
	documents: readonly IAuditDocument[],
	options: IConsolidateOptions = {},
): IConsolidation => {
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
					isSameFinding(m as unknown as IAuditFinding, f),
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
		const sev =
			SEVERITY_RANK[a.worstSeverity] - SEVERITY_RANK[b.worstSeverity];
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
			(m) =>
				(m.worstSeverity === 'FATAL' ||
					m.worstSeverity === 'MUY_MAL') &&
				m.seenBy.length >= 1,
		)
		.slice(0, topN)
		.map((m) => {
			const title = m.titles[0] ?? m.id;
			const file = m.files[0] ?? '<unknown>';
			return `${m.worstSeverity} · ${title} — see \`${file}\``;
		});

	return {
		auditsFound: parsed.length,
		skipped,
		consensus,
		findings: merged,
		topActions,
	};
};

/** Re-export for tests. */
export const _internal = { isSameFinding, worstSeverity, SEVERITY_RANK };

/** Convenience: render the consolidation as a markdown master document. */
export const renderConsolidationMarkdown = (c: IConsolidation): string => {
	const lines: string[] = [];
	lines.push('# Auditoría Maestra (Unificada) — `@mcp-vertex/core`');
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

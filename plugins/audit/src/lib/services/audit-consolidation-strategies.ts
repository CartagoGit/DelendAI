/**
 * audit-consolidation-strategies.ts — pluggable strategies for
 * `audit-consolidate.service.ts`.
 *
 * SOLID — the consolidator previously inlined its severity ranking
 * and finding-dedup policy as private helpers. This file extracts
 * them so each concern has one home (SRP), the consolidator is
 * open to swapping strategies (OCP), and tests can inject fake
 * strategies without touching the consolidator (DIP).
 *
 * Why these are strategies, not just utilities:
 *   - The severity ordering is a domain decision (FATAL > MUY_MAL >
 *     MEJORABLE > OK > MUY_BIEN > PERFECTO). A future "verbose"
 *     host might want a 4-level scale; a "compact" host might want
 *     only P0/P1/P2. Adding a new scale is a new strategy + one
 *     line in `DEFAULT_STRATEGIES`, not a search-and-replace.
 *   - The "are two findings the same?" predicate is heuristic. A
 *     host with a CVE-style catalogue might want exact match on a
 *     fingerprint; another host with a typo-tolerance policy might
 *     want edit-distance. The header of the original service
 *     explicitly says "if a future proposal wants fuzzy matching
 *     it can replace `isSameFinding` only" — this file is the
 *     place where that swap is now mechanical.
 */
import { SEVERITY_ORDER } from '../contracts/interfaces/audit.interface';
import type {
	AuditSeverity,
	IAuditFinding,
} from '../contracts/interfaces/audit.interface';

/* ------------------------------------------------------------------ *
 *  Severity ranking                                                   *
 * ------------------------------------------------------------------ */

export interface ISeverityRank {
	/** Lower rank = more urgent. */
	compare(a: AuditSeverity, b: AuditSeverity): number;
	/** The more-urgent of the two. */
	worst(a: AuditSeverity, b: AuditSeverity): AuditSeverity;
	/** True if `a` is strictly more urgent than `b`. */
	isMoreUrgent(a: AuditSeverity, b: AuditSeverity): boolean;
}

const buildDefaultRank = (): ISeverityRank => {
	const rank: Readonly<Record<AuditSeverity, number>> = (() => {
		const out: Record<AuditSeverity, number> = {} as Record<
			AuditSeverity,
			number
		>;
		SEVERITY_ORDER.forEach((s, i) => {
			out[s] = i;
		});
		return out;
	})();
	return {
		compare: (a, b) => rank[a] - rank[b],
		worst: (a, b) => (rank[a] <= rank[b] ? a : b),
		isMoreUrgent: (a, b) => rank[a] < rank[b],
	};
};

/** Default severity rank: index 0 (`FATAL`) is the most urgent.
 *  Built from `SEVERITY_ORDER` so a new severity added to the
 *  contract is automatically picked up — no edit here. */
export const DefaultSeverityRank: ISeverityRank = buildDefaultRank();

/* ------------------------------------------------------------------ *
 *  Finding-dedup predicate                                            *
 * ------------------------------------------------------------------ */

/** Minimum shape the dedup predicate needs from a finding. Keeps
 *  the strategy interface narrow (ISP) — `IConsolidation` is wider
 *  but not used here. */
export interface ILikeFinding {
	readonly title: string;
	readonly files: readonly string[];
}

export type FindingDedupPredicate = (
	a: ILikeFinding,
	b: ILikeFinding,
) => boolean;

const defaultDedup: FindingDedupPredicate = (a, b) => {
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

/** Default "are two findings the same?" predicate: shared file +
 *  substring containment of titles, with a 6-char token fallback
 *  for typo tolerance. */
export const DefaultFindingDedup: FindingDedupPredicate = defaultDedup;

/* ------------------------------------------------------------------ *
 *  Stable-key derivation                                              *
 * ------------------------------------------------------------------ */

export interface IFindingKeyDeriver {
	/** Return a stable, human-readable id for `f` at merge `index`,
	 *  disambiguating against keys the caller has already used. */
	key(
		f: IAuditFinding,
		index: number,
		seenBefore: ReadonlySet<string>,
	): string;
}

const defaultKeyDeriver: IFindingKeyDeriver = {
	key(f, index, seenBefore) {
		const filePart = (f.files[0] ?? 'no-file').replace(
			/[^a-z0-9]+/giu,
			'-',
		);
		const base = `${f.severity.toLowerCase()}-${filePart}`;
		if (seenBefore.has(base)) return `consensus-${index}`;
		return base;
	},
};

export const DefaultFindingKeyDeriver: IFindingKeyDeriver = defaultKeyDeriver;

/* ------------------------------------------------------------------ *
 *  Strategy bundle — the consolidator consumes this single object.  *
 * ------------------------------------------------------------------ */

export interface IConsolidationStrategies {
	readonly severity: ISeverityRank;
	readonly dedup: FindingDedupPredicate;
	readonly key: IFindingKeyDeriver;
}

/** Default strategy bundle. Open/Closed: a host injects a custom
 *  bundle through the `consolidateAudits` 4th argument. */
export const DEFAULT_CONSOLIDATION_STRATEGIES: IConsolidationStrategies = {
	severity: DefaultSeverityRank,
	dedup: DefaultFindingDedup,
	key: DefaultFindingKeyDeriver,
};

/**
 * adoption-stages.constant.ts — Cumulative stages of project adoption.
 *
 * f00280 S3: instead of a single all-or-nothing preset, adoption happens
 * in four CUMULATIVE stages. Each stage ADDS plugins on top of the
 * previous one; specifying `stage: N` installs stages 1..N. The
 * `specialized` stage is a sentinel: it does not pin specific plugin
 * ids but lets the assessment's "remaining recommended" set flow
 * through unmodified.
 *
 * Default stage is `core` — the minimum viable adoption
 * (version control + code discovery + project docs + memory) so a
 * brand-new user can drop mcp-vertex in without committing to the
 * full toolkit up front.
 */

export const ADOPTION_STAGES = [
	'core',
	'standard',
	'agents',
	'specialized',
] as const;

export type AdoptionStage = (typeof ADOPTION_STAGES)[number];

export interface IAdoptionStageDefinition {
	readonly id: AdoptionStage;
	/** Human-facing title used in adoption logs and rationale. */
	readonly title: string;
	/** One-line "why this stage exists" rationale. */
	readonly summary: string;
	/**
	 * Plugin ids ADDED at this stage. CUMULATIVE with previous
	 * stages — `resolveStagePluginIds('agents')` returns the union of
	 * `core`, `standard`, and `agents`.
	 *
	 * `specialized` keeps an empty list on purpose: the assessment's
	 * remaining recommendations fill that slot when the caller asks
	 * for the full surface.
	 */
	readonly pluginIds: readonly string[];
}

/**
 * Canonical stage catalog, ordered from smallest to largest. Order is
 * significant — `resolveStagePluginIds` walks this list until it
 * reaches the requested stage. The first entry is the default; the
 * last entry is the largest.
 */
export const ADOPTION_STAGE_CATALOG: readonly IAdoptionStageDefinition[] = [
	{
		id: 'core',
		title: 'core+git+search+docs',
		summary:
			'Foundation: code discovery (search), version control (git), project docs (docs), cross-session continuity (memory).',
		pluginIds: ['git', 'search', 'docs', 'memory'],
	},
	{
		id: 'standard',
		title: 'rules+test-policy+quality',
		summary:
			'Static rules, testing conventions, quality enforcement — the day-to-day developer loop.',
		pluginIds: ['rules', 'test-policy', 'quality', 'test-convention'],
	},
	{
		id: 'agents',
		title: 'proposals+agents',
		summary:
			'Proposal workflow + multi-agent orchestration. Required to run /auto_work and the swarm tools.',
		pluginIds: ['proposals', 'agent-orchestrator'],
	},
	{
		id: 'specialized',
		title: 'specialized plugins',
		summary:
			'Domain-specific plugins (security, perf, audit, deps, …). Adoption includes whatever the assessment recommends beyond the first three stages.',
		pluginIds: [],
	},
] as const;

export const DEFAULT_ADOPTION_STAGE: AdoptionStage = 'core';

export const isAdoptionStage = (value: unknown): value is AdoptionStage =>
	typeof value === 'string' &&
	(ADOPTION_STAGES as readonly string[]).includes(value);

/**
 * Resolve the CUMULATIVE set of plugin ids included up to and including
 * `stage`. Each stage contributes its `pluginIds` on top of all previous
 * stages in catalog order. The `specialized` stage returns an empty
 * list — the caller combines it with the assessment's remaining
 * recommendations to express "everything".
 *
 * @example
 *   resolveStagePluginIds('core')        // ['git', 'search', 'docs', 'memory']
 *   resolveStagePluginIds('standard')    // ['git', 'search', 'docs', 'memory', 'rules', 'test-policy', 'quality', 'test-convention']
 *   resolveStagePluginIds('specialized') // []
 */
export const resolveStagePluginIds = (
	stage: AdoptionStage,
): readonly string[] => {
	if (stage === 'specialized') return [];
	const result = new Set<string>();
	for (const def of ADOPTION_STAGE_CATALOG) {
		for (const id of def.pluginIds) {
			result.add(id);
		}
		if (def.id === stage) break;
	}
	return [...result];
};

import { PRESET_METADATA } from '../contracts/constants/preset-metadata.generated';
import { PRESET_ROLES } from '../contracts/constants/preset-roles.constant';
import type { IPresetBudgetProfile } from '../contracts/interfaces/preset-budget-profile.interface';
import { derivePresetBudget, derivePresetSummary } from './preset-derived';

/**
 * Canonical preset catalog for `@mcp-vertex/core`.
 *
 * Single source of truth for `--preset=NAME` resolution, the web
 * `/es/presets` table, the install docs, and any future consumer
 * that wants to know "which plugins does preset X ship?".
 *
 * Invariants (enforced by `preset-catalog.spec.ts` and
 * `tools/scripts/lint/preset-drift.script.ts`):
 *
 *   1. The catalog stores DELTAS, not full membership lists. Each
 *      preset's `members` array lists only the plugins *added* on
 *      top of the previous preset in the ⊇ chain. Resolved
 *      membership is the union of every preceding preset.
 *   2. The chain is `full, vertex ⊇ swarm ⊇ standard ⊇ minimal`,
 *      where `vertex` is an alternative sibling to `full` (its
 *      delta on top of `swarm` covers everything the mcp-vertex
 *      project itself ships, including host-only + opt-in
 *      plugins). Presets marked `independent: true` skip the
 *      chain accumulation and resolve to their own members only.
 *   3. Every `members[i].plugin` corresponds to a real package
 *      either under `plugins/<id>/package.json` or
 *      `packages/<id>/package.json`. Unknown ids fail the lint.
 *   4. Plugins marked `hostOnly: true` MAY appear in `full` or
 *      `vertex` and MUST NOT appear in `minimal`, `standard`, or
 *      `swarm`.
 *   5. The list of presets is closed: it is exactly the
 *      `PRESET_KIND` tuple.
 *
 * The catalog is plain data, no plugin-name vocabulary leaks into
 * the rest of the core: only the ids the user types in `--plugins=`
 * are referenced here.
 */
export const PRESET_KIND = [
	'minimal',
	'lean',
	'standard',
	'swarm',
	'full',
	'vertex',
	// Stack packs. Independent: each pack resolves to exactly its
	// own plugin set + tuned defaults; they never accumulate the
	// chain and never perturb the resolved membership of
	// `minimal`/`lean`/`standard`/`swarm`/`full`/`vertex`.
	'web-app',
	'backend-api',
	'cli-tool',
] as const;
export type IPresetKind = (typeof PRESET_KIND)[number];

export interface IPresetMember {
	/** Plugin id (e.g. "proposals", "issues"). */
	readonly plugin: string;
	/**
	 * When true, this plugin is host-only and only ships under `full`
	 * or `vertex`, never under `minimal`, `standard`, or `swarm`. The
	 * lint refuses any preset membership that violates this rule.
	 */
	readonly hostOnly?: boolean;
}

export interface IPresetDefinition {
	readonly id: IPresetKind;
	/** Human-facing title (i18n key: `preset.<id>.title`). */
	readonly title: string;
	/** Human-facing summary (i18n key: `preset.<id>.summary`). */
	readonly summary: string;
	/** Why this preset exists operationally. */
	readonly role: string;
	/**
	 * DELTA members. The effective membership is the union of every
	 * preceding preset in `PRESET_KIND` plus this `members` array,
	 * unless `independent` is true (then only this preset's own
	 * members apply).
	 */
	readonly members: readonly IPresetMember[];
	/**
	 * Runtime budget snapshot. `toolCount`/`schemaBytes` come from
	 * `PRESET_METADATA` (`preset-metadata.generated.ts`, r00024 /
	 * PRESET-001) — generated against the live runtime by
	 * `tools/scripts/generate/preset-metadata.script.ts`, the SAME
	 * measurement the token dashboard uses; `check:generated` fails on
	 * drift. `measurementSurface` is which surface was measured, not the
	 * runtime exposure default. `permissions`
	 * is real tool effects; `capabilities` is the role-profile summary.
	 */
	readonly budget: IPresetBudgetProfile;
	/**
	 * When true, the preset resolves to ONLY its own members and
	 * skips the chain accumulation. Use this for presets that are
	 * NOT a superset of the previous preset in the catalog order
	 * (e.g. `vertex`, which mirrors a specific project's config and
	 * intentionally omits some `swarm` plugins). The `init` UI
	 * surfaces `independent` presets as a peer option — they never
	 * overwrite or shadow the chain presets above them.
	 */
	readonly independent?: boolean;
}

type IPresetSeed = Omit<IPresetDefinition, 'summary' | 'budget'>;

/**
 * Canonical preset catalog. Order is significant: presets are listed
 * from smallest to largest; the last entry in the chain (`full` /
 * `vertex`) is the largest. Two presets are `independent: true` and
 * skip chain accumulation: `lean` (right after `minimal`) and
 * `vertex` (last). `lean` resolves to exactly its own 4 essentials;
 * `vertex` mirrors the mcp-vertex project's own config (which is NOT
 * a superset of `swarm`). Because both are independent, they do NOT
 * alter the resolved membership of the chain presets around them.
 */
const PRESET_SEEDS: readonly IPresetSeed[] = [
	{
		id: 'minimal',
		title: 'minimal',
		role: PRESET_ROLES.minimal!,
		members: [{ plugin: 'git' }, { plugin: 'search' }],
	},
	{
		// `lean` is the 4-plugin essentials preset: version control
		// (git), code discovery (search), cross-session continuity
		// (memory), and documentation (docs) — nothing heavy. Marked
		// `independent: true` so `resolvePresetMembers('lean')` resolves
		// to EXACTLY those 4 members and never accumulates the chain.
		// Because it is independent, its presence between `minimal` and
		// `standard` does NOT change the resolved membership of
		// `standard`/`swarm`/`full` (the accumulation loop skips
		// independent defs that are not the target).
		id: 'lean',
		title: 'lean',
		role: PRESET_ROLES.lean!,
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'memory' },
			{ plugin: 'docs' },
		],
		independent: true,
	},
	{
		id: 'standard',
		title: 'standard',
		role: PRESET_ROLES.standard!,
		members: [
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'i18n' },
			{ plugin: 'prompts-pack' },
			{ plugin: 'rules' },
			{ plugin: 'quality' },
			{ plugin: 'refactor' },
			{ plugin: 'deps' },
			{ plugin: 'test-policy' },
			{ plugin: 'database' },
			{ plugin: 'container' },
			{ plugin: 'diagram' },
			{ plugin: 'env' },
			{ plugin: 'skills-pack' },
			{ plugin: 'error-reporting' },
			{ plugin: 'auto-agent-selector' },
			{ plugin: 'agent-orchestrator' },
		],
	},
	{
		id: 'swarm',
		title: 'swarm',
		role: PRESET_ROLES.swarm!,
		members: [
			{ plugin: 'proposals' },
			{ plugin: 'notification' },
			{ plugin: 'completion' },
			{ plugin: 'logs' },
			{ plugin: 'status-marker' },
			{ plugin: 'test-convention' },
			{ plugin: 'conventions' },
			{ plugin: 'forge' },
			{ plugin: 'agent-orchestrator' },
		],
	},
	{
		id: 'full',
		title: 'full',
		role: PRESET_ROLES.full!,
		members: [
			{ plugin: 'web-fetch', hostOnly: true },
			{ plugin: 'issues', hostOnly: true },
			{ plugin: 'api' },
			{ plugin: 'remote-provider-core' },
			{ plugin: 'github' },
			{ plugin: 'gitlab' },
			{ plugin: 'prompt-eval' },
			{ plugin: 'agent-orchestrator' },
			// Loadable and configurable but, until now, reachable from no
			// preset at all — `verify:plugin-wiring` flagged them for weeks.
			// They ship only here, in `full`, because each one costs real
			// tokens on an adopter's surface. That cost is bounded by lazy
			// loading: they are in `managed-lazy-catalog.generated.ts`, so a
			// `full` install pays for a catalog entry, not an imported
			// module, until a tool of theirs is actually called. If you add a
			// plugin to any preset, REGENERATE that catalog
			// (`bun tools/scripts/generate/managed-lazy-catalog.script.ts`) —
			// one unindexed plugin demotes the entire surface to eager
			// loading for everyone (`managed-lazy-demotion.ts` now says so on
			// stderr instead of letting it pass silently).
			{ plugin: 'audit-orchestrator' },
			{ plugin: 'browser' },
			{ plugin: 'cache' },
			{ plugin: 'external-mcps' },
			{ plugin: 'observability' },
			// `changelog` removed — private, unpublished.
		],
	},
	{
		// `vertex` mirrors the plugin set of the mcp-vertex project
		// itself (`mcp-vertex.config.json` at the repo root) — every
		// key under its `plugins` object, INCLUDING `proposals` (the
		// orchestration/swarm engine): mcp-vertex dogfoods its own
		// orchestrator in its own dev surface, and this preset is what
		// a new adopter gets via `mcpv init:default`'s default, so it
		// must include `proposals` too (x00166 — the orchestrator is
		// the whole point of adopting mcp-vertex; this preset used to
		// silently omit it, a stale drift caught live 2026-07-29).
		// Marked `independent: true` so `resolvePresetMembers` skips the
		// chain accumulation and returns ONLY the members listed
		// below — the exact snapshot the project ships. `preset-drift`
		// verifies this list against the live root
		// `mcp-vertex.config.json` plugin keys on every validate pass.
		id: 'vertex',
		title: 'vertex',
		role: PRESET_ROLES.vertex!,
		members: [
			{ plugin: 'adaptive-optimizer' },
			{ plugin: 'audit' },
			{ plugin: 'auto-agent-selector' },
			{ plugin: 'auto-plugin-selector' },
			{ plugin: 'commit-policy' },
			{ plugin: 'completion' },
			{ plugin: 'container' },
			{ plugin: 'conventions' },
			{ plugin: 'context-for-change' },
			{ plugin: 'deps' },
			{ plugin: 'diagram' },
			{ plugin: 'docs' },
			{ plugin: 'env' },
			{ plugin: 'forge' },
			{ plugin: 'git' },
			{ plugin: 'i18n' },
			{ plugin: 'impact-analysis' },
			{ plugin: 'project-health' },
			{ plugin: 'quality-policy' },
			{ plugin: 'link-check' },
			{ plugin: 'logs' },
			{ plugin: 'memory' },
			{ plugin: 'notification' },
			{ plugin: 'orchestrator-runner' },
			{ plugin: 'agent-orchestrator' },
			{ plugin: 'perf' },
			{ plugin: 'proposals' },
			{ plugin: 'project-kpis' },
			{ plugin: 'quality' },
			{ plugin: 'rules' },
			{ plugin: 'search' },
			{ plugin: 'security' },
			{ plugin: 'status-marker' },
			{ plugin: 'tech-debt' },
			{ plugin: 'test-convention' },
			{ plugin: 'test-policy' },
			{ plugin: 'usage-tracking' },
			{ plugin: 'error-reporting' },
		],
		independent: true,
	},
	// Stack packs. Each resolves to exactly its own members;
	// never accumulates the ⊇ chain. `resolvePackOptions`
	// (in `pack-defaults.ts`) overlays tuned per-plugin defaults on
	// top of `PLUGIN_DEFAULTS` and below the user's explicit config.
	{
		id: 'web-app',
		title: 'web-app',
		role: PRESET_ROLES['web-app']!,
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'i18n' },
			{ plugin: 'rules' },
			{ plugin: 'quality' },
			{ plugin: 'refactor' },
			{ plugin: 'deps' },
			{ plugin: 'test-policy' },
			{ plugin: 'test-convention' },
			{ plugin: 'diagram' },
			{ plugin: 'env' },
			{ plugin: 'container' },
			{ plugin: 'web-fetch', hostOnly: true },
			{ plugin: 'status-marker' },
			{ plugin: 'skills-pack' },
			{ plugin: 'prompts-pack' },
		],
		independent: true,
	},
	{
		id: 'backend-api',
		title: 'backend-api',
		role: PRESET_ROLES['backend-api']!,
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'rules' },
			{ plugin: 'quality' },
			{ plugin: 'refactor' },
			{ plugin: 'deps' },
			{ plugin: 'test-policy' },
			{ plugin: 'test-convention' },
			{ plugin: 'database' },
			{ plugin: 'diagram' },
			{ plugin: 'env' },
			{ plugin: 'container' },
			{ plugin: 'skills-pack' },
			{ plugin: 'prompts-pack' },
		],
		independent: true,
	},
	{
		id: 'cli-tool',
		title: 'cli-tool',
		role: PRESET_ROLES['cli-tool']!,
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'env' },
			// `changelog` removed — private, unpublished.
			{ plugin: 'perf' },
			{ plugin: 'test-policy' },
		],
		independent: true,
	},
];

const resolvePresetMembersFrom = (
	definitions: readonly Pick<
		IPresetDefinition,
		'id' | 'members' | 'independent'
	>[],
	id: IPresetKind | string | undefined,
): readonly string[] => {
	if (id === undefined) return [];
	const index = PRESET_KIND.indexOf(id as IPresetKind);
	if (index < 0) return [];
	const target = definitions[index];
	if (target === undefined) return [];
	if (target.independent === true) {
		return target.members.map((m) => m.plugin);
	}
	const seen = new Set<string>();
	const ordered: string[] = [];
	for (let i = 0; i <= index; i += 1) {
		const def = definitions[i];
		if (def === undefined) continue;
		if (def.independent === true && def !== target) continue;
		for (const member of def.members) {
			if (!seen.has(member.plugin)) {
				seen.add(member.plugin);
				ordered.push(member.plugin);
			}
		}
	}
	return ordered;
};

export const PRESET_CATALOG: readonly IPresetDefinition[] = PRESET_SEEDS.map(
	(definition) => {
		const resolvedMembers = resolvePresetMembersFrom(
			PRESET_SEEDS,
			definition.id,
		);
		return {
			...definition,
			summary: derivePresetSummary({
				id: definition.id,
				resolvedMembers,
				...(definition.independent === true
					? { independent: true }
					: {}),
			}),
			budget: derivePresetBudget({
				metadata: PRESET_METADATA[definition.id],
				resolvedMembers,
			}),
		};
	},
);

/**
 * Resolves the effective membership of a preset: the union of every
 * preceding preset in the ⊇ chain plus the preset's own delta.
 * Presets marked `independent: true` skip the chain accumulation
 * and resolve to ONLY their own members (used by `vertex`).
 *
 * The returned array preserves the catalog order (smallest plugin
 * first, host-only last), is deduplicated, and is safe to feed
 * straight into `--plugins=A,B,C`.
 */
export const resolvePresetMembers = (
	id: IPresetKind | string | undefined,
): readonly string[] => {
	return resolvePresetMembersFrom(PRESET_CATALOG, id);
};

/** A preset kind or `undefined` (no preset). */
export const isPresetKind = (value: string | undefined): value is IPresetKind =>
	typeof value === 'string' &&
	(PRESET_KIND as readonly string[]).includes(value);

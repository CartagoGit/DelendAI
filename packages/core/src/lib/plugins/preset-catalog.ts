import { PRESET_METADATA } from '../contracts/constants/preset-metadata.generated';
import {
	PRESET_PURPOSES,
	PRESET_ROLES,
} from '../contracts/constants/preset-roles.constant';
import type { IPresetBudgetProfile } from '../contracts/interfaces/preset-budget-profile.interface';
import {
	RETIRED_PRESET_ID,
	type IRetiredPresetId,
} from '../contracts/constants/retired-preset-ids.constant';
import {
	STACK_PACKS,
	type IPackId,
} from '../contracts/constants/stack-packs.constant';
import { derivePresetBudget, derivePresetSummary } from './preset-derived';

/**
 * Canonical preset catalog for `@delendai/core`.
 *
 * Single source of truth for `--preset=NAME` resolution, the web
 * `/es/presets` table, the install docs, and any future consumer
 * that wants to know "which plugins does preset X ship?".
 *
 * Invariants (enforced by `preset-catalog.spec.ts`,
 * `tools/scripts/lint/preset-drift.script.ts` and
 * `tools/scripts/lint/manifest-vs-presets.script.ts`):
 *
 *   1. A preset is a pack BY PURPOSE: it lists its full membership, and
 *      no pack is a superset of another by construction. Every pack is
 *      `independent: true`; the delta-chain resolution below is kept only
 *      for a future pack that wants it.
 *   2. Every member's declared plugin dependencies are members of the
 *      same pack (`MANIFEST-PRESET-004`).
 *   3. Every `members[i].plugin` corresponds to a real package either
 *      under `plugins/<id>/package.json` or `packages/<id>/package.json`.
 *   4. Plugins marked `hostOnly: true` MAY appear in `everything`,
 *      `dogfood` or a pack whose purpose needs them, and MUST NOT appear
 *      in `minimal`, `solo` or `swarm`.
 *   5. The list of presets is closed: it is exactly the `PRESET_KIND`
 *      tuple. Retired ids and the stack packs (`web-app`, `backend-api`,
 *      `cli-tool`: a purpose pack plus a stack overlay, see
 *      `pack-defaults-overlay.ts`) resolve through `PRESET_ALIASES`.
 *
 * The catalog is plain data, no plugin-name vocabulary leaks into
 * the rest of the core: only the ids the user types in `--plugins=`
 * are referenced here.
 */
export const PRESET_KIND = [
	'minimal',
	'solo',
	'team-pr',
	'swarm',
	'audit',
	'docs-web',
	'everything',
	'dogfood',
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
	/** Who the pack is for (i18n key: `preset.<id>.purpose`). */
	readonly purpose: string;
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
	 * (e.g. `dogfood`, which mirrors a specific project's config and
	 * intentionally omits some `swarm` plugins). The `init` UI
	 * surfaces `independent` presets as a peer option — they never
	 * overwrite or shadow the chain presets above them.
	 */
	readonly independent?: boolean;
	/**
	 * Whether this preset lists only its `essential` tools in `tools/list`
	 * by default, keeping `contextual` and `administrative` ones hidden but
	 * callable through the router, `searchTools` and `resolveRoute`. A
	 * workspace's `managedSurface.progressiveDisclosure` still wins.
	 *
	 * On for `swarm` and `everything` (v00135): both ship `proposals`, whose 48
	 * tools are a third of their static surface and whose 29
	 * administrative tools are repair and diagnosis an agent rarely needs
	 * as its next step. Measured on the native surface it saves 58,827 B
	 * in each preset — swarm 236,176 -> 177,349 B, full 269,627 ->
	 * 210,800 B — which brings both back under the hard ceilings their
	 * temporary budget exceptions had raised.
	 */
	readonly progressiveDisclosure?: boolean;
}

type IPresetSeed = Omit<IPresetDefinition, 'summary' | 'budget'>;

/**
 * Canonical preset catalog. Order is significant: presets are listed
 * from smallest to largest; the last entry in the chain (`full` /
 * `dogfood`) is the largest. Two presets are `independent: true` and
 * skip chain accumulation: `lean` (right after `minimal`) and
 * `dogfood` (last). `lean` resolves to exactly its own 4 essentials;
 * `dogfood` mirrors the delendai project's own config (which is NOT
 * a superset of `swarm`). Because both are independent, they do NOT
 * alter the resolved membership of the chain presets around them.
 */
const PRESET_SEEDS: readonly IPresetSeed[] = [
	{
		id: 'minimal',
		title: 'minimal',
		role: PRESET_ROLES['minimal']!,
		purpose: PRESET_PURPOSES['minimal']!,
		members: [{ plugin: 'git' }, { plugin: 'search' }],
		independent: true,
	},
	{
		id: 'solo',
		title: 'solo',
		role: PRESET_ROLES['solo']!,
		purpose: PRESET_PURPOSES['solo']!,
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'quality' },
			{ plugin: 'rules' },
			{ plugin: 'deps' },
			{ plugin: 'test-policy' },
			{ plugin: 'env' },
			{ plugin: 'refactor' },
		],
		independent: true,
	},
	{
		id: 'team-pr',
		title: 'team-pr',
		role: PRESET_ROLES['team-pr']!,
		purpose: PRESET_PURPOSES['team-pr']!,
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'quality' },
			{ plugin: 'rules' },
			{ plugin: 'deps' },
			{ plugin: 'test-policy' },
			{ plugin: 'env' },
			{ plugin: 'refactor' },
			{ plugin: 'forge' },
			{ plugin: 'commit-policy' },
			{ plugin: 'conventions' },
			{ plugin: 'test-convention' },
			{ plugin: 'security' },
			{ plugin: 'web-fetch', hostOnly: true },
			{ plugin: 'status-marker' },
			{ plugin: 'error-reporting' },
		],
		independent: true,
	},
	{
		id: 'swarm',
		title: 'swarm',
		role: PRESET_ROLES['swarm']!,
		purpose: PRESET_PURPOSES['swarm']!,
		progressiveDisclosure: true,
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'quality' },
			{ plugin: 'test-policy' },
			{ plugin: 'proposals' },
			{ plugin: 'error-reporting' },
			{ plugin: 'logs' },
			{ plugin: 'agent-orchestrator' },
			{ plugin: 'auto-agent-selector' },
			{ plugin: 'notification' },
			{ plugin: 'completion' },
			{ plugin: 'status-marker' },
			{ plugin: 'forge' },
			{ plugin: 'commit-policy' },
			{ plugin: 'conventions' },
			{ plugin: 'test-convention' },
			{ plugin: 'usage-tracking' },
		],
		independent: true,
	},
	{
		id: 'audit',
		title: 'audit',
		role: PRESET_ROLES['audit']!,
		purpose: PRESET_PURPOSES['audit']!,
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'docs' },
			{ plugin: 'audit' },
			{ plugin: 'security' },
			{ plugin: 'web-fetch', hostOnly: true },
			{ plugin: 'deps' },
			{ plugin: 'tech-debt' },
			{ plugin: 'link-check' },
			{ plugin: 'project-health' },
			{ plugin: 'impact-analysis' },
			{ plugin: 'refactor' },
			{ plugin: 'quality' },
			{ plugin: 'test-policy' },
			{ plugin: 'logs' },
		],
		independent: true,
	},
	{
		id: 'docs-web',
		title: 'docs-web',
		role: PRESET_ROLES['docs-web']!,
		purpose: PRESET_PURPOSES['docs-web']!,
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'i18n' },
			{ plugin: 'link-check' },
			{ plugin: 'web-fetch', hostOnly: true },
			{ plugin: 'env' },
		],
		independent: true,
	},
	{
		id: 'everything',
		title: 'everything',
		role: PRESET_ROLES['everything']!,
		purpose: PRESET_PURPOSES['everything']!,
		progressiveDisclosure: true,
		members: [
			{ plugin: 'adaptive-optimizer' },
			{ plugin: 'agent-orchestrator' },
			{ plugin: 'api' },
			{ plugin: 'audit' },
			{ plugin: 'audit-orchestrator' },
			{ plugin: 'auto-agent-selector' },
			{ plugin: 'auto-plugin-selector' },
			{ plugin: 'browser' },
			{ plugin: 'cache' },
			{ plugin: 'commit-policy' },
			{ plugin: 'completion' },
			{ plugin: 'container' },
			{ plugin: 'context-for-change' },
			{ plugin: 'conventions' },
			{ plugin: 'database' },
			{ plugin: 'deps' },
			{ plugin: 'diagram' },
			{ plugin: 'docs' },
			{ plugin: 'env' },
			{ plugin: 'error-reporting' },
			{ plugin: 'execution-env' },
			{ plugin: 'external-mcps' },
			{ plugin: 'forge' },
			{ plugin: 'framework-knowledge' },
			{ plugin: 'git' },
			{ plugin: 'github' },
			{ plugin: 'gitlab' },
			{ plugin: 'i18n' },
			{ plugin: 'impact-analysis' },
			{ plugin: 'issues', hostOnly: true },
			{ plugin: 'link-check' },
			{ plugin: 'logs' },
			{ plugin: 'memory' },
			{ plugin: 'notification' },
			{ plugin: 'observability' },
			{ plugin: 'orchestrator-runner' },
			{ plugin: 'perf' },
			{ plugin: 'project-health' },
			{ plugin: 'project-kpis' },
			{ plugin: 'prompt-eval' },
			{ plugin: 'prompts-pack' },
			{ plugin: 'proposals' },
			{ plugin: 'quality' },
			{ plugin: 'quality-policy' },
			{ plugin: 'refactor' },
			{ plugin: 'remote-provider-core' },
			{ plugin: 'rules' },
			{ plugin: 'search' },
			{ plugin: 'security' },
			{ plugin: 'self-learning' },
			{ plugin: 'skills-pack' },
			{ plugin: 'status-marker' },
			{ plugin: 'style-convention' },
			{ plugin: 'tech-debt' },
			{ plugin: 'test-convention' },
			{ plugin: 'test-policy' },
			{ plugin: 'usage-tracking' },
			{ plugin: 'web-fetch', hostOnly: true },
		],
		independent: true,
	},
	{
		// `dogfood` is this repository's own snapshot: every key under the
		// `plugins` object of the root `delendai.config.json`, and nothing
		// else. `preset-drift` verifies the list against that file on every
		// validate pass, so it changes only when the repository's own config
		// does. It is a peer of the purpose packs, never a superset of one.
		id: 'dogfood',
		title: 'dogfood',
		role: PRESET_ROLES.dogfood!,
		purpose: PRESET_PURPOSES.dogfood!,
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
 * Backward-compatibility aliases for retired preset ids.
 *
 * Maps every id the catalogue stopped listing to the pack that replaces
 * it, and, for the stack packs, to the stack overlay layered on top
 * (`STACK_PACKS`). Applied inside `resolvePresetMembers` and
 * `normalizePresetInput` BEFORE the catalog lookup so old configs and
 * scripts that pass `--preset=<retired id>` keep resolving.
 *
 * A non-empty stderr line naming the replacement is emitted on every
 * alias hit so operators see the deprecation in CI logs.
 *
 * Adding a new alias: drop the legacy id here. Removing one: gate on a
 * removal-release doc + a follow-up audit proposal (this table is the
 * single switchboard for renames).
 */
interface IPresetAlias {
	readonly replacement: IPresetKind;
	/** The stack overlay the old id also stood for, when it was a stack pack. */
	readonly stack?: IPackId;
}

export { RETIRED_PRESET_ID, type IRetiredPresetId };

const PRESET_ALIASES: Readonly<Record<IRetiredPresetId, IPresetAlias>> = {
	vertex: { replacement: 'dogfood' },
	lean: { replacement: 'solo' },
	standard: { replacement: 'solo' },
	full: { replacement: 'everything' },
	'web-app': {
		replacement: STACK_PACKS['web-app'].basePack,
		stack: 'web-app',
	},
	'backend-api': {
		replacement: STACK_PACKS['backend-api'].basePack,
		stack: 'backend-api',
	},
	'cli-tool': {
		replacement: STACK_PACKS['cli-tool'].basePack,
		stack: 'cli-tool',
	},
};

/**
 * This module is reachable from `@delendai/core/contracts`, which must
 * compile for a consumer that has no `@types/node` — a browser bundle,
 * say. A bare `process.stderr.write` made that impossible, and the
 * failure was invisible here because this package does have the types.
 *
 * Reaching for `process` through `globalThis` keeps the behaviour
 * identical wherever a stderr exists (Node, Bun) and simply drops the
 * line where none does. A deprecation notice is worth printing when it
 * can be printed; it is not worth making the contracts barrel
 * unbuildable for half its consumers.
 */
type TStderrHost = {
	readonly process?: {
		readonly stderr?: { readonly write?: (chunk: string) => unknown };
	};
};

const warnDeprecatedPresetAlias = (
	alias: string,
	{ replacement, stack }: IPresetAlias,
): void => {
	const stderr = (globalThis as TStderrHost).process?.stderr;
	const instead =
		stack === undefined
			? `'${replacement}'`
			: `'${replacement}' with the '${stack}' stack overlay`;
	stderr?.write?.(
		`[delendai/preset] preset '${alias}' is deprecated, use ${instead} instead. ` +
			`The alias will be removed in a future release.\n`,
	);
};

/**
 * The plugins of a stack overlay: its base purpose pack plus the plugins
 * the stack adds, deduplicated. Silent, unlike resolving a retired id.
 */
export const resolveStackPackMembers = (stack: IPackId): readonly string[] => {
	const { basePack, plugins } = STACK_PACKS[stack];
	return [
		...new Set([
			...resolvePresetMembersFrom(PRESET_CATALOG, basePack),
			...plugins,
		]),
	];
};

/**
 * Resolves the effective membership of a preset: the union of every
 * preceding preset in the ⊇ chain plus the preset's own delta.
 * Presets marked `independent: true` skip the chain accumulation
 * and resolve to ONLY their own members (used by `dogfood`).
 *
 * The returned array preserves the catalog order (smallest plugin
 * first, host-only last), is deduplicated, and is safe to feed
 * straight into `--plugins=A,B,C`.
 *
 * Retired preset ids are accepted via `PRESET_ALIASES`
 * and resolved to their canonical successor; a deprecation warning
 * is emitted on stderr for each alias hit.
 */
export const resolvePresetMembers = (
	id: IPresetKind | string | undefined,
): readonly string[] => {
	if (typeof id === 'string' && Object.hasOwn(PRESET_ALIASES, id)) {
		const alias = PRESET_ALIASES[id as IRetiredPresetId];
		warnDeprecatedPresetAlias(id, alias);
		return alias.stack === undefined
			? resolvePresetMembersFrom(PRESET_CATALOG, alias.replacement)
			: resolveStackPackMembers(alias.stack);
	}
	return resolvePresetMembersFrom(PRESET_CATALOG, id);
};

/**
 * b00239 rename / single-frontier contract (x00504 / reviewer):
 * `normalizePresetInput()` is the ONLY place that translates the
 * external aliases (retired ids) into the internal `IPresetKind`.
 * After this call all downstream code can rely on the kind being
 * one of the values of `PRESET_KIND`; schemas (`z.enum(PRESET_KIND)`),
 * type guards (`isPresetKind`), and dispatch tables can assume the
 * normalised form.
 *
 * The function emits the deprecation warning on the alias path
 * exactly once per call so operators see it in CI logs.
 */
export const normalizePresetInput = (
	value: string | undefined | null,
): IPresetKind | undefined => {
	if (value === undefined || value === null) return undefined;
	if (Object.hasOwn(PRESET_ALIASES, value)) {
		const alias = PRESET_ALIASES[value as IRetiredPresetId];
		warnDeprecatedPresetAlias(value, alias);
		return alias.replacement;
	}
	if ((PRESET_KIND as readonly string[]).includes(value)) {
		return value as IPresetKind;
	}
	return undefined;
};

/** A preset kind or `undefined` (no preset). Prefer
 *  `normalizePresetInput` for external input — this guard is for
 *  internal callers that already passed through the normaliser. */
export const isPresetKind = (value: string | undefined): value is IPresetKind =>
	typeof value === 'string' &&
	(PRESET_KIND as readonly string[]).includes(value);

/**
 * Whether a surface hides `contextual` and `administrative` tools from
 * `tools/list`: the workspace's explicit setting when it has one, the
 * preset's default otherwise. An explicit `false` is an opt-out and is
 * honoured, which is why the config value is not merely OR-ed in.
 */
export const resolveProgressiveDisclosure = (
	configured: boolean | undefined,
	presetId: string | undefined,
): boolean =>
	configured ??
	PRESET_CATALOG.find((preset) => preset.id === presetId)
		?.progressiveDisclosure === true;

/**
 * Canonical preset catalog for `@mcp-vertex/core`.
 *
 * Single source of truth for `--preset=NAME` resolution, the web
 * `/es/presets` table, the install docs, and any future consumer
 * that wants to know "which plugins does preset X ship?".
 *
 * Invariants (enforced by `preset-catalog.spec.ts` and
 * `tools/scripts/lint/no-preset-drift.script.ts`):
 *
 *   1. The catalog stores DELTAS, not full membership lists. Each
 *      preset's `members` array lists only the plugins *added* on
 *      top of the previous preset in the ⊇ chain. Resolved
 *      membership is the union of every preceding preset.
 *   2. The chain is strictly `full ⊇ swarm ⊇ standard ⊇ minimal`.
 *   3. Every `members[i].plugin` corresponds to a real package
 *      either under `plugins/<id>/package.json` or
 *      `packages/<id>/package.json`. Unknown ids fail the lint.
 *   4. Plugins marked `hostOnly: true` MAY appear in `full` and
 *      MUST NOT appear in `minimal`, `standard`, or `swarm`.
 *   5. The list of presets is closed: it is exactly the
 *      `PRESET_KIND` tuple.
 *
 * The catalog is plain data, no plugin-name vocabulary leaks into
 * the rest of the core: only the ids the user types in `--plugins=`
 * are referenced here.
 */

export const PRESET_KIND = ['minimal', 'standard', 'swarm', 'full'] as const;
export type IPresetKind = (typeof PRESET_KIND)[number];

export interface IPresetMember {
	/** Plugin id (e.g. "proposals", "issues"). */
	readonly plugin: string;
	/**
	 * When true, this plugin is host-only and only ships under `full`,
	 * never under `minimal`, `standard`, or `swarm`. The lint refuses
	 * any preset membership that violates this rule.
	 */
	readonly hostOnly?: boolean;
}

export interface IPresetDefinition {
	readonly id: IPresetKind;
	/** Human-facing title (i18n key: `preset.<id>.title`). */
	readonly title: string;
	/** Human-facing summary (i18n key: `preset.<id>.summary`). */
	readonly summary: string;
	/**
	 * DELTA members. The effective membership is the union of every
	 * preceding preset in `PRESET_KIND` plus this `members` array.
	 */
	readonly members: readonly IPresetMember[];
}

/**
 * Canonical preset catalog. Order is significant: presets are listed
 * from smallest to largest. `members` is a delta (additive); the
 * lint verifies the ⊇ chain (full ⊇ swarm ⊇ standard ⊇ minimal).
 */
export const PRESET_CATALOG: readonly IPresetDefinition[] = [
	{
		id: 'minimal',
		title: 'minimal',
		summary:
			'Read-only orientation: git + search. Lightweight default for CI smoke tests.',
		members: [{ plugin: 'git' }, { plugin: 'search' }],
	},
	{
		id: 'standard',
		title: 'standard',
		summary:
			'Single-agent toolkit: minimal + memory, docs, rules, quality, deps.',
		members: [
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'rules' },
			{ plugin: 'quality' },
			{ plugin: 'deps' },
		],
	},
	{
		id: 'swarm',
		title: 'swarm',
		summary:
			'Multi-agent coordination: standard + proposals, notification, logs, status-marker, test-convention, conventions. ' +
			'audit is opt-in per project and is NOT in swarm — run it separately after a round finishes.',
		members: [
			{ plugin: 'proposals' },
			{ plugin: 'notification' },
			{ plugin: 'logs' },
			{ plugin: 'status-marker' },
			{ plugin: 'test-convention' },
			{ plugin: 'conventions' },
		],
	},
	{
		id: 'full',
		title: 'full',
		summary:
			'Everything in swarm + the host-only plugins (web-fetch, issues). ' +
			'audit is opt-in (load with --plugins=audit) when you need it.',
		members: [
			{ plugin: 'web-fetch', hostOnly: true },
			{ plugin: 'issues', hostOnly: true },
		],
	},
];

/**
 * Resolves the effective membership of a preset: the union of every
 * preceding preset in the ⊇ chain plus the preset's own delta.
 *
 * The returned array preserves the catalog order (smallest plugin
 * first, host-only last), is deduplicated, and is safe to feed
 * straight into `--plugins=A,B,C`.
 */
export const resolvePresetMembers = (
	id: IPresetKind | string | undefined,
): readonly string[] => {
	if (id === undefined) return [];
	const index = PRESET_KIND.indexOf(id as IPresetKind);
	if (index < 0) return [];
	const seen = new Set<string>();
	const ordered: string[] = [];
	for (let i = 0; i <= index; i += 1) {
		const def = PRESET_CATALOG[i];
		if (def === undefined) continue;
		for (const member of def.members) {
			if (!seen.has(member.plugin)) {
				seen.add(member.plugin);
				ordered.push(member.plugin);
			}
		}
	}
	return ordered;
};

/** A preset kind or `undefined` (no preset). */
export const isPresetKind = (value: string | undefined): value is IPresetKind =>
	typeof value === 'string' &&
	(PRESET_KIND as readonly string[]).includes(value);

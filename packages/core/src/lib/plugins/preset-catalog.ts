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
	// r00011 S1 — stack packs. Independent: each pack resolves to
	// exactly its own plugin set + tuned defaults; they never
	// accumulate the chain and never perturb the resolved
	// membership of `minimal`/`lean`/`standard`/`swarm`/`full`/
	// `vertex`.
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
	/**
	 * DELTA members. The effective membership is the union of every
	 * preceding preset in `PRESET_KIND` plus this `members` array,
	 * unless `independent` is true (then only this preset's own
	 * members apply).
	 */
	readonly members: readonly IPresetMember[];
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
export const PRESET_CATALOG: readonly IPresetDefinition[] = [
	{
		id: 'minimal',
		title: 'minimal',
		summary:
			'Read-only orientation: git + search. Lightweight default for CI smoke tests.',
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
		summary:
			'The 4 essentials: git (version control), search (code discovery), memory (cross-session continuity), docs (documentation). ' +
			'Independent preset (does NOT accumulate the chain); nothing heavy.',
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
		summary:
			'Single-agent toolkit: minimal + memory, docs, i18n, rules, quality, deps, test-policy, database, container, diagram, env, skills-pack, prompts-pack.',
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
			{ plugin: 'completion' },
			{ plugin: 'logs' },
			{ plugin: 'status-marker' },
			{ plugin: 'test-convention' },
			{ plugin: 'conventions' },
			{ plugin: 'forge' },
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
			{ plugin: 'api' },
			{ plugin: 'changelog' },
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
		// below — the exact snapshot the project ships. Keep this list
		// in lockstep with the root `mcp-vertex.config.json`'s `plugins`
		// keys — `no-preset-drift.script.ts` re-derives from
		// `PRESET_CATALOG` rather than hand-copying it, but it cannot
		// catch THIS list drifting from the live config; that
		// comparison must be done by hand on each pass.
		id: 'vertex',
		title: 'vertex',
		summary:
			'Snapshot of the mcp-vertex project itself: every plugin its own mcp-vertex.config.json loads, including proposals (orchestration/swarm). ' +
			'Independent preset (does NOT accumulate swarm); use this for projects that want the exact set the core ships.',
		members: [
			{ plugin: 'audit' },
			{ plugin: 'auto-agent-selector', hostOnly: true },
			{ plugin: 'container' },
			{ plugin: 'conventions' },
			{ plugin: 'deps' },
			{ plugin: 'diagram' },
			{ plugin: 'docs' },
			{ plugin: 'env' },
			{ plugin: 'forge' },
			{ plugin: 'git' },
			{ plugin: 'i18n' },
			{ plugin: 'link-check' },
			{ plugin: 'logs' },
			{ plugin: 'memory' },
			{ plugin: 'notification' },
			{ plugin: 'orchestrator-runner' },
			{ plugin: 'perf' },
			{ plugin: 'prompts-pack' },
			{ plugin: 'proposals' },
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
	// r00011 S1 — stack packs. Each resolves to exactly its own
	// members; never accumulates the ⊇ chain. `resolvePackOptions`
	// (in `pack-defaults.ts`) overlays tuned per-plugin defaults on
	// top of `PLUGIN_DEFAULTS` and below the user's explicit config.
	{
		id: 'web-app',
		title: 'web-app',
		summary:
			'Stack pack for web apps (Astro/Next/Remix/SvelteKit/etc): standard + i18n + diagram + container (dockerfile lint) + web-fetch. Independent; user config still wins.',
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
		summary:
			'Stack pack for backend services (Nest/Express/Hono/Fastify/etc): standard + database + container + env + audit (opt-in) + deps + perf. Independent; user config still wins.',
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
		summary:
			'Stack pack for CLI tools (oclif/commander/cobra/clap): minimal + search + memory + docs + env + changelog + perf. Independent; user config still wins.',
		members: [
			{ plugin: 'git' },
			{ plugin: 'search' },
			{ plugin: 'memory' },
			{ plugin: 'docs' },
			{ plugin: 'env' },
			{ plugin: 'changelog' },
			{ plugin: 'perf' },
			{ plugin: 'test-policy' },
		],
		independent: true,
	},
];

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
	if (id === undefined) return [];
	const index = PRESET_KIND.indexOf(id as IPresetKind);
	if (index < 0) return [];
	const target = PRESET_CATALOG[index];
	if (target === undefined) return [];
	if (target.independent === true) {
		// Independent presets resolve to ONLY their own members;
		// skip the chain accumulation entirely.
		return target.members.map((m) => m.plugin);
	}
	const seen = new Set<string>();
	const ordered: string[] = [];
	for (let i = 0; i <= index; i += 1) {
		const def = PRESET_CATALOG[i];
		if (def === undefined) continue;
		// An independent preset in the chain breaks the accumulation:
		// subsequent chain presets still see the chain above them,
		// but their own delta is appended fresh. (In practice we
		// expect `vertex` to be the last preset and independent;
		// placing any independent preset in the middle of the chain
		// is intentionally allowed but rare.)
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

/** A preset kind or `undefined` (no preset). */
export const isPresetKind = (value: string | undefined): value is IPresetKind =>
	typeof value === 'string' &&
	(PRESET_KIND as readonly string[]).includes(value);

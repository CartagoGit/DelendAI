import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { registerStaticRules } from './lib/registry';
import { CACHE_OWNER } from './lib/static-rules';
import { buildGcRegistration } from './lib/tools/gc-tool';

/**
 * `@mcp-vertex/cache` — opt-in cache eviction plugin (f00072 S2/S5).
 *
 * Makes `.cache/mcp-vertex/` self-cleaning by declaring eviction as
 * DATA: a set of TTL / keep-last rules contributed to the shared core
 * {@link ICacheEvictionRegistry} (handed in via
 * `ctx.cacheEvictionRegistry`). The plugin owns only the policy; the
 * registry (in `@mcp-vertex/core`) owns the apply logic and the boot
 * sweep. No timers, no `setInterval` — the core runs the registry once
 * on boot (`config.cache.runOnBoot`) and this plugin exposes `cache_gc`
 * for on-demand sweeps.
 *
 * Tools:
 *
 * - `<prefix>_cache_gc { dryRun?, onlyOwner? }` — preview (default) or
 *   apply eviction. Returns the report (removed entries, bytes, errors).
 *
 * Built-in static rules (see `static-rules.ts`) cover the one-shot
 * snapshot directories (`drift/`, `bootstrap/`, `verify/`, the
 * `s3-driver/` + `s4-s5-driver/` lint snapshots, `rules/`), the bounded
 * `state/` journal, and the orphan git worktrees crashed agents leave
 * under `.worktrees/` (f00072 S5).
 *
 * Activation is opt-in: `mcp-vertex --plugins=cache`. No network, no
 * secrets, no `process.env`. Hosts that never load it keep the current
 * grow-forever behaviour.
 */
const OptionsSchema = z
	.object({
		/**
		 * Upper cap (days) applied to every built-in `olderThanDays`
		 * rule: a rule's effective age is `min(builtin, maxAgeDays)`.
		 * Lets a host SHORTEN (never silently lengthen) the lifetimes.
		 * Default 30.
		 */
		maxAgeDays: z.number().int().min(1).optional(),
		/**
		 * Orphan-worktree sweeper tuning (f00072 S5). `enabled` (default
		 * true) toggles the rule; `keepLastN` (default 3) keeps the
		 * most-recent N worktrees by mtime under `.worktrees/`.
		 */
		worktrees: z
			.object({
				enabled: z.boolean().optional(),
				keepLastN: z.number().int().min(0).optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export default definePlugin({
	name: 'cache',
	version: '0.1.0',
	describe:
		'Opt-in cache eviction: declarative TTL/keep-last rules for `.cache/mcp-vertex` + `cache_gc` (dry-run by default). No network, no secrets.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options);
		const options = parsed.success ? parsed.data : {};

		// Contribute the static rules to the shared registry so the core
		// boot sweep (and any other plugin's `cache_gc onlyOwner` call)
		// sees them. When the host did not supply a registry (legacy
		// fixtures), skip registration silently — the tool still loads
		// and reports a structured error if invoked.
		const registry = ctx.cacheEvictionRegistry;
		const registeredIds =
			registry !== undefined
				? registerStaticRules(registry, {
						...(options.maxAgeDays !== undefined
							? { maxAgeDays: options.maxAgeDays }
							: {}),
						...(options.worktrees !== undefined
							? { worktrees: options.worktrees }
							: {}),
					})
				: [];

		return {
			tools: [
				buildGcRegistration({
					namespacePrefix: ctx.namespacePrefix,
					registry,
				}),
			],
			knowledge: [
				{
					id: 'cache-eviction-overview',
					title: 'Cache eviction plugin — overview',
					body: [
						'# Cache eviction (`@mcp-vertex/cache`)',
						'',
						'Makes `.cache/mcp-vertex/` self-cleaning via declarative',
						'TTL / keep-last rules contributed to the shared core',
						'eviction registry. Run `cache_gc` to preview or apply:',
						'',
						'- `cache_gc { dryRun: true }` (default) — report what would',
						'  be removed, delete nothing.',
						'- `cache_gc { dryRun: false }` — actually delete and shrink',
						'  the cache. Idempotent: a second apply is a no-op.',
						'- `cache_gc { onlyOwner: "logs" }` — scope the run to one',
						'  contributing plugin.',
						'',
						`Owner tag: \`${CACHE_OWNER}\`. Built-in rules: ${registeredIds.join(', ') || '(none — no registry supplied)'}.`,
						'',
						'The boot sweep posture is governed by `config.cache.runOnBoot`',
						"('dry-run' default, 'apply', or 'off') in mcp-vertex.config.json.",
					].join('\n'),
				},
			],
		};
	},
});

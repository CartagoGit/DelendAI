/**
 * orchestrator-runner — the headless routing brain (f00067 S4).
 *
 * Healthchecks the installed model providers, scores them against a task's
 * capability hints with a PURE deterministic scorer, and advises which
 * provider to route to. It NEVER spawns a model subprocess or spends money
 * in S4 — it advises; S6 executes. Depends on `usage-tracking` so every
 * routing decision it advises (and, from S6, executes) is recorded for
 * spend auditing (CRITICAL I15): that is declared as a hard `dependsOn`
 * (the loader refuses the whole batch when it is missing) and re-checked
 * defensively from `register()` against the peer registry.
 *
 * Load with `mcp-vertex --plugins=usage-tracking,orchestrator-runner`.
 */
import { definePlugin, joinRel, runCommand } from '@mcp-vertex/core/public';
import type { IProviderCapabilities } from '@mcp-vertex/core/public';

import { assertUsageTrackingLoaded, USAGE_TRACKING_PLUGIN } from './lib/guard';
import { HealthStore } from './lib/healthcheck/store';
import { resolveLoopDetectionSeam } from './lib/loop-detection-seam';
import { DEFAULT_OPTIONS, OptionsSchema } from './lib/options';
import { SessionStore } from './lib/router/session';
import { buildOrchestratorRunnerToolRegistrations } from './lib/tools';

export default definePlugin({
	name: 'orchestrator-runner',
	version: '0.1.0',
	describe:
		'Healthchecks installed model providers, scores them against a task, and advises which provider to route to. Headless (no spend). Requires the usage-tracking plugin.',
	// CRITICAL I15 (layer 1, authoritative): the loader refuses the whole
	// batch when usage-tracking is not also loaded — no partial registration.
	dependsOn: [USAGE_TRACKING_PLUGIN],
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options);
		const options = parsed.success ? parsed.data : {};

		// CRITICAL I15 (layer 2, defensive): the peer registry is empty at
		// register time by design (loads finish after register), so we only
		// hard-check when a host pre-seeded it; the empty case defers to the
		// authoritative `dependsOn` guard above. This never false-trips a
		// normal boot yet still gives a tested, clear throw.
		const peers = ctx.peerPlugins?.list() ?? [];
		if (peers.length > 0) assertUsageTrackingLoaded(peers);

		// The provider roster. Canonical home is the root-level
		// `providers` config block (S5 writes it); until core surfaces that
		// on the context, S4 reads a fully-typed roster from this plugin's
		// own options as a pragmatic source (documented in the README).
		const providers = (options.providers ??
			[]) as readonly IProviderCapabilities[];
		const ttlSeconds =
			options.sessionStickinessTtlSeconds ??
			DEFAULT_OPTIONS.sessionStickinessTtlSeconds;
		const defaultCostPreference =
			options.defaultCostPreference ??
			DEFAULT_OPTIONS.defaultCostPreference;

		const healthcheckPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'healthcheck.json'),
		);
		const quotasPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'quotas.json'),
		);

		// In-memory availability mirror (CRITICAL rule 3: never a per-decision
		// fs read). Hydrated best-effort from the last on-disk snapshot; a
		// missing/corrupt file leaves it empty (optimistic `available`).
		const health = new HealthStore();
		void health.loadFrom(healthcheckPath).catch(() => undefined);

		// Session stickiness (CRITICAL I12): TTL-bounded, pruned by an
		// unref'd sweep so it never keeps the process alive.
		const sessions = new SessionStore({ ttlSeconds });
		sessions.startPruneTimer();

		// Loop detection reuses the ONE detector (AGENTS.md rule 1) via an
		// injected seam — never a second detector, never a cross-plugin import.
		const loopDetector = resolveLoopDetectionSeam(ctx.options);

		return {
			tools: buildOrchestratorRunnerToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				providers,
				health,
				sessions,
				defaultCostPreference,
				healthcheckPath,
				quotasPath,
				workspaceRoot: ctx.workspace.root,
				runner: runCommand,
				loopDetector,
			}),
			knowledge: [
				{
					id: 'orchestrator-runner-routing',
					title: 'Provider routing',
					body: [
						'# Provider routing (orchestrator-runner)',
						'',
						`Tools: \`${ctx.namespacePrefix}_healthcheck_providers\`, ` +
							`\`${ctx.namespacePrefix}_advise_routing\`, ` +
							`\`${ctx.namespacePrefix}_get_quota\`.`,
						'',
						'- `advise_routing {taskDescription, sliceCapabilityHints?, mode?,',
						'  costPreference?, sessionId?}` scores the confirmed roster with a',
						'  pure, transparent scorer and returns the winning decision',
						'  (strategy passthrough|api|cli|mcp-tool|handoff), the top-2 backups',
						'  and the full scoring trace. Headless: it never spends.',
						'- `healthcheck_providers` probes each provider CLI on PATH and',
						'  mirrors availability in memory for the router.',
						'- `get_quota` reads the quota snapshot (populated by the bootstrap',
						'  layer in a later slice).',
						'- Requires the `usage-tracking` plugin so every advised route is',
						'  recorded for spend auditing.',
					].join('\n'),
				},
			],
		};
	},
});

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
 * Load with `delendai --plugins=usage-tracking,orchestrator-runner`.
 */
import { joinRel, runCommand } from '@delendai/core/public';
import { definePlugin } from '@delendai/core/plugin';

import { assertUsageTrackingLoaded, USAGE_TRACKING_PLUGIN } from './lib/guard';
import { HealthStore } from './lib/healthcheck/store';
import { buildDefaultInvocationManager } from './lib/invoke/build-manager';
import { SpendLimitsStore } from './lib/invoke/limits-store';
import { spendCapsFrom } from './lib/invoke/spend-caps.helper';
import { spendCheckerFor } from './lib/invoke/spend-guard';
import { resolveLoopDetectionSeam } from './lib/loop-detection-seam';
import { DEFAULT_OPTIONS, OptionsSchema, rosterFor } from './lib/options';
import type { ILifecycleEnvironment } from './lib/contracts/interfaces/execution-env-lifecycle.interface';
import { loadExecutionEnvironment } from './lib/services/environment-loader.service';
import { SessionStore } from './lib/router/session';
import { buildOrchestratorRunnerToolRegistrations } from './lib/tools';
import {
	interruptOrphans,
	invocationJournalAt,
} from './lib/services/invocation-journal.service';
import type { IConsentAsk } from './lib/contracts/interfaces/discovery-consent.interface';
import { ConfirmationSigner } from './lib/invoke/token';
import { askThroughElicitation } from './lib/services/discovery-consent.service';
import {
	quotaHoldFor,
	quotaSinkFor,
} from './lib/services/quota-reservation.service';
import { elicitedConfirmationGate } from './lib/services/spend-confirmation.service';

/** How long a quota observation is trusted before a hold refuses it. */
const QUOTA_OBSERVATION_FRESH_FOR_MS = 15 * 60_000;

export default definePlugin({
	name: 'orchestrator-runner',
	version: '0.1.1',
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

		const build = (environment: ILifecycleEnvironment | undefined) => {
			// The provider roster: this plugin's own option when it declares
			// one (an empty one included), else the root `providers` block,
			// which the core validates and passes on the context.
			const providers = rosterFor(options.providers, ctx.providers);
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
			const rosterDraftPath = ctx.workspace.resolve(
				joinRel(ctx.pluginCacheDir, 'roster.draft.json'),
			);
			// The confirmed config the bootstrap wizard emits a JSON Patch against.
			// The wizard READS it to diff (never WRITES it): confirmed intent is
			// the user's to own (CRITICAL I13 — patch is returned, applied on
			// confirm via elicitation / a CLI prompt).
			const configPath = ctx.workspace.resolve('delendai.config.json');
			// The user's yes to discovery, asked once (host state, not config).
			const consentPath = ctx.workspace.resolve(
				joinRel(ctx.pluginCacheDir, 'discovery-consent.json'),
			);
			// The usage-tracking sibling writes `limitsStatus` + the spend rollup
			// into its own cache dir; the runner reads that file (no cross-plugin
			// import) for the S7 spend guard and `advise_spend`.
			const usageSummaryPath = ctx.workspace.resolve(
				joinRel(
					joinRel(ctx.cacheDir, USAGE_TRACKING_PLUGIN),
					'usage-summary.json',
				),
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

			// S7 circuit-breaker seam. The runner never computes spend — it mirrors
			// the breaker's `limitsStatus` (written by usage-tracking) in memory and
			// consults it before every spend (no per-decision fs read, AGENTS.md
			// rule 3). The degrade-vs-hard-error decision is the pure
			// `decideSpendGuard`; the manager fires the hard error BEFORE any
			// subprocess/HTTP call.
			// The caps come from configuration, the authority; the summary only
			// says what has been spent against them. With a cap configured and
			// the spend unreadable, the guard refuses rather than guessing.
			const spendCaps = spendCapsFrom(
				ctx.pluginOptions?.get(USAGE_TRACKING_PLUGIN),
			);
			const spendLimits = new SpendLimitsStore();
			// `loadFrom` never rejects: an unreadable summary becomes an
			// `unknown` view with its reason, which the guard then acts on.
			void spendLimits.loadFrom(usageSummaryPath);
			spendLimits.startRefreshTimer(usageSummaryPath, 60_000);
			const checkSpend = spendCheckerFor({
				limits: () => spendLimits.snapshot(),
				caps: spendCaps,
				providers,
				availabilityOf: health.get.bind(health),
			});

			// What each hop did, so a restart can tell a finished hop from
			// one whose process died: those end as `interrupted`.
			const journalPath = ctx.workspace.resolve(
				joinRel(ctx.pluginCacheDir, 'invocations.jsonl'),
			);
			void interruptOrphans(journalPath);
			const ledgerPath = ctx.workspace.resolve(
				joinRel(ctx.pluginCacheDir, 'quota-reservations.json'),
			);

			// A spend that needs confirmation asks the user through the host's
			// elicitation; the server is known once the invoke tool registers.
			const signer = new ConfirmationSigner();
			let askUser: IConsentAsk | undefined;
			const confirmationGate = elicitedConfirmationGate(
				() => askUser,
				signer,
			);

			const manager = buildDefaultInvocationManager({
				confirmationGate,
				signer,
				...(environment !== undefined ? { environment } : {}),
				...(ctx.accounts !== undefined
					? { accounts: ctx.accounts }
					: {}),
				journal: invocationJournalAt(journalPath),
				// A hop on an account holds room in its quota pools while it
				// runs; the ledger is shared by every process on the machine.
				holdQuota: quotaHoldFor({
					accounts: ctx.accounts ?? [],
					ledgerPath,
					quotasPath,
					ttlMs:
						2 *
						(options.invokeTimeoutMs ??
							DEFAULT_OPTIONS.invokeTimeoutMs),
					freshForMs: QUOTA_OBSERVATION_FRESH_FOR_MS,
				}),
				// What each API response says about the quota left is written
				// for the groups of the account the provider runs on.
				quotaSink: quotaSinkFor({
					providers,
					accounts: ctx.accounts ?? [],
					quotasPath,
				}),
				checkSpend,
				providers,
				health,
				defaultCostPreference,
				invokeTimeoutMs:
					options.invokeTimeoutMs ?? DEFAULT_OPTIONS.invokeTimeoutMs,
				subprocessPoolSize:
					options.subprocessPoolSize ??
					DEFAULT_OPTIONS.subprocessPoolSize,
				concurrencyLimit:
					options.concurrencyLimit ??
					DEFAULT_OPTIONS.concurrencyLimit,
				maxFallbackDepth:
					options.maxFallbackDepth ??
					DEFAULT_OPTIONS.maxFallbackDepth,
				fallbackStrategy:
					options.fallbackStrategy ??
					DEFAULT_OPTIONS.fallbackStrategy,
				executeApi: options.executeApi ?? DEFAULT_OPTIONS.executeApi,
				confirmBeforeExecute:
					options.confirmBeforeExecute ??
					DEFAULT_OPTIONS.confirmBeforeExecute,
				autoBypassConfirmed:
					options.autoBypassConfirmed ??
					DEFAULT_OPTIONS.autoBypassConfirmed,
			});

			// Loop detection reuses the ONE detector (AGENTS.md rule 1) via an
			// injected seam — never a second detector, never a cross-plugin import.
			const loopDetector = resolveLoopDetectionSeam(ctx.options);

			return {
				tools: buildOrchestratorRunnerToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					providers,
					health,
					sessions,
					manager,
					defaultCostPreference,
					healthcheckPath,
					quotasPath,
					rosterDraftPath,
					configPath,
					accounts: ctx.accounts ?? [],
					ledgerPath,
					journalPath,
					onServer: (server) => {
						askUser = askThroughElicitation(server);
					},
					discovery: options.discovery ?? 'auto-with-consent',
					consentPath,
					usageSummaryPath,
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
								`\`${ctx.namespacePrefix}_get_quota\`, ` +
								`\`${ctx.namespacePrefix}_discover_providers\`, ` +
								`\`${ctx.namespacePrefix}_bootstrap_providers\`.`,
							'',
							'- `advise_routing {taskDescription, sliceCapabilityHints?, mode?,',
							'  costPreference?, sessionId?}` scores the confirmed roster with a',
							'  pure, transparent scorer and returns the winning decision',
							'  (strategy passthrough|api|cli|mcp-tool|handoff), the top-2 backups',
							'  and the full scoring trace. Headless: it never spends.',
							'- `healthcheck_providers` probes each provider CLI on PATH and',
							'  mirrors availability in memory for the router.',
							'- `discover_providers` runs a parallel PATH probe for the known',
							'  provider CLIs and reports installed vs missing (with install hints).',
							'- `bootstrap_providers` runs the wizard: probe + best-effort auth',
							'  RPC, writes a draft roster to the cache, and returns a prose brief',
							'  plus an RFC 6902 JSON Patch for the user to confirm into',
							'  `delendai.config.json#providers`. It never writes the confirmed',
							'  config itself.',
							'- `get_quota` reads the quota snapshot (the 3-source quota merge in',
							'  `quota.ts` writes it; S6 feeds it live header/RPC samples).',
							'- Requires the `usage-tracking` plugin so every advised route is',
							'  recorded for spend auditing.',
						].join('\n'),
					},
				],
			};
		};

		// Without an environment registration stays synchronous; with one the
		// package is imported first, and a missing package or unknown id
		// rejects registration.
		return options.executionEnvironment === undefined
			? build(undefined)
			: loadExecutionEnvironment(options.executionEnvironment).then(
					build,
				);
	},
});

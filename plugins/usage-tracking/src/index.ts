import { randomUUID } from 'node:crypto';

import {
	definePlugin,
	joinRel,
	type IToolRegistration,
} from '@mcp-vertex/core/public';
import { estimateResponseBytes } from '@mcp-vertex/core/lib/metrics/metrics-registry';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import { deriveCorePrefix } from './lib/attribute';
import { cleanupStaleTmpFiles } from './lib/cleanup-stale-tmp';
import { detectAgent } from './lib/detect-agent';
import { RecordBuffer } from './lib/record-buffer';
import {
	installSessionSurfaceBytesObserver,
	SessionSurfaceBytesService,
} from './lib/session-surface-bytes.service';
import {
	DEFAULT_SESSION_HYGIENE_POLICY,
	SessionHygieneMonitor,
} from './lib/session-hygiene';
import { SessionTooLongAdvisorySource } from './lib/services/checkpoint-advisory.service';
import {
	buildInvocationRecord,
	resolveInvocationSessionId,
} from './lib/services/invocation-recorder.service';
import { regenerateUsageSummary } from './lib/services/usage-rollup.service';
import { StartClock } from './lib/start-clock';
import {
	computeCostUsd,
	resolvePricing,
	type IPricingTable,
} from './lib/pricing';
import { buildUsageTrackingToolRegistrations } from './lib/tools';
import type { IModelDescriptor, IUsageTokens } from './lib/types';

const ClientMappingSchema = z.object({
	kind: z.string(),
	extension: z.string(),
});

const OptionsSchema = z
	.object({
		/**
		 * User extension map: `clientInfo.name` → `{kind, extension}`.
		 * Extends/overrides the built-in client table so an unknown client
		 * can be named without a code change (CRITICAL N6).
		 */
		clientMap: z.record(z.string(), ClientMappingSchema).optional(),
		/**
		 * Explicit token baselines keyed by `plugin/tool`, then `plugin/*`.
		 * Baselines are metadata-only and are compared with provider usage.
		 */
		tokenBaselines: z
			.record(z.string(), z.number().nonnegative())
			.optional(),
		/**
		 * Max buffered records before a forced flush. Default 64 (CRITICAL
		 * C2). Lower to fsync sooner; higher to coalesce more aggressively.
		 */
		maxBatch: z.number().int().min(1).max(10_000).optional(),
		/**
		 * Max ms a record waits before the buffer flushes. Default 250
		 * (CRITICAL C2).
		 */
		maxDelayMs: z.number().int().min(10).max(60_000).optional(),
		/** Rollup window (days) for the periodic summary. Default 7. */
		windowDays: z.number().positive().optional(),
		/**
		 * How often (ms) the summary is regenerated from the log. Default
		 * 300_000 (5 min).
		 */
		summaryIntervalMs: z.number().int().min(1000).optional(),
		/**
		 * S7 circuit breaker — session spend cap (USD). `undefined` (default)
		 * = unlimited. When set (with `maxMonthlySpendUsd`), the breaker
		 * computes rolling spend and writes `usage-summary.json#limitsStatus`;
		 * the orchestrator refuses to spend past the cap.
		 */
		maxSessionSpendUsd: z.number().min(0).optional(),
		/**
		 * S7 circuit breaker — calendar-month spend cap (USD). `undefined`
		 * (default) = unlimited. Evaluated on its own window, never averaged
		 * with the session window.
		 */
		maxMonthlySpendUsd: z.number().min(0).optional(),
		/**
		 * Local MCP-session guardrails. They observe only tool activity and
		 * output volume; host context/quota remains intentionally unknown.
		 */
		sessionHygiene: z
			.object({
				enabled: z.boolean().optional(),
				maxSessionAgeMinutes: z.number().positive().optional(),
				maxIdleGapMinutes: z.number().positive().optional(),
				maxMcpOutputTokens: z.number().positive().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

const DEFAULT_OPTIONS = {
	maxBatch: 64,
	maxDelayMs: 250,
	windowDays: 7,
	summaryIntervalMs: 5 * 60 * 1000,
} as const;

const EMPTY_PRICING: IPricingTable = {
	updatedAt: new Date(0).toISOString(),
	source: 'none',
	models: {},
};

/**
 * usage-tracking — the observability "eyes". Records every tool
 * invocation (agent, plugin, model, extension) to an append-only NDJSON
 * log under the cache dir and surfaces aggregate usage/cost reports.
 * Metadata only: no message content, no credentials (redacted before
 * write). Load with `mcp-vertex --plugins=usage-tracking`.
 */
export default definePlugin({
	name: 'usage-tracking',
	version: '0.1.1',
	describe:
		'Records every tool call (agent/plugin/model/extension) to an append-only log and reports aggregate usage + cost.',
	// Accrued spend/usage history, not derivable cache — deleting it
	// loses real cost data. See IMcpPlugin#cacheNamespace.
	cacheNamespace: 'results',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options);
		const options = parsed.success ? parsed.data : {};
		const maxBatch = options.maxBatch ?? DEFAULT_OPTIONS.maxBatch;
		const maxDelayMs = options.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs;
		const windowDays = options.windowDays ?? DEFAULT_OPTIONS.windowDays;
		const summaryIntervalMs =
			options.summaryIntervalMs ?? DEFAULT_OPTIONS.summaryIntervalMs;
		const clientMap = options.clientMap;
		const tokenBaselines = options.tokenBaselines ?? {};
		const baselineTokensOf = (
			plugin: string,
			tool: string,
		): number | undefined =>
			tokenBaselines[`${plugin}/${tool}`] ??
			tokenBaselines[`${plugin}/*`];
		const hygieneOptions = options.sessionHygiene;
		const sessionHygieneEnabled = hygieneOptions?.enabled ?? true;
		const sessionHygiene = new SessionHygieneMonitor({
			maxSessionAgeMs:
				(hygieneOptions?.maxSessionAgeMinutes ??
					DEFAULT_SESSION_HYGIENE_POLICY.maxSessionAgeMs / 60_000) *
				60_000,
			maxIdleGapMs:
				(hygieneOptions?.maxIdleGapMinutes ??
					DEFAULT_SESSION_HYGIENE_POLICY.maxIdleGapMs / 60_000) *
				60_000,
			maxMcpOutputTokens:
				hygieneOptions?.maxMcpOutputTokens ??
				DEFAULT_SESSION_HYGIENE_POLICY.maxMcpOutputTokens,
		});
		const sessionTooLong = new SessionTooLongAdvisorySource();
		let notificationServer: McpServer | undefined;

		// S7 circuit-breaker config. The session anchor is boot time; the
		// breaker is inert until at least one cap is set (limitsStatus then
		// carries null limits and never breaches).
		const sessionStartMs = Date.now();
		const limits = {
			sessionStartMs,
			...(options.maxSessionSpendUsd !== undefined
				? { maxSessionSpendUsd: options.maxSessionSpendUsd }
				: {}),
			...(options.maxMonthlySpendUsd !== undefined
				? { maxMonthlySpendUsd: options.maxMonthlySpendUsd }
				: {}),
		};

		const invocationsPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'invocations.jsonl'),
		);
		const summaryPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'usage-summary.json'),
		);
		const hostLifecyclePath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'host-lifecycle.claude-code.jsonl'),
		);
		const sessionSurfaceBytesPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'session-surface-bytes.jsonl'),
		);
		const pricingPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'pricing.json'),
		);

		// a00072 S7.b: boot-time hygiene. A 0-byte `.tmp` file older
		// than 60s is a crashed mid-write from `writeSummary`'s
		// atomic-rename pattern. Sweep them so the next rollup
		// tick does not trip over a stale sibling. The call is
		// best-effort and never throws — boot hygiene must never
		// fail the plugin.
		const pluginCacheDirAbs = ctx.workspace.resolve(ctx.pluginCacheDir);
		void cleanupStaleTmpFiles({ cacheDirAbs: pluginCacheDirAbs })
			.then((result) => {
				if (result.removed > 0) {
					// Debug-only — the lint is the source of truth.
					console.debug(
						`[usage-tracking] boot sweep: removed ${result.removed} stale tmp file(s)`,
					);
				}
			})
			.catch(() => undefined);

		const buffer = new RecordBuffer(invocationsPath, {
			maxBatch,
			maxDelayMs,
			// x00156 S3: surface append failures on the structured
			// incident stream, not just stderr.
			logs: ctx.logs,
		});
		const sessionSurfaceBytes = new SessionSurfaceBytesService(
			sessionSurfaceBytesPath,
			{
				maxBatch,
				maxDelayMs,
				logs: ctx.logs,
			},
		);
		const clock = new StartClock();
		const corePrefix = deriveCorePrefix(ctx.namespacePrefix);
		// Boot-scoped identity: the host declared its client once at
		// assembly; every row inherits it unless a call carries its own
		// sessionId. Never sniffs process.env for vendor variables.
		const agent = detectAgent(ctx.hostIdentity?.host, clientMap);
		const bootSessionId = `s_${randomUUID()}`;
		const lastModelBySession = new Map<string, IModelDescriptor>();
		const rememberModel = (
			sessionId: string,
			model: IModelDescriptor,
		): void => {
			lastModelBySession.delete(sessionId);
			lastModelBySession.set(sessionId, model);
			if (lastModelBySession.size > 1024) {
				const oldest = lastModelBySession.keys().next().value;
				if (oldest !== undefined) lastModelBySession.delete(oldest);
			}
		};

		// Pricing is resolved off the hot path: start with an empty table
		// (cost = null) and swap in the stale-while-revalidate result when
		// it lands. A pricing miss never blocks or fails a tool call (I6).
		let pricingTable: IPricingTable = EMPTY_PRICING;
		void resolvePricing(pricingPath)
			.then((table) => {
				pricingTable = table;
			})
			.catch(() => undefined);

		const costOf = (
			model: IModelDescriptor | null,
			usage: IUsageTokens | null,
		): number | null => {
			// Subscription providers have no meaningful per-call price (N4).
			if (model?.kind === 'subscription') return null;
			return computeCostUsd(pricingTable, model?.modelId, usage);
		};

		// Prime the summary once at boot so `limitsStatus` (S7) is available
		// to the orchestrator's spend guard well before the first 5-min tick.
		void regenerateUsageSummary(
			invocationsPath,
			summaryPath,
			windowDays,
			Date.now(),
			limits,
		).catch(() => undefined);

		// Periodic 5-min rollup regeneration from the log (unref'd so it
		// never keeps the process alive).
		//
		// x00157 S7: this `register` callback returns no `deactivate` hook,
		// so `summaryTimer` is never explicitly cancelled — it is a true
		// orphan by the strict definition. In production this is benign:
		// an MCP host calls a plugin's `register` exactly once per process
		// lifetime, so there is only ever one timer, and `unref()` already
		// guarantees it can't block process exit. The risk is confined to
		// a **re-registration within the same process** (a host restart in
		// dev, or a test suite that instantiates the plugin twice without
		// tearing down the first instance) — that would accumulate a second
		// live timer alongside the first. Tests that need to simulate this
		// have a seam: `drainLiveBuffers` clears the in-memory buffer state,
		// and a test that also wants to stop the interval itself can hold
		// the returned handle and call `clearInterval` directly; no new API
		// was added here since no test in this repo currently re-registers
		// the plugin without a fresh process.
		const summaryTimer = setInterval(() => {
			void regenerateUsageSummary(
				invocationsPath,
				summaryPath,
				windowDays,
				Date.now(),
				limits,
			).catch(() => undefined);
		}, summaryIntervalMs);
		summaryTimer.unref?.();

		// x00097 S3 (audit a00052: "registros reaparecen"): `usage_clear`
		// truncates the log file, but records still sitting in the flush
		// buffer were re-appended by the next drain — the wipe silently
		// undid itself. The manifest owns the composition (the clear tool
		// stays buffer-agnostic): a confirmed clear first drops the pending
		// records and waits out any in-flight drain, THEN truncates.
		const withBufferWipeBarrier = (
			reg: IToolRegistration,
		): IToolRegistration => ({
			...reg,
			register: (server) => {
				const intercepted = {
					// The clear tool only touches `registerTool`; anything
					// else it grows to use must be added here explicitly.
					registerTool: (
						name: string,
						config: unknown,
						handler: (args: unknown) => Promise<unknown>,
					) =>
						server.registerTool(
							name,
							config as never,
							(async (args: unknown) => {
								if (
									(args as { confirm?: boolean }).confirm ===
									true
								) {
									await buffer.clear();
								}
								return handler(args);
							}) as never,
						),
				} as unknown as typeof server;
				return reg.register(intercepted);
			},
		});

		const tools = buildUsageTrackingToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			invocationsPath,
			summaryPath,
			hostLifecyclePath,
			sessionHygiene,
			onServer: (server) => {
				notificationServer = server;
			},
		}).map((reg) =>
			reg.id === 'usage_clear' ? withBufferWipeBarrier(reg) : reg,
		);
		const firstTool = tools[0];
		const instrumentedTools =
			firstTool === undefined
				? tools
				: tools.map((reg) =>
						reg.id !== firstTool.id
							? reg
							: {
									...reg,
									register: async (server: McpServer) => {
										installSessionSurfaceBytesObserver({
											server,
											service: sessionSurfaceBytes,
											defaultSessionId: bootSessionId,
										});
										await reg.register(server);
									},
								},
					);

		return {
			tools: instrumentedTools,
			// Hot-path hooks. `onToolStart` stamps a start time; `onToolCall`
			// builds the metadata record and enqueues it (non-blocking).
			onToolStart: (toolName) => {
				clock.begin(toolName, Date.now());
			},
			onToolCall: (toolName, args, result, error) => {
				const endedAt = Date.now();
				const startedAt = clock.take(toolName);
				const peerPrefixes = ctx.peerPlugins?.list() ?? [];
				const sessionId = resolveInvocationSessionId(
					args,
					bootSessionId,
				);
				const record = buildInvocationRecord({
					toolName,
					corePrefix,
					peerPrefixes,
					agent,
					host: ctx.hostIdentity?.host,
					sessionId,
					args,
					result,
					error,
					startedAt,
					endedAt,
					responseBytes: estimateResponseBytes(result ?? {}),
					fallbackModel: lastModelBySession.get(sessionId),
					baselineTokensOf,
					costOf,
				});
				if (record.model !== null && record.usage !== null) {
					rememberModel(sessionId, record.model);
				}
				if (sessionHygieneEnabled) {
					const advisory = sessionHygiene.observe({
						sessionId,
						at: endedAt,
						responseBytes: record.responseBytes ?? 0,
					});
					sessionTooLong.noteHygiene(advisory);
					if (advisory && notificationServer) {
						void notificationServer
							.sendLoggingMessage({
								level: 'warning',
								logger: `${ctx.namespacePrefix}_session_hygiene`,
								data: {
									event: 'session-hygiene',
									...advisory,
								},
							})
							.catch(() => undefined);
					}
				}
				buffer.push(record);
			},
			getCheckpointAdvisory: () =>
				sessionHygieneEnabled ? sessionTooLong.current() : null,
			knowledge: [
				{
					id: 'usage-tracking-usage',
					title: 'Usage tracking',
					body: [
						'# Usage tracking',
						'',
						`Tools: \`${ctx.namespacePrefix}_usage_report\` / \`${ctx.namespacePrefix}_usage_clear\`.`,
						'',
						'- Every tool call across every loaded plugin is recorded to',
						`  \`${joinRel(ctx.pluginCacheDir, 'invocations.jsonl')}\` (append-only,`,
						'  metadata only — no message content, secrets redacted).',
						'- `usage_report {groupBy, windowDays, filter, sortBy, limit}`',
						'  groups spend and attributable savings by provider / plugin /',
						'  agent / extension / model and tracks request type / outcome /',
						'  iteration / latency telemetry in the persisted summary.',
						'- Saving tools stamp `tokensSaved` on the same append-only row;',
						'  model attribution reuses only the last model observed in that',
						'  session, while older/unattributed rows safely count as zero.',
						'- `tokenBaselines` compares configured per-tool/plugin baselines',
						'  with provider-reported usage locally; no extra LLM request is made.',
						'  Missing usage or baseline is marked unavailable, never guessed.',
						'- `usage_clear {confirm:true}` wipes the log + summary.',
						'- The 5-min rollup lives in',
						`  \`${joinRel(ctx.pluginCacheDir, 'usage-summary.json')}\`.`,
						'- Subscription models report no per-call price (a fixed',
						'  subscription cost is not a marginal per-call cost).',
					].join('\n'),
				},
			],
		};
	},
});

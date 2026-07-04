import { randomUUID } from 'node:crypto';

import { definePlugin, joinRel } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { deriveCorePrefix } from './lib/attribute';
import { detectAgent } from './lib/detect-agent';
import { buildRecord, resolveSessionId } from './lib/record';
import { RecordBuffer } from './lib/record-buffer';
import { regenerateSummary } from './lib/rollup';
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
	version: '0.1.0',
	describe:
		'Records every tool call (agent/plugin/model/extension) to an append-only log and reports aggregate usage + cost.',
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

		const invocationsPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'invocations.jsonl'),
		);
		const summaryPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'usage-summary.json'),
		);
		const pricingPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'pricing.json'),
		);

		const buffer = new RecordBuffer(invocationsPath, {
			maxBatch,
			maxDelayMs,
		});
		const clock = new StartClock();
		const corePrefix = deriveCorePrefix(ctx.namespacePrefix);
		// Boot-scoped identity: the host declared its client once at
		// assembly; every row inherits it unless a call carries its own
		// sessionId. Never sniffs process.env for vendor variables.
		const agent = detectAgent(ctx.hostIdentity?.host, clientMap);
		const bootSessionId = `s_${randomUUID()}`;

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

		// Periodic 5-min rollup regeneration from the log (unref'd so it
		// never keeps the process alive).
		const summaryTimer = setInterval(() => {
			void regenerateSummary(
				invocationsPath,
				summaryPath,
				windowDays,
			).catch(() => undefined);
		}, summaryIntervalMs);
		summaryTimer.unref?.();

		return {
			tools: buildUsageTrackingToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				invocationsPath,
				summaryPath,
			}),
			// Hot-path hooks. `onToolStart` stamps a start time; `onToolCall`
			// builds the metadata record and enqueues it (non-blocking).
			onToolStart: (toolName) => {
				clock.begin(toolName, Date.now());
			},
			onToolCall: (toolName, args, result, error) => {
				const endedAt = Date.now();
				const startedAt = clock.take(toolName);
				const peerPrefixes = ctx.peerPlugins?.list() ?? [];
				const record = buildRecord({
					toolName,
					corePrefix,
					peerPrefixes,
					agent,
					sessionId: resolveSessionId(args, bootSessionId),
					args,
					result,
					error,
					startedAt,
					endedAt,
					costOf,
				});
				buffer.push(record);
			},
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
						'  groups spend by provider / plugin / agent / extension and',
						'  lists the top-10 most expensive calls.',
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

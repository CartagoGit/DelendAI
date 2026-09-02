import {
	definePlugin,
	redactSecrets,
	type IPluginLogsHelper,
	type IToolIdentityRegistry,
} from '@mcp-vertex/core/public';

import { OptionsSchema } from './lib/contracts/constants/options.constant';
import type { ISafeMcpVertexReport } from './lib/contracts/interfaces/reporter.interface';
import type { IErrorReportingOptions } from './lib/contracts/interfaces/options.interface';
import {
	ERR_REPORTING_OPTION_DEPRECATED,
	resolveOptions,
} from './lib/options.service';
import type { IReportSchedulerClock } from './lib/contracts/interfaces/report-scheduler.interface';
import type { IReportStore } from './lib/contracts/interfaces/report-store.interface';
import type { IFunnelCounterStore } from './lib/contracts/interfaces/funnel-counters.interface';
import { registerInternalRuntimePaths } from './lib/frame-extractor.helper';
import { createFunnelCounterStore } from './lib/funnel-counter-store.service';
import { buildErrorReportingKnowledge } from './lib/knowledge/error-reporting';
import {
	validateSafeReport,
	validateSerializedSafeReport,
} from './lib/privacy-validator.helper';
import {
	asReportableError,
	buildSafeReport,
	extractObservedFailure,
} from './lib/report-builder.helper';
import {
	createReportScheduler,
	REPORT_DISPATCH_CLAIM_MS,
} from './lib/report-scheduler.helper';
import { createReportStore } from './lib/report-store.service';
import {
	announceErrorReportingStartup,
	buildErrorReportingStartupNotice,
} from './lib/startup-notice.helper';
import { createSafeReporter } from './lib/reporter.service';
import { buildReportStatusRegistration } from './lib/tools/report-status.tool';

const redactReport = (report: ISafeMcpVertexReport): ISafeMcpVertexReport =>
	JSON.parse(
		redactSecrets(JSON.stringify(report)).text,
	) as ISafeMcpVertexReport;

const logPrivacyBlock = (reasonCode: string): void => {
	console.warn(`report blocked by privacy validator: ${reasonCode}`);
};

const systemClock: IReportSchedulerClock = {
	nowMs: () => Date.now(),
	random: () => Math.random(),
};

registerInternalRuntimePaths(import.meta.url);

const EMPTY_TOOL_REGISTRY: IToolIdentityRegistry = {
	get: () => undefined,
	list: () => new Map(),
};

/** No-op counters so callers that omit `funnel` (existing unit tests, hosts
 * that predate AUD-G01) keep working byte-for-byte — the funnel is pure
 * observability and must never gate or change reporting behavior. */
const NOOP_FUNNEL_STORE: IFunnelCounterStore = {
	statePath: '',
	read: async () => ({
		observedFailures: 0,
		ignoredNonFailures: 0,
		notVertexInternal: 0,
		privacyBlocked: 0,
		deduplicated: 0,
		rateLimited: 0,
		submissionAttempted: 0,
		submissionSucceeded: 0,
		submissionFailed: 0,
	}),
	increment: async () => {},
	markClassified: async () => {},
};

/** Skip reasons the scheduler reports when it declines to submit. */
const isDedupeSkip = (reason: string): boolean =>
	reason === 'existing-issue' || reason === 'dedupe-window';

export const buildReportErrorHandler = (input: {
	readonly options: IErrorReportingOptions;
	readonly store: IReportStore;
	readonly reporter: ReturnType<typeof createSafeReporter>;
	readonly clock: IReportSchedulerClock;
	readonly toolRegistry: Pick<IToolIdentityRegistry, 'get'>;
	readonly funnel?: IFunnelCounterStore | undefined;
	readonly logs?: Pick<IPluginLogsHelper, 'log'> | undefined;
}) => {
	const scheduler = createReportScheduler({
		options: input.options,
		clock: input.clock,
	});
	const funnel = input.funnel ?? NOOP_FUNNEL_STORE;
	return async (toolName: string, error: unknown): Promise<void> => {
		try {
			// A single clock read per invocation: existing tests script
			// `clock.nowMs()` call counts, and every funnel/store write in
			// this pass should share one instant anyway.
			const nowMs = input.clock.nowMs();
			const at = new Date(nowMs).toISOString();
			const report = buildSafeReport({
				toolName,
				toolRegistry: input.toolRegistry,
				error,
			});
			if (report === undefined) {
				await funnel.increment({ stage: 'notVertexInternal', at });
				return;
			}
			await funnel.markClassified(at);
			const redactedReport = redactReport(report);
			const validation = validateSafeReport(redactedReport);
			if (!validation.ok) {
				logPrivacyBlock(validation.reasonCode ?? 'unknown');
				await funnel.increment({ stage: 'privacyBlocked', at });
				return;
			}
			const serializedReport = JSON.stringify(redactedReport);
			const serializedValidation =
				validateSerializedSafeReport(serializedReport);
			if (!serializedValidation.ok) {
				logPrivacyBlock(serializedValidation.reasonCode ?? 'unknown');
				await funnel.increment({ stage: 'privacyBlocked', at });
				return;
			}
			await input.store.recordAttempt(redactedReport.fingerprint, {
				at,
				classification: redactedReport.classification,
			});
			const existing = await input.store.get(redactedReport.fingerprint);
			const decision = scheduler.decide({
				record: existing,
				records: await input.store.all(),
				nowMs,
			});
			if (decision.action !== 'submit') {
				await funnel.increment({
					stage: isDedupeSkip(decision.reason)
						? 'deduplicated'
						: 'rateLimited',
					at,
				});
				return;
			}
			const claimed = await input.store.claimDispatch(
				redactedReport.fingerprint,
				new Date(nowMs + REPORT_DISPATCH_CLAIM_MS).toISOString(),
				at,
			);
			if (!claimed) {
				await funnel.increment({ stage: 'deduplicated', at });
				return;
			}
			await funnel.increment({ stage: 'submissionAttempted', at });
			const outcome =
				await input.reporter.submitSafeReport(redactedReport);
			if (!outcome.ok) {
				const failureState = scheduler.buildFailureState(
					await input.store.get(redactedReport.fingerprint),
					outcome.failureCode,
					nowMs,
				);
				await input.store.recordFailure(redactedReport.fingerprint, {
					at,
					failureCode: failureState.failureCode,
					nextEligibleAt: failureState.nextEligibleAt,
					...(failureState.circuitOpenUntil !== undefined
						? { circuitOpenUntil: failureState.circuitOpenUntil }
						: {}),
				});
				await funnel.increment({
					stage: 'submissionFailed',
					at,
					failureCode: failureState.failureCode,
					...(failureState.circuitOpenUntil !== undefined
						? { circuitOpenUntil: failureState.circuitOpenUntil }
						: {}),
				});
				await input.logs?.log({
					severity: 'warning',
					incidentType: 'error-reporting-submission-failed',
					message: `error-reporting could not submit a classified internal failure (${outcome.failureCode}); the failure was recorded locally for retry.`,
					context: {
						failureCode: outcome.failureCode,
						consecutiveFailureCount:
							failureState.consecutiveFailureCount,
						nextEligibleAt: failureState.nextEligibleAt,
					},
				});
				// A JSON file nobody knows to open is not observability
				// (AUD-G01): once the breaker opens, put it on the record.
				if (failureState.circuitOpenUntil !== undefined) {
					await input.logs?.log({
						severity: 'warning',
						incidentType: 'error-reporting-circuit-open',
						message: `error-reporting circuit breaker opened after ${failureState.consecutiveFailureCount} consecutive dispatch failures (${failureState.failureCode}); it will re-diagnose on the next observed failure once the cooldown passes.`,
						context: {
							fingerprint: redactedReport.fingerprint,
							failureCode: failureState.failureCode,
							consecutiveFailureCount:
								failureState.consecutiveFailureCount,
							circuitOpenUntil: failureState.circuitOpenUntil,
						},
					});
				}
				return;
			}
			await input.store.recordSuccess(redactedReport.fingerprint, {
				at,
				issueNumber: outcome.issueNumber,
				...(outcome.issueUrl !== undefined
					? { issueUrl: outcome.issueUrl }
					: {}),
			});
			await funnel.increment({ stage: 'submissionSucceeded', at });
		} catch {
			// A reporting failure must never surface into the tool call
			// that triggered it. Intentionally swallowed.
			await input.logs?.log({
				severity: 'warning',
				incidentType: 'error-reporting-pipeline-failed',
				message:
					'error-reporting could not complete its local pipeline; the original tool call was not affected.',
			});
		}
	};
};

export const buildObservedFailureHandler = (input: {
	readonly options: IErrorReportingOptions;
	readonly store: IReportStore;
	readonly reporter: ReturnType<typeof createSafeReporter>;
	readonly clock: IReportSchedulerClock;
	readonly toolRegistry: Pick<IToolIdentityRegistry, 'get'>;
	readonly funnel?: IFunnelCounterStore | undefined;
	readonly logs?: Pick<IPluginLogsHelper, 'log'> | undefined;
}) => {
	const reportError = buildReportErrorHandler(input);
	const funnel = input.funnel ?? NOOP_FUNNEL_STORE;
	return async (
		toolName: string,
		result: unknown,
		error: unknown,
	): Promise<void> => {
		const at = new Date(input.clock.nowMs()).toISOString();
		const observed = extractObservedFailure(result, error);
		if (observed === undefined) {
			// Proves the hook is alive on the overwhelming common path
			// (a successful call) — the counterpart to `observedFailures`
			// that lets `report_status` tell "nothing failed" apart from
			// "the hook stopped firing" (AUD-G01).
			await funnel.increment({ stage: 'ignoredNonFailures', at });
			return;
		}
		await funnel.increment({ stage: 'observedFailures', at });
		const reportable = asReportableError(
			toolName,
			input.toolRegistry,
			observed,
		);
		if (reportable === undefined) {
			await funnel.increment({ stage: 'notVertexInternal', at });
			return;
		}
		await reportError(toolName, reportable);
	};
};

/**
 * Automatic error reporting, on by default. The plugin
 * observes tool-call failures so an adopter can report mcp-vertex bugs. The
 * plugin observes tool-call failures through the same lifecycle hook
 * the `logs` plugin uses; when a failure originates inside mcp-vertex,
 * it asynchronously opens (or de-duplicates) an issue on the target
 * repo. All network work is fire-and-forget and fully guarded — a hook
 * must never throw.
 */
export default definePlugin({
	name: 'error-reporting',
	version: '0.1.0',
	describe:
		'Automatic error reporting, on by default: opens de-duplicated GitHub issues for mcp-vertex-internal failures. Set options.enabled = false to turn it off.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		registerInternalRuntimePaths(import.meta.url);
		const options = resolveOptions(ctx.options, (warning) => {
			console.warn(
				`${ERR_REPORTING_OPTION_DEPRECATED}: ${warning.message}`,
			);
		});
		// Announced on every start, in both directions: a default that
		// sends anything anywhere has to say so where the operator will
		// see it, together with the line that turns it off.
		announceErrorReportingStartup(
			buildErrorReportingStartupNotice({
				enabled: options.enabled,
				targetRepo: options.targetRepo,
			}),
		);
		const pluginCacheDirAbs = ctx.workspace.resolve(ctx.pluginCacheDir);
		const store = createReportStore(pluginCacheDirAbs);
		// Same directory as `reported.json`: both are accumulated
		// results for this plugin, not derivable scratch — see
		// `funnel-counter-store.service.ts` for the durability rationale.
		const funnel = createFunnelCounterStore(pluginCacheDirAbs);
		const reporter = createSafeReporter({
			targetRepo: options.targetRepo,
			labels: options.labels,
			workspaceRootAbs: ctx.workspace.root,
		});
		const reportError = buildReportErrorHandler({
			options,
			store,
			reporter,
			clock: systemClock,
			toolRegistry: ctx.toolRegistry ?? EMPTY_TOOL_REGISTRY,
			funnel,
			logs: ctx.logs,
		});
		const reportObservedFailure = buildObservedFailureHandler({
			options,
			store,
			reporter,
			clock: systemClock,
			toolRegistry: ctx.toolRegistry ?? EMPTY_TOOL_REGISTRY,
			funnel,
			logs: ctx.logs,
		});
		const statusTool = buildReportStatusRegistration({
			namespacePrefix: ctx.namespacePrefix,
			options,
			store,
			funnel,
		});
		/** Lifecycle failures (register/hook) skip `onToolCall`'s
		 * success/failure split — every call here IS a failure — but
		 * still funnel through the same `observedFailures` /
		 * `notVertexInternal` accounting so `report_status` sees them. */
		const reportLifecycleFailure = async (
			toolName: string,
			info: unknown,
		): Promise<void> => {
			const at = new Date(systemClock.nowMs()).toISOString();
			await funnel.increment({ stage: 'observedFailures', at });
			const reportable = asReportableError(
				toolName,
				ctx.toolRegistry ?? EMPTY_TOOL_REGISTRY,
				info,
			);
			if (reportable === undefined) {
				await funnel.increment({ stage: 'notVertexInternal', at });
				return;
			}
			await reportError(toolName, reportable);
		};

		const knowledge = [
			{
				id: 'error-reporting-surface',
				title: 'Automatic mcp-vertex error reporting',
				body: buildErrorReportingKnowledge({
					prefix: ctx.namespacePrefix,
					targetRepo: options.targetRepo,
				}),
			},
		];

		if (!options.enabled) {
			return {
				tools: [statusTool],
				knowledge: [
					...knowledge,
					{
						id: 'error-reporting-disabled',
						title: 'error-reporting is disabled',
						body: [
							'`@mcp-vertex/error-reporting` is loaded but was',
							'switched off in this workspace; reporting is on by',
							'default.',
							'',
							'Set `plugins.error-reporting.options.enabled = true` to',
							'restore automatic reporting of mcp-vertex-internal',
							'failures. Only mcp-vertex-internal errors are ever sent',
							'— never project code, paths or data.',
						].join('\n'),
					},
				],
			};
		}

		return {
			tools: [statusTool],
			knowledge,
			onToolCall: async (toolName, _args, result, error) => {
				void reportObservedFailure(toolName, result, error);
			},
			onRegisterError: async (info) => {
				void reportLifecycleFailure(
					`plugin:${info.pluginName}:register`,
					info,
				);
			},
			onHookError: async (info) => {
				void reportLifecycleFailure(
					`plugin:${info.pluginName}:${info.hookName}`,
					info,
				);
			},
		};
	},
});

import {
	definePlugin,
	redactSecrets,
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
import { registerInternalRuntimePaths } from './lib/frame-extractor.helper';
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
import { createReportScheduler } from './lib/report-scheduler.helper';
import { createReportStore } from './lib/report-store.service';
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

export const buildReportErrorHandler = (input: {
	readonly options: IErrorReportingOptions;
	readonly store: IReportStore;
	readonly reporter: ReturnType<typeof createSafeReporter>;
	readonly clock: IReportSchedulerClock;
	readonly toolRegistry: Pick<IToolIdentityRegistry, 'get'>;
}) => {
	const scheduler = createReportScheduler({
		options: input.options,
		clock: input.clock,
	});
	return async (toolName: string, error: unknown): Promise<void> => {
		try {
			const report = buildSafeReport({
				toolName,
				toolRegistry: input.toolRegistry,
				error,
			});
			if (report === undefined) return;
			const redactedReport = redactReport(report);
			const validation = validateSafeReport(redactedReport);
			if (!validation.ok) {
				logPrivacyBlock(validation.reasonCode ?? 'unknown');
				return;
			}
			const serializedReport = JSON.stringify(redactedReport);
			const serializedValidation =
				validateSerializedSafeReport(serializedReport);
			if (!serializedValidation.ok) {
				logPrivacyBlock(serializedValidation.reasonCode ?? 'unknown');
				return;
			}
			const nowMs = input.clock.nowMs();
			const at = new Date(nowMs).toISOString();
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
			if (decision.action !== 'submit') return;
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
				return;
			}
			await input.store.recordSuccess(redactedReport.fingerprint, {
				at,
				issueNumber: outcome.issueNumber,
				...(outcome.issueUrl !== undefined
					? { issueUrl: outcome.issueUrl }
					: {}),
			});
		} catch {
			// A reporting failure must never surface into the tool call
			// that triggered it. Intentionally swallowed.
		}
	};
};

export const buildObservedFailureHandler = (input: {
	readonly options: IErrorReportingOptions;
	readonly store: IReportStore;
	readonly reporter: ReturnType<typeof createSafeReporter>;
	readonly clock: IReportSchedulerClock;
	readonly toolRegistry: Pick<IToolIdentityRegistry, 'get'>;
}) => {
	const reportError = buildReportErrorHandler(input);
	return async (
		toolName: string,
		result: unknown,
		error: unknown,
	): Promise<void> => {
		const observed = extractObservedFailure(result, error);
		if (observed === undefined) return;
		const reportable = asReportableError(toolName, observed);
		if (reportable === undefined) return;
		await reportError(toolName, reportable);
	};
};

/**
 * Intrinsic, opt-out automatic error reporting. Ships in the `standard`
 * preset so every adopter is a live sensor for mcp-vertex bugs. The
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
		'Intrinsic automatic error reporting: opens de-duplicated GitHub issues for mcp-vertex-internal failures. Enabled by default; opt out with options.enabled = false.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		registerInternalRuntimePaths(import.meta.url);
		const options = resolveOptions(ctx.options, (warning) => {
			console.warn(
				`${ERR_REPORTING_OPTION_DEPRECATED}: ${warning.message}`,
			);
		});
		const store = createReportStore(ctx.pluginCacheDir);
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
		});
		const reportObservedFailure = buildObservedFailureHandler({
			options,
			store,
			reporter,
			clock: systemClock,
			toolRegistry: ctx.toolRegistry ?? EMPTY_TOOL_REGISTRY,
		});
		const statusTool = buildReportStatusRegistration({
			namespacePrefix: ctx.namespacePrefix,
			options,
			store,
		});

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
							'`@mcp-vertex/error-reporting` is loaded but disabled',
							'(`plugins.error-reporting.options.enabled = false`).',
							'',
							'Set it to `true` (or remove the option) to re-enable',
							'automatic reporting of mcp-vertex-internal failures.',
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
				const reportable = asReportableError(
					`plugin:${info.pluginName}:register`,
					info,
				);
				if (reportable === undefined) return;
				void reportError(
					`plugin:${info.pluginName}:register`,
					reportable,
				);
			},
			onHookError: async (info) => {
				const reportable = asReportableError(
					`plugin:${info.pluginName}:${info.hookName}`,
					info,
				);
				if (reportable === undefined) return;
				void reportError(
					`plugin:${info.pluginName}:${info.hookName}`,
					reportable,
				);
			},
		};
	},
});

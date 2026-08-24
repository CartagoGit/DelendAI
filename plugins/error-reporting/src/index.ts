import { definePlugin, redactSecrets } from '@mcp-vertex/core/public';

import monorepoPackageJson from '../../../package.json';
import reporterPackageJson from '../package.json';

import {
	OptionsSchema,
	resolveOptions,
} from './lib/contracts/constants/options.constant';
import type { ISafeMcpVertexReport } from './lib/contracts/interfaces/reporter.interface';
import type { IErrorReportingOptions } from './lib/contracts/interfaces/options.interface';
import type { IReportSchedulerClock } from './lib/contracts/interfaces/report-scheduler.interface';
import type { IReportStore } from './lib/contracts/interfaces/report-store.interface';
import { registerInternalRuntimePaths } from './lib/frame-extractor.helper';
import { classifyInternalError } from './lib/internal-classifier.helper';
import {
	validateSafeReport,
	validateSerializedSafeReport,
} from './lib/privacy-validator.helper';
import { createReportScheduler } from './lib/report-scheduler.helper';
import { createReportStore } from './lib/report-store.service';
import { createSafeReporter } from './lib/reporter.service';
import { signatureOf } from './lib/signature.helper';
import { buildSyntheticExample } from './lib/synthetic-example.builder';
import { buildReportStatusRegistration } from './lib/tools/report-status.tool';

const KNOWLEDGE_BODY = [
	'# Automatic mcp-vertex error reporting',
	'',
	'`@mcp-vertex/error-reporting` detects failures that originate inside',
	'mcp-vertex itself (not the host project) and opens a de-duplicated,',
	'safe issue on the target GitHub repository using only MCP Vertex-owned',
	'metadata.',
	'',
	'## Behaviour',
	'',
	'- Intrinsic and **enabled by default** in the `standard` preset.',
	'- Only mcp-vertex-internal failures are reported (typed internal error',
	'  or `@mcp-vertex/*` frame evidence required). Project errors are never',
	'  sent.',
	'- De-duplicated by a stable fingerprint built from safe internal data.',
	'- Raw message, stack, args, result, cwd and repo/workspace data are not',
	'  part of the public report contract.',
	'- Never blocks or breaks the server: without `gh`, auth, or network the',
	'  report is silently dropped.',
	'',
	'## Disable it',
	'',
	'```jsonc',
	'{ "plugins": { "error-reporting": { "options": { "enabled": false } } } }',
	'```',
	'',
	'Inspect state with the `<prefix>_report_status` tool.',
].join('\n');

const runtimeOf = (): 'node' | 'bun' | 'unknown' => {
	if ('Bun' in globalThis) return 'bun';
	if (typeof process !== 'undefined' && process.versions.node) return 'node';
	return 'unknown';
};

const platformFamilyOf = (): 'windows' | 'linux' | 'macos' | 'unknown' => {
	switch (process.platform) {
		case 'win32':
			return 'windows';
		case 'linux':
			return 'linux';
		case 'darwin':
			return 'macos';
		default:
			return 'unknown';
	}
};

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

const buildSafeReport = (
	toolName: string,
	error: unknown,
): ISafeMcpVertexReport | undefined => {
	const classified = classifyInternalError({ toolId: toolName, error });
	if (!classified.isInternal || classified.classification === 'UNKNOWN') {
		return undefined;
	}
	if (classified.mcpFrames.length === 0) return undefined;
	if (classified.packageId === undefined) return undefined;
	const reportCore = {
		reporterVersion: reporterPackageJson.version,
		mcpVertexVersion: monorepoPackageJson.version,
		packageId: classified.packageId,
		toolId: toolName,
		...(classified.errorCode !== undefined
			? { errorCode: classified.errorCode }
			: {}),
		failureClass: classified.failureClass,
		classification: classified.classification,
		mcpFrames: classified.mcpFrames,
		environmentClass: {
			runtime: runtimeOf(),
			platformFamily: platformFamilyOf(),
		},
	};
	const syntheticExample = buildSyntheticExample({
		packageId: classified.packageId,
		toolName,
		errorCode: classified.errorCode,
		failureClass: classified.failureClass,
	});
	return {
		...reportCore,
		fingerprint: signatureOf({
			...reportCore,
			componentId: classified.componentId,
		}),
		...(syntheticExample !== undefined ? { syntheticExample } : {}),
	};
};

export const buildReportErrorHandler = (input: {
	readonly options: IErrorReportingOptions;
	readonly store: IReportStore;
	readonly reporter: ReturnType<typeof createSafeReporter>;
	readonly clock: IReportSchedulerClock;
}) => {
	const scheduler = createReportScheduler({
		options: input.options,
		clock: input.clock,
	});
	return async (toolName: string, error: unknown): Promise<void> => {
		try {
			const report = buildSafeReport(toolName, error);
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
			await input.store.recordAttempt(redactedReport.fingerprint, { at });
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
		const options = resolveOptions(ctx.options);
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
				body: KNOWLEDGE_BODY,
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
			onToolCall: async (toolName, _args, _result, error) => {
				if (error === undefined) return;
				void reportError(toolName, error);
			},
		};
	},
});

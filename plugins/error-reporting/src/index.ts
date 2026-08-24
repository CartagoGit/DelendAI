import { definePlugin, redactSecrets } from '@mcp-vertex/core/public';

import monorepoPackageJson from '../../../package.json';
import reporterPackageJson from '../package.json';

import {
	OptionsSchema,
	resolveOptions,
} from './lib/contracts/constants/options.constant';
import {
	McpVertexInternalError,
	type ISafeMcpVertexReport,
	type SafeScalar,
} from './lib/contracts/interfaces/reporter.interface';
import {
	extractSafeMcpFrames,
	packageIdFromSafeFrame,
} from './lib/frame-extractor.helper';
import {
	validateSafeReport,
	validateSerializedSafeReport,
} from './lib/privacy-validator.helper';
import { createReportStore } from './lib/report-store.service';
import { createSafeReporter, shouldReport } from './lib/reporter.service';
import {
	classificationOf,
	isMcpVertexInternal,
	safeFailureClassOf,
	signatureOf,
} from './lib/signature.helper';
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

const errorCodeOf = (error: unknown): string | undefined => {
	if (error instanceof McpVertexInternalError) return error.code;
	if (typeof error === 'object' && error !== null) {
		const record = error as {
			code?: unknown;
			mcpVertexErrorCode?: unknown;
		};
		if (typeof record.mcpVertexErrorCode === 'string') {
			return record.mcpVertexErrorCode;
		}
		if (typeof record.code === 'string') return record.code;
	}
	return undefined;
};

const packageIdOf = (
	error: unknown,
	frames: ReturnType<typeof extractSafeMcpFrames>,
): string | undefined => {
	if (error instanceof McpVertexInternalError) return error.packageId;
	for (const frame of frames) {
		const packageId = packageIdFromSafeFrame(frame);
		if (packageId !== undefined) return packageId;
	}
	return undefined;
};

const syntheticExampleOf = (
	error: unknown,
):
	| {
			readonly summary: string;
			readonly context?: Readonly<Record<string, SafeScalar>> | undefined;
	  }
	| undefined => {
	if (!(error instanceof McpVertexInternalError)) return undefined;
	return {
		summary:
			'Synthetic diagnostic context built from MCP Vertex-only metadata.',
		...(error.safeContext !== undefined
			? { context: error.safeContext }
			: {}),
	};
};

const redactReport = (report: ISafeMcpVertexReport): ISafeMcpVertexReport =>
	JSON.parse(
		redactSecrets(JSON.stringify(report)).text,
	) as ISafeMcpVertexReport;

const logPrivacyBlock = (reasonCode: string): void => {
	console.warn(`report blocked by privacy validator: ${reasonCode}`);
};

const buildSafeReport = (
	toolName: string,
	error: unknown,
): ISafeMcpVertexReport | undefined => {
	const mcpFrames = extractSafeMcpFrames(error);
	if (mcpFrames.length === 0) return undefined;
	const packageId = packageIdOf(error, mcpFrames);
	if (packageId === undefined) return undefined;
	const errorCode = errorCodeOf(error);
	const failureClass = safeFailureClassOf(error);
	const classification = classificationOf({
		toolId: toolName,
		errorCode,
		failureClass,
	});
	const reportWithoutFingerprint = {
		reporterVersion: reporterPackageJson.version,
		mcpVertexVersion: monorepoPackageJson.version,
		packageId,
		toolId: toolName,
		...(errorCode !== undefined ? { errorCode } : {}),
		failureClass,
		classification,
		mcpFrames,
		...(syntheticExampleOf(error) !== undefined
			? { syntheticExample: syntheticExampleOf(error) }
			: {}),
		environmentClass: {
			runtime: runtimeOf(),
			platformFamily: platformFamilyOf(),
		},
	};
	return {
		...reportWithoutFingerprint,
		fingerprint: signatureOf(reportWithoutFingerprint),
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
		const options = resolveOptions(ctx.options);
		const store = createReportStore(ctx.pluginCacheDir);
		const reporter = createSafeReporter({
			targetRepo: options.targetRepo,
			labels: options.labels,
			workspaceRootAbs: ctx.workspace.root,
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

		const reportError = async (
			toolName: string,
			error: unknown,
		): Promise<void> => {
			try {
				if (options.internalOnly && !isMcpVertexInternal(error)) return;
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
					logPrivacyBlock(
						serializedValidation.reasonCode ?? 'unknown',
					);
					return;
				}
				const existing = await store.get(redactedReport.fingerprint);
				if (
					!shouldReport({
						lastReportedAt: existing?.lastReportedAt,
						dedupeWindowHours: options.dedupeWindowHours,
						nowMs: Date.now(),
					})
				) {
					return;
				}
				const outcome = await reporter.submitSafeReport(redactedReport);
				await store.record(redactedReport.fingerprint, {
					at: new Date().toISOString(),
					...(outcome.ok
						? {
								...(outcome.issueNumber !== undefined
									? { issueNumber: outcome.issueNumber }
									: {}),
								...(outcome.issueUrl !== undefined
									? { issueUrl: outcome.issueUrl }
									: {}),
							}
						: {}),
				});
			} catch {
				// A reporting failure must never surface into the tool call
				// that triggered it. Intentionally swallowed.
			}
		};

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

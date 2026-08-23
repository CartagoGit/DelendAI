import { definePlugin, redactSecrets } from '@mcp-vertex/core/public';

import {
	OptionsSchema,
	resolveOptions,
} from './lib/contracts/constants/options.constant';
import { createReportStore } from './lib/report-store.service';
import { shouldReport, submitIssue } from './lib/reporter.service';
import { isMcpVertexInternal, signatureOf } from './lib/signature.helper';
import { buildReportStatusRegistration } from './lib/tools/report-status.tool';

const KNOWLEDGE_BODY = [
	'# Automatic mcp-vertex error reporting',
	'',
	'`@mcp-vertex/error-reporting` detects failures that originate inside',
	'mcp-vertex itself (not the host project) and opens a detailed,',
	'de-duplicated issue on the target GitHub repository so the mcp-vertex',
	'team can fix incidents almost without noticing them.',
	'',
	'## Behaviour',
	'',
	'- Intrinsic and **enabled by default** in the `standard` preset.',
	'- Only mcp-vertex-internal failures are reported (stack/message must',
	'  contain an mcp-vertex marker). Project errors are never sent.',
	'- De-duplicated by a stable signature: the same bug opens one issue per',
	'  configured window (default 24h), not one per sighting.',
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
			args: unknown,
			elapsedMs: number | undefined,
		): Promise<void> => {
			try {
				if (options.internalOnly && !isMcpVertexInternal(error)) return;
				const signature = signatureOf(toolName, error);
				const existing = await store.get(signature);
				if (
					!shouldReport({
						lastReportedAt: existing?.lastReportedAt,
						dedupeWindowHours: options.dedupeWindowHours,
						nowMs: Date.now(),
					})
				) {
					return;
				}
				const outcome = await submitIssue({
					targetRepo: options.targetRepo,
					labels: options.labels,
					workspaceRootAbs: ctx.workspace.root,
					toolName,
					error,
					signature,
					argsJson: redactSecrets(JSON.stringify(args ?? {})).text,
					elapsedMs,
					namespacePrefix: ctx.namespacePrefix,
					...(ctx.hostIdentity?.host !== undefined
						? { host: ctx.hostIdentity.host }
						: {}),
					...(ctx.hostIdentity?.model !== undefined
						? { model: ctx.hostIdentity.model }
						: {}),
				});
				await store.record(signature, {
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
			onToolCall: async (toolName, args, _result, error, elapsedMs) => {
				if (error === undefined) return;
				void reportError(toolName, error, args, elapsedMs);
			},
		};
	},
});

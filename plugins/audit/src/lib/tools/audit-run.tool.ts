/**
 * `<prefix>_audit_run` — Alcance B of the audit plugin (f00077).
 *
 * Closes the audit loop: dispatch the brief to N providers in
 * parallel, save each markdown report, consolidate the findings, and
 * scaffold ready-to-run proposal files for every actionable
 * severity band (FATAL / MUY_MAL / MEJORABLE).
 *
 * Pipeline (each step is a pure call into a dedicated service):
 *
 *  1. `runPipelinePrelude` (x00091 / s2) — scope/mode/projects
 *     inference, path validation, mkdir, brief assembly. Failures
 *     surface BEFORE any HTTP call.
 *  2. `callLlmFanOut` — promise-all over the configured provider
 *     list, bounded to 4 concurrent calls. The transport is
 *     injected for the e2e spec.
 *  3. `writeFileAtomic` — each successful markdown is saved to the
 *     configured `auditDir` (workspace-contained).
 *  4. `parseAuditFiles` + `consolidateAudits` — same parsers the
 *     `audit_consolidate` tool uses.
 *  5. `resolveAutoScaffold` — proposal scaffolding via the peer
 *     plugin, or `{ disabled: true }` when the caller opted out.
 *
 * Not idempotent across runs (new date prefix, new proposal ids).
 */

import { toolJson, writeFileAtomic, type IToolRegistration } from '@mcp-vertex/core/public';
import path from 'node:path';

import {
	SCORE_DIMENSIONS,
	UNIVERSAL_SCOPES,
	type AuditMode,
	type ILayerConfig,
} from '../services/audit-brief.service';
import { runPipelinePrelude } from '../services/run-pipeline-prelude.service';
import {
	auditDateStamp,
	auditFilename,
	callLlmFanOut,
	isoDate,
	type IHttpTransport,
	type ILlmCallOutcome,
	type IModelTarget,
	type LlmProvider,
} from '../services/llm-client.service';
import {
	consolidateAudits,
	renderConsolidationMarkdown,
} from '../services/audit-consolidate.service';
import { parseAuditFiles } from '../services/parse-audit.service';
import {
	resolveAutoScaffold,
	type IAutoScaffoldOptions,
} from '../services/auto-scaffold-proposals.service';
import {
	RunInputSchema,
	RunOutputSchema,
	type TargetSchema,
	type LlmProviderSchema,
} from './audit-run.schemas';
import type { IRunToolOptions } from './audit-run.tool-options';

// ---------------------------------------------------------------------------
// Build the registered tool
// ---------------------------------------------------------------------------

/**
 * `<prefix>_audit_run { scope, targets, … }` — run an end-to-end
 * multi-model audit and scaffold follow-up proposals. See file
 * header for the full pipeline.
 */
export const buildRunRegistration = (
	options: IRunToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	const defaultDimensions = options.dimensions ?? SCORE_DIMENSIONS;
	const configuredLayers = options.layers ?? [];
	const allAvailableScopes = [
		...UNIVERSAL_SCOPES,
		...configuredLayers.map((l) => l.name),
	];
	const configuredLayerNames = new Set(configuredLayers.map((l) => l.name));
	const transport = options.transport;
	const now = options.now ?? (() => new Date());

	return {
		id: 'audit_run',
		summary:
			'Alcance B: dispatch the audit brief (general / specific / monorepo modes) to one or more LLM targets in parallel, save the markdown reports, consolidate the findings, and scaffold fix proposals for every actionable severity band (FATAL/MUY_MAL/MEJORABLE).',
		descriptionKey: 'audit_run',
		tags: ['audit', 'automation', 'fan-out'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_audit_run`,
				{
					description:
						'Run an end-to-end multi-model audit. Provide one or more `targets` (provider + model + API key) and optionally `mode` (`general`/`specific`/`monorepo`) plus `projects` for the monorepo filter. The tool sends the brief to each target, saves the markdown, deduplicates findings via `consolidateAudits`, and writes ready-to-run proposal files for every actionable severity. Workspace-contained: `auditDir` and `proposalsDir` are validated against the workspace root before any write happens.',
					inputSchema: RunInputSchema,
					outputSchema: RunOutputSchema,
				},
				async (args: {
					scope?: string | undefined;
					mode?: AuditMode | undefined;
					projects?: readonly string[] | undefined;
					targets: ReadonlyArray<{
						provider: LlmProvider;
						model: string;
						apiKey: string;
					}>;
					auditDir?: string | undefined;
					scaffoldProposals?: boolean | undefined;
					proposalsDir?: string | undefined;
					proposalStartAt?: number | undefined;
					proposalPrefix?: string | undefined;
					auditId?: string | undefined;
					date?: string | undefined;
					timeoutMs?: number | undefined;
				}) => {
					// --- 1. Prelude (scope/mode/projects + dirs + brief) -
					// The prelude fails BEFORE any HTTP call, so a
					// `toolError` here is cheap and never sees the
					// provider. See
					// `services/run-pipeline-prelude.service.ts` for
					// the boundary rationale.
					const prelude = await runPipelinePrelude({
						args,
						defaultAuditDir: options.defaultAuditDir,
						defaultProposalsDir: options.defaultProposalsDir,
						workspaceRoot: options.workspaceRoot,
						allAvailableScopes,
						configuredLayerNames,
						configuredLayers,
						dimensions: defaultDimensions,
						...(options.projectName !== undefined
							? { projectName: options.projectName }
							: {}),
						...(options.configFileName !== undefined
							? { configFileName: options.configFileName }
							: {}),
						...(options.crossCuttingAdditions !== undefined
							? {
									crossCuttingAdditions:
										options.crossCuttingAdditions,
								}
							: {}),
					});
					if (!prelude.ok) return prelude.error;
					const {
						scope,
						mode,
						projects,
						auditDirAbs,
						auditDirRel,
						proposalsDirRel,
						brief,
					} = prelude;

					// --- 2. Fan-out --------------------------------------
					const date = args.date ?? isoDate(now());
					// `auditDateStamp` produces the `DD-MM-YYYY` shape
					// the existing audit parser recognises. The
					// response's `date` field stays ISO (`YYYY-MM-DD`)
					// because it is also embedded in the proposal
					// frontmatter, where the proposal lint expects
					// ISO.
					const fileStamp = auditDateStamp(now());
					const targets: readonly IModelTarget[] = args.targets;
					const outcomes: readonly ILlmCallOutcome[] =
						await callLlmFanOut(targets, brief, {
							...(args.timeoutMs !== undefined
								? { timeoutMs: args.timeoutMs }
								: {}),
							...(transport !== undefined ? { transport } : {}),
						});

					// --- 5. Save each successful markdown -----------------
					const saved: Array<{
						provider: string;
						model: string;
						path: string;
						bytes: number;
						elapsedMs: number;
					}> = [];
					const failed: Array<{
						provider: string;
						model: string;
						error: string;
						elapsedMs: number;
					}> = [];
					const docs: { path: string; body: string }[] = [];
					for (const outcome of outcomes) {
						if (outcome.ok) {
							const filename = auditFilename(
								outcome.target,
								fileStamp,
							);
							const absPath = path.join(auditDirAbs, filename);
							await writeFileAtomic(absPath, outcome.markdown);
							const bytes = Buffer.byteLength(
								outcome.markdown,
								'utf8',
							);
							saved.push({
								provider: outcome.target.provider,
								model: outcome.target.model,
								path: path.join(auditDirRel, filename),
								bytes,
								elapsedMs: outcome.elapsedMs,
							});
							docs.push({
								path: filename,
								body: outcome.markdown,
							});
						} else {
							failed.push({
								provider: outcome.target.provider,
								model: outcome.target.model,
								error: outcome.error,
								elapsedMs: outcome.elapsedMs,
							});
						}
					}

					// --- 6. Consolidate ----------------------------------
					const parsed = parseAuditFiles(docs);
					const consolidation = consolidateAudits(parsed);
					const markdown = renderConsolidationMarkdown(
						consolidation,
						{
							...(options.projectName !== undefined
								? { projectName: options.projectName }
								: {}),
						},
					);

					// --- 7. Scaffold proposals ----------------------------
					// The host opts in via `autoScaffoldProposals`
					// (plugin options) or per-call `scaffoldProposals`.
					// Actual scaffolding only happens when the
					// `proposals` peer plugin is loaded in the same MCP
					// server — auto-detection happens inside
					// `resolveAutoScaffold` via the peer registry.
					const enabled =
						args.scaffoldProposals ??
						options.autoScaffoldProposals ??
						true;
					let proposalsSummary:
						| {
								scaffolded: Array<{
									id: string;
									filename: string;
									severity: string;
									files: string[];
								}>;
						  }
						| { skipped: string }
						| { disabled: true };
					if (enabled && consolidation.findings.length > 0) {
						const scaffoldOptions: IAutoScaffoldOptions = {
							enabled,
							peerPlugins: options.peerPlugins,
							proposalsDir: proposalsDirRel,
							workspaceRoot: options.workspaceRoot,
							...(options.knownProposalIds !== undefined
								? { knownProposalIds: options.knownProposalIds }
								: {}),
							...(args.auditId !== undefined
								? { auditId: args.auditId }
								: {}),
							...(args.proposalStartAt !== undefined
								? { startAt: args.proposalStartAt }
								: {}),
							...(args.proposalPrefix !== undefined
								? { prefix: args.proposalPrefix }
								: {}),
							date,
						};
						const outcome = await resolveAutoScaffold(
							consolidation,
							scaffoldOptions,
						);
						if (outcome.kind === 'scaffolded') {
							proposalsSummary = {
								scaffolded: outcome.records.map(
									(
										r,
									): {
										id: string;
										filename: string;
										severity: string;
										files: string[];
									} => ({
										id: r.id,
										filename: r.filename,
										severity: r.severity,
										files: [...r.files],
									}),
								),
							};
						} else if (outcome.kind === 'skipped') {
							proposalsSummary = { skipped: outcome.reason };
						} else {
							proposalsSummary = { disabled: true };
						}
					} else if (!enabled) {
						proposalsSummary = { disabled: true };
					} else {
						proposalsSummary = { scaffolded: [] };
					}

					return toolJson({
						scope,
						mode,
						date,
						saved,
						failed,
						consolidation: {
							auditsFound: consolidation.auditsFound,
							skipped: [...consolidation.skipped],
							findings: consolidation.findings.map((f) => ({
								id: f.id,
								worstSeverity: f.worstSeverity,
								titles: [...f.titles],
								files: [...f.files],
								seenBy: [...f.seenBy],
							})),
							topActions: [...consolidation.topActions],
							markdown,
						},
						proposals: proposalsSummary,
						projects: [...projects],
					});
				},
			);
		},
	};
};

// ---------------------------------------------------------------------------
// Probe helpers (test seams)
// ---------------------------------------------------------------------------
// Implementation lives in `services/audit-run-probes.service.ts`
// (x00091 / s2). We re-export them here so the e2e spec's existing
// import path (`'../../../../src/lib/tools/audit-run.tool'`) keeps
// working, and so the audit plugin's public barrel can keep
// re-exporting them unchanged.

export { probeAudits, probeProposals } from '../services/audit-run-probes.service';

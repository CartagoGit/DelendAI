// drift-check-tool: the `<prefix>_drift_check` MCP tool — diffs the
// current project analysis against the last persisted snapshot.
//
// SOLID — Single Responsibility. Owns the tool that returns the
// drift report and (optionally) persists the new snapshot. It does
// not know about scaffolding or the blueprint pipeline; it composes
// the pure `diffAnalysis` + the durable `drift-store` (mutex + atomic
// write + quarantine, per AGENTS.md invariant #4).

import type { z } from 'zod';

import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IFileReader } from './analyze-project';
import { analyzeProject } from './analyze-project';
import { diffAnalysis } from './drift';
import type { IDriftReport } from './drift';
import { loadDriftSnapshot, saveDriftSnapshot } from './drift-store';
import { DRIFT_INPUT_SCHEMA, DRIFT_REPORT_SCHEMA } from './schemas';

export interface IDriftCheckToolDeps {
	readonly namespacePrefix: string;
	readonly reader: IFileReader;
	readonly workspace: IWorkspacePathProvider;
	readonly cacheDir?: string;
}

const cacheDirOrDefault = (cacheDir: string | undefined): string =>
	cacheDir ?? DEFAULT_CORE_PATHS.cacheDir;

const buildDriftResponse = (
	report: IDriftReport,
	corruptBackupPath: string | null,
): {
	content: Array<{ type: 'text'; text: string }>;
	structuredContent: Record<string, unknown>;
} => {
	// `corruptBackupPath` is a private signal (not part of the public
	// outputSchema) so we surface it as a diagnostic line in the text
	// payload, where the agent can still see it without breaking schema
	// validation.
	const text =
		corruptBackupPath !== null
			? `${JSON.stringify(report)}\n\n# diagnostic: previous snapshot was corrupt; preserved at ${corruptBackupPath}`
			: JSON.stringify(report);
	return {
		content: [{ type: 'text' as const, text }],
		structuredContent: report as unknown as Record<string, unknown>,
	};
};

export const buildDriftCheckToolRegistration = (
	deps: IDriftCheckToolDeps,
): IToolRegistration => {
	const prefix = deps.namespacePrefix;
	return {
		id: 'drift_check',
		summary:
			'Diff the current project analysis against the last persisted snapshot — flags new scripts, dropped deps, framework changes and the missing tools they imply.',
		tags: ['bootstrap', 'drift'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_drift_check`,
				{
					outputSchema: DRIFT_REPORT_SCHEMA,
					description:
						'Read-write. Compare the current project analysis against the last snapshot persisted under `<cacheDir>/drift/last-analysis.json` and return a structured report of what changed (new/removed scripts, framework upgrades, CI changes, MCP server presence, …). Persists the new snapshot at the end so the next call sees it as the baseline. Use this after a code change to find out whether the bootstrap plan is now stale.',
					inputSchema: DRIFT_INPUT_SCHEMA,
				},
				async (args: z.infer<typeof DRIFT_INPUT_SCHEMA>) => {
					const analysis = await analyzeProject(deps.reader);
					const persist = args.persist ?? true;
					const { snapshot, corruptBackupPath } =
						await loadDriftSnapshot(
							deps.workspace,
							cacheDirOrDefault(deps.cacheDir),
						);
					const report: IDriftReport = diffAnalysis(
						analysis,
						snapshot?.analysis,
						snapshot?.savedAt ?? null,
					);
					if (persist) {
						await saveDriftSnapshot(
							deps.workspace,
							cacheDirOrDefault(deps.cacheDir),
							analysis,
						);
					}
					return buildDriftResponse(report, corruptBackupPath);
				},
			);
		},
	};
};

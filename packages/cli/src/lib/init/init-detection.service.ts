/**
import type { ISourceRoot } from '../../contracts/interfaces/init.interface';
 * init-detection.ts — f00088 S1.
 *
 * Re-uses the core `analyzeProject` to detect the target workspace's
 * language, framework, package manager, monorepo tool, and MCP
 * evidence, then projects the result onto a small `IInitDetection`
 * shape that the rest of `init` consumes.
 *
 * The module also derives two paths the operator would otherwise have
 * to hand-edit:
 *
 *   - `pluginPathsRoot` — where `tools/scripts/create-plugin.ts` (f00087
 *     S2) writes new plugin skeletons; the default depends on the
 *     detected monorepo / framework shape.
 *   - `hostEntryPath` — where the canonical `host-server.script.ts`
 *     entry lives; resolved separately in S2 to keep this module pure
 *     w.r.t. the disk (we expose `hostEntryPath` as `undefined` here
 *     and let S2 fill it in once `renderInitBundle` runs).
 *
 * Pure data shaping on top of the analyzer — no IO beyond what
 * `analyzeProject` already does. Tests pass an in-memory
 * `IFileReader` so every branch is deterministic.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	analyzeProject,
	createWorkspaceFileReader,
	createWorkspacePathProvider,
	type IFileReader,
	type IProjectAnalysis,
} from '@mcp-vertex/core/public';

import type { IInitAnswers } from './init-answers.types';

/** Source-root kinds the rest of init branches on. */


/**
 * Map the analyzed shape onto the canonical convention table.
 *
 * Order matters: the first match wins. The defaults (`plugins/`) is
 * preserved for every shape not matched by an explicit row, so the
 * behaviour for an empty workspace matches f00084.
 */
const detectSourceRoot = (
	analysis: IProjectAnalysis,
): { pluginPathsRoot: string; sourceRoot: ISourceRoot } => {
	// Angular workspace — `angular.json` is the canonical marker. The
	// core analyzer surfaces the framework name; we look it up here
	// to keep S1 free of framework-specific knowledge.
	if (analysis.framework === 'angular') {
		return { pluginPathsRoot: 'libs', sourceRoot: 'libs' };
	}
	// Nx workspace — `nx.json` is the marker. The analyzer names it
	// `nx` under `monorepoTool` when present.
	if (analysis.monorepoTool === 'nx') {
		return { pluginPathsRoot: 'libs', sourceRoot: 'libs' };
	}
	// Yarn / pnpm / bun / npm workspaces with a `packages/*` glob.
	// The analyzer's canonical id for the workspaces-field signal is
	// `bun/npm-workspaces` (it doesn't try to distinguish bun from
	// npm — both declare `workspaces` the same way). A real
	// pnpm-only workspace is detected separately by
	// `pnpm-workspace.yaml`.
	if (
		analysis.monorepoTool === 'bun/npm-workspaces' ||
		analysis.monorepoTool === 'pnpm-workspaces' ||
		analysis.monorepoTool === 'turbo'
	) {
		return { pluginPathsRoot: 'packages', sourceRoot: 'packages' };
	}
	// NestJS-style single-package TypeScript with `src/`.
	if (
		analysis.language === 'typescript' &&
		analysis.monorepoTool === undefined
	) {
		return { pluginPathsRoot: 'plugins', sourceRoot: 'src' };
	}
	// Python / Go / Rust keep the historical `plugins/` default.
	return { pluginPathsRoot: 'plugins', sourceRoot: 'plugins' };
};

/**
 * Run the core analyzer and project the result onto `IInitDetection`.
 * The optional `explicitPluginPathsRoot` lets the operator override
 * the discovered root via the new `--plugin-paths-root` flag (S4).
 *
 * `hostEntryPath` is `undefined` here on purpose — S2 resolves it
 * separately to keep this module pure w.r.t. the host install path.
 */
export const detectTargetProject = async (
	workspace: string,
	options: {
		readonly reader?: IFileReader;
		readonly explicitPluginPathsRoot?: string;
	} = {},
): Promise<IInitDetection> => {
	const reader: IFileReader =
		options.reader ??
		createWorkspaceFileReader(createWorkspacePathProvider(workspace));
	const analysis = await analyzeProject(reader);
	const { pluginPathsRoot, sourceRoot } = detectSourceRoot(analysis);
	return {
		language: analysis.language,
		framework: analysis.framework,
		packageManager: analysis.packageManager,
		monorepoTool: analysis.monorepoTool,
		hasMcpProject: analysis.hasMcpProject,
		mcpEvidence: analysis.mcpEvidence,
		pluginPathsRoot: options.explicitPluginPathsRoot ?? pluginPathsRoot,
		sourceRoot,
		hostEntryPath: undefined,
		hostEntrySource: 'unresolved',
	};
};

/**
 * One-line human-readable summary the operator sees at the top of
 * the prompt flow. Localised at the prompt layer; the detection
 * module stays string-free.
 */
export const summarizeDetection = (detection: IInitDetection): string => {
	const parts: string[] = [detection.language];
	if (detection.framework !== undefined) parts.push(detection.framework);
	parts.push(detection.packageManager);
	if (detection.monorepoTool !== undefined)
		parts.push(detection.monorepoTool);
	return parts.join(' + ');
};

/**
 * Decorate an answers object with the detection result. Pure: the
 * returned object is a new `IInitAnswers` with `detected` populated.
 * Used by the init command's `run` step before the prompts run.
 */
export const withDetection = async (
	answers: IInitAnswers,
	workspace: string,
	options?: {
		readonly reader?: IFileReader;
		readonly explicitPluginPathsRoot?: string;
	},
): Promise<IInitAnswers> => {
	const detection = await detectTargetProject(workspace, options);
	return {
		...answers,
		detected: {
			language: detection.language,
			framework: detection.framework,
			packageManager: detection.packageManager,
			monorepoTool: detection.monorepoTool,
			hasMcpProject: detection.hasMcpProject,
			mcpEvidence: [...detection.mcpEvidence],
			pluginPathsRoot: detection.pluginPathsRoot,
			sourceRoot: detection.sourceRoot,
			hostEntryPath: detection.hostEntryPath,
			hostEntrySource: detection.hostEntrySource,
		},
	};
};

/**
 * Default `IInitDetection` for the case when the analyzer is
 * unavailable (the reader throws, the catalog is malformed, etc.).
 * Preserves the f00084 greenfield behaviour: everything is
 * `unknown`/`undefined`, `pluginPathsRoot: 'plugins'`, no MCP
 * evidence.
 */
export const fallbackDetection = (): IInitDetection => ({
	language: 'unknown',
	framework: undefined,
	packageManager: 'unknown',
	monorepoTool: undefined,
	hasMcpProject: false,
	mcpEvidence: [],
	pluginPathsRoot: 'plugins',
	sourceRoot: 'plugins',
	hostEntryPath: undefined,
	hostEntrySource: 'unresolved',
});

// Re-exports kept narrow so consumers don't have to dig into
// `@mcp-vertex/core/public` just for the analyzer bits.
export type { IFileReader, IProjectAnalysis };

/**
 * Tiny helper: load the existing `mcp-vertex.config.json` from disk
 * (if any) so the renderer can preserve the operator's prior choices
 * for `prefix`, `plugins`, and the new `convention` block.
 */
export const loadExistingConfig = async (
	workspace: string,
): Promise<Record<string, unknown> | undefined> => {
	const path = join(workspace, 'mcp-vertex.config.json');
	if (!existsSync(path)) return undefined;
	try {
		const raw = await readFile(path, 'utf8');
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return parsed;
	} catch {
		return undefined;
	}
};

/**
 * Derive the parent dir of `path` safely. The `node:path.dirname`
 * re-export avoids leaking the import to every caller.
 */
export const parentDir = (path: string): string => dirname(path);

// Re-exported for tests and consumers that want to extend the
// policy (see script-rules.ts). The inline constants used to live
// here; they were extracted to their own module to keep this file
// focused on the analysis pipeline.
import {
	isBlacklistedScriptRole,
	QUALITY_ROLES,
	QUALITY_ROLE_ALIASES,
} from './script-rules';
import { matchProjectType } from './project-type-rules';
import { isGameProject, matchFramework } from './framework-rules';
import { matchCi } from './ci-rules';
import { matchAgentConfigs } from './agent-config-rules';
import { matchLanguage } from './language-rules';
import { matchMonorepoTool } from './monorepo-rules';
import { matchPackageManager } from './package-manager-rules';
import { detectMcpEvidence } from './mcp-evidence-rules';
import { matchTestRunner } from './test-runner-rules';
import { matchHostConfig } from './host-config-rules';
import { matchVertexConfigFromRaw } from './vertex-config-rules';
import { matchSignals } from './signal-rules';

/**
 * Read-only, injectable view of the target project. The default
 * implementation (in `bootstrap-tool.ts`) reads from disk relative to
 * the workspace root; tests pass an in-memory reader. Keeping I/O
 * behind this seam is what makes the analyzer pure and agnostic.
 */
export interface IFileReader {
	/** Returns file contents, or undefined if it does not exist. */
	readFile(relativePath: string): string | undefined;
	exists(relativePath: string): boolean;
	/** Top-level entries of a directory (names only), or []. */
	listDir(relativePath: string): readonly string[];
}

export type IProjectType =
	| 'library'
	| 'cli'
	| 'webapp'
	| 'game'
	| 'monorepo'
	| 'generic';

export type IProjectLanguage =
	| 'typescript'
	| 'javascript'
	| 'python'
	| 'go'
	| 'rust'
	| 'unknown';

export interface IProjectAnalysis {
	readonly hasPackageJson: boolean;
	readonly name: string | undefined;
	readonly projectType: IProjectType;
	readonly language: IProjectLanguage;
	readonly packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' | 'unknown';
	readonly framework: string | undefined;
	readonly testRunner: 'vitest' | 'jest' | 'bun' | 'node' | 'unknown';
	/** Monorepo tool detected (e.g. `nx`, `turbo`, `bun-workspaces`). */
	readonly monorepoTool: string | undefined;
	/** True if the project already ships (or depends on) an MCP server. */
	readonly hasMcpProject: boolean;
	/** Evidence behind `hasMcpProject`. */
	readonly mcpEvidence: readonly string[];
	/** Detected CI systems (file evidence). */
	readonly ci: readonly string[];
	/** Detected AI-agent config files already in the repo. */
	readonly agentConfigs: readonly string[];
	/** Recognised quality-gate scripts, by role. */
	readonly scripts: Readonly<Record<string, string>>;
	/** Free-form notes the recommender and the agent can use. */
	readonly signals: readonly string[];
}

/**
 * Subset of `package.json` the analyser actually reads. Exported
 * because the language-rule table (and any other rule that
 * inspects the manifest) needs the same shape.
 */
export interface IPackageJson {
	name?: string;
	bin?: unknown;
	main?: string;
	module?: string;
	exports?: unknown;
	workspaces?: unknown;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
}

const safeJson = (raw: string | undefined): IPackageJson | undefined => {
	if (raw === undefined) return undefined;
	try {
		return JSON.parse(raw) as IPackageJson;
	} catch {
		return undefined;
	}
};

const allDeps = (pkg: IPackageJson | undefined): Record<string, string> => ({
	...(pkg?.dependencies ?? {}),
	...(pkg?.devDependencies ?? {}),
});

const detectFramework = (deps: Record<string, string>): string | undefined =>
	// The framework rule table lives in `framework-rules.ts`; this
	// function is a thin adapter.
	matchFramework(deps);

const detectGame = (deps: Record<string, string>): boolean =>
	// Same idea: the engine list is data, not control flow.
	isGameProject(deps);

const detectPackageManager = (
	reader: IFileReader,
): IProjectAnalysis['packageManager'] => {
	// The package-manager rule table lives in
	// `package-manager-rules.ts`; this function is a thin
	// adapter. Adding a manager is a one-line table entry, not
	// an edit to this function.
	return matchPackageManager(reader);
};

const detectTestRunner = (
	deps: Record<string, string>,
	scripts: Record<string, string>,
): IProjectAnalysis['testRunner'] => {
	// The test-runner rule table lives in `test-runner-rules.ts`;
	// this function is a thin adapter. Adding a runner is a
	// one-line table entry, not an edit to this function.
	return matchTestRunner(deps, scripts);
};

/**
 * Pick the scripts worth surfacing to the agent: any role that looks
 * like a quality gate (lint, test, build, typecheck + common aliases)
 * AND anything that doesn't look like a lifecycle hook. The agent
 * uses the picked set to derive `run_<role>` tools and the drift
 * detector uses it to flag new/removed scripts — see drift.ts.
 *
 * The policy (primary roles, aliases, lifecycle blacklist) lives in
 * `script-rules.ts`; this function is pure pipeline.
 */
const pickScripts = (
	scripts: Record<string, string>,
): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const role of QUALITY_ROLES) {
		if (scripts[role] !== undefined) out[role] = scripts[role] as string;
	}
	// Apply role aliases (e.g. `type-check` → `typecheck`).
	for (const [alias, primary] of Object.entries(QUALITY_ROLE_ALIASES)) {
		if (out[primary] === undefined && scripts[alias] !== undefined) {
			out[primary] = scripts[alias] as string;
		}
	}
	// Anything else that isn't a lifecycle hook is potentially a
	// quality gate (e2e, format, docs, dev, start, …) and worth
	// surfacing. This is the source of `run_e2e`, `run_format` etc.
	for (const [role, command] of Object.entries(scripts)) {
		if (isBlacklistedScriptRole(role)) continue;
		if (out[role] !== undefined) continue;
		out[role] = command;
	}
	return out;
};

const detectMonorepoTool = (
	reader: IFileReader,
	pkg: IPackageJson | undefined,
): string | undefined => {
	// The monorepo rule table lives in `monorepo-rules.ts`; this
	// function is a thin adapter. Adding a monorepo tool is a
	// one-line table entry, not an edit to this function.
	return matchMonorepoTool(reader, pkg);
};

const detectLanguage = (
	reader: IFileReader,
	pkg: IPackageJson | undefined,
): IProjectLanguage => {
	// The language rule table lives in `language-rules.ts`; this
	// function is a thin adapter. Adding a language is a one-line
	// table entry, not an edit to this function.
	return matchLanguage(reader, pkg);
};

const detectCi = (reader: IFileReader): readonly string[] => {
	// The CI rule table lives in `ci-rules.ts`; this function is a
	// thin adapter. Adding a CI system is a one-line table entry,
	// not an edit to this function.
	return matchCi(reader);
};

const detectAgentConfigs = (reader: IFileReader): readonly string[] => {
	// The agent-config rule table lives in `agent-config-rules.ts`;
	// this function is a thin adapter. Adding an editor is a
	// one-line table entry, not an edit to this function.
	return matchAgentConfigs(reader);
};

const detectProjectType = (
	reader: IFileReader,
	pkg: IPackageJson | undefined,
	deps: Record<string, string>,
	framework: string | undefined,
	monorepoTool: string | undefined,
): IProjectType => {
	// The actual rule table lives in `project-type-rules.ts`; this
	// function only translates the analysis inputs into the rule
	// context. Adding a new project type is a one-line table entry,
	// not an edit to this function.
	return matchProjectType({
		reader,
		hasBin: pkg?.bin !== undefined,
		hasExports: pkg?.exports !== undefined,
		hasMain: pkg?.main !== undefined,
		framework,
		monorepoTool,
		isGame: detectGame(deps),
	});
};

const detectMcp = (
	reader: IFileReader,
	deps: Record<string, string>,
): { has: boolean; evidence: string[] } => {
	// The MCP-evidence rule table lives in `mcp-evidence-rules.ts`;
	// this function is a thin adapter. Adding a new evidence kind
	// (e.g. a corporate marker file) is a one-line table entry.
	const result = detectMcpEvidence(reader, deps);
	return { has: result.has, evidence: [...result.evidence] };
};

const detectCustomExtraTools = (reader: IFileReader): boolean => {
	// The host-config rule table lives in `host-config-rules.ts`;
	// this function is a thin adapter. The current consumer
	// only needs a boolean; the matcher returns a list of hit
	// ids and we surface "any hit" as `true` for backward
	// compatibility.
	const hits = matchHostConfig(reader);
	return hits.length > 0;
};

const detectCustomVertexConfig = (reader: IFileReader): boolean => {
	// The vertex-config rule table lives in
	// `vertex-config-rules.ts`; this function is a thin adapter.
	// The matcher parses the JSON internally and returns a list
	// of hit ids; the boolean is `any hit` for backward
	// compatibility with the boolean contract this function
	// used to have.
	const hits = matchVertexConfigFromRaw(
		reader.readFile('mcp-vertex.config.json'),
	);
	return hits.length > 0;
};

/**
 * Inspect a project through a read-only reader and produce a structured
 * analysis. Never throws on malformed input — missing or invalid files
 * degrade to `unknown`/`generic` so the recommender always has data.
 */
export const analyzeProject = (reader: IFileReader): IProjectAnalysis => {
	const pkg = safeJson(reader.readFile('package.json'));
	const deps = allDeps(pkg);
	const scripts = pkg?.scripts ?? {};
	const framework = detectFramework(deps);
	const language = detectLanguage(reader, pkg);
	const monorepoTool = detectMonorepoTool(reader, pkg);
	const mcp = detectMcp(reader, deps);
	const hasCustomExtraTools = detectCustomExtraTools(reader);
	const hasCustomVertexConfig = detectCustomVertexConfig(reader);
	const projectType = detectProjectType(
		reader,
		pkg,
		deps,
		framework,
		monorepoTool,
	);
	const ci = detectCi(reader);
	const agentConfigs = detectAgentConfigs(reader);
	const packageManager = detectPackageManager(reader);
	const testRunner = detectTestRunner(deps, scripts);
	const scriptsPicked = pickScripts(scripts);

	const signals = matchSignals({
		analysis: {
			hasPackageJson: pkg !== undefined,
			name: pkg?.name,
			projectType,
			language,
			packageManager,
			framework,
			testRunner,
			monorepoTool,
			hasMcpProject: mcp.has,
			mcpEvidence: mcp.evidence,
			ci,
			agentConfigs,
			scripts: scriptsPicked,
			signals: [],
		},
		hasCustomExtraTools,
		hasCustomVertexConfig,
	});

	return {
		hasPackageJson: pkg !== undefined,
		name: pkg?.name,
		projectType,
		language,
		packageManager,
		framework,
		testRunner,
		monorepoTool,
		hasMcpProject: mcp.has,
		mcpEvidence: mcp.evidence,
		ci,
		agentConfigs,
		scripts: scriptsPicked,
		signals,
	};
};

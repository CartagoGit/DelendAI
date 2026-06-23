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
	if (reader.exists('bun.lock') || reader.exists('bun.lockb')) return 'bun';
	if (reader.exists('pnpm-lock.yaml')) return 'pnpm';
	if (reader.exists('yarn.lock')) return 'yarn';
	if (reader.exists('package-lock.json')) return 'npm';
	return 'unknown';
};

const detectTestRunner = (
	deps: Record<string, string>,
	scripts: Record<string, string>,
): IProjectAnalysis['testRunner'] => {
	if ('vitest' in deps) return 'vitest';
	if ('jest' in deps) return 'jest';
	const testScript = scripts.test ?? '';
	if (/\bvitest\b/.test(testScript)) return 'vitest';
	if (/\bjest\b/.test(testScript)) return 'jest';
	if (/\bbun test\b/.test(testScript)) return 'bun';
	if (/\bnode --test\b/.test(testScript)) return 'node';
	return 'unknown';
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
	if (reader.exists('nx.json')) return 'nx';
	if (reader.exists('turbo.json')) return 'turbo';
	if (reader.exists('pnpm-workspace.yaml')) return 'pnpm-workspaces';
	if (reader.exists('lerna.json')) return 'lerna';
	if (pkg?.workspaces !== undefined) return 'bun/npm-workspaces';
	return undefined;
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
	const evidence: string[] = [];
	if ('@modelcontextprotocol/sdk' in deps) {
		evidence.push('depends on @modelcontextprotocol/sdk');
	}
	for (const path of ['.vscode/mcp.json', 'mcp.json', '.cursor/mcp.json']) {
		if (reader.exists(path)) evidence.push(`found ${path}`);
	}
	for (const path of ['src/server.ts', 'src/mcp-server.ts', 'server.ts']) {
		if (reader.exists(path)) evidence.push(`found ${path}`);
	}
	return { has: evidence.length > 0, evidence };
};

const detectCustomExtraTools = (reader: IFileReader): boolean => {
	const hostConfig =
		reader.readFile('libs/mcp-project/src/lib/shared/host-config.ts') ??
		reader.readFile('src/lib/shared/host-config.ts');
	if (hostConfig === undefined) return false;
	const match = /extraTools\s*:\s*\[([\s\S]*?)\]/m.exec(hostConfig);
	if (match === null) return false;
	const body = match[1] ?? '';
	const withoutComments = body
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/.*$/gm, '');
	const withoutScaffold = withoutComments.replace(
		/buildScaffoldToolRegistration\s*\([\s\S]*?\)\s*,?/g,
		'',
	);
	return /[A-Za-z0-9_$]+\s*\(/.test(withoutScaffold);
};

const detectCustomVertexConfig = (reader: IFileReader): boolean => {
	const raw = reader.readFile('mcp-vertex.config.json');
	if (raw === undefined) return false;
	try {
		const parsed = JSON.parse(raw) as {
			plugins?: unknown;
			validationMatrix?: { scopes?: unknown };
		};
		const plugins =
			parsed.plugins &&
			typeof parsed.plugins === 'object' &&
			!Array.isArray(parsed.plugins)
				? Object.keys(parsed.plugins).length
				: 0;
		const scopes =
			parsed.validationMatrix?.scopes &&
			typeof parsed.validationMatrix.scopes === 'object' &&
			!Array.isArray(parsed.validationMatrix.scopes)
				? Object.keys(parsed.validationMatrix.scopes).length
				: 0;
		return plugins > 0 || scopes > 0;
	} catch {
		return false;
	}
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

	const signals: string[] = [];
	if (pkg === undefined && language === 'unknown') {
		signals.push('no recognised manifest — limited analysis');
	}
	signals.push(
		mcp.has
			? 'an MCP server already exists; recommend augmenting, not replacing'
			: 'no MCP server detected; a fresh one can be scaffolded',
	);
	if (framework !== undefined) signals.push(`web framework: ${framework}`);
	if (monorepoTool !== undefined)
		signals.push(`monorepo tool: ${monorepoTool}`);
	if (language !== 'typescript' && language !== 'javascript') {
		signals.push(`non-JS stack: ${language}`);
	}
	if (agentConfigs.length > 0) {
		signals.push(
			`existing agent config (${agentConfigs.join(', ')}); align with it`,
		);
	}
	if (hasCustomExtraTools) signals.push('host-config has custom extraTools');
	if (hasCustomVertexConfig) {
		signals.push('mcp-vertex.config.json has plugin or validation config');
	}
	if (ci.length > 0) signals.push(`CI: ${ci.join(', ')}`);

	return {
		hasPackageJson: pkg !== undefined,
		name: pkg?.name,
		projectType,
		language,
		packageManager: detectPackageManager(reader),
		framework,
		testRunner: detectTestRunner(deps, scripts),
		monorepoTool,
		hasMcpProject: mcp.has,
		mcpEvidence: mcp.evidence,
		ci,
		agentConfigs,
		scripts: pickScripts(scripts),
		signals,
	};
};

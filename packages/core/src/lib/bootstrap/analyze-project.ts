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

interface IPackageJson {
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

const detectFramework = (deps: Record<string, string>): string | undefined => {
	if ('@angular/core' in deps) return 'angular';
	if ('next' in deps) return 'next';
	if ('react' in deps) return 'react';
	if ('vue' in deps) return 'vue';
	if ('svelte' in deps) return 'svelte';
	if ('solid-js' in deps) return 'solid';
	return undefined;
};

const detectGame = (deps: Record<string, string>): boolean =>
	'phaser' in deps ||
	'three' in deps ||
	'pixi.js' in deps ||
	'babylonjs' in deps;

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

const QUALITY_ROLES = ['lint', 'test', 'build', 'typecheck'] as const;

const pickScripts = (
	scripts: Record<string, string>,
): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const role of QUALITY_ROLES) {
		if (scripts[role] !== undefined) out[role] = scripts[role] as string;
	}
	// common aliases
	if (out.typecheck === undefined && scripts['type-check'] !== undefined) {
		out.typecheck = scripts['type-check'] as string;
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
	if (reader.exists('tsconfig.json') || reader.exists('tsconfig.base.json')) {
		return 'typescript';
	}
	if (pkg !== undefined) return 'javascript';
	if (
		reader.exists('pyproject.toml') ||
		reader.exists('requirements.txt') ||
		reader.exists('setup.py')
	) {
		return 'python';
	}
	if (reader.exists('go.mod')) return 'go';
	if (reader.exists('Cargo.toml')) return 'rust';
	return 'unknown';
};

const detectCi = (reader: IFileReader): string[] => {
	const ci: string[] = [];
	if (reader.listDir('.github/workflows').length > 0)
		ci.push('github-actions');
	if (reader.exists('.gitlab-ci.yml')) ci.push('gitlab-ci');
	if (reader.exists('azure-pipelines.yml')) ci.push('azure-pipelines');
	if (reader.exists('.circleci/config.yml')) ci.push('circleci');
	if (reader.exists('Jenkinsfile')) ci.push('jenkins');
	return ci;
};

const detectAgentConfigs = (reader: IFileReader): string[] => {
	const configs: string[] = [];
	if (reader.exists('CLAUDE.md')) configs.push('CLAUDE.md');
	if (reader.exists('AGENTS.md')) configs.push('AGENTS.md');
	if (reader.exists('.cursorrules') || reader.listDir('.cursor').length > 0) {
		configs.push('cursor');
	}
	if (reader.exists('.github/copilot-instructions.md')) {
		configs.push('copilot-instructions');
	}
	if (reader.listDir('.github/agents').length > 0)
		configs.push('github-agents');
	if (reader.exists('.windsurfrules')) configs.push('windsurf');
	return configs;
};

const detectProjectType = (
	reader: IFileReader,
	pkg: IPackageJson | undefined,
	deps: Record<string, string>,
	framework: string | undefined,
	monorepoTool: string | undefined,
): IProjectType => {
	if (monorepoTool !== undefined) return 'monorepo';
	if (detectGame(deps)) return 'game';
	if (framework !== undefined) return 'webapp';
	if (pkg?.bin !== undefined) return 'cli';
	if (pkg?.exports !== undefined || pkg?.main !== undefined) return 'library';
	// Non-JS stacks.
	if (reader.exists('Cargo.toml')) {
		return reader.exists('src/main.rs') ? 'cli' : 'library';
	}
	if (reader.exists('go.mod')) {
		return reader.exists('main.go') ? 'cli' : 'library';
	}
	if (reader.exists('pyproject.toml') || reader.exists('setup.py')) {
		return 'library';
	}
	return 'generic';
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

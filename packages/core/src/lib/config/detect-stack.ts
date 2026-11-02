/**
 * detect-stack.ts — r00011 S2: pure stack auto-detection.
 *
 * `detectStack(workspaceRoot, deps)` reads injected manifest signals
 * (package.json, requirements.txt, Cargo.toml, go.mod) + a file
 * listing of well-known config files (astro.config.*, next.config.*,
 * nest-cli.json, vite.config.*, prisma/schema.prisma, Cargo.toml,
 * etc.) and produces a ranked list of `IStackRecommendation` so the
 * caller (init, configuration_center) can recommend the matching
 * pack with rationale.
 *
 * Pure: same inputs -> same outputs. No fs, no subprocess. The
 * production deps live in `realStackProbeDeps()`.
 */
import type {
	IDetectedProjectDefaults,
	IDetectedStackPack,
	IStackDetectionResult,
	IStackProbeDeps,
	IStackRecommendation,
} from '../contracts/interfaces/stack-detection.interface';
import {
	containsAny,
	containsAnyPythonDep,
	detectDocsRoots,
	detectLanguageSignals,
	detectLintCommand,
	detectPackageManager,
	detectPrimaryLanguage,
	detectSourceRoots,
	detectTestRunner,
	detectTypecheckCommand,
	extractDeps,
	extractScripts,
	hasAnyDep,
	listDocRootGlobs,
	listManifestFiles,
	listPackageManagerLockfiles,
	listSourceRootCandidates,
} from './detect-stack-defaults.helper';

const MANIFEST_FILES = listManifestFiles();

const WEB_FRAMEWORK_SIGNALS: ReadonlyArray<{
	readonly framework: string;
	readonly dep: string;
}> = [
	{ framework: 'Astro', dep: 'astro' },
	{ framework: 'Next.js', dep: 'next' },
	{ framework: 'Remix', dep: '@remix-run/react' },
	{ framework: 'SvelteKit', dep: '@sveltejs/kit' },
	{ framework: 'Nuxt', dep: 'nuxt' },
	{ framework: 'Vite (web)', dep: 'vite' },
];

const BACKEND_FRAMEWORK_SIGNALS: ReadonlyArray<{
	readonly framework: string;
	readonly dep: string;
}> = [
	{ framework: 'NestJS', dep: '@nestjs/core' },
	{ framework: 'Express', dep: 'express' },
	{ framework: 'Hono', dep: 'hono' },
	{ framework: 'Fastify', dep: 'fastify' },
	{ framework: 'Koa', dep: 'koa' },
];

const CLI_FRAMEWORK_SIGNALS: ReadonlyArray<{
	readonly framework: string;
	readonly dep: string;
}> = [
	{ framework: 'oclif', dep: '@oclif/core' },
	{ framework: 'commander', dep: 'commander' },
	{ framework: 'yargs', dep: 'yargs' },
	{ framework: 'cobra (Go)', dep: 'spf13/cobra' },
	{ framework: 'clap (Rust)', dep: 'clap' },
];

const DATA_SIGNALS: ReadonlyArray<{
	readonly framework: string;
	readonly dep: string;
}> = [
	{ framework: 'Prisma', dep: 'prisma' },
	{ framework: 'Drizzle', dep: 'drizzle-orm' },
	{ framework: 'TypeORM', dep: 'typeorm' },
	{ framework: 'Sequelize', dep: 'sequelize' },
	{ framework: 'SQLAlchemy', dep: 'sqlalchemy' },
	{ framework: 'sqlx (Rust)', dep: 'sqlx' },
];

interface IFileProbes {
	readonly paths: readonly string[];
	readonly hasAstroConfig: boolean;
	readonly hasNextConfig: boolean;
	readonly hasViteConfig: boolean;
	readonly hasPrismaSchema: boolean;
	readonly hasNestCliJson: boolean;
	readonly hasCargoToml: boolean;
	readonly hasGoMod: boolean;
}

const probeFiles = (root: string, deps: IStackProbeDeps): IFileProbes => {
	const list = deps.listFiles(root, [
		'astro.config.{ts,js,mjs}',
		'next.config.{js,ts,mjs}',
		'vite.config.{js,ts,mjs}',
		'tsconfig.json',
		'tsconfig.*.json',
		'prisma/schema.prisma',
		'nest-cli.json',
		'Cargo.toml',
		'go.mod',
		...listPackageManagerLockfiles(),
		...listDocRootGlobs(),
		...listSourceRootCandidates(),
	]);
	const has = (suffix: string): boolean =>
		list.some((p) => p.endsWith(suffix));
	return {
		paths: list,
		hasAstroConfig: list.some((p) => p.includes('astro.config')),
		hasNextConfig: list.some((p) => p.includes('next.config')),
		hasViteConfig: list.some((p) => p.includes('vite.config')),
		hasPrismaSchema: has('prisma/schema.prisma'),
		hasNestCliJson: list.some((p) => p.endsWith('nest-cli.json')),
		hasCargoToml: list.some((p) => p.endsWith('Cargo.toml')),
		hasGoMod: list.some((p) => p.endsWith('go.mod')),
	};
};

interface IAccumulator {
	readonly scores: Map<IDetectedStackPack, number>;
	readonly reasons: Map<IDetectedStackPack, string[]>;
	readonly languages: Set<string>;
	readonly frameworks: Set<string>;
}

const bump = (
	acc: IAccumulator,
	pack: IDetectedStackPack,
	score: number,
	reason: string,
): void => {
	acc.scores.set(pack, (acc.scores.get(pack) ?? 0) + score);
	const list = acc.reasons.get(pack) ?? [];
	list.push(reason);
	acc.reasons.set(pack, list);
};

const finalize = (acc: IAccumulator): IStackDetectionResult => {
	const recs: IStackRecommendation[] = [];
	for (const [pack, score] of acc.scores) {
		if (score <= 0) continue;
		const reasons = acc.reasons.get(pack) ?? [];
		recs.push({
			pack,
			confidence: Math.min(score, 1),
			reasons,
		});
	}
	recs.sort(
		(a, b) => b.confidence - a.confidence || a.pack.localeCompare(b.pack),
	);
	const top =
		recs.length > 0 && recs[0] !== undefined && recs[0].confidence >= 0.4
			? recs[0].pack
			: 'unknown';
	return {
		recommendations: recs,
		top,
		detectedLanguages: [...acc.languages].sort(),
		detectedFrameworks: [...acc.frameworks].sort(),
		defaults: {
			packageManager: 'unknown',
			language: 'unknown',
			testRunner: 'unknown',
			lintCommand: undefined,
			typecheckCommand: undefined,
			docsRoots: [],
			sourceRoots: [],
		},
	};
};

/**
 * Detect the stack pack the workspace most likely belongs to.
 * Pure: same `(workspaceRoot, deps)` -> same result.
 */
export const detectStack = async (
	workspaceRoot: string,
	deps: IStackProbeDeps,
): Promise<IStackDetectionResult> => {
	const acc: IAccumulator = {
		scores: new Map(),
		reasons: new Map(),
		languages: new Set(),
		frameworks: new Set(),
	};

	const pkg = await deps.readJson(`${workspaceRoot}/package.json`);
	const deps_ = extractDeps(pkg);
	const scripts = extractScripts(pkg);

	const webFrameworks = hasAnyDep(deps_, WEB_FRAMEWORK_SIGNALS);
	for (const f of webFrameworks) acc.frameworks.add(f);
	const backendFrameworks = hasAnyDep(deps_, BACKEND_FRAMEWORK_SIGNALS);
	for (const f of backendFrameworks) acc.frameworks.add(f);
	const cliFrameworksJs = hasAnyDep(deps_, CLI_FRAMEWORK_SIGNALS);
	for (const f of cliFrameworksJs) acc.frameworks.add(f);
	const dataFrameworks = hasAnyDep(deps_, DATA_SIGNALS);
	for (const f of dataFrameworks) acc.frameworks.add(f);

	const pyproject = await deps.readText(`${workspaceRoot}/pyproject.toml`);
	const requirements = await deps.readText(
		`${workspaceRoot}/requirements.txt`,
	);
	const pyText = `${pyproject ?? ''}\n${requirements ?? ''}`;
	const pyBackend = containsAnyPythonDep(pyText, [
		{ framework: 'Django', dep: 'django' },
		{ framework: 'Flask', dep: 'flask' },
		{ framework: 'FastAPI', dep: 'fastapi' },
	]);
	for (const f of pyBackend) acc.frameworks.add(f);
	const pyData = containsAnyPythonDep(pyText, [
		{ framework: 'SQLAlchemy', dep: 'sqlalchemy' },
		{ framework: 'pandas', dep: 'pandas' },
		{ framework: 'polars', dep: 'polars' },
	]);
	for (const f of pyData) acc.frameworks.add(f);

	const cargoText = await deps.readText(`${workspaceRoot}/Cargo.toml`);
	const cargoBin =
		(cargoText !== null && containsAny(cargoText, ['[[bin]]'])) ||
		(cargoText !== null && containsAny(cargoText, ['clap', 'structopt']));
	const goModText = await deps.readText(`${workspaceRoot}/go.mod`);
	const goCli =
		goModText !== null && containsAny(goModText, ['cobra', 'urfave/cli']);

	const files = probeFiles(workspaceRoot, deps);
	for (const language of detectLanguageSignals(
		deps_,
		files.paths,
		pyText,
		cargoText,
		goModText,
	)) {
		acc.languages.add(language);
	}
	const packageManager = detectPackageManager(files.paths);
	const language = detectPrimaryLanguage(
		deps_,
		files.paths,
		pyText,
		cargoText,
		goModText,
	);
	const testRunner = detectTestRunner(
		deps_,
		scripts,
		pyText,
		cargoText,
		goModText,
	);
	const docsRoots = detectDocsRoots(files.paths);
	const sourceRoots = detectSourceRoots(files.paths);
	const detectedDefaults: IDetectedProjectDefaults = {
		packageManager,
		language,
		testRunner,
		lintCommand: detectLintCommand(
			scripts,
			packageManager,
			language,
			pyText,
		),
		typecheckCommand: detectTypecheckCommand(
			scripts,
			packageManager,
			language,
			pyText,
			cargoText,
			goModText,
		),
		docsRoots,
		sourceRoots,
	};

	// Web-app signals
	if (
		webFrameworks.length > 0 ||
		files.hasAstroConfig ||
		files.hasNextConfig ||
		files.hasViteConfig
	) {
		bump(acc, 'web-app', 0.6, 'web framework or web config file detected');
		if (webFrameworks.includes('Astro') || files.hasAstroConfig) {
			bump(acc, 'web-app', 0.3, 'Astro detected');
		}
		if (webFrameworks.includes('Next.js') || files.hasNextConfig) {
			bump(acc, 'web-app', 0.3, 'Next.js detected');
		}
		if (webFrameworks.includes('SvelteKit')) {
			bump(acc, 'web-app', 0.3, 'SvelteKit detected');
		}
	}

	// Backend-api signals
	if (
		backendFrameworks.length > 0 ||
		files.hasNestCliJson ||
		pyBackend.length > 0 ||
		dataFrameworks.length > 0 ||
		files.hasPrismaSchema
	) {
		bump(acc, 'backend-api', 0.5, 'backend framework or schema detected');
		if (backendFrameworks.includes('NestJS') || files.hasNestCliJson) {
			bump(acc, 'backend-api', 0.3, 'NestJS detected');
		}
		if (backendFrameworks.includes('Express')) {
			bump(acc, 'backend-api', 0.2, 'Express detected');
		}
		if (backendFrameworks.includes('Hono')) {
			bump(acc, 'backend-api', 0.2, 'Hono detected');
		}
		if (files.hasPrismaSchema || dataFrameworks.length > 0) {
			bump(acc, 'backend-api', 0.2, 'ORM / Prisma schema detected');
		}
	}

	// CLI-tool signals
	const cliSignals =
		cliFrameworksJs.length > 0 ||
		cargoBin ||
		goCli ||
		cargoText?.includes('[[bin]]');
	if (cliSignals) {
		bump(acc, 'cli-tool', 0.5, 'CLI framework or bin target detected');
		if (
			cliFrameworksJs.includes('oclif') ||
			cliFrameworksJs.includes('commander')
		) {
			bump(acc, 'cli-tool', 0.3, 'JS CLI framework detected');
		}
		if (cargoBin) {
			bump(acc, 'cli-tool', 0.3, 'Rust bin target detected');
		}
		if (goCli) {
			bump(acc, 'cli-tool', 0.3, 'Go CLI framework detected');
		}
	}

	// Library: ts-only with no web/backend/cli signals
	if (
		webFrameworks.length === 0 &&
		backendFrameworks.length === 0 &&
		cliFrameworksJs.length === 0 &&
		pyBackend.length === 0 &&
		Object.keys(deps_).length > 0 &&
		!files.hasNextConfig &&
		!files.hasAstroConfig &&
		!files.hasViteConfig &&
		!files.hasNestCliJson
	) {
		bump(acc, 'library', 0.4, 'TS/JS package with no runtime framework');
	}

	// Monorepo: workspaces field or packages/ dir
	const workspaces = (pkg as { workspaces?: unknown } | null)?.workspaces;
	const listForMono = deps.listFiles(workspaceRoot, [
		'packages/*/package.json',
		'apps/*/package.json',
	]);
	if (workspaces !== undefined || listForMono.length > 1) {
		bump(acc, 'monorepo', 0.6, 'monorepo layout detected');
	}

	// Data: dominant ORM/dwh signals
	if (
		dataFrameworks.length > 0 ||
		pyData.length > 0 ||
		(Object.keys(deps_).length > 0 &&
			files.hasPrismaSchema &&
			webFrameworks.length === 0 &&
			backendFrameworks.length === 0)
	) {
		bump(acc, 'data', 0.4, 'data / ORM stack detected');
	}

	// Security-hardened is reserved for a future slice that consumes
	// `detectStack` output + lint findings; we do not bump it here so
	// the recommendation set always reflects concrete signals.

	const result = finalize(acc);
	return {
		...result,
		defaults: detectedDefaults,
	};
};

export { MANIFEST_FILES };

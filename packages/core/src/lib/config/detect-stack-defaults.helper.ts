import { runnerFor } from '../bootstrap/package-runners';
import type {
	IDetectedLanguage,
	IDetectedPackageManager,
	IDetectedTestRunner,
} from '../contracts/interfaces/stack-detection.interface';

interface IPackageJson {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly scripts?: Readonly<Record<string, string>>;
}

const PACKAGE_MANAGER_LOCKFILES = [
	'bun.lock',
	'bun.lockb',
	'pnpm-lock.yaml',
	'yarn.lock',
	'package-lock.json',
] as const;

const MANIFEST_FILES = [
	'package.json',
	'requirements.txt',
	'pyproject.toml',
	'Cargo.toml',
	'go.mod',
	'composer.json',
] as const;

const DOC_ROOT_GLOBS = [
	'README.md',
	'docs',
	'docs/*',
	'doc',
	'doc/*',
	'documentation',
	'documentation/*',
] as const;

const SOURCE_ROOT_CANDIDATES = [
	'packages',
	'plugins',
	'apps',
	'libs',
	'services',
	'src',
	'extensions',
	'tools',
] as const;

const LINT_SCRIPT_KEYS = ['lint'] as const;

const TYPECHECK_SCRIPT_KEYS = [
	'typecheck',
	'type-check',
	'check-types',
	'types',
] as const;

export const extractDeps = (pkg: unknown): Record<string, string> => {
	if (pkg === null || typeof pkg !== 'object') return {};
	const obj = pkg as Partial<IPackageJson>;
	const out: Record<string, string> = {};
	if (obj.dependencies !== undefined) {
		Object.assign(out, obj.dependencies);
	}
	if (obj.devDependencies !== undefined) {
		Object.assign(out, obj.devDependencies);
	}
	return out;
};

export const extractScripts = (pkg: unknown): Record<string, string> => {
	if (pkg === null || typeof pkg !== 'object') return {};
	const obj = pkg as Partial<IPackageJson>;
	return obj.scripts === undefined ? {} : { ...obj.scripts };
};

export const hasAnyDep = (
	deps: Readonly<Record<string, string>>,
	signals: ReadonlyArray<{
		readonly framework: string;
		readonly dep: string;
	}>,
): readonly string[] => {
	const matched: string[] = [];
	for (const { framework, dep } of signals) {
		if (Object.hasOwn(deps, dep)) matched.push(framework);
	}
	return matched;
};

export const containsAnyPythonDep = (
	text: string,
	signals: ReadonlyArray<{
		readonly framework: string;
		readonly dep: string;
	}>,
): readonly string[] => {
	const matched: string[] = [];
	const lower = text.toLowerCase();
	for (const { framework, dep } of signals) {
		if (lower.includes(dep.toLowerCase())) matched.push(framework);
	}
	return matched;
};

export const containsAny = (
	text: string,
	needles: readonly string[],
): boolean => {
	const lower = text.toLowerCase();
	return needles.some((needle) => lower.includes(needle.toLowerCase()));
};

const unique = (values: readonly string[]): readonly string[] => [
	...new Set(values),
];

export const listPackageManagerLockfiles = (): readonly string[] =>
	PACKAGE_MANAGER_LOCKFILES;

export const listManifestFiles = (): readonly string[] => MANIFEST_FILES;

export const listDocRootGlobs = (): readonly string[] => DOC_ROOT_GLOBS;

export const listSourceRootCandidates = (): readonly string[] =>
	SOURCE_ROOT_CANDIDATES;

export const detectPackageManager = (
	paths: readonly string[],
): IDetectedPackageManager => {
	if (paths.includes('bun.lock') || paths.includes('bun.lockb')) return 'bun';
	if (paths.includes('pnpm-lock.yaml')) return 'pnpm';
	if (paths.includes('yarn.lock')) return 'yarn';
	if (paths.includes('package-lock.json')) return 'npm';
	return 'unknown';
};

export const detectPrimaryLanguage = (
	deps: Readonly<Record<string, string>>,
	paths: readonly string[],
	pyText: string,
	cargoText: string | null,
	goModText: string | null,
): IDetectedLanguage => {
	if (cargoText !== null) return 'rust';
	if (goModText !== null) return 'go';
	if (pyText.trim().length > 0) return 'python';
	const hasTsSignals =
		Object.hasOwn(deps, 'typescript') ||
		paths.some(
			(path) =>
				path.endsWith('tsconfig.json') || path.includes('tsconfig.'),
		);
	if (hasTsSignals) return 'typescript';
	if (Object.keys(deps).length > 0) return 'javascript';
	return 'unknown';
};

export const detectLanguageSignals = (
	deps: Readonly<Record<string, string>>,
	paths: readonly string[],
	pyText: string,
	cargoText: string | null,
	goModText: string | null,
): readonly string[] => {
	const out: string[] = [];
	const primary = detectPrimaryLanguage(
		deps,
		paths,
		pyText,
		cargoText,
		goModText,
	);
	if (primary !== 'unknown') out.push(primary);
	return out;
};

export const detectTestRunner = (
	deps: Readonly<Record<string, string>>,
	scripts: Readonly<Record<string, string>>,
	pyText: string,
	cargoText: string | null,
	goModText: string | null,
): IDetectedTestRunner => {
	if (Object.hasOwn(deps, 'vitest')) return 'vitest';
	if (Object.hasOwn(deps, 'jest')) return 'jest';
	const testScript = scripts.test ?? '';
	if (/\bvitest\b/.test(testScript)) return 'vitest';
	if (/\bjest\b/.test(testScript)) return 'jest';
	if (/\bbun test\b/.test(testScript)) return 'bun';
	if (/\bnode --test\b/.test(testScript)) return 'node';
	if (containsAny(pyText, ['pytest'])) return 'pytest';
	if (cargoText !== null) return 'cargo-test';
	if (goModText !== null) return 'go-test';
	return 'unknown';
};

export const detectDocsRoots = (
	paths: readonly string[],
): readonly string[] => {
	const out: string[] = [];
	for (const base of ['docs', 'doc', 'documentation']) {
		const scoped = paths
			.filter((path) => path.startsWith(`${base}/`))
			.sort((a, b) => a.localeCompare(b));
		if (scoped.length > 0) {
			out.push(...scoped);
			continue;
		}
		if (paths.includes(base)) out.push(base);
	}
	if (paths.includes('README.md')) out.push('README.md');
	return unique(out);
};

export const detectSourceRoots = (
	paths: readonly string[],
): readonly string[] =>
	SOURCE_ROOT_CANDIDATES.filter((root) => paths.includes(root));

const resolveScriptCommand = (
	scripts: Readonly<Record<string, string>>,
	keys: readonly string[],
	packageManager: IDetectedPackageManager,
): string | undefined => {
	for (const key of keys) {
		if (scripts[key] === undefined) continue;
		return packageManager === 'unknown'
			? scripts[key]
			: `${runnerFor(packageManager)} ${key}`;
	}
	return undefined;
};

export const detectLintCommand = (
	scripts: Readonly<Record<string, string>>,
	packageManager: IDetectedPackageManager,
	primaryLanguage: IDetectedLanguage,
	pyText: string,
): string | undefined => {
	const scriptCommand = resolveScriptCommand(
		scripts,
		LINT_SCRIPT_KEYS,
		packageManager,
	);
	if (scriptCommand !== undefined) return scriptCommand;
	if (primaryLanguage === 'python' && containsAny(pyText, ['ruff'])) {
		return 'ruff check .';
	}
	return undefined;
};

export const detectTypecheckCommand = (
	scripts: Readonly<Record<string, string>>,
	packageManager: IDetectedPackageManager,
	primaryLanguage: IDetectedLanguage,
	pyText: string,
	cargoText: string | null,
	goModText: string | null,
): string | undefined => {
	const scriptCommand = resolveScriptCommand(
		scripts,
		TYPECHECK_SCRIPT_KEYS,
		packageManager,
	);
	if (scriptCommand !== undefined) return scriptCommand;
	if (primaryLanguage === 'python' && containsAny(pyText, ['mypy'])) {
		return 'mypy .';
	}
	if (cargoText !== null) return 'cargo check';
	if (goModText !== null) return 'go test ./...';
	return undefined;
};

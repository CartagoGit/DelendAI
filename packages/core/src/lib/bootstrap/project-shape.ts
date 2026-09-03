import type {
	IProjectShape,
	TProjectRole,
	TWorkspaceShape,
} from '@mcp-vertex/contracts';

import type { IFileReader, IPackageJson } from './analyze-project';
import { matchProjectRoles } from './role-rules';

/** Inputs shared by the workspace and role detectors. */
export interface IProjectShapeContext {
	readonly reader: IFileReader;
	readonly packageJson?: IPackageJson;
	readonly dependencies: Readonly<Record<string, string>>;
}

export interface IWorkspaceShapeRule {
	readonly result: TWorkspaceShape;
	readonly priority: number;
	readonly matches: (ctx: IProjectShapeContext) => Promise<boolean> | boolean;
}

const WORKSPACE_MARKERS = [
	'nx.json',
	'turbo.json',
	'pnpm-workspace.yaml',
	'lerna.json',
	'workspace.yaml',
] as const;

const SOURCE_ROOTS = [
	'packages',
	'plugins',
	'apps',
	'libs',
	'services',
	'extensions',
] as const;

const LANGUAGE_MANIFESTS = [
	'package.json',
	'pyproject.toml',
	'requirements.txt',
	'Cargo.toml',
	'go.mod',
] as const;

const hasWorkspaceMarker = async (reader: IFileReader): Promise<boolean> => {
	for (const marker of WORKSPACE_MARKERS) {
		if (await reader.exists(marker)) return true;
	}
	return false;
};

const hasWorkspaceRoot = async (reader: IFileReader): Promise<boolean> => {
	for (const root of SOURCE_ROOTS) {
		if ((await reader.listDir(root)).length > 0) return true;
	}
	return false;
};

const manifestCount = async (reader: IFileReader): Promise<number> => {
	let count = 0;
	for (const manifest of LANGUAGE_MANIFESTS) {
		if (await reader.exists(manifest)) count += 1;
	}
	return count;
};

/**
 * Workspace shape is deliberately separate from project roles. A monorepo
 * can contain a web client, an API, a library and a CLI simultaneously.
 */
export const DEFAULT_WORKSPACE_SHAPE_RULES: readonly IWorkspaceShapeRule[] = [
	{
		result: 'monorepo',
		priority: 100,
		matches: async ({ reader, packageJson }) =>
			packageJson?.workspaces !== undefined ||
			(await hasWorkspaceMarker(reader)) ||
			(await hasWorkspaceRoot(reader)),
	},
	{
		result: 'polyglot-workspace',
		priority: 90,
		matches: async ({ reader }) => (await manifestCount(reader)) > 1,
	},
	{
		result: 'single-package',
		priority: 10,
		matches: async ({ reader }) =>
			(await manifestCount(reader)) === 1 ||
			(await reader.exists('package.json')),
	},
];

export const detectWorkspaceShape = async (
	ctx: IProjectShapeContext,
	rules: readonly IWorkspaceShapeRule[] = DEFAULT_WORKSPACE_SHAPE_RULES,
): Promise<TWorkspaceShape> => {
	for (const rule of [...rules].sort((a, b) => b.priority - a.priority)) {
		if (await rule.matches(ctx)) return rule.result;
	}
	return 'unknown';
};

/** Alias kept parallel with the other bootstrap rule-table matchers. */
export const matchWorkspaceShape = detectWorkspaceShape;

const parsePackageJson = (
	raw: string | undefined,
): IPackageJson | undefined => {
	if (raw === undefined) return undefined;
	try {
		return JSON.parse(raw) as IPackageJson;
	} catch {
		return undefined;
	}
};

const packageDependencies = (
	packageJson: IPackageJson | undefined,
): Readonly<Record<string, string>> => ({
	...(packageJson?.dependencies ?? {}),
	...(packageJson?.devDependencies ?? {}),
});

/** Build the canonical shape from an injected, workspace-contained reader. */
/**
 * `packageJson` is passed in rather than read here. Every caller has
 * already parsed it, and re-reading turned one shared bootstrap analysis
 * into three reads of the same file — a regression `plan-tool.spec.ts`
 * catches by counting them. Omit it only when there is genuinely nothing
 * parsed yet.
 */
export const buildProjectShape = async (
	reader: IFileReader,
	packageJson?: IPackageJson | undefined,
): Promise<IProjectShape> => {
	const context: IProjectShapeContext = {
		reader,
		...(packageJson === undefined ? {} : { packageJson }),
		dependencies: packageDependencies(packageJson),
	};
	return {
		workspace: await detectWorkspaceShape(context),
		roles: await matchProjectRoles(context),
	};
};

/** Name used by detector-oriented callers; both names share one pipeline. */
export const detectProjectShape = buildProjectShape;

/** Type-only convenience for consumers that need to name role values. */
export type { IProjectShape, TProjectRole, TWorkspaceShape };

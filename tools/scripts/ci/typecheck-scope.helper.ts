/**
 * typecheck-scope.helper.ts — which workspaces a change can move what `tsc`
 * concludes about, and the root project narrowed to them.
 *
 * A type error surfaces in the file that consumes the change, so the bound is
 * the workspaces the change touches and every workspace that depends on one of
 * them, transitively, by its declared `@delendai/*` dependencies
 * (`lint:workspace-deps-declared` keeps those declarations true). The narrowed
 * project extends the root one and keeps its `include` patterns, restricted to
 * those workspaces, so each file is checked under the same options it always
 * was. A change the workspaces cannot describe (a root manifest, the lockfile,
 * a root tsconfig) checks everything; so does a run with no change list.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One workspace: its directory and the workspace names it depends on. */
export interface ITypecheckWorkspace {
	readonly dir: string;
	readonly name: string;
	readonly dependsOn: readonly string[];
}

/** What the typecheck covers for a change, and why. */
export type ITypecheckScope =
	| { readonly full: true; readonly why: string }
	| {
			readonly full: false;
			/** Each workspace checked, with the reason it is. */
			readonly workspaces: readonly {
				readonly dir: string;
				readonly why: string;
			}[];
			/** Root `include` patterns restricted to those workspaces. */
			readonly include: readonly string[];
			/** Whether `tools/tsconfig.json` has to run. */
			readonly tools: boolean;
	  };

/** Root files whose change can move every compilation. */
const EVERYTHING =
	/^(package\.json|bun\.lock|bunfig\.toml|tsconfig[^/]*\.json|[^/]+\.d\.ts)$/u;

/** The workspace holding `file`, the longest directory that prefixes it. */
const workspaceOf = (
	file: string,
	workspaces: readonly ITypecheckWorkspace[],
): ITypecheckWorkspace | undefined =>
	workspaces
		.filter((each) => file.startsWith(`${each.dir}/`))
		.sort((a, b) => b.dir.length - a.dir.length)[0];

/**
 * The root `include` patterns that describe `dir`, made concrete for it:
 * the `packages/<any>/src` pattern, for `packages/core`, is `packages/core/src`. Pure.
 */
export const includeFor = (
	dir: string,
	rootInclude: readonly string[],
): readonly string[] => {
	const dirParts = dir.split('/');
	return rootInclude.flatMap((pattern) => {
		const parts = pattern.split('/');
		const head = parts.slice(0, dirParts.length);
		const fits = head.every(
			(part, index) => part === '*' || part === dirParts[index],
		);
		return fits && parts.length > dirParts.length
			? [[...dirParts, ...parts.slice(dirParts.length)].join('/')]
			: [];
	});
};

/** The typecheck scope of a change. Pure. */
export const typecheckScopeOf = (input: {
	readonly changed: readonly string[];
	readonly workspaces: readonly ITypecheckWorkspace[];
	readonly rootInclude: readonly string[];
}): ITypecheckScope => {
	if (input.changed.length === 0) {
		return {
			full: true,
			why: 'no change list (a push, a dispatch or an unreadable diff): every project is checked',
		};
	}
	const root = input.changed.find((file) => EVERYTHING.test(file));
	if (root !== undefined) {
		return {
			full: true,
			why: `${root} changed, which every compilation reads`,
		};
	}
	const why = new Map<string, string>();
	const extra: string[] = [];
	for (const file of input.changed) {
		if (file.endsWith('.md')) continue;
		const owner = workspaceOf(file, input.workspaces);
		if (owner !== undefined) {
			if (!why.has(owner.dir)) why.set(owner.dir, `${file} changed`);
			continue;
		}
		// A root include outside every workspace (`scripts/**`).
		for (const pattern of input.rootInclude) {
			const fixed = pattern.slice(0, pattern.indexOf('*'));
			if (fixed.length > 0 && file.startsWith(fixed)) extra.push(pattern);
		}
	}
	// Dependents, transitively, through the declared dependencies.
	const byName = new Map(input.workspaces.map((each) => [each.name, each]));
	let grew = true;
	while (grew) {
		grew = false;
		for (const each of input.workspaces) {
			if (why.has(each.dir)) continue;
			const reached = each.dependsOn.find((name) => {
				const dep = byName.get(name);
				return dep !== undefined && why.has(dep.dir);
			});
			if (reached !== undefined) {
				why.set(each.dir, `depends on ${reached}`);
				grew = true;
			}
		}
	}
	const workspaces = input.workspaces
		.filter((each) => why.has(each.dir))
		.map((each) => ({ dir: each.dir, why: why.get(each.dir) ?? '' }));
	const include = [
		...new Set([
			...workspaces.flatMap((each) =>
				includeFor(each.dir, input.rootInclude),
			),
			...extra,
		]),
	];
	return {
		full: false,
		workspaces,
		include,
		tools: workspaces.some(
			(each) => each.dir === 'tools' || each.dir.startsWith('tools/'),
		),
	};
};

/** Every declared workspace with its `@delendai/*`-style dependencies. */
export const readWorkspaces = (
	rootDir: string,
): readonly ITypecheckWorkspace[] => {
	const manifest = JSON.parse(
		readFileSync(join(rootDir, 'package.json'), 'utf8'),
	) as { readonly workspaces?: readonly string[] };
	const dirs = (manifest.workspaces ?? []).flatMap((glob) => {
		if (!glob.endsWith('/*')) return [glob];
		const base = glob.slice(0, -2);
		const abs = join(rootDir, base);
		if (!existsSync(abs)) return [];
		return readdirSync(abs, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => `${base}/${entry.name}`);
	});
	return dirs.flatMap((dir) => {
		const path = join(rootDir, dir, 'package.json');
		if (!existsSync(path)) return [];
		const pkg = JSON.parse(readFileSync(path, 'utf8')) as {
			readonly name?: string;
			readonly dependencies?: Record<string, string>;
			readonly devDependencies?: Record<string, string>;
			readonly peerDependencies?: Record<string, string>;
			readonly optionalDependencies?: Record<string, string>;
		};
		return [
			{
				dir,
				name: pkg.name ?? dir,
				dependsOn: [
					...Object.keys(pkg.dependencies ?? {}),
					...Object.keys(pkg.devDependencies ?? {}),
					...Object.keys(pkg.peerDependencies ?? {}),
					...Object.keys(pkg.optionalDependencies ?? {}),
				],
			},
		];
	});
};

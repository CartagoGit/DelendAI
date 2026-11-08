/**
 * test-scope.ts — which specs an agent runs for a change, by setting.
 *
 * The default is `touched`: a changed spec, the spec that mirrors a changed
 * source, and a spec that imports a changed file directly. Nothing reached
 * through another module runs unless the project asks, in `delendai.config.json`:
 *
 *   "testing": { "scope": "touched" | "reach" | "all" }
 *
 * Each scope adds what a change to the shared test setup reaches
 * (`test-infrastructure`): no spec imports a setup file or a config.
 *
 * `reach` adds what the symbol analysis reaches (`affected-specs.service`)
 * and the specs that read a changed file; `all` runs every tracked spec.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parseJsonc } from '@delendai/core/cli';

import {
	createResolver,
	factsOf,
	setupFilesAt,
	testInfrastructureSpecsOf,
} from './affected-specs.service';
import { exportDelta, type IExportDelta } from './export-delta';

export const TEST_SCOPES = ['touched', 'reach', 'all'] as const;
export type ITestScope = (typeof TEST_SCOPES)[number];

export const DEFAULT_TEST_SCOPE: ITestScope = 'touched';

/** The scope a parsed config asks for; anything else is the default. */
export const testScopeOf = (config: unknown): ITestScope => {
	const scope = (config as { testing?: { scope?: unknown } } | null)?.testing
		?.scope;
	return TEST_SCOPES.find((known) => known === scope) ?? DEFAULT_TEST_SCOPE;
};

/** The scope `delendai.config.json` under `root` asks for. */
export const readTestScope = (root: string): ITestScope => {
	try {
		return testScopeOf(
			parseJsonc(readFileSync(join(root, 'delendai.config.json'), 'utf8'))
				.value,
		);
	} catch {
		return DEFAULT_TEST_SCOPE;
	}
};

const SPEC = /\.(?:spec|test)\.tsx?$/u;
const stemOf = (path: string): string =>
	(path.split('/').pop() ?? path).replace(/(?:\.(?:spec|test))?\.tsx?$/u, '');
const workspaceOf = (path: string): string =>
	path.split('/').slice(0, 2).join('/');
/** `pkg/src/lib` to `pkg/tests/src/lib`, the repo's mirrored spec folder. */
const mirrorDirOf = (dir: string): string =>
	dir.replace(/^([^/]+\/[^/]+)\/src(?=\/|$)/u, '$1/tests/src');

/** The specs that mirror one source file: same folder or mirrored folder first. */
const mirrorsOf = (
	source: string,
	specs: readonly string[],
): readonly string[] => {
	const stem = stemOf(source);
	const named = specs.filter((spec) => stemOf(spec) === stem);
	const dir = dirname(source);
	const exact = named.filter(
		(spec) => dirname(spec) === dir || dirname(spec) === mirrorDirOf(dir),
	);
	if (exact.length > 0 || stem === 'index') return exact;
	return named.filter((spec) => workspaceOf(spec) === workspaceOf(source));
};

/** How a changed re-export file's delta and a spec's imports are told apart. */
export interface ISymbolView {
	/** The names a changed file's export moved; `undefined`: not a re-export file. */
	readonly deltaOf: (file: string) => IExportDelta | undefined;
	/** The names a spec imports from `target`; `*` for all of it. */
	readonly namesOf: (spec: string, target: string) => readonly string[] | '*';
}

/** Whether a spec asks for a name that moved in `target`. */
const asksForMoved = (
	spec: string,
	target: string,
	symbols: ISymbolView | undefined,
): boolean => {
	const delta = symbols?.deltaOf(target);
	if (symbols === undefined || delta === undefined || delta === '*')
		return true;
	const names = symbols.namesOf(spec, target);
	return names === '*' || names.some((name) => delta.has(name));
};

/**
 * The touched specs, from the changed paths, every tracked spec and the files
 * each spec imports. A changed re-export file (a barrel) selects only the
 * specs that import a name whose export moved. Sorted, without duplicates. Pure.
 */
export const touchedSpecs = (
	changed: readonly string[],
	specs: readonly string[],
	importsOf: (spec: string) => readonly string[],
	symbols?: ISymbolView,
): readonly string[] => {
	const out = new Set<string>();
	const known = new Set(specs);
	const sources = changed.filter(
		(file) => !SPEC.test(file) && /\.tsx?$/u.test(file),
	);
	for (const file of changed) if (known.has(file)) out.add(file);
	for (const source of sources)
		for (const spec of mirrorsOf(source, specs)) out.add(spec);
	const touchedSources = new Set(sources);
	for (const spec of specs)
		if (
			importsOf(spec).some(
				(target) =>
					touchedSources.has(target) &&
					asksForMoved(spec, target, symbols),
			)
		)
			out.add(spec);
	return [...out].sort();
};

/**
 * The touched specs of a repository as git has it, with the specs a change
 * to the shared test setup reaches.
 */
export const touchedSpecsOf = (
	root: string,
	changed: readonly string[],
	tracked: readonly string[],
	paths: Readonly<Record<string, readonly string[]>>,
	/** A file's text at the base of the change; absent, a barrel selects every importer. */
	baseText?: (file: string) => string | undefined,
): readonly string[] => {
	const files = new Set(tracked.filter((file) => /\.tsx?$/u.test(file)));
	const resolve = createResolver(files, paths);
	const read = (file: string): string =>
		readFileSync(join(root, file), 'utf8');
	const factsBySpec = new Map<string, ReturnType<typeof factsOf>>();
	const importsFacts = (spec: string): ReturnType<typeof factsOf> => {
		const cached = factsBySpec.get(spec);
		if (cached !== undefined) return cached;
		const facts = factsOf(read(spec), (specifier) =>
			resolve(spec, specifier),
		);
		factsBySpec.set(spec, facts);
		return facts;
	};
	const symbols: ISymbolView | undefined =
		baseText === undefined
			? undefined
			: {
					deltaOf: (file) => {
						try {
							return exportDelta(
								baseText(file),
								read(file),
								(specifier) => resolve(file, specifier),
							);
						} catch {
							// A deleted or unreadable file: every importer is affected.
							return undefined;
						}
					},
					namesOf: (spec, target) => {
						const asked = importsFacts(spec)
							.imports.filter((each) => each.target === target)
							.map((each) => each.names);
						return asked.includes('*') ? '*' : asked.flat();
					},
				};
	return [
		...new Set([
			...touchedSpecs(
				changed,
				[...files].filter((file) => SPEC.test(file)),
				(spec) =>
					importsFacts(spec).imports.map(({ target }) => target),
				symbols,
			),
			...testInfrastructureSpecsOf({
				files: tracked,
				changed,
				read,
				paths,
				setupFiles: setupFilesAt(root, tracked),
			}),
		]),
	].sort();
};

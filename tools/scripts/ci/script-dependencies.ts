/**
 * script-dependencies.ts — does this command need `node_modules`?
 *
 * WHY a question worth a module: a CI job that installs Bun but never
 * runs `bun install` works perfectly for every script whose import graph
 * stays inside the repository and `node:*`, and dies with `Cannot find
 * module` the first time one reaches a package. Nothing in the YAML
 * tells the two apart — the difference lives in the imports of the file
 * the step runs, and of every file THAT imports. So the answer is read
 * from there.
 *
 * Measured failure: `keep-the-queue-moving` reaped merged refs with a
 * script whose graph reaches `@delendai/core` and, through it,
 * `@modelcontextprotocol/sdk`. The job had checkout and Bun and no
 * install. Its run went red, the merged ref was never deleted, and the
 * operator saw a spent branch linger on the forge and in every clone.
 *
 * Pure over two readers, so the rule is pinned by cases rather than by
 * a repository layout.
 */

import { dirname, join, normalize } from 'node:path';

export interface IScriptDependencyReaders {
	/** The body of a `package.json` script, or undefined. */
	readonly scriptOf: (name: string) => string | undefined;
	/** A repo-relative file's source, or undefined when it does not exist. */
	readonly readSource: (path: string) => string | undefined;
	/**
	 * The `tsconfig` path aliases, as `compilerOptions.paths` states them.
	 *
	 * Needed because a bare specifier is not always a package. Bun honours
	 * `paths`, so `@delendai/core/lib/...` resolves to a source file in
	 * this checkout with no install at all — which is exactly how the
	 * import-lean protection guard runs in CI. Treating every bare
	 * specifier as a package would demand an install that job was
	 * deliberately built not to need.
	 */
	readonly aliases?: Readonly<Record<string, readonly string[]>> | undefined;
}

/**
 * The repo-relative target an alias maps a specifier to, or undefined
 * when no alias covers it. An exact key wins over a wildcard, and a
 * longer wildcard prefix over a shorter one — the order TypeScript and
 * Bun both use.
 */
export const aliasTarget = (
	aliases: Readonly<Record<string, readonly string[]>>,
	specifier: string,
): string | undefined => {
	const clean = (target: string): string => target.replace(/^\.\//u, '');
	const exact = aliases[specifier]?.[0];
	if (exact !== undefined) return clean(exact);
	let best: { readonly prefix: string; readonly target: string } | undefined;
	for (const [key, targets] of Object.entries(aliases)) {
		if (!key.endsWith('/*')) continue;
		const prefix = key.slice(0, -1);
		const target = targets[0];
		if (target === undefined || !specifier.startsWith(prefix)) continue;
		if (best === undefined || prefix.length > best.prefix.length)
			best = { prefix, target };
	}
	if (best === undefined) return undefined;
	return clean(best.target.replace('*', specifier.slice(best.prefix.length)));
};

/** Specifiers the runtime ships: never a reason to install. */
const BUILTIN_RE = /^(?:node|bun):/u;

/** `bun run <name>`, in command position. */
const BUN_RUN_RE =
	/(?:^|[\n;&|(])[ \t]*bun[ \t]+run[ \t]+([A-Za-z0-9:_./-]+)/gu;

/** `bun <file>.ts|.js|.mjs|.cjs`, in command position. */
const BUN_FILE_RE =
	/(?:^|[\n;&|(])[ \t]*bun[ \t]+(?:--[A-Za-z-]+[ \t]+)*(\.?\/?[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs|cjs))\b/gu;

/** Every static, dynamic and CommonJS specifier in a source file. */
const SPECIFIER_RE =
	/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu;

const RESOLUTION_SUFFIXES: readonly string[] = [
	'',
	'.ts',
	'.tsx',
	'.js',
	'/index.ts',
	'/index.js',
];

/** Strip comments so an example import in prose is not an import. */
const withoutComments = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

export const specifiersIn = (source: string): readonly string[] =>
	[...withoutComments(source).matchAll(SPECIFIER_RE)].map(
		(match) => match[1] ?? '',
	);

const resolveWithSuffixes = (
	base: string,
	readers: IScriptDependencyReaders,
): string | undefined => {
	for (const suffix of RESOLUTION_SUFFIXES) {
		const candidate = `${base}${suffix}`;
		if (readers.readSource(candidate) !== undefined) return candidate;
	}
	return undefined;
};

const resolveRelative = (
	from: string,
	specifier: string,
	readers: IScriptDependencyReaders,
): string | undefined =>
	resolveWithSuffixes(normalize(join(dirname(from), specifier)), readers);

/**
 * True when the file, or anything it reaches through relative imports,
 * imports a package. A file that cannot be read contributes nothing:
 * whether it exists at all is the checkout rule's question, and
 * guessing "yes" here would turn every generated path into a finding.
 */
export const fileNeedsInstall = (
	entry: string,
	readers: IScriptDependencyReaders,
	seen: Set<string> = new Set(),
): boolean => {
	const path = normalize(entry.replace(/^\.\//u, ''));
	if (seen.has(path)) return false;
	seen.add(path);
	const source = readers.readSource(path);
	if (source === undefined) return false;
	for (const specifier of specifiersIn(source)) {
		if (BUILTIN_RE.test(specifier)) continue;
		if (!specifier.startsWith('.')) {
			// An alias is a file in this checkout, walked like any other.
			// An alias whose target is missing is left to the resolver to
			// report; only a specifier no alias covers is a package.
			const aliased =
				readers.aliases === undefined
					? undefined
					: aliasTarget(readers.aliases, specifier);
			if (aliased === undefined) return true;
			const file = resolveWithSuffixes(normalize(aliased), readers);
			if (file !== undefined && fileNeedsInstall(file, readers, seen))
				return true;
			continue;
		}
		const next = resolveRelative(path, specifier, readers);
		if (next !== undefined && fileNeedsInstall(next, readers, seen))
			return true;
	}
	return false;
};

/**
 * True when running `command` would load a package: directly through a
 * script file, or through a `bun run` script that eventually runs one.
 * Script bodies are followed through `&&` chains and nested `bun run`
 * calls; each script name is visited once, so a cycle ends.
 */
export const commandNeedsInstall = (
	command: string,
	readers: IScriptDependencyReaders,
	visitedScripts: Set<string> = new Set(),
	seenFiles: Set<string> = new Set(),
): boolean => {
	for (const match of command.matchAll(BUN_FILE_RE)) {
		if (fileNeedsInstall(match[1] ?? '', readers, seenFiles)) return true;
	}
	for (const match of command.matchAll(BUN_RUN_RE)) {
		const name = match[1] ?? '';
		if (visitedScripts.has(name)) continue;
		visitedScripts.add(name);
		const body = readers.scriptOf(name);
		if (
			body !== undefined &&
			commandNeedsInstall(body, readers, visitedScripts, seenFiles)
		)
			return true;
	}
	return false;
};

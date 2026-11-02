/**
 * affected-specs.service.ts — the specs a change can affect, by symbol.
 *
 * Following imports module by module, a change anywhere in core reached 1,362
 * of 2,407 specs: nearly every spec imports a barrel, and a barrel imports
 * everything. What a spec depends on is the names it imports, so a name asked
 * of a barrel is followed through its re-exports to the module that declares
 * it, and only that module's own imports are followed from there. The same
 * change then reaches 240 specs, found in under a second.
 *
 * Importing a barrel still evaluates every module behind it, so a changed
 * file that runs code when it loads (a call, a registration, a branch at its
 * top level) is followed module by module instead: whatever imports anything
 * that leads to it is affected.
 *
 * One answer for every caller: the forge's test plan and the local proof.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

import type {
	IAffectedSpecsInput,
	IModuleFacts,
} from './affected-specs.interface';

const SPEC = /\.(spec|test)\.tsx?$/u;
const NAMESPACE = '*';

const stripComments = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

/** Every way a module names another, and what it declares itself. Pure. */
export const factsOf = (
	text: string,
	resolveSpecifier: (specifier: string) => string | undefined,
): IModuleFacts => {
	const source = stripComments(text);
	const local = new Set<string>();
	const reexports: IModuleFacts['reexports'][number][] = [];
	const imports: IModuleFacts['imports'][number][] = [];
	for (const match of source.matchAll(
		/export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gu,
	))
		local.add(match[1] ?? '');
	if (/export\s+default\b/u.test(source)) local.add('default');
	for (const match of source.matchAll(
		/export\s+(?:type\s+)?\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/gu,
	)) {
		const pairs = (match[1] ?? '')
			.split(',')
			.map((name) => name.trim().replace(/^type\s+/u, ''))
			.filter((name) => name.length > 0)
			.map((name) => {
				const [original = '', alias] = name.split(/\s+as\s+/u);
				return [(alias ?? original).trim(), original.trim()] as const;
			});
		const target =
			match[2] === undefined ? undefined : resolveSpecifier(match[2]);
		if (match[2] === undefined) for (const [name] of pairs) local.add(name);
		else if (target !== undefined)
			reexports.push({ from: target, names: new Map(pairs) });
	}
	for (const match of source.matchAll(
		/export\s+\*\s*(?:as\s+([\w$]+)\s*)?from\s*['"]([^'"]+)['"]/gu,
	)) {
		const target = resolveSpecifier(match[2] ?? '');
		if (target === undefined) continue;
		if (match[1] === undefined)
			reexports.push({ from: target, names: NAMESPACE });
		else {
			local.add(match[1]);
			imports.push({ target, names: NAMESPACE });
		}
	}
	for (const match of source.matchAll(
		/import\s+(?:type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gu,
	)) {
		const target = resolveSpecifier(match[2] ?? '');
		if (target === undefined) continue;
		const clause = match[1] ?? '';
		if (/\*\s+as\b/u.test(clause)) {
			imports.push({ target, names: NAMESPACE });
			continue;
		}
		const names = [
			...(/\{([^}]*)\}/u.exec(clause)?.[1] ?? '')
				.split(',')
				.map((name) => name.trim().replace(/^type\s+/u, ''))
				.filter((name) => name.length > 0)
				.map((name) => (name.split(/\s+as\s+/u)[0] ?? '').trim()),
			...(clause
				.replace(/\{[^}]*\}/u, '')
				.replace(/,/gu, '')
				.trim().length > 0
				? ['default']
				: []),
		];
		imports.push({ target, names: names.length > 0 ? names : NAMESPACE });
	}
	// A bare import, a dynamic one and a mock all reach the whole module.
	for (const match of source.matchAll(
		/(?:import\s*\(\s*|import\s+|vi\.mock\(\s*|vi\.importActual\(\s*)['"]([^'"]+)['"]/gu,
	)) {
		const target = resolveSpecifier(match[1] ?? '');
		if (target !== undefined) imports.push({ target, names: NAMESPACE });
	}
	return { local, reexports, imports };
};

const DECLARATION =
	/^(import\b|export\b|const\b|let\b|var\b|function\b|async\s+function\b|class\b|abstract\s+class\b|interface\b|type\b|enum\b|declare\b|namespace\b|;|"use |'use )/u;
/** A line starting with these goes on with the statement above (`>;`). */
const CONTINUATION = /[>|&)\]}.,:?]/u;
/** A `/` after these starts a regular expression, not a division. */
const BEFORE_REGEX = /[(,=:[!&|?{};+\-*%<>~^]$|\breturn$|^$/u;

/** Skip a string, template or regex from `start`; the index of its last char. */
const skipLiteral = (js: string, start: number): number => {
	const quote = js[start];
	let index = start + 1;
	while (index < js.length && js[index] !== quote) {
		if (js[index] === '\\') index += 1;
		index += 1;
	}
	return index;
};

/** The start of each statement at the top level of the code. Pure. */
export const topLevelStatements = (js: string): readonly string[] => {
	const starts: string[] = [];
	let depth = 0;
	let atStart = true;
	let last = '';
	for (let index = 0; index < js.length; index += 1) {
		const char = js[index] ?? '';
		if (char === '/' && js[index + 1] === '/') {
			index = js.indexOf('\n', index);
			if (index < 0) break;
			if (depth === 0) atStart = true;
			continue;
		}
		if (char === '/' && js[index + 1] === '*') {
			index = js.indexOf('*/', index + 2) + 1;
			if (index <= 0) break;
			continue;
		}
		if (atStart && depth === 0 && !/\s/u.test(char)) {
			// Formatted code starts a top-level statement at column 0; an
			// indented line continues the one above (`=>` and a new line).
			if (
				(index === 0 || js[index - 1] === '\n') &&
				!CONTINUATION.test(char)
			)
				starts.push(js.slice(index, index + 40));
			atStart = false;
		}
		if (char === '"' || char === "'" || char === '`') {
			// A template's `${}` holds code, but never a statement start.
			index = skipLiteral(js, index);
			last = 'x';
			continue;
		}
		if (char === '/' && BEFORE_REGEX.test(last)) {
			index = skipLiteral(js, index);
			last = 'x';
			continue;
		}
		if ('{(['.includes(char)) depth += 1;
		else if ('})]'.includes(char)) depth = Math.max(0, depth - 1);
		else if ((char === '\n' || char === ';') && depth === 0) atStart = true;
		if (!/\s/u.test(char))
			last = /\w/u.test(char) ? `${last}${char}`.slice(-6) : char;
	}
	return starts;
};

/** Whether loading the file runs a statement that is no declaration. */
export const runsCodeWhenLoaded = (text: string): boolean => {
	try {
		return topLevelStatements(text).some(
			(statement) => !DECLARATION.test(statement),
		);
	} catch {
		// Unreadable as code: assume it runs some, the cautious answer.
		return true;
	}
};

/** A specifier resolver over the tracked files and the path aliases. */
export const createResolver =
	(
		files: ReadonlySet<string>,
		paths: Readonly<Record<string, readonly string[]>>,
	) =>
	(from: string, specifier: string): string | undefined => {
		const pick = (base: string): string | undefined =>
			[
				base,
				`${base}.ts`,
				`${base}.tsx`,
				`${base}/index.ts`,
				base.replace(/\.js$/u, '.ts'),
			]
				.map((candidate) => normalize(candidate).replace(/^\.\//u, ''))
				.find((candidate) => files.has(candidate));
		if (specifier.startsWith('.'))
			return pick(join(dirname(from), specifier));
		for (const [alias, [target = ''] = []] of Object.entries(paths)) {
			if (alias === specifier) return pick(target);
			if (
				alias.endsWith('/*') &&
				specifier.startsWith(alias.slice(0, -1))
			)
				return pick(
					target.replace('*', specifier.slice(alias.length - 1)),
				);
		}
		return undefined;
	};

/** The specs `changed` can affect, from the tracked files and their text. */
export const affectedSpecs = (
	input: IAffectedSpecsInput,
): readonly string[] => {
	const files = input.files.filter((file) => /\.tsx?$/u.test(file));
	const known = new Set(files);
	const resolve = createResolver(known, input.paths);
	const facts = new Map(
		files.map((file) => [
			file,
			factsOf(input.read(file), (specifier) => resolve(file, specifier)),
		]),
	);
	const memo = new Map<string, ReadonlySet<string>>();
	/** The modules that declare `name` behind `target`, or none found. */
	const declaring = (target: string, name: string): ReadonlySet<string> => {
		const key = `${target}#${name}`;
		const cached = memo.get(key);
		if (cached !== undefined) return cached;
		const found = new Set<string>();
		memo.set(key, found);
		const module = facts.get(target);
		if (module === undefined) return found;
		if (name === NAMESPACE || module.local.has(name)) found.add(target);
		for (const reexport of module.reexports) {
			const original =
				reexport.names === NAMESPACE ? name : reexport.names.get(name);
			if (name === NAMESPACE || original !== undefined)
				for (const provider of declaring(
					reexport.from,
					original ?? name,
				))
					found.add(provider);
		}
		return found;
	};
	/**
	 * The modules that answer `name` asked of `target`: where it is declared,
	 * or the module itself when the analysis cannot tell, the cautious answer.
	 * Only the module asked falls back: an `export *` that does not hold the
	 * name answers nothing.
	 */
	const providers = (target: string, name: string): ReadonlySet<string> => {
		const found = declaring(target, name);
		return found.size > 0 ? found : new Set([target]);
	};
	const reverse = (bySymbol: boolean): Map<string, Set<string>> => {
		const edges = new Map<string, Set<string>>();
		const link = (from: string, to: string): void => {
			const users = edges.get(to) ?? new Set<string>();
			users.add(from);
			edges.set(to, users);
		};
		for (const [file, module] of facts) {
			for (const { target, names } of module.imports) {
				if (!bySymbol) link(file, target);
				else
					for (const name of names === NAMESPACE
						? [NAMESPACE]
						: names)
						for (const provider of providers(target, name))
							link(file, provider);
			}
			if (!bySymbol)
				for (const reexport of module.reexports)
					link(file, reexport.from);
		}
		return edges;
	};
	const reached = (
		edges: ReadonlyMap<string, ReadonlySet<string>>,
		seeds: readonly string[],
	): Set<string> => {
		const seen = new Set(seeds);
		const queue = [...seeds];
		for (let next = queue.pop(); next !== undefined; next = queue.pop())
			for (const user of edges.get(next) ?? [])
				if (!seen.has(user)) {
					seen.add(user);
					queue.push(user);
				}
		return seen;
	};
	const changed = input.changed.filter((file) => known.has(file));
	const loud = changed.filter((file) => runsCodeWhenLoaded(input.read(file)));
	const quiet = changed.filter((file) => !loud.includes(file));
	const hit = new Set([
		...reached(reverse(true), quiet),
		...(loud.length > 0 ? reached(reverse(false), loud) : []),
	]);
	return [...hit].filter((file) => SPEC.test(file)).sort();
};

/** The specs a branch's change since `base` can affect, read from git. */
export const affectedSpecsSince = (
	root: string,
	base: string,
): readonly string[] => {
	const git = (args: readonly string[]): readonly string[] =>
		execFileSync('git', [...args], {
			cwd: root,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		})
			.split('\n')
			.filter((line) => line.length > 0);
	const config = JSON.parse(
		readFileSync(join(root, 'tsconfig.base.json'), 'utf8'),
	) as { compilerOptions?: { paths?: Record<string, readonly string[]> } };
	return affectedSpecs({
		files: git(['ls-files']),
		changed: git(['diff', '--name-only', `${base}...HEAD`]),
		read: (file) => readFileSync(join(root, file), 'utf8'),
		paths: config.compilerOptions?.paths ?? {},
	});
};

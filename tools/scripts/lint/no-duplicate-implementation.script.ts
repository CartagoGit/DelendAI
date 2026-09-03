#!/usr/bin/env bun
/**
 * no-duplicate-implementation.script.ts — q00014 S7.
 *
 * A bug shipped from this repo because `plugins/commit-policy/src/lib/
 * engine.ts` grew its own private `executeGuardedCommit`, a second copy of
 * the logic already exported from `lib/services/commit-driver.ts`. Both
 * copies had tests. Both suites were green. The live path called the copy
 * that was NOT the one whose tests encoded the fix, so the fix "existed"
 * and did nothing. Nothing in `validate` could see it: no lint rule cares
 * how many times you write the same function, and coverage was satisfied by
 * the tests of the copy nobody called.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS GATE CHECKS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Both rules are scoped to ONE package's `src/` tree at a time — a package
 * being the nearest directory with a `package.json`. Duplication across
 * package boundaries is a different (and often deliberate) decision.
 *
 * Rule 1 — `shadowed-export`.
 *   Two TOP-LEVEL value definitions (`const` / `let` / `var` / `function` /
 *   `class`, at column 0) of the same identifier, in two different modules
 *   of one package, where at least one of them is `export`ed. That is a
 *   second implementation competing with the package's published one, and
 *   the importing module silently gets whichever the resolver picked.
 *
 * Rule 2 — `duplicated-body`.
 *   Two top-level function or class bodies in different modules of one
 *   package sharing a contiguous run of `--min-clone-lines` (default 15)
 *   identical normalized code lines. This is the rule that would have
 *   caught the real incident: the two commit implementations had DIFFERENT
 *   names (`executeGuardedCommit` vs `runCommitDriverUnlocked`), so a
 *   same-name rule alone never fires on it. Normalization trims
 *   indentation, collapses internal whitespace and drops blank and
 *   comment-only lines; nothing else — this is a type-1/type-2 clone
 *   detector, not a semantic one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS GATE DELIBERATELY DOES **NOT** CATCH
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   - Duplication that was rewritten rather than copied. Two independently
 *     typed implementations of the same behaviour share no 15 identical
 *     lines and are invisible here. Type-4 (semantic) clone detection is a
 *     research problem, not a lint gate.
 *   - Duplication ACROSS packages, and duplication between `src/` and test
 *     trees. Test doubles legitimately restate production shapes.
 *   - Nested / non-top-level definitions. A `const parse = ...` inside a
 *     function body is scoped, cheap to read, and not a competing module
 *     export. Only column-0 declarations are considered.
 *   - Anything that is not a value: `type`, `interface`, `enum`,
 *     `namespace` and `declare module` are excluded outright, because
 *     TypeScript's declaration merging makes repeating those names a
 *     LANGUAGE FEATURE, not a defect.
 *   - Function overloads. Overload signatures live in one file, and both
 *     rules are strictly cross-file.
 *   - Re-exports. `export { x } from './y'` and `export * from './y'`
 *     declare no value and never match the declaration pattern.
 *   - Unexported local helpers with generic names (`toLines`, `isOk`) that
 *     are not exported anywhere in the package — Rule 1 requires one side
 *     to be exported, precisely so that these do not produce noise. They
 *     can still trip Rule 2, but only by being 15 identical lines long, at
 *     which point they are a copy and not a coincidence.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EXCEPTIONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * There is NO suppression comment. A blanket `// lint-ignore` marker is a
 * one-keystroke way to make this gate disappear, and this is exactly the
 * class of defect an in-a-hurry agent will silence rather than fix. The
 * only way out is an entry in `ALLOWED_DUPLICATES` below, in this file, in
 * a diff a reviewer sees, with a written reason — see the array's doc.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

/** Roots searched for packages. */
const DEFAULT_ROOTS = ['packages', 'plugins', 'apps', 'extensions'] as const;

const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'build',
	'.astro',
	'.cache',
	'coverage',
	'tests',
	'__tests__',
	'__fixtures__',
	'_fixtures',
	'fixtures',
]);

/* ───────────────────────── exceptions ───────────────────────── */

export interface IAllowedDuplicate {
	/** Repo-relative package directory, e.g. `plugins/commit-policy`. */
	readonly package: string;
	/** Rule 1: the shared identifier. Rule 2: `<fileA>::<fileB>`. */
	readonly key: string;
	/** Why this duplication is correct. Required; keep it specific. */
	readonly reason: string;
}

/**
 * Justified exceptions. One entry per real, reviewed case, each with a
 * reason a future reader can check. Adding an entry is a code change in a
 * gate file: it shows up in review. Deleting the reason is not an option —
 * an entry with an empty `reason` fails this gate's own spec.
 *
 * (Empty today: the tree has no accepted duplicate implementations.)
 */
export const ALLOWED_DUPLICATES: readonly IAllowedDuplicate[] = [];

/** Where the ratchet's accepted debt is recorded. */
const BASELINE_REL =
	'tools/scripts/lint/no-duplicate-implementation.baseline.json';

/* ───────────────────────── types ───────────────────────── */

export type IDuplicateRule = 'shadowed-export' | 'duplicated-body';

export interface IDuplicateViolation {
	readonly rule: IDuplicateRule;
	readonly package: string;
	readonly file: string;
	readonly line: number;
	readonly detail: string;
	readonly fix: string;
}

export interface ISourceFile {
	/** Repo-relative path. */
	readonly file: string;
	readonly body: string;
}

/* ─────────────── top-level declaration extraction ─────────────── */

export interface ITopLevelDefinition {
	readonly name: string;
	readonly kind: 'const' | 'let' | 'var' | 'function' | 'class';
	readonly exported: boolean;
	readonly file: string;
	readonly line: number;
}

/**
 * Column-0 value declarations only. `type` / `interface` / `enum` /
 * `namespace` are absent from the alternation on purpose (declaration
 * merging), and so is `export default` (it declares no shared name).
 */
const TOP_LEVEL_DECL_RE =
	/^(export\s+)?(?:declare\s+)?(?:async\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/u;

export const findTopLevelDefinitions = (
	file: string,
	body: string,
): readonly ITopLevelDefinition[] => {
	const out: ITopLevelDefinition[] = [];
	const lines = body.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const match = TOP_LEVEL_DECL_RE.exec(lines[index] ?? '');
		if (match?.[2] === undefined || match[3] === undefined) continue;
		out.push({
			name: match[3],
			kind: match[2] as ITopLevelDefinition['kind'],
			exported: match[1] !== undefined,
			file,
			line: index + 1,
		});
	}
	return out;
};

/* ─────────────── rule 1: shadowed export ─────────────── */

export const findShadowedExports = (
	packageDir: string,
	files: readonly ISourceFile[],
): readonly IDuplicateViolation[] => {
	const byName = new Map<string, ITopLevelDefinition[]>();
	for (const { file, body } of files) {
		for (const definition of findTopLevelDefinitions(file, body)) {
			const bucket = byName.get(definition.name) ?? [];
			bucket.push(definition);
			byName.set(definition.name, bucket);
		}
	}
	const violations: IDuplicateViolation[] = [];
	for (const [name, definitions] of byName) {
		const distinctFiles = new Set(definitions.map((d) => d.file));
		if (distinctFiles.size < 2) continue;
		if (!definitions.some((d) => d.exported)) continue;
		if (isAllowed(packageDir, name)) continue;
		const exported = definitions.filter((d) => d.exported);
		const shadow = definitions.find((d) => !d.exported) ?? definitions[1];
		const owner = exported[0] ?? definitions[0];
		if (owner === undefined || shadow === undefined) continue;
		violations.push({
			rule: 'shadowed-export',
			package: packageDir,
			file: shadow.file,
			line: shadow.line,
			detail: `\`${name}\` is defined here and also at ${owner.file}:${owner.line}${owner.exported ? ' (exported)' : ''}, in the same package — two implementations of one name, and each one's tests only cover its own copy`,
			fix: `delete this definition and import \`${name}\` from ${owner.file}. If the two really must differ, rename one so the difference is visible at every call site, or record the pair in ALLOWED_DUPLICATES in ${relative(REPO_ROOT, import.meta.path)} with a reason.`,
		});
	}
	return violations;
};

/* ─────────────── rule 2: duplicated body ─────────────── */

export interface ICodeBlock {
	readonly name: string;
	readonly file: string;
	readonly startLine: number;
	/** Normalized code lines, paired with their 1-based source line. */
	readonly lines: readonly { readonly line: number; readonly text: string }[];
}

const BLOCK_START_RE =
	/^(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:\(|function\b|class\b)/u;

/** Trim, collapse internal whitespace, drop blanks and comment-only lines. */
export const normalizeCodeLine = (raw: string): string | undefined => {
	const trimmed = raw.trim().replace(/\s+/gu, ' ');
	if (trimmed.length === 0) return undefined;
	if (
		trimmed.startsWith('//') ||
		trimmed.startsWith('/*') ||
		trimmed.startsWith('*')
	)
		return undefined;
	return trimmed;
};

/** Top-level function/class bodies, brace-matched from their declaration. */
export const extractTopLevelBlocks = (
	file: string,
	body: string,
): readonly ICodeBlock[] => {
	const lines = body.split('\n');
	const blocks: ICodeBlock[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const header = lines[index] ?? '';
		const match = BLOCK_START_RE.exec(header);
		const name = match?.[1] ?? match?.[2];
		if (name === undefined) continue;
		const collected: { line: number; text: string }[] = [];
		let depth = 0;
		let opened = false;
		for (let cursor = index; cursor < lines.length; cursor += 1) {
			const text = lines[cursor] ?? '';
			const normalized = normalizeCodeLine(text);
			if (normalized !== undefined)
				collected.push({ line: cursor + 1, text: normalized });
			for (const char of text) {
				if (char === '{') {
					depth += 1;
					opened = true;
				} else if (char === '}') depth -= 1;
			}
			if (opened && depth <= 0) {
				index = cursor;
				break;
			}
		}
		if (!opened) continue;
		blocks.push({
			name,
			file,
			startLine: index + 1,
			lines: collected,
		});
	}
	return blocks;
};

export const DEFAULT_MIN_CLONE_LINES = 15;

/**
 * Cross-file clones inside one package, found by hashing every window of
 * `minLines` consecutive normalized lines. Two blocks in different files
 * sharing any window share at least that many identical contiguous lines.
 */
export const findDuplicatedBodies = (
	packageDir: string,
	files: readonly ISourceFile[],
	minLines: number = DEFAULT_MIN_CLONE_LINES,
): readonly IDuplicateViolation[] => {
	const blocks = files.flatMap(({ file, body }) =>
		extractTopLevelBlocks(file, body),
	);
	const windows = new Map<
		string,
		{ block: ICodeBlock; line: number; index: number }[]
	>();
	blocks.forEach((block, blockIndex) => {
		for (let i = 0; i + minLines <= block.lines.length; i += 1) {
			const slice = block.lines.slice(i, i + minLines);
			const key = slice.map((entry) => entry.text).join('\n');
			const bucket = windows.get(key) ?? [];
			bucket.push({
				block,
				line: slice[0]?.line ?? block.startLine,
				index: blockIndex,
			});
			windows.set(key, bucket);
		}
	});

	const reported = new Set<string>();
	const violations: IDuplicateViolation[] = [];
	for (const bucket of windows.values()) {
		for (let a = 0; a < bucket.length; a += 1) {
			for (let b = a + 1; b < bucket.length; b += 1) {
				const left = bucket[a];
				const right = bucket[b];
				if (left === undefined || right === undefined) continue;
				if (left.block.file === right.block.file) continue;
				const pairKey = [
					`${left.block.file}#${left.block.name}`,
					`${right.block.file}#${right.block.name}`,
				]
					.sort()
					.join('::');
				if (reported.has(pairKey)) continue;
				if (isAllowed(packageDir, pairKey)) continue;
				reported.add(pairKey);
				const [first, second] =
					left.block.file < right.block.file
						? [left, right]
						: [right, left];
				violations.push({
					rule: 'duplicated-body',
					package: packageDir,
					file: first.block.file,
					line: first.line,
					detail: `\`${first.block.name}\` shares ${minLines}+ identical consecutive lines with \`${second.block.name}\` at ${second.block.file}:${second.line} — one package, two copies of the same logic, each with its own tests`,
					fix: `keep ONE implementation, export it, and have the other call it. A fix applied to one copy does not reach the other, and the green suite will not tell you which copy the live path uses. If the duplication is deliberate, record \`${pairKey}\` in ALLOWED_DUPLICATES in ${relative(REPO_ROOT, import.meta.path)} with a reason.`,
				});
			}
		}
	}
	return violations;
};

/* ─────────────── package discovery / orchestration ─────────────── */

const isAllowed = (packageDir: string, key: string): boolean =>
	ALLOWED_DUPLICATES.some(
		(entry) => entry.package === packageDir && entry.key === key,
	);

const walk = (dir: string, out: string[]): void => {
	// `readdirSync`'s return type widens to `Dirent[]` under some
	// option overloads; this call passes none, so it yields names.
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
		const full = join(dir, entry);
		let stats: ReturnType<typeof statSync>;
		try {
			stats = statSync(full);
		} catch {
			continue;
		}
		if (stats.isDirectory()) {
			walk(full, out);
			continue;
		}
		if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
		if (/\.(?:spec|test|d)\.tsx?$/u.test(entry)) continue;
		out.push(full);
	}
};

/** Package roots: any directory with a package.json AND a src/ directory. */
export const findPackages = (
	root: string,
	searchRoots: readonly string[] = DEFAULT_ROOTS,
): readonly string[] => {
	const found: string[] = [];
	const visit = (dir: string, depth: number): void => {
		if (depth > 3) return;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		if (entries.includes('package.json') && entries.includes('src')) {
			found.push(dir);
			return;
		}
		for (const entry of entries) {
			if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
			const full = join(dir, entry);
			try {
				if (statSync(full).isDirectory()) visit(full, depth + 1);
			} catch {
				/* unreadable — skip */
			}
		}
	};
	for (const searchRoot of searchRoots) visit(join(root, searchRoot), 0);
	return found.sort();
};

export const lintPackage = (
	packageDir: string,
	files: readonly ISourceFile[],
	minLines: number = DEFAULT_MIN_CLONE_LINES,
): readonly IDuplicateViolation[] => [
	...findShadowedExports(packageDir, files),
	...findDuplicatedBodies(packageDir, files, minLines),
];

export interface IDuplicateResult {
	readonly violations: readonly IDuplicateViolation[];
	readonly packages: number;
	readonly files: number;
}

export const lintRepository = (
	root: string,
	searchRoots: readonly string[] = DEFAULT_ROOTS,
	minLines: number = DEFAULT_MIN_CLONE_LINES,
): IDuplicateResult => {
	const violations: IDuplicateViolation[] = [];
	const packages = findPackages(root, searchRoots);
	let fileCount = 0;
	for (const packageDir of packages) {
		const absolute: string[] = [];
		walk(join(packageDir, 'src'), absolute);
		const files = absolute.map((file) => ({
			file: relative(root, file).split(sep).join('/'),
			body: readFileSync(file, 'utf8'),
		}));
		fileCount += files.length;
		violations.push(
			...lintPackage(
				relative(root, packageDir).split(sep).join('/'),
				files,
				minLines,
			),
		);
	}
	violations.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
	);
	return { violations, packages: packages.length, files: fileCount };
};

export const formatReport = (result: IDuplicateResult): string => {
	if (result.violations.length === 0)
		return `✓ no-duplicate-implementation: ${result.files} source file(s) across ${result.packages} package(s), no competing copies of one implementation.`;
	return [
		`✖ no-duplicate-implementation: ${result.violations.length} duplicated implementation(s):`,
		...result.violations.map(
			(violation) =>
				`  ${violation.file}:${violation.line}  [${violation.rule}]\n      ${violation.detail}\n      fix: ${violation.fix}`,
		),
		'',
		'  Two copies of one behaviour means the tests can be green while the',
		'  live path runs the copy the fix never reached.',
	].join('\n');
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const argOf = (flag: string): string | undefined =>
		process.argv
			.find((arg) => arg.startsWith(`${flag}=`))
			?.slice(flag.length + 1);
	const root = resolve(argOf('--root') ?? REPO_ROOT);
	const searchRoots = (argOf('--search-roots') ?? '')
		.split(',')
		.filter((entry) => entry.length > 0);
	const minLines = Number.parseInt(
		argOf('--min-clone-lines') ?? `${DEFAULT_MIN_CLONE_LINES}`,
		10,
	);
	if (!Number.isFinite(minLines) || minLines < 4) {
		console.error(
			'no-duplicate-implementation: --min-clone-lines must be an integer >= 4.',
		);
		process.exit(2);
	}
	const result = lintRepository(
		root,
		searchRoots.length > 0 ? searchRoots : DEFAULT_ROOTS,
		minLines,
	);

	// Ratchet, like every other structural gate in this repo. The
	// first run over an established codebase finds a hundred-odd
	// duplicates; failing on all of them would only mean the gate gets
	// disabled, and a disabled gate protects nothing. So the existing
	// set is recorded and the gate fails on anything NEW — the count
	// per file may shrink freely and may never grow.
	const baselineAbs = join(root, BASELINE_REL);
	const current: Record<string, number> = {};
	for (const violation of result.violations) {
		current[violation.file] = (current[violation.file] ?? 0) + 1;
	}

	if (process.argv.includes('--update')) {
		writeFileSync(
			baselineAbs,
			`${JSON.stringify(current, null, '\t')}\n`,
			'utf8',
		);
		console.error(
			`no-duplicate-implementation: baseline updated — ${String(Object.keys(current).length)} file(s), ${String(result.violations.length)} duplicate(s).`,
		);
		process.exit(0);
	}

	let baseline: Record<string, number> = {};
	try {
		baseline = JSON.parse(readFileSync(baselineAbs, 'utf8')) as Record<
			string,
			number
		>;
	} catch {
		baseline = {};
	}

	const regressions = result.violations.filter((violation) => {
		const allowed = baseline[violation.file] ?? 0;
		return (current[violation.file] ?? 0) > allowed;
	});

	if (regressions.length > 0) {
		console.error(formatReport({ ...result, violations: regressions }));
		console.error(
			`\n  If this duplication is deliberate, record it in ALLOWED_DUPLICATES, or run\n` +
				`  \`bun ${BASELINE_REL.replace('.baseline.json', '.script.ts')} --update\` to rebaseline\n` +
				'  (the baseline may only be raised deliberately).\n',
		);
		process.exit(1);
	}

	const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
	console.log(
		result.violations.length === 0
			? '✓ no-duplicate-implementation: no duplicated implementations.'
			: `✓ no-duplicate-implementation: no new duplicates; debt ${String(baselineTotal)} → ${String(result.violations.length)}. Run --update to lock in a win.`,
	);
	process.exit(0);
}

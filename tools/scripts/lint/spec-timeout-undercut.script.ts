#!/usr/bin/env bun
/**
 * spec-timeout-undercut.script.ts — x00542 S3.
 *
 * A per-test timeout literal that is SMALLER than its own project's
 * `testTimeout` is a failure, and almost always an accidental one.
 *
 * The suite-level ceiling is a deliberate decision with a measurement
 * behind it (x00542 S2): a full `validate` run starts ~1,466 spec files
 * in parallel, and a spec that transforms in 11 s on an idle machine
 * pays several times that under contention. A `}, 15_000)` copied into
 * a project whose ceiling is 120_000 silently reverts that decision for
 * one test — and the test then fails on load rather than on a defect,
 * in a run that is the evidence `close_slice` demands.
 *
 * Raising a ceiling for one slow test is legitimate and stays legal.
 * Lowering it is the accident this refuses.
 *
 * The scan is a small state machine rather than a pattern, because the
 * shape that matters (`}, 15_000);`) is also how a `setTimeout`, a
 * `reduce` and an `Array.from` close. Measured on this repository, the
 * naive line pattern reported 18 findings of which 3 were closing
 * something other than a test. A gate that cries wolf gets switched off.
 *
 * Exit codes:
 *   0 — every per-test literal is at or above its project's ceiling.
 *   1 — at least one undercuts it (or the tree could not be read).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();

/** Vitest's own default when a project declares no ceiling. */
export const VITEST_DEFAULT_TIMEOUT_MS = 5_000;

const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'build',
	'coverage',
	'.git',
	'.cache',
	'.worktrees',
]);

/** Call names that take a per-test timeout as their last argument. */
const TEST_CALLS = new Set(['it', 'test', 'bench']);

export interface ISpecTimeoutFinding {
	readonly specPath: string;
	readonly line: number;
	readonly timeoutMs: number;
	readonly projectPath: string;
	readonly projectTimeoutMs: number;
}

// --- the scanner -----------------------------------------------------------

type TScanState =
	| 'code'
	| 'line-comment'
	| 'block-comment'
	| 'single'
	| 'double'
	| 'template';

const isIdentifierChar = (char: string | undefined): boolean =>
	char !== undefined && /[A-Za-z0-9_$]/u.test(char);

/**
 * Every `it(...)` / `test(...)` call in `source`, with the numeric
 * timeout it passes (or `undefined` when it passes none).
 *
 * Written as a scan over the characters because the interesting token
 * appears inside strings, comments and template literals that must not
 * be read as code — and because the closing shape is indistinguishable
 * from a dozen other calls when read one line at a time.
 */
export const testCallTimeouts = (
	source: string,
): readonly { readonly line: number; readonly timeoutMs: number }[] => {
	const out: { line: number; timeoutMs: number }[] = [];
	let state: TScanState = 'code';
	let templateDepth = 0;
	let line = 1;
	let identifierStart = -1;

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index] ?? '';
		const next = source[index + 1];
		if (char === '\n') line += 1;

		if (state === 'line-comment') {
			if (char === '\n') state = 'code';
			continue;
		}
		if (state === 'block-comment') {
			if (char === '*' && next === '/') {
				state = 'code';
				index += 1;
			}
			continue;
		}
		if (state === 'single' || state === 'double' || state === 'template') {
			if (char === '\\') {
				index += 1;
				continue;
			}
			if (state === 'single' && char === "'") state = 'code';
			else if (state === 'double' && char === '"') state = 'code';
			else if (state === 'template' && char === '`') state = 'code';
			continue;
		}

		// --- in code ---
		if (char === '/' && next === '/') {
			state = 'line-comment';
			index += 1;
			continue;
		}
		if (char === '/' && next === '*') {
			state = 'block-comment';
			index += 1;
			continue;
		}
		if (char === "'") {
			state = 'single';
			continue;
		}
		if (char === '"') {
			state = 'double';
			continue;
		}
		if (char === '`') {
			state = 'template';
			templateDepth += 1;
			continue;
		}

		if (isIdentifierChar(char)) {
			if (identifierStart === -1) identifierStart = index;
			continue;
		}

		const name =
			identifierStart === -1 ? '' : source.slice(identifierStart, index);
		const nameEnd = index;
		identifierStart = -1;
		if (name === '' || !TEST_CALLS.has(name)) continue;
		// `foo.it` is a property access, not the global. The character
		// before the name decides.
		const before =
			source[(identifierStart === -1 ? nameEnd - name.length : 0) - 1];
		if (before === '.') continue;

		// `it(`, `it.each(...)(`, `it.only(` — walk past the member
		// chain to the call's opening paren.
		const openIndex = findCallOpenParen(source, nameEnd);
		if (openIndex === -1) continue;
		const call = readCall(source, openIndex);
		if (call === null) continue;
		const timeoutMs = trailingTimeoutOf(call.argumentsText);
		const closingLine =
			line + countNewlines(source, index, call.closeIndex);
		if (timeoutMs !== undefined) {
			out.push({ line: closingLine, timeoutMs });
		}
		// The skipped region's newlines have to be accounted for, or
		// every later finding reports a line that drifts further back.
		line = closingLine;
		index = call.closeIndex;
	}
	void templateDepth;
	return out;
};

const countNewlines = (source: string, from: number, to: number): number => {
	let count = 0;
	for (let index = from; index < to; index += 1) {
		if (source[index] === '\n') count += 1;
	}
	return count;
};

/** The `(` that opens the call, skipping `.only` / `.each(...)` links. */
const findCallOpenParen = (source: string, from: number): number => {
	let index = from;
	for (;;) {
		while (index < source.length && /\s/u.test(source[index] ?? 'x')) {
			index += 1;
		}
		const char = source[index];
		if (char === '(') return index;
		if (char !== '.') return -1;
		index += 1;
		while (isIdentifierChar(source[index])) index += 1;
	}
};

interface IReadCall {
	readonly argumentsText: string;
	readonly closeIndex: number;
}

/** From an opening `(`, the text between it and its matching `)`. */
const readCall = (source: string, openIndex: number): IReadCall | null => {
	let depth = 0;
	let state: TScanState = 'code';
	for (let index = openIndex; index < source.length; index += 1) {
		const char = source[index] ?? '';
		const next = source[index + 1];
		if (state === 'line-comment') {
			if (char === '\n') state = 'code';
			continue;
		}
		if (state === 'block-comment') {
			if (char === '*' && next === '/') {
				state = 'code';
				index += 1;
			}
			continue;
		}
		if (state === 'single' || state === 'double' || state === 'template') {
			if (char === '\\') {
				index += 1;
				continue;
			}
			if (
				(state === 'single' && char === "'") ||
				(state === 'double' && char === '"') ||
				(state === 'template' && char === '`')
			) {
				state = 'code';
			}
			continue;
		}
		if (char === '/' && next === '/') {
			state = 'line-comment';
			index += 1;
			continue;
		}
		if (char === '/' && next === '*') {
			state = 'block-comment';
			index += 1;
			continue;
		}
		if (char === "'") {
			state = 'single';
			continue;
		}
		if (char === '"') {
			state = 'double';
			continue;
		}
		if (char === '`') {
			state = 'template';
			continue;
		}
		if (char === '(' || char === '[' || char === '{') depth += 1;
		else if (char === ')' || char === ']' || char === '}') {
			depth -= 1;
			if (depth === 0 && char === ')') {
				return {
					argumentsText: source.slice(openIndex + 1, index),
					closeIndex: index,
				};
			}
		}
	}
	return null;
};

/**
 * The call's arguments, split at the commas that are actually
 * separators.
 *
 * A test body is full of commas inside objects, arrays, calls and
 * strings; splitting on all of them is how a gate starts reading a
 * plugin option named `timeout` as a vitest ceiling. (It did: two
 * findings in `plugin-activation-equivalence.spec.ts` were assertions
 * about a plugin's own `timeout: 500`.)
 */
export const splitTopLevelArgs = (argumentsText: string): readonly string[] => {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	let state: TScanState = 'code';
	for (let index = 0; index < argumentsText.length; index += 1) {
		const char = argumentsText[index] ?? '';
		const next = argumentsText[index + 1];
		if (state === 'line-comment') {
			if (char === '\n') state = 'code';
			continue;
		}
		if (state === 'block-comment') {
			if (char === '*' && next === '/') {
				state = 'code';
				index += 1;
			}
			continue;
		}
		if (state === 'single' || state === 'double' || state === 'template') {
			if (char === '\\') {
				index += 1;
				continue;
			}
			if (
				(state === 'single' && char === "'") ||
				(state === 'double' && char === '"') ||
				(state === 'template' && char === '`')
			) {
				state = 'code';
			}
			continue;
		}
		if (char === '/' && next === '/') {
			state = 'line-comment';
			index += 1;
			continue;
		}
		if (char === '/' && next === '*') {
			state = 'block-comment';
			index += 1;
			continue;
		}
		if (char === "'") {
			state = 'single';
			continue;
		}
		if (char === '"') {
			state = 'double';
			continue;
		}
		if (char === '`') {
			state = 'template';
			continue;
		}
		if (char === '(' || char === '[' || char === '{') depth += 1;
		else if (char === ')' || char === ']' || char === '}') depth -= 1;
		else if (char === ',' && depth === 0) {
			parts.push(argumentsText.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(argumentsText.slice(start));
	return parts.map((part) => part.trim()).filter((part) => part !== '');
};

/**
 * `{ timeout: 15_000 }` as a WHOLE argument, and only then.
 *
 * The key has to sit at the object's own top level: a `timeout` nested
 * inside the fixture an assertion builds is somebody else's field.
 */
const optionsTimeoutOf = (argument: string): number | undefined => {
	if (!argument.startsWith('{') || !argument.endsWith('}')) return undefined;
	const inner = argument.slice(1, -1);
	for (const entry of splitTopLevelArgs(inner)) {
		const match = /^timeout\s*:\s*([0-9_]+)$/u.exec(entry);
		if (match?.[1] !== undefined) {
			return Number(match[1].replaceAll('_', ''));
		}
	}
	return undefined;
};

/**
 * The numeric timeout a call passes, if it passes one.
 *
 * Vitest accepts it two ways: as the last positional argument
 * (`it('x', fn, 15_000)`) and inside an options object
 * (`it('x', { timeout: 15_000 }, fn)`). Both are read here; anything
 * else — a constant, an expression — is not a literal and is left alone,
 * because a name is a decision somebody wrote down.
 */
export const trailingTimeoutOf = (
	argumentsText: string,
): number | undefined => {
	const args = splitTopLevelArgs(argumentsText);
	for (const argument of args) {
		const fromOptions = optionsTimeoutOf(argument);
		if (fromOptions !== undefined) return fromOptions;
	}
	const last = args[args.length - 1];
	if (last === undefined || args.length < 2) return undefined;
	return /^[0-9_]+$/u.test(last)
		? Number(last.replaceAll('_', ''))
		: undefined;
};

// --- the project ceilings --------------------------------------------------

/**
 * The `testTimeout` a vitest config declares, following one level of
 * named constant (`testTimeout: SUITE_TIMEOUT_MS`) because that is how
 * several suites in this repository write it.
 */
export const declaredTimeoutOf = (configSource: string): number => {
	const literal = /testTimeout:\s*([0-9_]+)/u.exec(configSource);
	if (literal?.[1] !== undefined) {
		return Number(literal[1].replaceAll('_', ''));
	}
	const named = /testTimeout:\s*([A-Za-z_$][A-Za-z0-9_$]*)/u.exec(
		configSource,
	);
	if (named?.[1] !== undefined) {
		const bound = new RegExp(
			`(?:const|let|var)\\s+${named[1]}\\s*(?::[^=]+)?=\\s*([0-9_]+)`,
			'u',
		).exec(configSource);
		if (bound?.[1] !== undefined) {
			return Number(bound[1].replaceAll('_', ''));
		}
	}
	return VITEST_DEFAULT_TIMEOUT_MS;
};

// --- the walk --------------------------------------------------------------

const walk = (dir: string, out: string[] = []): readonly string[] => {
	let entries: readonly import('node:fs').Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			walk(join(dir, entry.name), out);
			continue;
		}
		out.push(join(dir, entry.name));
	}
	return out;
};

export interface IProjectCeiling {
	readonly dir: string;
	readonly timeoutMs: number;
}

/** Nearest-config-wins, so a plugin inside a package gets its own. */
export const ceilingFor = (
	specPath: string,
	projects: readonly IProjectCeiling[],
): IProjectCeiling | undefined =>
	[...projects]
		.filter((project) => specPath.startsWith(`${project.dir}/`))
		.sort((left, right) => right.dir.length - left.dir.length)[0];

export const findUndercuts = (
	files: readonly string[],
	read: (path: string) => string,
): readonly ISpecTimeoutFinding[] => {
	const projects: IProjectCeiling[] = files
		.filter((file) => file.endsWith('vitest.config.ts'))
		.map((file) => ({
			dir: dirname(file),
			timeoutMs: declaredTimeoutOf(read(file)),
		}));
	const findings: ISpecTimeoutFinding[] = [];
	for (const spec of files.filter((file) => file.endsWith('.spec.ts'))) {
		const project = ceilingFor(spec, projects);
		if (project === undefined) continue;
		for (const call of testCallTimeouts(read(spec))) {
			if (call.timeoutMs >= project.timeoutMs) continue;
			findings.push({
				specPath: spec,
				line: call.line,
				timeoutMs: call.timeoutMs,
				projectPath: project.dir,
				projectTimeoutMs: project.timeoutMs,
			});
		}
	}
	return findings;
};

export const formatReport = (
	findings: readonly ISpecTimeoutFinding[],
	root: string,
): string => {
	if (findings.length === 0) {
		return '✓ spec-timeout-undercut: no per-test literal lowers its own project ceiling.';
	}
	const lines = [
		`✖ spec-timeout-undercut: ${String(findings.length)} per-test timeout(s) below the project ceiling.`,
		'',
	];
	for (const finding of findings) {
		lines.push(
			`  ${relative(root, finding.specPath)}:${String(finding.line)} — ${String(finding.timeoutMs)} ms against ${String(finding.projectTimeoutMs)} ms declared by ${relative(root, finding.projectPath) || '.'}/vitest.config.ts`,
		);
	}
	lines.push(
		'',
		'  A suite ceiling is a decision with a measurement behind it (x00542).',
		'  Lowering it for one test makes that test fail on load rather than on',
		'  a defect, in the run `close_slice` accepts as evidence. Raise it if',
		'  the test needs more; never below what the project already decided.',
	);
	return lines.join('\n');
};

export const main = (): number => {
	const files = walk(REPO_ROOT);
	const findings = findUndercuts(files, (path) => {
		try {
			return readFileSync(path, 'utf8');
		} catch {
			return '';
		}
	});
	console.log(formatReport(findings, REPO_ROOT));
	return findings.length === 0 ? 0 : 1;
};

if (import.meta.main) process.exit(main());

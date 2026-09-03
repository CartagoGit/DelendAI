#!/usr/bin/env bun
/**
 * no-silent-gates.script.ts — q00014 S7.
 *
 * A gate that exits non-zero while printing NOTHING is worse than no gate
 * at all: the operator sees a red step, no reason, and learns to re-run
 * `validate` hoping it goes green.
 *
 * This is not hypothetical. In this repo `catalog-drift-check` failed with
 * exit 1 and zero visible output, because the script wrote its diagnosis to
 * STDOUT and the package.json entry that invoked it redirected stdout to
 * /dev/null. Two independently reasonable decisions composed into a gate
 * with no failure message.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS GATE CHECKS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The set of scripts under inspection is DERIVED, never hardcoded: it is the
 * transitive closure of `validate:run` in the root package.json (every
 * `bun run <name>` it reaches, and every `bun <path>.ts` leaf those reach,
 * including commands nested inside quoted arguments such as the
 * `with-compute-lock` wrapper). Adding a gate to the chain puts it under
 * this check automatically; removing one takes it out.
 *
 * Rule 1 — `discarded-stdout` (exact, syntactic, zero false positives).
 *   A package.json script in that closure may not redirect the stdout of a
 *   gate command to /dev/null (`>/dev/null`, `1>/dev/null`, `&>/dev/null`,
 *   `>&/dev/null`). This is the exact antipattern that caused the incident.
 *   If a command is too chatty, make the command quieter (a `--quiet` flag);
 *   do not blindfold its failure path.
 *
 * Rule 2 — `silent-exit` (static, file-level, conservative).
 *   A reachable script that can terminate non-zero — `process.exit(<not the
 *   literal 0>)`, `process.exitCode = <non-zero literal>`, or `throw` at the
 *   module's top level — must contain at least one write to stdout or
 *   stderr somewhere in the file (`console.log|info|warn|error|debug`,
 *   `process.stdout.write`, `process.stderr.write`). A file with a failure
 *   exit and not a single output call cannot possibly explain itself.
 *
 * Rule 3 — `silent-failure-branch` (static, scope-level, still conservative).
 *   For each failure exit written with a NON-ZERO LITERAL argument, at least
 *   one of the brace scopes enclosing it — innermost outwards, up to and
 *   including module scope — must contain an output call. This catches the
 *   shape the file-level rule cannot see: a helper that bails out silently
 *   inside a file whose happy path is chatty.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS GATE DELIBERATELY DOES **NOT** CATCH
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   - Real control flow. This is lexical analysis over text, not a reaching
 *     -definitions analysis. `if (bad) { process.exit(1); }` inside a scope
 *     that prints something *on a different branch* passes Rule 3. Proving
 *     the print dominates the exit needs a CFG, and a CFG-based gate that is
 *     wrong 5% of the time gets disabled within a week.
 *   - Output that is empty or useless at runtime (`console.error('')`,
 *     `console.log(undefined)`). Presence of a call is the property.
 *   - Non-zero exits caused by an uncaught async rejection, a `throw` inside
 *     a callback, or a child process the script forwards the code of.
 *   - Redirection performed anywhere other than a package.json script in the
 *     closure — inside a shell script, a lefthook job, or CI YAML.
 *   - stderr being discarded (`2>/dev/null`). It is equally destructive, but
 *     it is a different antipattern from the one that happened here and it
 *     has legitimate uses inside compound git commands; keeping Rule 1 to
 *     the exact incident shape is what makes it argument-proof.
 *   - Leaves that are not repo `.ts` files (`biome`, `stylelint`, `bun run
 *     --cwd apps/web check`). They are reported as `unresolved` in verbose
 *     mode, never as violations.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

/* ───────────────────────── types ───────────────────────── */

export type SilentGateRule =
	| 'discarded-stdout'
	| 'silent-exit'
	| 'silent-failure-branch';

export interface ISilentGateViolation {
	readonly rule: SilentGateRule;
	/** Repo-relative file, or `package.json` for Rule 1. */
	readonly file: string;
	readonly line: number;
	readonly detail: string;
	readonly fix: string;
}

export interface ISilentGateResult {
	readonly violations: readonly ISilentGateViolation[];
	/** Repo-relative `.ts` entry points reached from `validate:run`. */
	readonly scriptFiles: readonly string[];
	/** Leaf commands that are not repo `.ts` files (external tools). */
	readonly unresolved: readonly string[];
}

/* ─────────────────── chain resolution (pure) ─────────────────── */

/**
 * Split a shell command into its top-level commands, and additionally
 * recurse into single/double-quoted arguments — `with-compute-lock` and
 * friends carry a whole gate command inside quotes, and a redirect hidden
 * in there counts just as much.
 */
export const splitCommandSegments = (command: string): readonly string[] => {
	const segments: string[] = [];
	const quoted: string[] = [];
	let current = '';
	let quote: string | undefined;
	let buffer = '';
	for (const char of command) {
		if (quote !== undefined) {
			if (char === quote) {
				quoted.push(buffer);
				buffer = '';
				quote = undefined;
				continue;
			}
			buffer += char;
			current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		current += char;
	}
	for (const piece of [current, ...quoted]) {
		for (const part of piece.split(/&&|\|\||;|(?<!\|)\|(?!\|)/u)) {
			const trimmed = part.trim();
			if (trimmed.length > 0) segments.push(trimmed);
		}
	}
	return segments;
};

const BUN_RUN_RE = /^bun\s+(?:--\S+\s+)*run\s+(?:--\S+\s+)*([\w:.-]+)/u;
const BUN_SCRIPT_RE = /^bun\s+(?:--\S+\s+)*([\w./-]+\.ts)\b/u;

export interface IChainClosure {
	/** package.json script names reachable from the entry script. */
	readonly scriptNames: readonly string[];
	/** repo-relative `.ts` entry files reachable from the entry script. */
	readonly files: readonly string[];
	/** leaf commands that resolved to neither of the above. */
	readonly unresolved: readonly string[];
}

/** Transitive closure of a package.json script over `bun run` / `bun <file>.ts`. */
export const resolveChain = (
	scripts: Readonly<Record<string, string>>,
	entry: string,
): IChainClosure => {
	const scriptNames: string[] = [];
	const files = new Set<string>();
	const unresolved = new Set<string>();
	const seen = new Set<string>();

	const visit = (name: string): void => {
		if (seen.has(name)) return;
		seen.add(name);
		const command = scripts[name];
		if (command === undefined) {
			unresolved.add(`bun run ${name}`);
			return;
		}
		scriptNames.push(name);
		for (const segment of splitCommandSegments(command)) {
			const asRun = BUN_RUN_RE.exec(segment);
			if (asRun?.[1] !== undefined) {
				// `bun run --cwd <pkg> <name>` targets another workspace's
				// package.json; it is out of this closure by construction.
				if (/--cwd/u.test(segment)) {
					unresolved.add(segment);
					continue;
				}
				visit(asRun[1]);
				continue;
			}
			const asFile = BUN_SCRIPT_RE.exec(segment);
			if (asFile?.[1] !== undefined) {
				files.add(asFile[1]);
				continue;
			}
			if (/^(bun|node)\b/u.test(segment) || segment.includes('/')) {
				unresolved.add(segment);
			} else {
				unresolved.add(segment);
			}
		}
	};

	visit(entry);
	return {
		scriptNames,
		files: [...files].sort(),
		unresolved: [...unresolved].sort(),
	};
};

/* ─────────────────── rule 1: discarded stdout ─────────────────── */

/** stdout (or stdout+stderr) sent to /dev/null. `2>/dev/null` is out of scope. */
const STDOUT_TO_DEVNULL_RE =
	/(?<![\d2])(?:1?>|&>|>&)\s*\/dev\/null|(?:>\s*\/dev\/null\s*2>&1)/u;

export const findDiscardedStdout = (
	scripts: Readonly<Record<string, string>>,
	closure: IChainClosure,
	packageJsonText: string,
): readonly ISilentGateViolation[] => {
	const lines = packageJsonText.split('\n');
	const violations: ISilentGateViolation[] = [];
	for (const name of closure.scriptNames) {
		const command = scripts[name] ?? '';
		for (const segment of splitCommandSegments(command)) {
			if (!STDOUT_TO_DEVNULL_RE.test(segment)) continue;
			const isGate =
				BUN_RUN_RE.test(segment) || BUN_SCRIPT_RE.test(segment);
			if (!isGate) continue;
			const line =
				lines.findIndex((text) =>
					new RegExp(`"${name}"\\s*:`, 'u').test(text),
				) + 1;
			violations.push({
				rule: 'discarded-stdout',
				file: 'package.json',
				line: line > 0 ? line : 1,
				detail: `script "${name}" discards the stdout of a gate command: ${segment}`,
				fix: 'remove the `>/dev/null`. If the command is too chatty, give it a --quiet flag; a gate whose stdout is discarded fails with an empty screen.',
			});
		}
	}
	return violations;
};

/* ─────────────────── rules 2 & 3: silent failure paths ─────────────────── */

const OUTPUT_CALL_RE =
	/\bconsole\.(?:log|info|warn|error|debug|table|trace)\s*\(|\bprocess\.(?:stdout|stderr)\.write\s*\(/u;
const NON_ZERO_LITERAL_EXIT_RE =
	/\bprocess\.exit\(\s*([1-9]\d*)\s*\)|\bprocess\.exitCode\s*=\s*([1-9]\d*)/u;
const ANY_FAILURE_EXIT_RE =
	/\bprocess\.exit\(\s*(?!0\s*\))|\bprocess\.exitCode\s*=\s*(?!0\b)/u;

/** Strip line comments and string bodies so tokens inside them do not count. */
const stripNoise = (line: string): string =>
	line
		.replace(/\/\/.*$/u, '')
		.replace(/'(?:[^'\\]|\\.)*'/gu, "''")
		.replace(/"(?:[^"\\]|\\.)*"/gu, '""')
		.replace(/`(?:[^`\\]|\\.)*`/gu, '``');

/**
 * Brace depth at the START of each line, plus the cleaned line text.
 * Template literals and comments are stripped first so braces inside them
 * do not shift the depth.
 */
const scanScopes = (
	source: string,
): readonly { readonly depth: number; readonly text: string }[] => {
	const out: { depth: number; text: string }[] = [];
	let depth = 0;
	let inBlockComment = false;
	for (const raw of source.split('\n')) {
		let text = raw;
		if (inBlockComment) {
			const end = text.indexOf('*/');
			if (end < 0) {
				out.push({ depth, text: '' });
				continue;
			}
			text = text.slice(end + 2);
			inBlockComment = false;
		}
		const start = text.indexOf('/*');
		if (start >= 0 && !text.slice(0, start).includes('//')) {
			const end = text.indexOf('*/', start + 2);
			if (end < 0) {
				inBlockComment = true;
				text = text.slice(0, start);
			} else {
				text = text.slice(0, start) + text.slice(end + 2);
			}
		}
		const clean = stripNoise(text);
		out.push({ depth, text: clean });
		for (const char of clean) {
			if (char === '{') depth += 1;
			else if (char === '}') depth -= 1;
		}
	}
	return out;
};

/**
 * True when some enclosing scope of `index` — innermost outwards, module
 * scope included — contains an output call.
 */
const enclosingScopePrints = (
	lines: readonly { readonly depth: number; readonly text: string }[],
	index: number,
): boolean => {
	const target = lines[index];
	if (target === undefined) return false;
	for (let depth = target.depth; depth >= 0; depth -= 1) {
		let start = 0;
		for (let i = index; i >= 0; i -= 1) {
			if ((lines[i]?.depth ?? 0) < depth) {
				start = i;
				break;
			}
		}
		let end = lines.length - 1;
		for (let i = index; i < lines.length; i += 1) {
			if ((lines[i]?.depth ?? 0) < depth) {
				end = i;
				break;
			}
		}
		for (let i = start; i <= end; i += 1) {
			if (OUTPUT_CALL_RE.test(lines[i]?.text ?? '')) return true;
		}
	}
	return false;
};

export const lintScriptSource = (
	file: string,
	source: string,
): readonly ISilentGateViolation[] => {
	const lines = scanScopes(source);
	const body = lines.map((entry) => entry.text).join('\n');
	const violations: ISilentGateViolation[] = [];

	const canFail =
		ANY_FAILURE_EXIT_RE.test(body) || /^\s*throw\s+/mu.test(body);
	if (canFail && !OUTPUT_CALL_RE.test(body)) {
		const line =
			lines.findIndex((entry) => ANY_FAILURE_EXIT_RE.test(entry.text)) + 1;
		violations.push({
			rule: 'silent-exit',
			file,
			line: line > 0 ? line : 1,
			detail: 'this gate can exit non-zero but the file contains no console/stdout/stderr write at all — a failure here shows the operator a red step and nothing else',
			fix: 'print the diagnosis before exiting: `console.error(formatReport(result));` — say which file, which line, what is wrong and what to do.',
		});
		return violations;
	}

	for (let index = 0; index < lines.length; index += 1) {
		const text = lines[index]?.text ?? '';
		if (!NON_ZERO_LITERAL_EXIT_RE.test(text)) continue;
		if (enclosingScopePrints(lines, index)) continue;
		violations.push({
			rule: 'silent-failure-branch',
			file,
			line: index + 1,
			detail: 'this non-zero exit is in a scope that never writes to stdout or stderr — the branch fails silently',
			fix: 'add a `console.error(...)` in this scope explaining the failure and the remedy before exiting.',
		});
	}
	return violations;
};

/* ─────────────────── orchestration ─────────────────── */

export interface ISilentGateInputs {
	readonly packageJsonText: string;
	readonly entry: string;
	readonly readScript: (relPath: string) => string | undefined;
}

export const lintSilentGates = (
	inputs: ISilentGateInputs,
): ISilentGateResult => {
	const manifest = JSON.parse(inputs.packageJsonText) as {
		scripts?: Record<string, string>;
	};
	const scripts = manifest.scripts ?? {};
	const closure = resolveChain(scripts, inputs.entry);
	const violations: ISilentGateViolation[] = [
		...findDiscardedStdout(scripts, closure, inputs.packageJsonText),
	];
	for (const file of closure.files) {
		const source = inputs.readScript(file);
		if (source === undefined) continue;
		violations.push(...lintScriptSource(file, source));
	}
	violations.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
	);
	return {
		violations,
		scriptFiles: closure.files,
		unresolved: closure.unresolved,
	};
};

export const formatReport = (result: ISilentGateResult): string => {
	if (result.violations.length === 0) {
		return `✓ no-silent-gates: ${result.scriptFiles.length} gate script(s) in the validate:run chain all report on their failure path.`;
	}
	return [
		`✖ no-silent-gates: ${result.violations.length} silent failure path(s):`,
		...result.violations.map(
			(violation) =>
				`  ${violation.file}:${violation.line}  [${violation.rule}]\n      ${violation.detail}\n      fix: ${violation.fix}`,
		),
		'',
		'  A gate that exits non-zero without printing is indistinguishable',
		'  from a broken runner. Every failure path must name the problem.',
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
	const manifestPath = argOf('--package-json') ?? join(REPO_ROOT, 'package.json');
	const root = argOf('--root') ?? REPO_ROOT;
	const entry = argOf('--entry') ?? 'validate:run';
	const result = lintSilentGates({
		packageJsonText: readFileSync(manifestPath, 'utf8'),
		entry,
		readScript: (relPath) => {
			try {
				return readFileSync(join(root, relPath), 'utf8');
			} catch {
				return undefined;
			}
		},
	});
	if (process.argv.includes('--verbose')) {
		console.log(
			`chain: ${result.scriptFiles.length} ts entry point(s), ${result.unresolved.length} external leaf command(s)`,
		);
		for (const file of result.scriptFiles) console.log(`  ts  ${file}`);
		for (const leaf of result.unresolved) console.log(`  ext ${leaf}`);
	}
	const report = formatReport(result);
	if (result.violations.length === 0) console.log(report);
	else console.error(report);
	process.exit(result.violations.length === 0 ? 0 : 1);
}

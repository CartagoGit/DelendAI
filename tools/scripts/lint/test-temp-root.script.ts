#!/usr/bin/env bun
/**
 * test-temp-root.script.ts — a test makes its temp directories under
 * `tmpdir()`.
 *
 * A run's temp root (x01091) is `os.tmpdir()`: the test runner points it
 * at one directory it removes when the run ends. A spec or test helper
 * that hands a literal absolute `/tmp/...` path to `mkdtemp` or
 * `mkdtempSync` steps around that root and leaves an entry in the system
 * temp directory for ever.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A `mkdtemp`/`mkdtempSync` call whose first argument is a literal `/tmp` path. */
const LITERAL_TMP_MKDTEMP =
	/\bmkdtemp(?:Sync)?\s*\(\s*(?:`|'|")\/(?:var\/)?tmp(?:\/|`|'|")/u;

/** The files the rule reads: specs and test helpers. */
const isTestFile = (path: string): boolean =>
	/\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path) ||
	/(?:^|\/)test-kit\//u.test(path) ||
	/\.helper\.[cm]?[jt]sx?$/u.test(path);

export interface ITempRootFinding {
	readonly path: string;
	readonly line: number;
	readonly text: string;
}

/** Every literal-`/tmp` mkdtemp call in one file's text, with its line. */
export const literalTmpMkdtemps = (
	path: string,
	text: string,
): readonly ITempRootFinding[] =>
	text
		.split('\n')
		.flatMap((line, index) =>
			LITERAL_TMP_MKDTEMP.test(line)
				? [{ path, line: index + 1, text: line.trim() }]
				: [],
		);

export const findLiteralTmpMkdtemps = (
	files: readonly { readonly path: string; readonly text: string }[],
): readonly ITempRootFinding[] =>
	files.flatMap((file) => literalTmpMkdtemps(file.path, file.text));

if (import.meta.main) {
	const root = process.cwd();
	const files = execFileSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter(isTestFile)
		// The rule's own spec holds the shapes it refuses.
		.filter((path) => !path.endsWith('test-temp-root.spec.ts'))
		.flatMap((path) => {
			try {
				return [{ path, text: readFileSync(join(root, path), 'utf8') }];
			} catch {
				return [];
			}
		});
	const findings = findLiteralTmpMkdtemps(files);
	if (findings.length === 0) {
		console.log(
			'✓ test-temp-root: no test makes a directory outside tmpdir().',
		);
		process.exit(0);
	}
	console.error(
		[
			`✖ test-temp-root: ${String(findings.length)} mkdtemp call(s) on a literal /tmp path.`,
			'',
			...findings.map((f) => `  ${f.path}:${String(f.line)} — ${f.text}`),
			'',
			"  Use join(tmpdir(), 'prefix-'): the run's temp root removes it when the run ends.",
		].join('\n'),
	);
	process.exit(1);
}

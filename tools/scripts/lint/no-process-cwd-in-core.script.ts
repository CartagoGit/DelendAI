#!/usr/bin/env bun
/**
 * no-process-cwd-in-core.script.ts — core's library reads no workspace
 * root from the launch directory.
 *
 * `process.cwd()` is where a process was started, which a library cannot
 * know to be the workspace: a host started from a home directory made
 * shell_status suggest installs for whatever project lived there. The
 * entry points (`packages/core/src/*.ts`, the CLI) read it once and pass
 * the root down; every module under `packages/core/src/lib` takes it as
 * an argument.
 *
 * Only code counts: comments and string text are blanked first, so one saying
 * "never `process.cwd()`" or a scaffold template that writes one into a
 * generated entry point is not a finding.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const SCAN_ROOT = join(REPO_ROOT, 'packages', 'core', 'src', 'lib');

const sourceFiles = async (dir: string): Promise<readonly string[]> => {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
		else if (/\.tsx?$/u.test(entry.name) && !entry.name.endsWith('.d.ts'))
			out.push(path);
	}
	return out;
};

/**
 * The source with comments and string text blanked (newlines kept), so
 * only code is left. A template's `${…}` stays code.
 */
export const codeOnly = (text: string): string => {
	let out = '';
	// Brace depth of each open `${`, innermost last; a `}` at depth 0
	// closes the substitution and resumes the template text.
	const substitutions: number[] = [];
	let index = 0;
	const blank = (char: string): string => (char === '\n' ? '\n' : ' ');
	const skipQuoted = (quote: string): void => {
		out += ' ';
		index += 1;
		while (index < text.length && text[index] !== quote) {
			if (text[index] === '\\') {
				out += ' ';
				index += 1;
			}
			out += blank(text[index] ?? '');
			index += 1;
		}
		out += ' ';
		index += 1;
	};
	const skipTemplateText = (): void => {
		while (index < text.length) {
			const char = text[index] ?? '';
			if (char === '\\') {
				out += '  ';
				index += 2;
			} else if (char === '`') {
				out += ' ';
				index += 1;
				return;
			} else if (char === '$' && text[index + 1] === '{') {
				out += '  ';
				index += 2;
				substitutions.push(0);
				return;
			} else {
				out += blank(char);
				index += 1;
			}
		}
	};
	while (index < text.length) {
		const char = text[index] ?? '';
		const next = text[index + 1];
		if (char === '/' && next === '/') {
			while (index < text.length && text[index] !== '\n') {
				out += ' ';
				index += 1;
			}
		} else if (char === '/' && next === '*') {
			const close = text.indexOf('*/', index + 2);
			const stop = close < 0 ? text.length : close + 2;
			for (; index < stop; index += 1) out += blank(text[index] ?? '');
		} else if (char === "'" || char === '"') {
			skipQuoted(char);
		} else if (char === '`') {
			out += ' ';
			index += 1;
			skipTemplateText();
		} else if (substitutions.length > 0 && char === '{') {
			substitutions[substitutions.length - 1] =
				(substitutions.at(-1) ?? 0) + 1;
			out += char;
			index += 1;
		} else if (substitutions.length > 0 && char === '}') {
			index += 1;
			if (substitutions.at(-1) === 0) {
				substitutions.pop();
				out += ' ';
				skipTemplateText();
			} else {
				substitutions[substitutions.length - 1] =
					(substitutions.at(-1) ?? 1) - 1;
				out += char;
			}
		} else {
			out += char;
			index += 1;
		}
	}
	return out;
};

/** The 1-based lines of every `process.cwd()` call in one source text. */
export const processCwdCalls = (text: string): readonly number[] =>
	codeOnly(text)
		.split('\n')
		.flatMap((line, index) =>
			/\bprocess\s*\.\s*cwd\s*\(/u.test(line) ? [index + 1] : [],
		);

const main = async (): Promise<number> => {
	const files = await sourceFiles(SCAN_ROOT).catch(() => []);
	if (files.length === 0) {
		console.error(
			`✖ no-process-cwd-in-core: no source under ${relative(REPO_ROOT, SCAN_ROOT)}; nothing was measured.`,
		);
		return 1;
	}
	const findings: string[] = [];
	for (const file of files) {
		for (const line of processCwdCalls(await readFile(file, 'utf8')))
			findings.push(`${relative(REPO_ROOT, file)}:${line}`);
	}
	if (findings.length > 0) {
		console.error(
			`✖ no-process-cwd-in-core: ${findings.length} process.cwd() call(s) in core's library. Take the workspace root as an argument from the entry point:`,
		);
		for (const finding of findings) console.error(`  ${finding}`);
		return 1;
	}
	console.log(
		`✓ no-process-cwd-in-core: ${files.length} file(s), no process.cwd() call.`,
	);
	return 0;
};

if (import.meta.main) process.exit(await main());

#!/usr/bin/env bun
/**
 * no-interpolated-replacement.script.ts — text spliced in is text, not a
 * replacement pattern.
 *
 * `s.replace(re, `${head}${body}`)` reads `$&`, `$'`, `` $` `` and `$1` in
 * the replacement string as patterns. When `body` is something a person or
 * an agent wrote, those characters stop being text: a reviewer's note
 * that quoted a schema pattern ending in `$'` had the rest of the proposal
 * spliced into it, and a second copy of the next slice written into the
 * document. A function replacement (`() => `${head}${body}``) inserts its
 * result as it is. This refuses an interpolated template literal passed
 * as the replacement of `replace`/`replaceAll`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	SCANNED_SOURCE,
	SELF_SPEC,
	SKIPPED_SOURCE,
} from './no-interpolated-replacement.constant';

const CALL = /\.replace(?:All)?\(/gu;

/** The index just past a string, template or regex literal opening at `i`. */
const skipLiteral = (text: string, i: number): number => {
	const quote = text[i];
	let j = i + 1;
	while (j < text.length) {
		const c = text[j];
		if (c === '\\') {
			j += 2;
			continue;
		}
		if (quote === '`' && c === '$' && text[j + 1] === '{') {
			j = skipBalanced(text, j + 1);
			continue;
		}
		if (c === quote) return j + 1;
		if (quote === '/' && c === '[') {
			const close = text.indexOf(']', j);
			j = close === -1 ? text.length : close + 1;
			continue;
		}
		j += 1;
	}
	return j;
};

/** The index just past the bracket group opening at `i`. */
const skipBalanced = (text: string, i: number): number => {
	let depth = 0;
	let j = i;
	while (j < text.length) {
		const c = text[j] ?? '';
		if (c === "'" || c === '"' || c === '`') {
			j = skipLiteral(text, j);
			continue;
		}
		if ('([{'.includes(c)) depth += 1;
		if (')]}'.includes(c)) {
			depth -= 1;
			if (depth === 0) return j + 1;
		}
		j += 1;
	}
	return j;
};

/** The second argument of the call whose `(` is at `open`, when it is a template. */
const replacementTemplate = (
	text: string,
	open: number,
): string | undefined => {
	let j = open + 1;
	while (/\s/u.test(text[j] ?? '')) j += 1;
	// A regex literal first argument is skipped as a literal.
	if (text[j] === '/') j = skipLiteral(text, j);
	while (j < text.length) {
		const c = text[j] ?? '';
		if (c === "'" || c === '"' || c === '`') {
			j = skipLiteral(text, j);
			continue;
		}
		if ('([{'.includes(c)) {
			j = skipBalanced(text, j);
			continue;
		}
		if (c === ')') return undefined;
		if (c === ',') break;
		j += 1;
	}
	j += 1;
	while (/\s/u.test(text[j] ?? '')) j += 1;
	if (text[j] !== '`') return undefined;
	const literal = text.slice(j, skipLiteral(text, j));
	return literal.includes('${') ? literal : undefined;
};

/** Every interpolated replacement in one text, with its line. */
export const interpolatedReplacementsIn = (
	text: string,
): readonly { readonly line: number; readonly match: string }[] => {
	const found: { line: number; match: string }[] = [];
	for (const call of text.matchAll(CALL)) {
		const lineStart = text.lastIndexOf('\n', call.index) + 1;
		// A comment that shows the shape is not the shape.
		if (/^\s*(?:\/\/|\/?\*)/u.test(text.slice(lineStart, call.index)))
			continue;
		const open = (call.index ?? 0) + call[0].length - 1;
		const template = replacementTemplate(text, open);
		if (template === undefined) continue;
		found.push({
			line: text.slice(0, call.index).split('\n').length,
			match: `${call[0]}…, ${template.slice(0, 60)}`,
		});
	}
	return found;
};

const sources = (root: string): readonly { path: string; text: string }[] =>
	execFileSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter(
			(path) =>
				SCANNED_SOURCE.test(path) &&
				!SKIPPED_SOURCE.test(path) &&
				path !== SELF_SPEC,
		)
		.flatMap((path) => {
			try {
				return [{ path, text: readFileSync(join(root, path), 'utf8') }];
			} catch {
				return [];
			}
		});

if (import.meta.main) {
	const root = process.cwd();
	const scanned = sources(root);
	const findings = scanned.flatMap((file) =>
		interpolatedReplacementsIn(file.text).map(
			(hit) => `  ${file.path}:${String(hit.line)} — ${hit.match}`,
		),
	);
	if (findings.length === 0) {
		console.log(
			`✓ no-interpolated-replacement: ${String(scanned.length)} files, no interpolated replacement string.`,
		);
		process.exit(0);
	}
	console.error(
		[
			`✖ no-interpolated-replacement: ${String(findings.length)} replacement(s) read their text as patterns.`,
			'',
			...findings,
			'',
			"  `$&`, `$'` and `$1` in a replacement string are patterns, not text.",
			'  Pass a function: `.replace(re, () => `${head}${body}`)`.',
		].join('\n'),
	);
	process.exit(1);
}

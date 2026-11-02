#!/usr/bin/env bun
/**
 * no-control-bytes.script.ts — no tracked source file holds a raw C0
 * control byte other than tab, newline or carriage return.
 *
 * A NUL reached a prompt the product sends to models: the source had a
 * raw byte where an escaped backtick was meant, every gate passed, and
 * an editor shows the line as if nothing were there. A control byte a
 * string needs is written as an escape (`\u0000`), which says so.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const LAST_C0 = 0x1f;
const DELETE = 0x7f;

/** Every C0 byte and DEL, except tab, newline and carriage return. */
const isControl = (code: number): boolean =>
	(code <= LAST_C0 &&
		code !== TAB &&
		code !== LINE_FEED &&
		code !== CARRIAGE_RETURN) ||
	code === DELETE;

/** The first control character of `line`, or `undefined`. */
const firstControl = (line: string): number | undefined => {
	for (let index = 0; index < line.length; index += 1) {
		const code = line.charCodeAt(index);
		if (isControl(code)) return code;
	}
	return undefined;
};

const SOURCE_RE = /\.(?:[cm]?[jt]s|tsx|jsx)$/u;

/** `path:line (0xNN)` for every line of `text` holding a control byte. */
export const controlByteLines = (
	path: string,
	text: string,
): readonly string[] =>
	text.split('\n').flatMap((line, index) => {
		const code = firstControl(line);
		return code === undefined
			? []
			: [
					`${path}:${String(index + 1)} (0x${code.toString(16).padStart(2, '0')})`,
				];
	});

const main = (): number => {
	const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
		encoding: 'utf8',
	}).trim();
	const files = execFileSync('git', ['ls-files'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\n')
		.filter((file) => SOURCE_RE.test(file));
	// A scan over nothing proves nothing.
	if (files.length === 0) {
		console.error('✖ no-control-bytes: no tracked source file was found.');
		return 1;
	}
	const found = files.flatMap((file) => {
		try {
			return controlByteLines(
				file,
				readFileSync(join(root, file), 'utf8'),
			);
		} catch {
			return [];
		}
	});
	if (found.length === 0) {
		console.log(
			`✓ no-control-bytes: ${String(files.length)} tracked source files, none with a raw control byte.`,
		);
		return 0;
	}
	console.error(
		`✖ no-control-bytes: ${String(found.length)} line(s) hold a raw control byte:\n${found
			.slice(0, 20)
			.map((at) => `  ${at}`)
			.join(
				'\n',
			)}\n  Write the byte as an escape (\\u0000) or remove it.`,
	);
	return 1;
};

if (import.meta.main) process.exit(main());

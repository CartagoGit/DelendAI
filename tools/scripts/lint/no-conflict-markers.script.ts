#!/usr/bin/env bun
/**
 * no-conflict-markers.script.ts — no tracked file keeps the markers of a
 * merge nobody finished.
 *
 * On 2026-10-06 two proposal documents reached the integration branch
 * with `<<<<<<< HEAD` and `>>>>>>>` lines in them: a script merged one
 * pull request into another, the merge stopped on a conflict, and the
 * next step committed the tree as it was. Every gate passed. Markdown
 * renders the markers as text, and no check looked for them.
 *
 * Only the two unambiguous markers are judged: `=======` alone is also a
 * markdown heading underline. A spec that needs a marker writes it in a
 * string, which never starts a line.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A line git writes to open or close a conflict. */
const MARKER_RE = /^(<{7}|>{7}) /mu;

/** Files whose content cannot hold a conflict worth reporting. */
const BINARY_RE =
	/\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|pdf|zip|gz|sqlite|wasm)$/iu;

/** `path:line` for every marker line in `text`. */
export const markerLines = (path: string, text: string): readonly string[] =>
	text
		.split('\n')
		.flatMap((line, index) =>
			MARKER_RE.test(line) ? [`${path}:${String(index + 1)}`] : [],
		);

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
		.filter((file) => file.length > 0 && !BINARY_RE.test(file));
	const found = files.flatMap((file) => {
		try {
			return markerLines(file, readFileSync(join(root, file), 'utf8'));
		} catch {
			return [];
		}
	});
	if (found.length === 0) {
		console.log(
			`✓ no-conflict-markers: ${String(files.length)} tracked files, none with a conflict marker.`,
		);
		return 0;
	}
	console.error(
		`✖ no-conflict-markers: ${String(found.length)} conflict marker line(s) in tracked files:\n${found
			.slice(0, 20)
			.map((at) => `  ${at}`)
			.join(
				'\n',
			)}\n  Finish the merge: keep what both sides meant, then remove every marker line.`,
	);
	return 1;
};

if (import.meta.main) process.exit(main());

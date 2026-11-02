#!/usr/bin/env bun
/**
 * no-home-directory-in-tracked-files.script.ts — somebody's machine does
 * not ship with the repository.
 *
 * Observed: a clone on a different computer carried the author's home
 * directory. Two tracked files held it as live configuration —
 * `.claude/settings.json` named `/home/<user>/_projects/delendai` as an
 * additional directory, and the Cursor rules linked every document as
 * `file:///home/<user>/...`. Both travel to every clone, and the second
 * is installed into a project that adopts delendai, where those links
 * point at a directory that does not exist.
 *
 * An absolute home path in a tracked file is always one of two things: a
 * leak of whose machine this was, or a path that is wrong everywhere
 * except one computer. Usually both.
 *
 * Historical prose keeps its baseline — an audit written a year ago that
 * quotes a terminal session is a record, not a configuration — so the
 * rule bites on what is added from now on.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	BASELINE_PATH,
	HOME_PATTERNS,
	SKIP_PREFIXES,
} from './no-home-directory-in-tracked-files.constant';
import type { IHomePathFinding } from './no-home-directory-in-tracked-files.interface';

/** Every home-shaped absolute path in one text, with its line number. */
export const homePathsIn = (
	text: string,
): readonly { readonly line: number; readonly match: string }[] => {
	const found: { line: number; match: string }[] = [];
	text.split('\n').forEach((line, index) => {
		for (const pattern of HOME_PATTERNS) {
			const hit = new RegExp(pattern.source, pattern.flags).exec(line);
			if (hit !== null) {
				found.push({ line: index + 1, match: hit[0] });
				break;
			}
		}
	});
	return found;
};

/** Whether this path is historical prose rather than live configuration. */
export const isHistorical = (path: string): boolean =>
	SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));

/** Scan the tracked files a caller hands over. */
export const findHomePaths = (
	files: readonly { readonly path: string; readonly text: string }[],
): readonly IHomePathFinding[] =>
	files
		.filter((file) => !isHistorical(file.path))
		.flatMap((file) =>
			homePathsIn(file.text).map((hit) => ({
				path: file.path,
				line: hit.line,
				match: hit.match,
			})),
		);

const trackedTextFiles = (
	root: string,
): readonly { readonly path: string; readonly text: string }[] =>
	execFileSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter((path) => path.length > 0)
		.flatMap((path) => {
			try {
				return [{ path, text: readFileSync(join(root, path), 'utf8') }];
			} catch {
				// Binary, or unreadable: neither can hold a leaked path we
				// could act on.
				return [];
			}
		});

if (import.meta.main) {
	const root = process.cwd();
	const baseline = existsSync(join(root, BASELINE_PATH))
		? (JSON.parse(readFileSync(join(root, BASELINE_PATH), 'utf8')) as {
				readonly allowed?: readonly string[];
			})
		: {};
	const allowed = new Set(baseline.allowed ?? []);
	const findings = findHomePaths(trackedTextFiles(root)).filter(
		(finding) => !allowed.has(finding.path),
	);
	if (findings.length === 0) {
		console.log(
			'✓ no-home-directory-in-tracked-files: no machine ships with this repository.',
		);
		process.exit(0);
	}
	console.error(
		[
			`✖ no-home-directory-in-tracked-files: ${String(findings.length)} absolute home path(s) in tracked files.`,
			'',
			...findings
				.slice(0, 20)
				.map(
					(finding) =>
						`  ${finding.path}:${String(finding.line)} — ${finding.match}`,
				),
			'',
			'  A tracked absolute home path is a leak of whose machine this was, a',
			'  path that is wrong on every other computer, or both. Configuration',
			'  installed into a project that adopts delendai carries it further.',
			'',
			'  fix: make it relative, or read it at runtime.',
		].join('\n'),
	);
	process.exit(1);
}

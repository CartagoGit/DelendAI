#!/usr/bin/env bun
/**
 * one-work-ref-shape.script.ts — the shape of a work ref is stated once.
 *
 * It was stated four times, in three spellings. The policy expanded
 * `…-g${generation}/${topic}`; the claim service carried a hand-written
 * regex agreeing with it; `commit-branch-discipline` told agents
 * `…-g<n>-<topic>`, with a DASH; and a persistence remedy quoted a shape
 * with no topic at all.
 *
 * That is not untidiness. A ref named the way the guard said sits inside
 * the right namespace, so the guard passes it — and then it cannot be
 * claimed, cannot be renamed and cannot be published, because the reader
 * is looking for a slash. Measured on this repository: 135 such refs, all
 * unpublishable by construction, none of which any message admitted was
 * wrong.
 *
 * So: one statement. `WORK_REF_SHAPE` is it; everything else derives from
 * `branches.workRefTemplate` at runtime. This refuses a second one.
 *
 * Exit codes: 0 — one statement. 1 — somebody wrote another.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** A work-ref shape written out by hand, in any of its dialects. */
const SPELLING =
	/[<{$][{]?(?:proposal|id)[}>]?-[<{$][{]?slice[}>]?-g[<{$][{]?(?:generation|n)[}>]?(?<tail>.{0,12})/iu;

/**
 * Whether a hand-written shape AGREES with the one statement.
 *
 * Silence is not the goal — a comment quoting the real shape helps the
 * next reader. Disagreement is the defect: `…-g<n>-<topic>` taught a
 * spelling the engine never writes, and a shape that stops at the
 * generation teaches one that loses what the work is about.
 */
const agrees = (tail: string): boolean =>
	/^[/\\][<{$]?[{]?(?:topic|what)/iu.test(tail);

/**
 * Files allowed to disagree, and why.
 *
 * Only the three that EXPLAIN the defect: quoting the dash spelling is
 * how the next reader learns what this lint is for. A line may also opt
 * out with `work-ref-shape: alternative` when it deliberately exercises
 * another operator's template — the point is that other shapes are legal,
 * and only OUR statement of ours must be single.
 */
const ALLOWED = new Set([
	'packages/cli/src/lib/work-ref-shape.service.ts',
	'packages/cli/src/lib/work-ref-shape.service.spec.ts',
	'tools/scripts/lint/one-work-ref-shape.script.ts',
	'tools/scripts/lint/commit-branch-discipline.script.ts',
]);

/** An explicit, visible opt-out for a deliberately different template. */
const OPTED_OUT = /work-ref-shape:\s*alternative/u;

const tracked = (): readonly string[] =>
	execFileSync('git', ['ls-files', '-z'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter((path) => path.length > 0)
		.filter((path) => /\.(ts|md|ya?ml|json)$/u.test(path))
		// Applied migrations are immutable history, and proposals record
		// what was true when they were written.
		.filter((path) => !path.includes('/migrations/'))
		.filter((path) => !path.startsWith('docs/delendai/proposals/'));

const offenders = tracked().flatMap((path) => {
	if (ALLOWED.has(path)) return [];
	let text = '';
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		return [];
	}
	return text
		.split('\n')
		.map((line, index) => ({ line: index + 1, text: line }))
		.filter((row) => !OPTED_OUT.test(row.text))
		.filter((row) => {
			const found = SPELLING.exec(row.text);
			return found !== null && !agrees(found.groups?.tail ?? '');
		})
		.map((row) => `${path}:${String(row.line)} — ${row.text.trim()}`);
});

if (offenders.length > 0) {
	process.stderr.write(
		[
			`✖ one-work-ref-shape: ${String(offenders.length)} hand-written work-ref shape(s).`,
			'',
			...offenders.map((line) => `  ${line}`),
			'',
			'  The shape is stated once, in `WORK_REF_SHAPE`, and everything',
			'  else derives it from `branches.workRefTemplate` at runtime.',
			'  A second statement drifts, and a ref named after the wrong one',
			'  can never be claimed, renamed or published — it passes the',
			'  namespace guard and dies silently.',
			'',
			'  fix: render it with `workRefShapeInWords(template)` for a',
			'       message, or read it with `parseWorkSubject(template, …)`.',
			'',
		].join('\n'),
	);
	process.exit(1);
}

process.stdout.write(
	'✓ one-work-ref-shape: the shape of a work ref is stated once.\n',
);

#!/usr/bin/env bun
/**
 * proposals-locks-file-size.script.ts — r00042 S3.
 *
 * No file under `plugins/proposals/src/lib/locks/` may exceed 600 lines.
 *
 * ## Why a ceiling here specifically, and not everywhere
 *
 * This is the agent lock engine: the code that decides which agent owns
 * which files while several of them write to one checkout. It has a
 * recorded history of subtle correctness bugs — a release keyed on a bare
 * `sliceId` that silently no-opped, a re-claim that dropped files from an
 * existing claim — and both were the kind of defect that hides in a long
 * file because no reader holds the whole thing in their head at once.
 *
 * A line ceiling is a crude proxy for "small enough to reason about", and
 * it is the right crudeness for this directory: the cost of a subtle bug
 * here is two agents inside the same critical section, which is silent.
 *
 * ## Why a hard limit rather than a ratchet
 *
 * Most gates in this repository are ratchets, because they inherited debt
 * that must be burned down gradually. This one starts satisfied — the S3
 * split brought `engine.ts` from 1,394 lines and `file-lock-table.ts` from
 * 745 under the ceiling — so there is no debt to grandfather, and a
 * baseline would only be a place for the next 900-line file to hide.
 *
 * Exit codes: 0 every file within the ceiling, 1 at least one over.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** The ceiling r00042 S3 sets. */
export const MAX_LINES = 600;

export const LOCKS_DIR = 'plugins/proposals/src/lib/locks';

export interface IOversizeFinding {
	readonly file: string;
	readonly lines: number;
}

/** Files over the ceiling, largest first. */
export const findOversizedFiles = (
	root: string,
	dir: string = LOCKS_DIR,
	maxLines: number = MAX_LINES,
): readonly IOversizeFinding[] => {
	const absolute = join(root, dir);
	let entries: string[];
	try {
		entries = readdirSync(absolute);
	} catch {
		return [];
	}
	const findings: IOversizeFinding[] = [];
	for (const entry of entries) {
		const full = join(absolute, entry);
		if (statSync(full).isDirectory()) {
			findings.push(
				...findOversizedFiles(root, relative(root, full), maxLines),
			);
			continue;
		}
		if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
		const lines = readFileSync(full, 'utf8').split('\n').length;
		if (lines <= maxLines) continue;
		findings.push({ file: relative(root, full), lines });
	}
	return [...findings].sort((left, right) => right.lines - left.lines);
};

const main = (): number => {
	const root = process.cwd();
	const findings = findOversizedFiles(root);
	const scanned = (() => {
		try {
			return readdirSync(join(root, LOCKS_DIR)).filter((f) =>
				f.endsWith('.ts'),
			).length;
		} catch {
			return 0;
		}
	})();

	if (scanned === 0) {
		// A gate that scanned nothing must say so rather than report ok.
		console.error(
			`proposals-locks-file-size: found no files under ${LOCKS_DIR}; refusing to report ok`,
		);
		return 1;
	}

	if (findings.length === 0) {
		console.log(
			`✓ proposals-locks-file-size: ${scanned} file(s) under ${LOCKS_DIR}, none over ${MAX_LINES} lines.`,
		);
		return 0;
	}

	console.error(
		`✖ proposals-locks-file-size: ${findings.length} file(s) over ${MAX_LINES} lines:`,
	);
	for (const finding of findings)
		console.error(`  ${finding.file}: ${finding.lines} lines`);
	console.error(
		'\nThis directory decides which agent owns which files while several write to one\n' +
			'checkout, and its two recorded bugs — a release that silently no-opped, a\n' +
			're-claim that dropped files — both hid in length. Split along the cohesive\n' +
			'seam rather than raising the ceiling, and move declarations verbatim: a\n' +
			'refactor that quietly edits a body here costs two agents in one critical\n' +
			'section, which fails silently.',
	);
	return 1;
};

if (import.meta.main) process.exit(main());

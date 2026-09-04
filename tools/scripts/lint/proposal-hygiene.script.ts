#!/usr/bin/env bun
/**
 * proposal-hygiene.script.ts — b00240.
 *
 * Three defects that a proposal can carry from the moment it is created,
 * all of which make it impossible to ever close, and none of which any
 * existing gate saw:
 *
 *  1. **Unfilled scaffold.** `create_proposal` writes a template whose
 *     Goal reads `TODO: describe the goal.` and whose acceptance reads
 *     `TODO: observable acceptance criteria.` A proposal that never states
 *     its goal cannot be evaluated, reviewed or closed — the closing gate
 *     asks whether the acceptance criteria are met, and there are none.
 *     Three such files sat in `ready/` for days.
 *
 *  2. **Heading/id mismatch.** `x00424`'s H1 read `# x00419 — …`. Every
 *     tool that reads the frontmatter and every human who reads the
 *     heading were looking at different proposals.
 *
 *  3. **Duplicates.** `x00420` and `x00422` are the same work: same
 *     subject, same single slice, the same two files. Two ids for one job
 *     means one of them can never be closed honestly, because whoever
 *     does the work closes the other.
 *
 * The shared cause is that creating a proposal and specifying it are two
 * steps and only the first was enforced. This gate enforces the second.
 *
 * Ratchet, like the repo's other quality gates: existing violations are
 * baselined so the pressure is on new ones. `--update` rebaselines.
 *
 * Exit codes: 0 clean (or only baselined), 1 new violations, 2 bad usage.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const BASELINE = 'tools/scripts/lint/proposal-hygiene.baseline.json';

/**
 * Only `ready/` and `in-progress/` are judged. A proposal in `done/` is
 * history: it was closed under whatever rules applied then, and failing a
 * gate over it would demand rewriting the record rather than the process.
 */
const JUDGED_FOLDERS = ['ready', 'in-progress'] as const;

/** The placeholders the scaffold ships with, verbatim. */
const SCAFFOLD_PLACEHOLDERS = [
	'TODO: describe the goal.',
	'TODO: why this work matters now.',
	'TODO: what this proposal deliberately skips.',
	'TODO: observable acceptance criteria.',
] as const;

export interface IProposalHygieneFinding {
	readonly file: string;
	readonly rule: 'unfilled-scaffold' | 'heading-id-mismatch' | 'duplicate';
	readonly detail: string;
}

/** Stable key for baselining, independent of line numbers. */
export const findingKey = (finding: IProposalHygieneFinding): string =>
	`${finding.file}::${finding.rule}::${finding.detail}`;

const frontmatterId = (text: string): string | undefined =>
	/^id:\s*(\S+)\s*$/mu.exec(text)?.[1];

const headingId = (text: string): string | undefined =>
	/^#\s+([a-z]\d{5})\b/mu.exec(text)?.[1];

/**
 * The comparable shape of a proposal: what it is about, stripped of the
 * words that differ between two descriptions of the same job.
 *
 * Deliberately crude. A stricter similarity measure would catch more and
 * would also start refusing two genuinely different proposals that happen
 * to touch one file, and a hygiene gate that cries wolf gets baselined
 * into silence. This one only fires when two OPEN proposals name exactly
 * the same files in exactly the same slice shape, which is what x00420 and
 * x00422 did.
 */
export const fingerprintProposal = (text: string): string | undefined => {
	const files = [...text.matchAll(/^- \*\*Files\*\*:\s*(.+)$/gmu)].map(
		(match) => (match[1] ?? '').trim(),
	);
	if (files.length === 0) return undefined;
	return files.join(' | ');
};

export const checkProposal = (
	file: string,
	text: string,
): readonly IProposalHygieneFinding[] => {
	const findings: IProposalHygieneFinding[] = [];

	// A placeholder counts only where the scaffold puts it: alone on its
	// own line, optionally as a list item. A substring search also matched
	// prose that QUOTES the placeholder — this gate's own sibling proposal
	// explains the defect by naming it, and got reported for saying so.
	// A gate that fires on the documentation of the thing it checks is a
	// gate that gets baselined into silence.
	const lines = text.split('\n');
	for (const placeholder of SCAFFOLD_PLACEHOLDERS) {
		const unfilled = lines.some(
			(line) => line.replace(/^-\s+/u, '').trim() === placeholder,
		);
		if (!unfilled) continue;
		findings.push({
			file,
			rule: 'unfilled-scaffold',
			detail: `still carries the scaffold placeholder "${placeholder}"`,
		});
	}

	const declared = frontmatterId(text);
	const heading = headingId(text);
	if (
		declared !== undefined &&
		heading !== undefined &&
		declared !== heading
	) {
		findings.push({
			file,
			rule: 'heading-id-mismatch',
			detail: `frontmatter says ${declared}, the H1 says ${heading}`,
		});
	}

	return findings;
};

/** Cross-file rule: two open proposals that describe the same work. */
export const findDuplicates = (
	proposals: ReadonlyMap<string, string>,
): readonly IProposalHygieneFinding[] => {
	const byFingerprint = new Map<string, string[]>();
	for (const [file, text] of proposals) {
		const fingerprint = fingerprintProposal(text);
		if (fingerprint === undefined) continue;
		const bucket = byFingerprint.get(fingerprint) ?? [];
		bucket.push(file);
		byFingerprint.set(fingerprint, bucket);
	}
	const findings: IProposalHygieneFinding[] = [];
	for (const [, bucket] of byFingerprint) {
		if (bucket.length < 2) continue;
		const sorted = [...bucket].sort();
		// Report the later ones against the first, so resolving the
		// duplicate does not shift the finding onto the survivor.
		for (const file of sorted.slice(1))
			findings.push({
				file,
				rule: 'duplicate',
				detail: `same slice files as ${sorted[0] ?? ''}`,
			});
	}
	return findings;
};

const collectProposals = (root: string): Map<string, string> => {
	const out = new Map<string, string>();
	const walk = (dir: string): void => {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.endsWith('.md')) continue;
			if (entry.toLowerCase() === 'readme.md') continue;
			// Repo-relative: an absolute path would bake this checkout's
			// location into the baseline, so the same tree would fail on
			// any other machine and in CI.
			out.set(relative(root, full), readFileSync(full, 'utf8'));
		}
	};
	for (const folder of JUDGED_FOLDERS)
		walk(join(root, 'docs/mcp-vertex/proposals', folder));
	return out;
};

const main = (): number => {
	const update = process.argv.includes('--update');
	const proposals = collectProposals(process.cwd());

	if (proposals.size === 0) {
		// A gate that scanned nothing must say so rather than report ok —
		// this repo has been burnt by gates that passed because they never
		// looked at anything.
		console.error(
			'proposal-hygiene: scanned ZERO proposals; refusing to report ok',
		);
		return 1;
	}

	const findings: IProposalHygieneFinding[] = [];
	for (const [file, text] of proposals)
		findings.push(...checkProposal(file, text));
	findings.push(...findDuplicates(proposals));

	const baseline: string[] = (() => {
		try {
			return JSON.parse(readFileSync(BASELINE, 'utf8')) as string[];
		} catch {
			return [];
		}
	})();

	if (update) {
		writeFileSync(
			BASELINE,
			`${JSON.stringify(findings.map(findingKey).sort(), null, 2)}\n`,
			'utf8',
		);
		console.log(
			`proposal-hygiene: baseline updated — ${findings.length} finding(s) across ${proposals.size} open proposal(s).`,
		);
		return 0;
	}

	const known = new Set(baseline);
	const fresh = findings.filter((f) => !known.has(findingKey(f)));

	if (fresh.length === 0) {
		console.log(
			`proposal-hygiene: no new findings (${baseline.length} baselined, ${proposals.size} open proposals scanned).`,
		);
		return 0;
	}

	console.error(
		`proposal-hygiene: ${fresh.length} new finding(s) across ${proposals.size} open proposal(s):`,
	);
	for (const finding of fresh)
		console.error(
			`  ${finding.rule}  ${finding.file}\n    ${finding.detail}`,
		);
	console.error(
		'\nA proposal that does not state its goal or its acceptance criteria can never be\n' +
			'closed: the closing gate asks whether the criteria are met and finds none. Fill\n' +
			'it in, or delete it. Rebaseline with --update only for findings you have decided\n' +
			'to carry deliberately.',
	);
	return 1;
};

if (import.meta.main) process.exit(main());

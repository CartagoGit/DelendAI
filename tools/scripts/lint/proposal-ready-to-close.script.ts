#!/usr/bin/env bun
/**
 * proposal-ready-to-close.script.ts — R-2026-08-31.
 *
 * Lint that catches proposals sitting in `in-progress/` with all
 * slices `done` but a missing/empty `shipped-in:` frontmatter. Those
 * proposals are the canonical stuck state: the implementer shipped the
 * work, the peer-reviewer approved it, but nobody ever called
 * `proposals_proposal_transition { to: "done" }` (or it was rejected
 * because `guardShippedInPresent` requires `shipped-in:` in the
 * frontmatter). Without this lint the proposals accumulate indefinitely.
 *
 * For each finding the script renders:
 *  - the proposal id
 *  - the count of `done` slices vs total slices
 *  - whether `shipped-in:` is missing, empty, or populated
 *  - the next action the operator (or an agent) must take to close it
 *
 * The lint is advisory by default (exit 0) — it surfaces the
 * housekeeping debt without failing CI. Pass `--strict` to fail when
 * any proposal is reported (recommended for CI on `develop`).
 *
 * Usage:
 *   bun tools/scripts/lint/proposal-ready-to-close.script.ts
 *   bun tools/scripts/lint/proposal-ready-to-close.script.ts --strict
 *   bun tools/scripts/lint/proposal-ready-to-close.script.ts --proposal=<id>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { collectSliceStatuses } from '../../../plugins/proposals/src/lib/services/proposal-completeness';
import { parseProposalSlicePlan } from '../../../plugins/proposals/src/lib/swarm/proposal-slice-plan';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../../plugins/proposals/src/lib/proposals/frontmatter-parser';
import { repoRoot } from '../lib/monorepo-paths';

const _PROPOSALS_ROOT = 'docs/delendai/proposals';
const BASELINE_REL = 'tools/scripts/lint/proposal-ready-to-close.baseline.json';
const PROPOSAL_FILENAME = /^[a-z]\d{5}-[a-z0-9-]+\.md$/;
/**
 * Every folder a finished proposal can be stranded in.
 *
 * It used to be `in-progress` alone, which is why 25 proposals with all
 * slices done sat unseen in `ready/` and `review/`. The two cases are
 * NOT the same, and the glossary says why: `ready` has no edge to
 * `done` at all (ready -> in-progress -> review -> done), so a `ready`
 * proposal whose slices are all done is drift — the work cannot even
 * have been claimed through the state machine. `review -> done` IS the
 * legal closing hop, so a finished proposal waiting there is waiting
 * correctly, on a DIFFERENT agent's approval. Reporting both and
 * failing only on the first is the difference between a gate and a
 * nag.
 */
const SCAN_DIRS: readonly string[] = ['in-progress', 'ready', 'review'];

/** Folders where "all slices done" means the proposal is stranded. */
const DRIFT_FOLDERS: ReadonlySet<string> = new Set(['in-progress', 'ready']);

export type IReadyToCloseFinding = {
	readonly relPath: string;
	readonly folder: string;
	/** `true` when the folder has no legal edge to `done` (drift). */
	readonly stranded: boolean;
	readonly proposalId: string;
	readonly totalSlices: number;
	readonly doneSlices: number;
	readonly shippedInState: 'missing' | 'empty' | 'invalid' | 'ok';
	readonly nextAction: string;
	/** For a proposal waiting in review with valid `shipped-in`. */
	readonly drift?: IReviewDrift;
};

const walkMarkdown = (absDir: string, out: string[]): void => {
	for (const entry of readdirSync(absDir, { withFileTypes: true })) {
		const abs = join(absDir, entry.name);
		if (entry.isDirectory()) walkMarkdown(abs, out);
		else if (PROPOSAL_FILENAME.test(entry.name)) out.push(abs);
	}
};

/**
 * Slice counts come from the canonical parser, not a private regex.
 *
 * The copy that used to live here required the status to be a single
 * word ending the line (`/^\s*-\s*\*\*Status\*\*:\s*(\w+)\s*$/`), so a slice
 * that explains itself — `**Status**: done — before the S3 shrink, …`,
 * the house style for evidence — matched nothing. The proposal then
 * counted zero slices and was skipped as "not finished". Three stranded
 * proposals in `ready/` were invisible for exactly that reason,
 * including the one an external audit named. One parser, one answer.
 */
const countSlices = (markdown: string): { done: number; total: number } => {
	const slices = collectSliceStatuses(markdown);
	return {
		done: slices.filter((slice) => slice.status === 'done').length,
		total: slices.length,
	};
};

const readFrontmatter = (markdown: string): Record<string, unknown> => {
	const block = extractYamlBlock(markdown);
	if (block === null) return {};
	return parseFrontmatterBlock(block) as Record<string, unknown>;
};

const shippedInState = (
	fm: Record<string, unknown>,
): IReadyToCloseFinding['shippedInState'] => {
	const list = fm['shipped-in'];
	if (!Array.isArray(list)) return 'missing';
	if (list.length === 0) return 'empty';
	const shas = list.filter(
		(v) => typeof v === 'string' && v.trim().length > 0,
	);
	if (shas.length === 0) return 'empty';
	if (!shas.every((v) => /^[0-9a-f]{7,40}$/.test((v as string).trim()))) {
		return 'invalid';
	}
	return 'ok';
};

/**
 * What to actually do next.
 *
 * This used to end with "(force:true if no peer reviewer is
 * available)", which taught every agent that read it to bypass the
 * peer-review gate the moment closing became inconvenient — and a
 * proposal closed that way looks identical to one that was reviewed.
 * The honest next step is the two-call handoff: the implementer opens
 * the round, a different agent approves it. If no reviewer is
 * available, the proposal is not closable yet, and saying so is the
 * point of the gate.
 */
const nextActionFor = (
	state: IReadyToCloseFinding['shippedInState'],
	proposalId: string,
): string => {
	switch (state) {
		case 'missing':
		case 'empty':
			return (
				`Add \`shipped-in: [<sha>]\` to the top-level frontmatter of ${proposalId} ` +
				`(between the two leading --- lines — NOT inside a resolution: block). ` +
				`Find the SHA with: \`git log --oneline --all | head -20 | grep -i ${proposalId.slice(0, 1)}0\`. ` +
				`Then open a review round and have a DIFFERENT agent approve it: ` +
				`proposals_proposal_review { action: "submit", proposalId: "${proposalId}", sliceId: "<finished-slice>", agent: "<implementer>" }, ` +
				`then proposals_proposal_review { action: "approve", ... , agent: "<reviewer ≠ implementer>" }. ` +
				`Finally proposals_proposal_transition { id: "${proposalId}", to: "done", reason: "all slices done; close-loop" }.`
			);
		case 'invalid':
			return (
				`The \`shipped-in:\` list of ${proposalId} contains entries that are not 7-40 char hex SHAs. ` +
				`Replace each entry with the real commit hash. Until the gate (guardShippedInPresent) accepts every entry, the proposal cannot move to done.`
			);
		default:
			return `frontmatter already valid; run proposals_proposal_transition { id: "${proposalId}", to: "done", reason: "all slices done" }.`;
	}
};

/** How far the repository moved under a proposal waiting for review. */
export type IReviewDrift =
	| {
			readonly measured: true;
			readonly reviewAgeDays: number;
			readonly commitsSince: number;
			readonly filesTouchedSince: readonly string[];
			readonly files: number;
			readonly driftRatio: number;
	  }
	| { readonly measured: false; readonly reason: string };

/** The git facts a drift measure needs, injectable for tests. */
export interface IReviewGitFacts {
	/** Commit time in ms, or `undefined` when the commit is unknown here. */
	readonly commitTimeMs: (sha: string) => number | undefined;
	readonly commitsSince: (sha: string) => number;
	/** The given files that later commits touched, even if reverted. */
	readonly filesTouchedSince: (
		sha: string,
		files: readonly string[],
	) => readonly string[];
}

/**
 * Age and drift of a review, from the latest `shipped-in` commit git
 * knows. A review of work that landed long ago, under files rewritten
 * since, is a different job from one that landed minutes ago; this is
 * what tells them apart. Never "fresh" when it cannot be measured.
 */
export const measureReviewDrift = (input: {
	readonly shippedIn: readonly string[];
	readonly files: readonly string[];
	readonly nowMs: number;
	readonly git: IReviewGitFacts;
}): IReviewDrift => {
	const landed = input.shippedIn
		.map((sha) => ({ sha, at: input.git.commitTimeMs(sha) }))
		.filter((c): c is { sha: string; at: number } => c.at !== undefined)
		.sort((a, b) => b.at - a.at)[0];
	if (landed === undefined) {
		return {
			measured: false,
			reason: 'no shipped-in commit is known to this clone',
		};
	}
	const touched = [...input.git.filesTouchedSince(landed.sha, input.files)];
	return {
		measured: true,
		reviewAgeDays: Math.floor((input.nowMs - landed.at) / 86_400_000),
		commitsSince: input.git.commitsSince(landed.sha),
		filesTouchedSince: touched,
		files: input.files.length,
		driftRatio:
			input.files.length === 0 ? 0 : touched.length / input.files.length,
	};
};

/** Largest drift first, then oldest; unmeasurable last. */
export const byDrift = (a: IReviewDrift, b: IReviewDrift): number => {
	if (!a.measured || !b.measured) {
		return Number(!a.measured) - Number(!b.measured);
	}
	return (
		b.driftRatio - a.driftRatio ||
		b.commitsSince - a.commitsSince ||
		b.reviewAgeDays - a.reviewAgeDays
	);
};

/** Every file the proposal's slices declare, once each. */
const sliceFilesOf = (
	proposalId: string,
	markdown: string,
): readonly string[] => [
	...new Set(
		(parseProposalSlicePlan(proposalId, markdown)?.slices ?? []).flatMap(
			(slice) => slice.files,
		),
	),
];

export const scanReadyToClose = (
	proposalsDirAbs: string,
	options: {
		readonly proposalId?: string;
		/** Measures review drift when given; the report passes real git. */
		readonly git?: IReviewGitFacts;
		readonly nowMs?: number;
	} = {},
): readonly IReadyToCloseFinding[] => {
	const root = repoRoot();
	const findings: IReadyToCloseFinding[] = [];
	for (const dir of SCAN_DIRS) {
		const abs = join(proposalsDirAbs, dir);
		if (!existsSync(abs)) continue;
		const files: string[] = [];
		walkMarkdown(abs, files);
		for (const proposalAbs of files) {
			const rel = relative(root, proposalAbs).split('\\').join('/');
			const markdown = readFileSync(proposalAbs, 'utf8');
			const fm = readFrontmatter(markdown);
			const proposalId = typeof fm.id === 'string' ? fm.id : 'unknown';
			if (options.proposalId && proposalId !== options.proposalId) {
				continue;
			}
			const { done, total } = countSlices(markdown);
			// Skip non-completed proposals.
			if (total === 0 || done < total) continue;
			const state = shippedInState(fm);
			findings.push({
				relPath: rel,
				folder: dir,
				stranded: DRIFT_FOLDERS.has(dir),
				proposalId,
				totalSlices: total,
				doneSlices: done,
				shippedInState: state,
				nextAction: nextActionFor(state, proposalId),
				...(options.git !== undefined &&
				!DRIFT_FOLDERS.has(dir) &&
				state === 'ok'
					? {
							drift: measureReviewDrift({
								shippedIn: (fm['shipped-in'] as string[]).map(
									(sha) => sha.trim(),
								),
								files: sliceFilesOf(proposalId, markdown),
								nowMs: options.nowMs ?? Date.now(),
								git: options.git,
							}),
						}
					: {}),
			});
		}
	}
	findings.sort((a, b) => a.proposalId.localeCompare(b.proposalId));
	return findings;
};

const driftNote = (drift: IReviewDrift | undefined): string => {
	if (drift === undefined) return '';
	if (!drift.measured) return `; drift: unmeasurable (${drift.reason})`;
	return `; ${String(drift.reviewAgeDays)}d old, ${String(drift.commitsSince)} commits since, ${String(drift.filesTouchedSince.length)}/${String(drift.files)} files touched since`;
};

const render = (
	findings: readonly IReadyToCloseFinding[],
	sort: 'drift' | 'age' = 'drift',
): string => {
	if (findings.length === 0) {
		return '✓ proposal-ready-to-close: no finished proposal is stranded outside done/.\n';
	}
	const stranded = findings.filter((f) => f.stranded);
	const unmeasured = { measured: false, reason: '' } as const;
	const awaiting = findings
		.filter((f) => !f.stranded)
		.sort((a, b) =>
			sort === 'age'
				? (b.drift?.measured === true ? b.drift.reviewAgeDays : -1) -
					(a.drift?.measured === true ? a.drift.reviewAgeDays : -1)
				: byDrift(a.drift ?? unmeasured, b.drift ?? unmeasured),
		);
	const lines: string[] = [];
	if (stranded.length > 0) {
		lines.push(
			`✖ proposal-ready-to-close: ${stranded.length} proposal(s) have every slice done in a folder with no edge to done.\n`,
		);
		for (const f of stranded) {
			lines.push(
				`  ${f.proposalId} [${f.folder}] (${f.doneSlices}/${f.totalSlices} slices done, shipped-in: ${f.shippedInState})`,
			);
			lines.push(`    ${f.relPath}`);
			lines.push(`    next: ${f.nextAction}`);
		}
	}
	if (awaiting.length > 0) {
		lines.push(
			`\n  ${awaiting.length} finished proposal(s) wait in review/ for a second agent's approval — the legal closing hop, not drift:`,
		);
		for (const f of awaiting) {
			lines.push(
				`    ${f.proposalId} (${f.doneSlices}/${f.totalSlices}, shipped-in: ${f.shippedInState}${driftNote(f.drift)})`,
			);
		}
	}
	return lines.join('\n');
};

/**
 * The ratchet, in the shape this repo's other proposal gates use.
 *
 * Three proposals are stranded in `ready/` today and none of them can be
 * closed by whoever notices: closing needs `shipped-in:` plus a review
 * round approved by a DIFFERENT agent than the implementer. Failing on
 * them immediately would paint develop red for a state no single agent
 * may fix, so they are recorded and the pressure goes on NEW drift. The
 * list may only shrink.
 */
export const loadBaseline = (root: string): readonly string[] => {
	try {
		const raw = readFileSync(join(root, BASELINE_REL), 'utf8');
		const parsed: unknown = JSON.parse(raw);
		if (parsed === null || typeof parsed !== 'object') return [];
		return Object.keys(parsed as Record<string, unknown>);
	} catch {
		return [];
	}
};

/** Stranded findings that the baseline does not already account for. */
export const unbaselinedStrandings = (
	findings: readonly IReadyToCloseFinding[],
	baseline: readonly string[],
): readonly IReadyToCloseFinding[] => {
	const known = new Set(baseline);
	return findings.filter((f) => f.stranded && !known.has(f.proposalId));
};

/** Baselined ids that are no longer stranded — the ratchet's win. */
export const resolvedStrandings = (
	findings: readonly IReadyToCloseFinding[],
	baseline: readonly string[],
): readonly string[] => {
	const stranded = new Set(
		findings.filter((f) => f.stranded).map((f) => f.proposalId),
	);
	return baseline.filter((id) => !stranded.has(id));
};

/** Git facts about `ref`'s history, read from the clone at `root`. */
const gitFactsAt = (root: string, ref: string): IReviewGitFacts => {
	const git = (args: readonly string[]): string | undefined => {
		try {
			return execFileSync('git', [...args], {
				cwd: root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			}).trim();
		} catch {
			return undefined;
		}
	};
	return {
		commitTimeMs: (sha) => {
			if (git(['merge-base', '--is-ancestor', sha, ref]) === undefined) {
				return undefined;
			}
			const seconds = git(['show', '-s', '--format=%ct', sha]);
			return seconds === undefined ? undefined : Number(seconds) * 1000;
		},
		commitsSince: (sha) =>
			Number(git(['rev-list', '--count', `${sha}..${ref}`]) ?? 0),
		filesTouchedSince: (sha, files) =>
			files.length === 0
				? []
				: [
						...new Set(
							(
								git([
									'log',
									'--format=',
									'--name-only',
									`${sha}..${ref}`,
									'--',
									...files,
								]) ?? ''
							)
								.split('\n')
								.filter((line) => line.length > 0),
						),
					],
	};
};

const main = (): number => {
	const args = new Set(process.argv.slice(2));
	const strict = args.has('--strict');
	const proposalArg = [...args]
		.find((arg) => arg.startsWith('--proposal='))
		?.split('=')[1];
	const proposalsDirAbs = join(repoRoot(), 'docs', 'delendai', 'proposals');
	const findings = scanReadyToClose(proposalsDirAbs, {
		...(proposalArg !== undefined ? { proposalId: proposalArg } : {}),
		git: gitFactsAt(repoRoot(), 'HEAD'),
	});
	const sort = [...args].includes('--sort=age') ? 'age' : 'drift';
	process.stdout.write(`${render(findings, sort)}\n`);
	const root = repoRoot();
	if (args.has('--update')) {
		const stranded = findings
			.filter((f) => f.stranded)
			.sort((a, b) => a.proposalId.localeCompare(b.proposalId));
		// An object keyed by id, tab-indented, the shape the other
		// baselines in this directory use: it survives the formatter
		// whatever its length, and it records WHY each entry is frozen
		// instead of leaving a bare list nobody can audit.
		const entries: Record<string, string> = {};
		for (const f of stranded) {
			entries[f.proposalId] =
				`${String(f.doneSlices)}/${String(f.totalSlices)} slices done in ${f.folder}/; shipped-in: ${f.shippedInState}`;
		}
		writeFileSync(
			join(root, BASELINE_REL),
			`${JSON.stringify(entries, null, '\t')}\n`,
		);
		process.stdout.write(
			`proposal-ready-to-close: baseline updated — ${String(stranded.length)} stranded proposal(s).\n`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);
	const fresh = unbaselinedStrandings(findings, baseline);
	const resolved = resolvedStrandings(findings, baseline);
	if (resolved.length > 0) {
		process.stdout.write(
			`  ${String(resolved.length)} baselined proposal(s) are no longer stranded (${resolved.join(', ')}) — rerun with --update to lock the win in.\n`,
		);
	}
	if (fresh.length > 0) {
		process.stderr.write(
			`\n✖ proposal-ready-to-close: ${String(fresh.length)} NEW stranded proposal(s): ${fresh
				.map((f) => f.proposalId)
				.join(', ')}\n` +
				'  A proposal whose slices are all done cannot sit in a folder with no edge to `done`.\n' +
				'  Move it through the state machine, or record it with --update if it is genuinely blocked.\n',
		);
		return 1;
	}
	// `review` is a legitimate waiting state, so it never fails the gate;
	// only a proposal stranded where the state machine cannot close it does.
	if (strict && findings.some((f) => f.stranded)) return 1;
	return 0;
};

if (import.meta.main) process.exit(main());

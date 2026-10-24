#!/usr/bin/env bun
/**
 * proposals-tracked.script.ts — a proposal that only exists in someone's
 * working copy does not exist.
 *
 * WHY this gate exists, measured rather than imagined. Twice in one week
 * an agent authored proposals and left them untracked in the shared
 * checkout: once a second agent wrote `f00539`–`f00546` straight into
 * the working tree, and once THIS agent did the same with `f00547`–
 * `f00550` while waiting for an unrelated pull request to land. Both
 * times the files were real work that nobody else could see: not on a
 * ref, not on the forge, not in the SQLite index, and invisible to every
 * other agent deciding what to work on next.
 *
 * The response to the first incident was to make `create_proposal`
 * return the publication step as its `nextAction`. That is advice, and
 * advice is exactly what a less capable agent skips — as the second
 * incident proved, with a capable one. So the rule stops being a
 * sentence an agent may read and becomes a gate it cannot push past.
 *
 * WHAT IT REFUSES: any file under the proposals directory that git does
 * not have — untracked, or tracked with uncommitted modifications. The
 * fix is never "delete it"; it is to land the file the way this project
 * declares, which is why the failure prints the project's own
 * integration step rather than a hard-coded "open a pull request". A
 * repository that merges straight to its integration branch is told to
 * do that instead.
 *
 * WHAT IT DELIBERATELY ALLOWS: a clean working copy with proposals fully
 * committed, and a run in a repository that has no proposals directory
 * at all (a host that does not use the plugin is not in violation of
 * anything).
 *
 * Usage:
 *   bun tools/scripts/lint/proposals-tracked.script.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';

/** One file git does not yet hold, and why it is reported. */
export interface IUnlandedProposal {
	readonly path: string;
	readonly reason: 'untracked' | 'modified';
}

export interface IProposalsTrackedReport {
	readonly verdict: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
	readonly unlanded: readonly IUnlandedProposal[];
	readonly message: string;
}

/**
 * Read `git status --porcelain` for one directory.
 *
 * Porcelain v1 is used rather than v2 because its two-character status
 * field is the whole question here: `??` is untracked, anything with a
 * non-space in the worktree column is modified. Paths are returned
 * repo-relative, exactly as the caller passes them on.
 */
export const parsePorcelain = (
	porcelain: string,
): readonly IUnlandedProposal[] => {
	const unlanded: IUnlandedProposal[] = [];
	for (const rawLine of porcelain.split('\n')) {
		if (rawLine.trim().length === 0) continue;
		const status = rawLine.slice(0, 2);
		// Porcelain quotes paths containing unusual bytes; strip the
		// quoting so the reported path is the one a human would type.
		const rawPath = rawLine.slice(3).trim();
		const path =
			rawPath.startsWith('"') && rawPath.endsWith('"')
				? rawPath.slice(1, -1)
				: rawPath;
		if (path.length === 0) continue;
		if (status === '??') {
			unlanded.push({ path, reason: 'untracked' });
			continue;
		}
		// A staged-but-uncommitted change is still not on a ref. The
		// index column (status[0]) being non-space is as much a failure
		// as the worktree column, because neither has reached the forge.
		if (status.trim().length > 0) {
			unlanded.push({ path, reason: 'modified' });
		}
	}
	return unlanded;
};

/**
 * The whole decision as a pure function, so every verdict — including
 * the one that must never be confused with a pass — is pinned by a case
 * instead of reproduced by staging a repository.
 *
 * `integrationStep` is the project's own sentence for how work reaches
 * the integration branch. It is passed in rather than derived here so
 * the gate stays workflow-agnostic: this script never decides that a
 * pull request is the right answer.
 */
export const judgeProposalsTracked = (input: {
	readonly hasProposalsDir: boolean;
	readonly unlanded: readonly IUnlandedProposal[];
	readonly integrationStep: string;
}): IProposalsTrackedReport => {
	if (!input.hasProposalsDir) {
		return {
			verdict: 'NOT_APPLICABLE',
			unlanded: [],
			message:
				'proposals-tracked: no proposals directory in this workspace, so there is nothing to land.',
		};
	}
	if (input.unlanded.length === 0) {
		return {
			verdict: 'PASS',
			unlanded: [],
			message:
				'proposals-tracked: every proposal in this workspace is committed.',
		};
	}
	const lines = input.unlanded.map(
		(entry) => `  ${entry.reason.padEnd(9)} ${entry.path}`,
	);
	return {
		verdict: 'FAIL',
		unlanded: input.unlanded,
		message: [
			`✖ proposals-tracked: ${input.unlanded.length} proposal file(s) exist only in this working copy.`,
			'',
			...lines,
			'',
			'  A proposal nobody else can see is not a proposal. No other agent',
			'  can read it, claim it, or avoid duplicating it, and it is absent',
			'  from the index that answers "what is there to work on?".',
			'',
			`  Land them: ${input.integrationStep}`,
			'',
			'  Never resolve this by deleting the files — that discards real work.',
		].join('\n'),
	};
};

/** The proposals directory, as this workspace lays it out. */
const proposalsDirOf = (root: string): string => {
	const configPath = join(root, 'delendai.config.json');
	if (!existsSync(configPath)) return 'docs/delendai/proposals';
	try {
		const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
			readonly docsDir?: string;
			readonly plugins?: {
				readonly proposals?: {
					readonly options?: { readonly proposalsDir?: string };
				};
			};
		};
		const configured = config.plugins?.proposals?.options?.proposalsDir;
		if (typeof configured === 'string' && configured.length > 0) {
			return configured;
		}
		const docsDir = config.docsDir ?? 'docs/delendai';
		return `${docsDir}/proposals`;
	} catch {
		return 'docs/delendai/proposals';
	}
};

const main = (): number => {
	const root = repoRoot();
	const proposalsDir = proposalsDirOf(root);
	const hasProposalsDir = existsSync(join(root, proposalsDir));

	const porcelain = hasProposalsDir
		? execFileSync('git', ['status', '--porcelain', '--', proposalsDir], {
				cwd: root,
				encoding: 'utf8',
				maxBuffer: 16 * 1024 * 1024,
			})
		: '';

	// The project's own integration sentence, so a host that merges
	// directly is not told to open a pull request it does not use.
	let integrationStep =
		'commit them and get them onto the integration branch the way this project declares.';
	try {
		const branches = declaredBranches(root);
		integrationStep = `commit them onto a ref and land that ref into \`${branches.integration}\` the way this project declares (see \`create_proposal\`'s nextAction).`;
	} catch {
		// Policy unavailable (a host without the config): the generic
		// sentence above is still true, and a gate must not fail because
		// it could not phrase its advice.
	}

	const report = judgeProposalsTracked({
		hasProposalsDir,
		unlanded: parsePorcelain(porcelain),
		integrationStep,
	});

	console.log(report.message);
	return report.verdict === 'FAIL' ? 1 : 0;
};

if (import.meta.main) process.exit(main());

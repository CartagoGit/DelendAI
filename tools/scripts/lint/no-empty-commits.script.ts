#!/usr/bin/env bun
/**
 * no-empty-commits.script.ts
 *
 * Refuse to push a commit whose tree is identical to its parent's.
 *
 * An empty commit is not merely untidy here. Four of them on develop
 * read `feat(xNNNNN): commit via slice SN`: they told the proposals
 * engine a slice had shipped while carrying not one changed byte. A
 * proposal can then close on the strength of a commit that contains
 * nothing, and the work is simply gone — with a SHA to point at.
 *
 * The `commit-tree` path that minted several of them is fixed, but they
 * kept appearing from other paths, so this checks the OUTCOME instead of
 * guessing at causes: whatever produced it, an empty commit does not
 * leave this machine.
 *
 * Merge commits are exempt. A merge whose tree equals its first
 * parent's is normal and carries real meaning (it records that a branch
 * was integrated), so emptiness is only defined here for single-parent
 * commits.
 *
 * Exit codes: 0 — no empty commits in the range. 1 — at least one.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface IEmptyCommit {
	readonly sha: string;
	readonly subject: string;
}

const git = async (args: readonly string[]): Promise<string> => {
	const { stdout } = await exec('git', [...args], {
		maxBuffer: 16 * 1024 * 1024,
	});
	return stdout;
};

/**
 * Parse `git rev-list --parents --format` output into commits with their
 * parent count, so a merge can be told from an ordinary commit without
 * a second call per commit.
 */
export const parseRevList = (
	stdout: string,
): readonly { sha: string; parents: readonly string[]; subject: string }[] => {
	const out: { sha: string; parents: string[]; subject: string }[] = [];
	// `--format=%s` emits: "<sha> <parents…>\n<subject>\n" per commit.
	const lines = stdout.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const header = lines[index]?.trim() ?? '';
		if (header === '') continue;
		// `rev-list --format` prefixes each header with the literal word
		// "commit". The first version of this parser did not drop it, so
		// every line failed the sha test, every commit was skipped, and
		// the gate reported "ok" having examined nothing — the precise
		// failure `lint:no-silent-gates` exists to catch, in a gate
		// written the same week.
		const parts = header
			.split(' ')
			.filter((part) => part.length > 0 && part !== 'commit');
		const sha = parts[0];
		if (sha === undefined || !/^[0-9a-f]{7,40}$/u.test(sha)) continue;
		out.push({
			sha,
			parents: parts.slice(1),
			subject: lines[index + 1]?.trim() ?? '',
		});
		index += 1;
	}
	return out;
};

export const findEmptyCommits = async (
	range: string,
): Promise<readonly IEmptyCommit[]> => {
	const stdout = await git([
		'rev-list',
		'--parents',
		'--format=%s',
		range,
	]).catch(() => '');
	const empties: IEmptyCommit[] = [];
	for (const commit of parseRevList(stdout)) {
		// Only single-parent commits have a meaningful notion of empty.
		if (commit.parents.length !== 1) continue;
		const parent = commit.parents[0] as string;
		const [tree, parentTree] = await Promise.all([
			git(['rev-parse', `${commit.sha}^{tree}`]).catch(() => 'a'),
			git(['rev-parse', `${parent}^{tree}`]).catch(() => 'b'),
		]);
		if (tree.trim() === parentTree.trim()) {
			empties.push({ sha: commit.sha, subject: commit.subject });
		}
	}
	return empties;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const explicit = argv.find((arg) => arg.includes('..'));
	let range = explicit;
	if (range === undefined) {
		// Resolve the outgoing range from git, never from a lefthook
		// `{…}` template: x00159 cost a day to a guard that never fired
		// because lefthook cannot populate a refspec for a plain push,
		// so the placeholder shipped as a literal string.
		const upstream = (
			await git(['rev-parse', '--abbrev-ref', '@{upstream}']).catch(
				() => '',
			)
		).trim();
		if (upstream === '') {
			console.log(
				'✓ no-empty-commits: ok (no upstream to compare against)',
			);
			return 0;
		}
		range = `${upstream}..HEAD`;
	}

	const empties = await findEmptyCommits(range);
	if (empties.length === 0) {
		console.log(`✓ no-empty-commits: ok (${range})`);
		return 0;
	}

	console.error(
		`✖ no-empty-commits: ${String(empties.length)} commit(s) in ${range} have the same tree as their parent:`,
	);
	for (const commit of empties) {
		console.error(`  ${commit.sha}  ${commit.subject}`);
	}
	console.error('');
	console.error(
		'  An empty commit that says it shipped a slice is worse than no commit:',
	);
	console.error(
		'  a proposal can close on its SHA while the work it claims is nowhere.',
	);
	console.error(
		'  Drop it (`git rebase --onto <sha>^ <sha>`) or put the intended change in it.',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}

#!/usr/bin/env bun
/**
 * open-publication-prs.script.ts — every well-shaped publication has a
 * pull request (x00677).
 *
 * `delendai work publish` opens the pull request of what it publishes.
 * An agent that pushes a publication ref by hand does not, and its work
 * then sits on the forge unreviewed and unmerged — and fails
 * `ref-lifecycle`, the required check, for every other pull request.
 * The local hydrator runs this after the integration branch moves, on the
 * machine that holds the forge credential: it opens the missing pull
 * requests of publications that have the project's shape, through the
 * same service the CLI uses, and only reports the ones that do not.
 */
import { execFileSync } from 'node:child_process';

import { openPublicationPullRequest } from '@delendai/cli';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/monorepo-paths';
import { prHeadProblem } from '../lint/pr-head-shape.script';

const run = (command: string, args: readonly string[]): string | undefined => {
	try {
		return execFileSync(command, [...args], {
			cwd: repoRoot(),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

const shortRef = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

const main = (): number => {
	const branches = declaredBranches(repoRoot());
	const publication = shortRef(branches.publicationRefPrefix);
	if (publication === '') {
		console.log(
			'open-publication-prs: NOT_APPLICABLE — no publication namespace.',
		);
		return 0;
	}
	const listed = (
		run('git', [
			'ls-remote',
			'--',
			'origin',
			`refs/heads/${publication}*`,
		]) ?? ''
	)
		.split('\n')
		.map((line) => line.split('\t'))
		.flatMap(([sha, ref]) =>
			sha && ref ? [{ sha, branch: shortRef(ref) }] : [],
		);
	const apply = process.argv.includes('--apply');
	for (const { sha, branch } of listed) {
		const problem = prHeadProblem(branch, branches);
		if (problem !== undefined) {
			console.log(`open-publication-prs: left alone — ${problem}`);
			continue;
		}
		const known = run('gh', [
			'pr',
			'list',
			'--head',
			branch,
			'--state',
			'all',
			'--json',
			'state,headRefOid',
			'--jq',
			`[.[] | select(.state=="OPEN" or .headRefOid=="${sha}")] | length`,
		]);
		if (known === undefined || known !== '0') continue;
		if (!apply) {
			console.log(`open-publication-prs: would open ${branch}`);
			continue;
		}
		run('git', ['fetch', '--quiet', '--', 'origin', sha]);
		const opened = openPublicationPullRequest({
			remote: 'origin',
			base: branches.integration,
			branch,
			tip: sha,
			integrationBase: `origin/${branches.integration}`,
			fallbackTitle: branch,
			ports: {
				git: (args) => run('git', args),
				gh: (args) => run('gh', args),
			},
		});
		console.log(
			`open-publication-prs: ${branch} — ${opened.status}${'url' in opened ? ` ${opened.url}` : ` (${opened.reason})`}`,
		);
	}
	return 0;
};

if (import.meta.main) process.exit(main());

#!/usr/bin/env bun
/**
 * upsert-issue — keep one open issue per title, or close it when it clears.
 *
 *   bun tools/scripts/ci/upsert-issue.script.ts --title=<t> --body=<text>
 *   bun tools/scripts/ci/upsert-issue.script.ts --title=<t> --close=<comment>
 *
 * Needs the `gh` CLI with GH_TOKEN and GITHUB_REPOSITORY in the environment.
 */
import { spawnSync } from 'node:child_process';

import {
	closeClearedIssues,
	type IIssueForge,
	upsertIssue,
} from './upsert-issue';

const arg = (name: string): string | undefined =>
	process.argv
		.find((a) => a.startsWith(`--${name}=`))
		?.slice(name.length + 3);

const gh = (args: readonly string[]): string => {
	const done = spawnSync(
		'gh',
		[...args, '--repo', process.env.GITHUB_REPOSITORY ?? ''],
		{ encoding: 'utf8' },
	);
	if (done.status !== 0) throw new Error(done.stderr);
	return done.stdout;
};

const forge: IIssueForge = {
	listOpen: (title) =>
		Promise.resolve(
			(
				JSON.parse(
					gh([
						'issue',
						'list',
						'--state',
						'open',
						'--search',
						`"${title}" in:title`,
						'--json',
						'number,title',
					]),
				) as { number: number; title: string }[]
			)
				.filter((issue) => issue.title === title)
				.map((issue) => issue.number),
		),
	create: (title, body) => {
		gh(['issue', 'create', '--title', title, '--body', body]);
		return Promise.resolve();
	},
	edit: (number, body) => {
		gh(['issue', 'edit', String(number), '--body', body]);
		return Promise.resolve();
	},
	close: (number, comment) => {
		gh(['issue', 'close', String(number), '--comment', comment]);
		return Promise.resolve();
	},
};

const title = arg('title');
const body = arg('body');
const cleared = arg('close');
if (title === undefined || (body === undefined && cleared === undefined)) {
	console.error('usage: --title=<t> (--body=<text> | --close=<comment>)');
	process.exit(2);
}
const outcome =
	cleared === undefined
		? await upsertIssue(forge, title, body ?? '')
		: await closeClearedIssues(forge, title, cleared);
console.log(`upsert-issue: ${outcome}`);

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
	createGhIssueForge,
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

const forge = createGhIssueForge(gh);

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

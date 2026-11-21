import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { hangingForgeWorkRefs } from '../../../../src/lib/work-units/forge-work-refs.service';

const LONG_AGO = 1_700_000_000;
const NOW = LONG_AGO + 30 * 86_400;

/** A clone whose forge copies are remote-tracking refs, dated long ago. */
const clone = () => {
	const root = mkdtempSync(join(tmpdir(), 'forge-work-refs-'));
	const run = (args: string[]): string =>
		execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			env: {
				...process.env,
				GIT_AUTHOR_NAME: 't',
				GIT_AUTHOR_EMAIL: 't@t',
				GIT_COMMITTER_NAME: 't',
				GIT_COMMITTER_EMAIL: 't@t',
				GIT_AUTHOR_DATE: `@${String(LONG_AGO)}`,
				GIT_COMMITTER_DATE: `@${String(LONG_AGO)}`,
			},
		}).trim();
	run(['init', '-q', '-b', 'develop']);
	run(['commit', '-q', '--allow-empty', '-m', 'base']);
	run(['update-ref', 'refs/remotes/origin/develop', 'HEAD']);
	/** A work ref on the forge with one commit of its own. */
	const unit = (name: string, trailer?: string): void => {
		run(['checkout', '-q', '-b', name, 'develop']);
		run([
			'commit',
			'-q',
			'--allow-empty',
			'-m',
			'work',
			...(trailer === undefined ? [] : ['--trailer', trailer]),
		]);
		run(['update-ref', `refs/remotes/origin/${name}`, 'HEAD']);
		run(['checkout', '-q', 'develop']);
	};
	return { root, run, unit };
};

const hanging = (
	root: string,
	refs: readonly string[],
	published: readonly string[] = [],
) =>
	hangingForgeWorkRefs({
		root,
		remote: 'origin',
		integration: 'develop',
		refs,
		leaseTtlMinutes: 30,
		now: NOW,
		published,
	});

describe('hangingForgeWorkRefs', () => {
	it('calls a long-silent work ref hanging', () => {
		const { root, unit } = clone();
		unit('delendai/wip/a/implement/x1-S1-g1/t');
		expect(hanging(root, ['delendai/wip/a/implement/x1-S1-g1/t'])).toEqual([
			{ ref: 'delendai/wip/a/implement/x1-S1-g1/t', why: 'silent 720 h' },
		]);
	});

	it('lists a parked one as waiting, with what it waits on', () => {
		const { root, unit } = clone();
		unit(
			'delendai/wip/a/implement/x2-S1-g1/t',
			"Delendai-Parked: the owner's sampling run",
		);
		expect(hanging(root, ['delendai/wip/a/implement/x2-S1-g1/t'])).toEqual([
			{
				ref: 'delendai/wip/a/implement/x2-S1-g1/t',
				why: "waiting 720 h on: the owner's sampling run",
				waiting: true,
			},
		]);
	});

	it('leaves one whose publication holds all its commits', () => {
		const { root, run, unit } = clone();
		unit('delendai/wip/a/implement/x3-S1-g1/t');
		run([
			'update-ref',
			'refs/remotes/origin/delendai/pr/a/implement/x3-all-g1/t',
			'refs/remotes/origin/delendai/wip/a/implement/x3-S1-g1/t',
		]);
		expect(
			hanging(
				root,
				['delendai/wip/a/implement/x3-S1-g1/t'],
				['delendai/pr/a/implement/x3-all-g1/t'],
			),
		).toEqual([]);
	});
});

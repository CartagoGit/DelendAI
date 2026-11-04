/**
 * A change of the work-ref shape keeps every unit written under an
 * earlier shape working (x00679).
 *
 * f00644 added the kind segment, and units entered before it became
 * unreachable: the CLI rendered only the new name and reported the unit
 * missing (x00674). The rule is permanent, so the test is: for every
 * shape a unit may still carry, the current CLI enters the SAME unit,
 * checkpoints onto it and publishes it under its own name — no rename, no
 * second unit, nothing lost.
 *
 * Whoever changes `WORK_REF_SHAPE` appends the shape it replaces to
 * PREVIOUS_SHAPES.
 *
 * work-ref-shape: alternative — these are the historical shapes, spelled
 * on purpose as the record of what units in the field may carry.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveWorkRef, WORK_REF_NAMING } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { createWorkCommand } from './work.command';

/** Every shape a live unit may still carry, oldest first. */
const PREVIOUS_SHAPES: readonly string[] = [
	// Until f00644: no kind segment.
	'heads/delendai/wip/${agent}/${proposal}-${slice}-g${generation}/${topic}',
];

const UNIT = {
	agent: 'claude-opus-5',
	proposal: 'x00553',
	slice: 'S1',
	generation: 1,
	topic: 'probe',
} as const;

const ARGS = [
	`--proposal=${UNIT.proposal}`,
	`--slice=${UNIT.slice}`,
	`--agent=${UNIT.agent}`,
	`--topic=${UNIT.topic}`,
];

const roots: string[] = [];
const command = createWorkCommand();

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (root: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const contextFor = (root: string): ICliCommandContext =>
	fakePartial<ICliCommandContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			ICliCommandContext['globals'],
			'workspace' | 'json'
		>({ workspace: root, json: true }),
	});

/** A repository holding one unit written under `shape`, with its remote. */
const repoWithUnitUnder = (
	shape: string,
): { readonly root: string; readonly branch: string } => {
	const root = mkdtempSync(join(tmpdir(), 'work-ref-migration-'));
	const remote = mkdtempSync(join(tmpdir(), 'work-ref-migration-remote-'));
	roots.push(root, remote);
	git(remote, 'init', '-q', '--bare');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	// The unit's worktree is placed in the repository; it is ignored, as
	// a worktree in the shared checkout's tree must be (x00695).
	writeFileSync(join(root, '.gitignore'), 'unit/\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	const ref = resolveWorkRef(shape, UNIT);
	const commit = git(
		root,
		'commit-tree',
		git(root, 'rev-parse', 'HEAD^{tree}'),
		'-p',
		'HEAD',
		'-m',
		'feat: work written under an earlier shape',
	);
	git(root, 'update-ref', ref, commit);
	return { root, branch: ref.replace(/^refs\/heads\//u, '') };
};

describe('a work-ref shape change keeps old units working (x00679)', () => {
	it('pins the current shape, so a change of it records the one it replaces', () => {
		// Changing WORK_REF_SHAPE? Append the shape it replaces to
		// PREVIOUS_SHAPES above, then update this line. Units in the field
		// still carry the old one, and the cases below prove they keep
		// working.
		expect(WORK_REF_NAMING.shape).toBe(
			'${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}',
		);
	});

	for (const shape of PREVIOUS_SHAPES) {
		describe(shape, () => {
			it('enters the same unit, without a second one', async () => {
				const { root, branch } = repoWithUnitUnder(shape);
				const entered = await command.run(
					['enter', ...ARGS, '--dir=unit'],
					contextFor(root),
				);
				expect(entered.data).toMatchObject({ branch });
				expect(
					git(
						root,
						'for-each-ref',
						'--format=%(refname)',
						'refs/heads/delendai/wip/',
					)
						.split('\n')
						.filter((line) => line.length > 0),
				).toEqual([`refs/heads/${branch}`]);
			});

			it('checkpoints onto the same unit', async () => {
				const { root, branch } = repoWithUnitUnder(shape);
				const before = git(root, 'rev-parse', branch);
				writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
				const result = await command.run(
					[
						'checkpoint',
						...ARGS,
						'--paths=a.ts',
						'--message=feat: more work',
					],
					contextFor(root),
				);
				expect(result.code).toBe(0);
				expect(git(root, 'rev-parse', branch)).not.toBe(before);
				expect(
					git(
						root,
						'rev-parse',
						`${git(root, 'rev-parse', branch)}~1`,
					),
				).toBe(before);
			});

			it('publishes it under its own name', async () => {
				const { root, branch } = repoWithUnitUnder(shape);
				const published = await command.run(
					['publish', ...ARGS],
					contextFor(root),
				);
				expect(published.data).toMatchObject({ published: true });
				expect(git(root, 'ls-remote', 'origin')).toContain(
					branch.replace('/wip/', '/pr/'),
				);
			});
		});
	}
});

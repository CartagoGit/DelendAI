/**
 * What a delendai tool writes in a unit of work is committed when the call
 * returns, on a real repository.
 */
import { execFileSync } from 'node:child_process';
import {
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	commitSubjectFor,
	pathsTheCallChanged,
	withCallWritesCommitted,
} from '../../../../src/lib/shared/commit-call-writes';
import { bindWriteRoot } from '../../../../src/lib/shared/bind-write-root';
import { buildFsToolRegistrations } from '../../../../src/lib/shared/fs-tools';
import { createFakeToolServer } from '@delendai/test-kit';
import type { IToolRegistration } from '@delendai/core/lib/contracts/interfaces/tool-registration.interface';

const made: string[] = [];
afterEach(() => {
	for (const dir of made.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A project on work refs: its shared checkout, and one unit's worktree. */
const project = (): { readonly shared: string; readonly unit: string } => {
	const parent = realpathSync(mkdtempSync(join(tmpdir(), 'x722-')));
	made.push(parent);
	const shared = join(parent, 'checkout');
	const unit = join(parent, 'unit');
	execFileSync('git', ['init', '-q', '-b', 'develop', shared]);
	git(shared, 'config', 'user.email', 'owner@example.test');
	git(shared, 'config', 'user.name', 'Owner');
	writeFileSync(
		join(shared, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	writeFileSync(join(shared, 'proposal.md'), 'status: review\n');
	git(shared, 'add', '-A');
	git(shared, 'commit', '-q', '-m', 'base');
	git(
		shared,
		'worktree',
		'add',
		'-q',
		'-b',
		'delendai/wip/qwen/review/batch-g1/backlog',
		unit,
	);
	return { shared, unit };
};

const writing =
	(root: string, files: Readonly<Record<string, string>>) =>
	async (): Promise<unknown> => {
		for (const [path, content] of Object.entries(files)) {
			writeFileSync(join(root, path), content);
		}
		return { content: [{ type: 'text', text: '{"ok":true}' }] };
	};

describe('a write in a unit of work is committed as it happens', () => {
	it('commits exactly the paths the call changed, named after the call', async () => {
		const { unit } = project();
		writeFileSync(join(unit, 'mine.txt'), 'the agent was editing this\n');

		await withCallWritesCommitted(
			unit,
			'proposal_review',
			{ proposalId: 'x00001', sliceId: 'S1', action: 'approve' },
			writing(unit, { 'proposal.md': 'status: review\napproved\n' }),
		);

		expect(git(unit, 'log', '-1', '--format=%s')).toBe(
			'chore(delendai): proposal_review x00001 S1 approve',
		);
		expect(git(unit, 'show', '--name-only', '--format=', 'HEAD')).toBe(
			'proposal.md',
		);
		expect(git(unit, 'status', '--porcelain')).toBe('?? mine.txt');
	});

	it('commits once another process lets go of the lock it met', async () => {
		const { shared, unit } = project();
		const lock = join(
			shared,
			'.git/refs/heads/delendai/wip/qwen/review/batch-g1/backlog.lock',
		);
		writeFileSync(lock, '');
		setTimeout(() => rmSync(lock, { force: true }), 1500);

		await withCallWritesCommitted(
			unit,
			'proposal_review',
			{ proposalId: 'x00001', sliceId: 'S1', action: 'submit' },
			writing(unit, { 'proposal.md': 'status: review\nsubmitted\n' }),
		);

		expect(git(unit, 'log', '-1', '--format=%s')).toBe(
			'chore(delendai): proposal_review x00001 S1 submit',
		);
		expect(git(unit, 'status', '--porcelain')).toBe('');
	});

	it('commits a new file, and a file the agent had already changed', async () => {
		const { unit } = project();
		writeFileSync(join(unit, 'proposal.md'), 'the agent edited it\n');

		await withCallWritesCommitted(
			unit,
			'fs_write',
			{ path: 'proposal.md' },
			writing(unit, {
				'proposal.md': 'the tool wrote it\n',
				'new.md': 'new\n',
			}),
		);

		expect(
			git(unit, 'show', '--name-only', '--format=', 'HEAD').split('\n'),
		).toEqual(['new.md', 'proposal.md']);
		expect(git(unit, 'status', '--porcelain')).toBe('');
	});

	it('commits a file the call renamed, and one it created (x00733)', async () => {
		const { unit } = project();

		await withCallWritesCommitted(
			unit,
			'proposal_review',
			{ proposalId: 'x00001' },
			async () => {
				git(unit, 'mv', 'proposal.md', 'x00001-canonical.md');
				writeFileSync(join(unit, '.gitkeep'), '');
				return { content: [{ type: 'text', text: '{"ok":true}' }] };
			},
		);

		expect(
			git(
				unit,
				'show',
				'--no-renames',
				'--name-status',
				'--format=',
				'HEAD',
			)
				.split('\n')
				.sort(),
		).toEqual(['A\t.gitkeep', 'A\tx00001-canonical.md', 'D\tproposal.md']);
		expect(git(unit, 'status', '--porcelain')).toBe('');
	});

	it('commits a file the call renamed and then moved on', async () => {
		const { unit } = project();

		const result = await withCallWritesCommitted(
			unit,
			'proposal_review',
			{ proposalId: 'x00001', action: 'request_changes' },
			async () => {
				// Renamed to its canonical name (staged), then reopened
				// into another stage: the canonical path never lands.
				git(unit, 'mv', 'proposal.md', 'x00001-canonical.md');
				rmSync(join(unit, 'x00001-canonical.md'));
				writeFileSync(
					join(unit, 'x00001-reopened.md'),
					'status: open\n',
				);
				return { content: [{ type: 'text', text: '{"ok":true}' }] };
			},
		);

		expect(result).toEqual({
			content: [{ type: 'text', text: '{"ok":true}' }],
		});
		expect(
			git(
				unit,
				'show',
				'--no-renames',
				'--name-status',
				'--format=',
				'HEAD',
			)
				.split('\n')
				.sort(),
		).toEqual(['A\tx00001-reopened.md', 'D\tproposal.md']);
		expect(git(unit, 'status', '--porcelain')).toBe('');
	});

	it('commits nothing when all the call wrote it removed again', async () => {
		const { unit } = project();
		const head = git(unit, 'rev-parse', 'HEAD');

		const result = await withCallWritesCommitted(
			unit,
			'proposal_review',
			{ proposalId: 'x00001' },
			async () => {
				writeFileSync(join(unit, 'draft.md'), 'draft\n');
				git(unit, 'add', 'draft.md');
				rmSync(join(unit, 'draft.md'));
				return { content: [{ type: 'text', text: '{"ok":true}' }] };
			},
		);

		expect(result).toEqual({
			content: [{ type: 'text', text: '{"ok":true}' }],
		});
		expect(git(unit, 'rev-parse', 'HEAD')).toBe(head);
		expect(git(unit, 'status', '--porcelain')).toBe('');
	});

	it('commits nothing when the call failed or changed nothing', async () => {
		const { unit } = project();
		const head = git(unit, 'rev-parse', 'HEAD');

		await withCallWritesCommitted(unit, 'fs_write', {}, async () => {
			writeFileSync(join(unit, 'half.md'), 'half\n');
			return { isError: true, content: [] };
		});
		await withCallWritesCommitted(unit, 'fs_read', {}, async () => ({
			content: [],
		}));

		expect(git(unit, 'rev-parse', 'HEAD')).toBe(head);
	});

	it('commits nothing outside a unit of work', async () => {
		const { shared, unit } = project();
		const head = git(shared, 'rev-parse', 'HEAD');
		git(unit, 'switch', '-q', '-c', 'feature/by-hand');

		await withCallWritesCommitted(
			shared,
			'fs_write',
			{},
			writing(shared, { 'a.md': 'a\n' }),
		);
		await withCallWritesCommitted(
			unit,
			'fs_write',
			{},
			writing(unit, { 'b.md': 'b\n' }),
		);

		expect(git(shared, 'rev-parse', 'HEAD')).toBe(head);
		expect(git(unit, 'rev-parse', 'HEAD')).toBe(head);
	});

	it('says what to run when the commit is refused, and still answers', async () => {
		const { unit } = project();
		const hooks = join(git(unit, 'rev-parse', '--git-common-dir'), 'hooks');
		writeFileSync(join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n', {
			mode: 0o755,
		});

		const result = (await withCallWritesCommitted(
			unit,
			'fs_write',
			{ path: 'a.md' },
			writing(unit, { 'a.md': 'a\n' }),
		)) as { readonly content: readonly { readonly text: string }[] };

		expect(result.content[0]?.text).toBe('{"ok":true}');
		expect(result.content[1]?.text).toContain('could not commit');
		expect(result.content[1]?.text).toContain('add -A -- a.md');
	});

	it('commits calls in one worktree one after another', async () => {
		const { unit } = project();

		await Promise.all(
			['a', 'b', 'c'].map((name) =>
				withCallWritesCommitted(
					unit,
					'fs_write',
					{ path: `${name}.md` },
					writing(unit, { [`${name}.md`]: `${name}\n` }),
				),
			),
		);

		expect(
			git(unit, 'log', '-3', '--format=%s').split('\n').sort(),
		).toEqual([
			'chore(delendai): fs_write a.md',
			'chore(delendai): fs_write b.md',
			'chore(delendai): fs_write c.md',
		]);
		expect(git(unit, 'status', '--porcelain')).toBe('');
	});
});

describe('what a commit says', () => {
	it('names the tool and what it acted on, within one line', () => {
		expect(
			commitSubjectFor('proposal_transition', { id: 'x1', to: 'done' }),
		).toBe('chore(delendai): proposal_transition x1 done');
		expect(commitSubjectFor('fs_write', undefined)).toBe(
			'chore(delendai): fs_write',
		);
		const long = commitSubjectFor('fs_write', { path: 'a/'.repeat(80) });
		expect(long.length).toBe(72);
		expect(long.endsWith('…')).toBe(true);
	});

	it('reads a change to a path already changed, and ignores what the call left alone', () => {
		const before = new Map([
			['kept.md', ' M:1'],
			['edited.md', ' M:1'],
		]);
		const after = new Map([
			['kept.md', ' M:1'],
			['edited.md', ' M:2'],
			['new.md', '??:3'],
		]);
		expect(pathsTheCallChanged(before, after)).toEqual([
			'edited.md',
			'new.md',
		]);
	});
});

describe('every caller-checkout tool commits through the write binding', () => {
	it('commits what fs_write wrote into the unit it names', async () => {
		const { shared, unit } = project();
		const fsWrite = buildFsToolRegistrations({
			namespacePrefix: 'core',
			workspaceRootAbs: shared,
		}).find((tool) => tool.id === 'fs_write') as IToolRegistration;
		let handler: ((args: unknown) => Promise<unknown>) | undefined;
		await bindWriteRoot(fsWrite, shared).register(
			createFakeToolServer({
				onRegisterTool: (registered) => {
					handler = registered.handler as typeof handler;
				},
			}),
		);
		if (handler === undefined) throw new Error('fs_write did not register');

		await handler({ path: 'note.md', content: 'hello', checkout: unit });

		expect(readFileSync(join(unit, 'note.md'), 'utf8')).toBe('hello');
		expect(git(unit, 'log', '-1', '--format=%s')).toBe(
			'chore(delendai): core_fs_write note.md',
		);
	});
});

/**
 * The coordination journal read from the ref a project publishes it to,
 * against a real remote.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '../../../../src/lib/contracts/interfaces/git-runner.interface';
import {
	journalRefReader,
	journalSourceFor,
	parseJournal,
} from '../../../../src/lib/startup-reconciler/journal-ref.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const runnerIn =
	(cwd: string): IGitRunner =>
	async (args) => {
		const result = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
		return { ok: result.status === 0, output: result.stdout ?? '' };
	};

/** A clone of a bare remote; `journal`, when given, is published there. */
const project = (journal?: string): { clone: string; remote: string } => {
	const root = mkdtempSync(join(tmpdir(), 'journal-ref-'));
	roots.push(root);
	const remote = join(root, 'remote.git');
	const clone = join(root, 'clone');
	git(root, 'init', '-q', '--bare', remote);
	git(root, 'init', '-q', clone);
	if (journal !== undefined) {
		const publisher = join(root, 'publisher');
		git(root, 'init', '-q', publisher);
		writeFileSync(join(publisher, 'journal.ndjson'), journal);
		git(publisher, 'add', '-A');
		git(
			publisher,
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t',
			'commit',
			'-q',
			'-m',
			'journal',
		);
		git(publisher, 'push', '-q', remote, 'HEAD:refs/delendai/journal');
	}
	return { clone, remote };
};

const line = (eventKind: string, occurredAt: number): string =>
	JSON.stringify({ eventKind, occurredAt, proposalUid: 'x1' });

const read = (clone: string, remote: string | undefined, since?: number) =>
	journalRefReader(runnerIn(clone), async () => remote)(
		'delendai',
		'develop',
		since,
	);

describe('the journal published to a ref', () => {
	it('is empty on a remote nobody published one to', async () => {
		const { clone, remote } = project();
		expect(await read(clone, remote)).toEqual({
			kind: 'payload',
			payload: [],
		});
	});

	it('is empty for a project with no integration remote', async () => {
		const { clone } = project();
		expect(await read(clone, undefined)).toEqual({
			kind: 'payload',
			payload: [],
		});
	});

	it('reads every event, oldest first, and only those at or after the point asked for', async () => {
		const { clone, remote } = project(
			[
				line('slice-recovered', 30),
				line('owner-changed', 10),
				'',
				line('recovery-decision', 20),
			].join('\n'),
		);
		const all = await read(clone, remote);
		expect(all.kind).toBe('payload');
		expect(
			all.kind === 'payload' &&
				all.payload.map((event) => event.occurredAt),
		).toEqual([10, 20, 30]);

		const since = await read(clone, remote, 20);
		expect(
			since.kind === 'payload' &&
				since.payload.map((event) => event.occurredAt),
		).toEqual([20, 30]);
		// Read twice, it answers the same events: the import dedupes them.
		expect(await read(clone, remote)).toEqual(all);
	});

	it('imports nothing from a journal with a line that is not an event', async () => {
		const { clone, remote } = project(
			[
				line('owner-changed', 10),
				'{"eventKind":"made-up","occurredAt":1}',
			].join('\n'),
		);
		const result = await read(clone, remote);
		expect(result.kind).toBe('unavailable');
		expect(result.kind === 'unavailable' && result.reason).toContain(
			'line 2',
		);
	});

	it('is unavailable, not empty, when the remote cannot be asked', async () => {
		const { clone } = project();
		const result = await read(
			clone,
			join(tmpdir(), 'no-such-remote-anywhere.git'),
		);
		expect(result.kind).toBe('unavailable');
	});
});

describe('the journal source a reconciliation reads', () => {
	const branches = { namespacePrefix: 'delendai', integration: 'develop' };

	it('is the one it was given', () => {
		const given = {
			read: async () => ({ kind: 'payload' as const, payload: [] }),
		};
		expect(
			journalSourceFor({ journalSource: given, git: {} }, branches),
		).toBe(given);
	});

	it('is the project ref, read through the git seam, otherwise', async () => {
		const asked: unknown[] = [];
		const source = journalSourceFor(
			{
				git: {
					readJournal: async (namespace, integration, since) => {
						asked.push([namespace, integration, since]);
						return { kind: 'payload', payload: [] };
					},
				},
			},
			branches,
		);
		await source?.read({ sinceOccurredAt: 5 });
		expect(asked).toEqual([['delendai', 'develop', 5]]);
	});

	it('is absent when the seam cannot read one', () => {
		expect(journalSourceFor({ git: {} }, branches)).toBeUndefined();
	});
});

describe('parseJournal', () => {
	it('skips blank lines and refuses one that does not parse', () => {
		expect(parseJournal('\n\n')).toEqual([]);
		expect(parseJournal('not json')).toEqual({ badLine: 1 });
	});
});

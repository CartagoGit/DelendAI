/**
 * The coordination journal published to its ref, against a real bare
 * remote and two real clones standing in for two machines.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '../../../../src/lib/contracts/interfaces/git-runner.interface';
import {
	journalRefPublisher,
	publishPendingJournal,
} from '../../../../src/lib/startup-reconciler/journal-publish.service';
import { journalRefReader } from '../../../../src/lib/startup-reconciler/journal-ref.service';
import type {
	IJournalPublication,
	IJournalSourceEvent,
} from '../../../../src/lib/startup-reconciler/seams.interface';

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
		return {
			ok: result.status === 0,
			output: result.stdout ?? '',
			reason: result.stderr,
		};
	};

interface IMachines {
	readonly remote: string;
	readonly first: string;
	readonly second: string;
}

/** One bare remote and two clones of it: two machines of one project. */
const machines = (): IMachines => {
	const root = mkdtempSync(join(tmpdir(), 'journal-publish-'));
	roots.push(root);
	const remote = join(root, 'remote.git');
	git(root, 'init', '-q', '--bare', remote);
	const first = join(root, 'first');
	const second = join(root, 'second');
	git(root, 'init', '-q', first);
	git(root, 'init', '-q', second);
	return { remote, first, second };
};

const event = (occurredAt: number, tag = 'a'): IJournalSourceEvent => ({
	eventKind: 'slice-recovered',
	proposalUid: `p-${tag}`,
	occurredAt,
	payload: { tag },
});

const publish = (
	clone: string,
	remote: string,
	events: readonly IJournalSourceEvent[],
	run: IGitRunner = runnerIn(clone),
): Promise<IJournalPublication> =>
	journalRefPublisher(run, async () => remote)('delendai', 'develop', events);

const published = async (clone: string, remote: string) => {
	const read = await journalRefReader(runnerIn(clone), async () => remote)(
		'delendai',
		'develop',
		undefined,
	);
	return read.kind === 'payload' ? read.payload : [];
};

describe('publishing the journal to its ref', () => {
	it('creates the ref on a remote nobody published to, and a clone reads it back', async () => {
		const { remote, first, second } = machines();
		expect(await publish(first, remote, [event(2), event(1)])).toEqual({
			kind: 'published',
			added: 2,
		});
		expect(
			(await published(second, remote)).map((e) => e.occurredAt),
		).toEqual([1, 2]);
	});

	it('publishes nothing twice: the same events are an unchanged ref', async () => {
		const { remote, first } = machines();
		await publish(first, remote, [event(1)]);
		const tip = git(remote, 'rev-parse', 'refs/delendai/journal');
		expect(await publish(first, remote, [event(1)])).toEqual({
			kind: 'unchanged',
		});
		expect(git(remote, 'rev-parse', 'refs/delendai/journal')).toBe(tip);
	});

	it('adds to what another machine published as a fast-forward', async () => {
		const { remote, first, second } = machines();
		await publish(first, remote, [event(1, 'a')]);
		const before = git(remote, 'rev-parse', 'refs/delendai/journal');
		expect(
			await publish(second, remote, [event(1, 'a'), event(2, 'b')]),
		).toEqual({ kind: 'published', added: 1 });
		expect(git(remote, 'merge-base', before, 'refs/delendai/journal')).toBe(
			before,
		);
		expect((await published(first, remote)).map((e) => e.payload)).toEqual([
			{ tag: 'a' },
			{ tag: 'b' },
		]);
	});

	it('merges and retries when the push is rejected because another machine published first', async () => {
		const { remote, first, second } = machines();
		await publish(first, remote, [event(1, 'a')]);
		const real = runnerIn(second);
		let raced = false;
		const racing: IGitRunner = async (args) => {
			if (args[0] === 'push' && !raced) {
				raced = true;
				await publish(first, remote, [event(1, 'a'), event(3, 'c')]);
			}
			return real(args);
		};
		expect(await publish(second, remote, [event(2, 'b')], racing)).toEqual({
			kind: 'published',
			added: 1,
		});
		expect((await published(first, remote)).map((e) => e.payload)).toEqual([
			{ tag: 'a' },
			{ tag: 'b' },
			{ tag: 'c' },
		]);
	});

	it('is a no-op for a project with no integration remote', async () => {
		const { first } = machines();
		const run = runnerIn(first);
		expect(
			await journalRefPublisher(run, async () => undefined)(
				'delendai',
				'develop',
				[event(1)],
			),
		).toEqual({ kind: 'unchanged' });
	});

	it('answers unavailable, never throws, when the remote cannot be reached', async () => {
		const { first } = machines();
		const result = await publish(first, '/nonexistent/remote.git', [
			event(1),
		]);
		expect(result.kind).toBe('unavailable');
	});
});

describe('the boot step that publishes the journal', () => {
	const branches = { namespacePrefix: 'delendai', integration: 'develop' };
	const view = {
		eventKind: 'slice-recovered',
		machineId: null,
		occurredAt: 5,
		payload: { tag: 'v' },
		proposalUid: null,
	};

	it('reports a failed publication as a note and does not throw', async () => {
		const findings = await publishPendingJournal({
			git: {
				publishJournal: async () => {
					throw new Error('network down');
				},
			},
			journal: { listAll: () => [view] },
			branches,
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			code: 'journal.publication-failed',
			kind: 'note',
			blocksMutation: false,
		});
	});

	it('hands the seam the stored rows as events without their nulls', async () => {
		let seen: readonly IJournalSourceEvent[] = [];
		const findings = await publishPendingJournal({
			git: {
				publishJournal: async (_ns, _branch, events) => {
					seen = events;
					return { kind: 'published', added: events.length };
				},
			},
			journal: { listAll: () => [view] },
			branches,
		});
		expect(seen).toEqual([
			{
				eventKind: 'slice-recovered',
				occurredAt: 5,
				payload: { tag: 'v' },
			},
		]);
		expect(findings[0]?.code).toBe('journal.published');
	});

	it('says nothing when there is no publisher or nothing to publish', async () => {
		expect(
			await publishPendingJournal({
				git: {},
				journal: { listAll: () => [view] },
				branches,
			}),
		).toEqual([]);
	});
});

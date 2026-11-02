import { describe, expect, it } from 'vitest';

import type { IRoadmapFilePort } from '../../../../src/lib/contracts/interfaces/roadmap-store.interface';
import type {
	IRoadmapTimelineDraft,
	IRoadmapTimelineStore,
} from '../../../../src/lib/contracts/interfaces/timeline.interface';
import { InMemoryTimelineStore } from '../../../../src/lib/store/in-memory-timeline.store';
import { MarkdownTimelineStore } from '../../../../src/lib/store/markdown-timeline.store';
import { whenAdded } from '../../../../src/lib/timeline/timeline-query.helper';
import { META, entry } from '../timeline/timeline-fixtures.helper';

const memoryPort = (): IRoadmapFilePort => {
	const files = new Map<string, string>();
	return {
		read: async (path) => files.get(path),
		write: async (path, content) => {
			files.set(path, content);
		},
		quarantine: async (path) => {
			files.delete(path);
			return `${path}.corrupt`;
		},
		withLock: (_path, fn) => fn(),
	};
};

const backends: ReadonlyArray<readonly [string, () => IRoadmapTimelineStore]> =
	[
		['in-memory', () => new InMemoryTimelineStore()],
		[
			'markdown',
			() =>
				new MarkdownTimelineStore({
					path: '/plan/timeline.md',
					files: memoryPort(),
				}),
		],
	];

const added = (id: string, horizon = '0.5.0'): IRoadmapTimelineDraft => ({
	...META,
	kind: 'entry-added',
	horizon,
	entryId: id,
	entry: entry(id),
});

describe.each(backends)('timeline store (%s)', (_name, create) => {
	it('lists nothing before anything was appended', async () => {
		expect(await create().list()).toEqual({ ok: true, value: [] });
	});

	it('numbers events in the order they were appended, across batches', async () => {
		const store = create();
		await store.append([added('a'), added('b')]);
		await store.append([added('c')]);
		const listed = await store.list();
		expect(listed.ok && listed.value.map((event) => event.seq)).toEqual([
			1, 2, 3,
		]);
	});

	it('answers when an entry was added, who added it and why', async () => {
		const store = create();
		await store.append([
			{ ...added('a'), actor: 'ana', reason: 'asked by support' },
		]);
		const listed = await store.list();
		const found = listed.ok ? whenAdded(listed.value, 'a') : undefined;
		expect(found?.at).toBe(META.at);
		expect(found?.actor).toBe('ana');
		expect(found?.reason).toBe('asked by support');
	});

	it('filters by entry and by horizon', async () => {
		const store = create();
		await store.append([added('a'), added('b'), added('c', '0.6.0')]);
		const byEntry = await store.list({ entryId: 'b' });
		expect(byEntry.ok && byEntry.value).toHaveLength(1);
		const byHorizon = await store.list({ horizon: '0.6.0' });
		expect(byHorizon.ok && byHorizon.value[0]?.entryId).toBe('c');
	});

	it('appends a batch whole or not at all', async () => {
		const store = create();
		const result = await store.append([
			added('a'),
			{ ...added('b'), reason: '' },
		]);
		expect(result.ok).toBe(false);
		expect(await store.list()).toEqual({ ok: true, value: [] });
	});

	it('redacts a secret in the reason', async () => {
		const store = create();
		const secret = `ghp_${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'}`;
		await store.append([{ ...added('a'), reason: `rotated ${secret}` }]);
		const listed = await store.list();
		expect(listed.ok && listed.value[0]?.reason).not.toContain(secret);
	});

	it('offers no way to remove or rewrite an event', () => {
		expect(Object.keys(Object.getPrototypeOf(create())).sort()).toEqual(
			expect.not.arrayContaining([
				'delete',
				'remove',
				'update',
				'clear',
				'rewrite',
			]),
		);
	});
});

import { describe, expect, it } from 'vitest';

import type { IRoadmapFilePort } from '../../../../src/lib/contracts/interfaces/roadmap-store.interface';
import type { IRoadmapTimelineDraft } from '../../../../src/lib/contracts/interfaces/timeline.interface';
import { MarkdownTimelineStore } from '../../../../src/lib/store/markdown-timeline.store';
import { META, entry } from '../timeline/timeline-fixtures.helper';

const PATH = '/plan/timeline.md';

const diskWith = (initial?: string) => {
	const files = new Map<string, string>();
	if (initial !== undefined) files.set(PATH, initial);
	const port: IRoadmapFilePort = {
		read: async (path) => files.get(path),
		write: async (path, content) => {
			files.set(path, content);
		},
		quarantine: async (path) => {
			const text = files.get(path);
			if (text === undefined) return null;
			files.delete(path);
			files.set(`${path}.corrupt`, text);
			return `${path}.corrupt`;
		},
		withLock: (_path, fn) => fn(),
	};
	return { files, port };
};

const added = (id: string): IRoadmapTimelineDraft => ({
	...META,
	kind: 'entry-added',
	horizon: '0.5.0',
	entryId: id,
	entry: entry(id),
});

describe('MarkdownTimelineStore', () => {
	it('keeps every earlier byte when it appends', async () => {
		const disk = diskWith();
		const store = new MarkdownTimelineStore({
			path: PATH,
			files: disk.port,
		});
		await store.append([added('a')]);
		const first = disk.files.get(PATH) ?? '';
		await store.append([added('b')]);
		const second = disk.files.get(PATH) ?? '';
		expect(second.startsWith(first)).toBe(true);
		expect(second.length).toBeGreaterThan(first.length);
	});

	it('can be searched as plain text, with no database', async () => {
		const disk = diskWith();
		const store = new MarkdownTimelineStore({
			path: PATH,
			files: disk.port,
		});
		await store.append([added('needle')]);
		const text = disk.files.get(PATH) ?? '';
		expect(text).toContain('"entryId":"needle"');
		expect(text).toContain('"kind":"entry-added"');
	});

	it('continues the numbering of a file it did not write', async () => {
		const disk = diskWith();
		await new MarkdownTimelineStore({
			path: PATH,
			files: disk.port,
		}).append([added('a')]);
		const reopened = new MarkdownTimelineStore({
			path: PATH,
			files: disk.port,
		});
		const result = await reopened.append([added('b')]);
		expect(result.ok && result.value[0]?.seq).toBe(2);
	});

	it('moves an unreadable timeline aside instead of appending to it', async () => {
		const disk = diskWith('# Roadmap timeline\n\n- {not json\n');
		const store = new MarkdownTimelineStore({
			path: PATH,
			files: disk.port,
		});
		const result = await store.append([added('a')]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain('moved to');
		expect(disk.files.has(`${PATH}.corrupt`)).toBe(true);
		expect(disk.files.has(PATH)).toBe(false);
	});

	it('reports an unreadable timeline on list without moving it', async () => {
		const disk = diskWith('- {"seq":"one"}\n');
		const store = new MarkdownTimelineStore({
			path: PATH,
			files: disk.port,
		});
		expect((await store.list()).ok).toBe(false);
		expect(disk.files.has(PATH)).toBe(true);
	});

	it('ignores prose lines around the events', async () => {
		const disk = diskWith('# Roadmap timeline\n\nSome note by hand.\n');
		const store = new MarkdownTimelineStore({
			path: PATH,
			files: disk.port,
		});
		await store.append([added('a')]);
		const listed = await store.list();
		expect(listed.ok && listed.value).toHaveLength(1);
		expect(disk.files.get(PATH)).toContain('Some note by hand.');
	});
});

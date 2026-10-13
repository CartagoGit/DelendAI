import { describe, expect, it } from 'vitest';

import type { IRoadmapFilePort } from '../../../../src/lib/contracts/interfaces/roadmap-store.interface';
import type { IRoadmap } from '../../../../src/lib/contracts/interfaces/roadmap.interface';
import { MarkdownRoadmapStore } from '../../../../src/lib/store/markdown-roadmap.store';

interface IFakeDisk {
	readonly files: Map<string, string>;
	readonly quarantined: string[];
	readonly locks: string[];
	readonly port: IRoadmapFilePort;
}

const fakeDisk = (initial: Record<string, string> = {}): IFakeDisk => {
	const files = new Map(Object.entries(initial));
	const quarantined: string[] = [];
	const locks: string[] = [];
	const port: IRoadmapFilePort = {
		read: async (path) => files.get(path),
		write: async (path, content) => {
			files.set(path, content);
		},
		quarantine: async (path) => {
			const text = files.get(path);
			if (text === undefined) return null;
			files.delete(path);
			const backup = `${path}.corrupt`;
			files.set(backup, text);
			quarantined.push(backup);
			return backup;
		},
		withLock: async (path, fn) => {
			locks.push(`enter ${path}`);
			try {
				return await fn();
			} finally {
				locks.push(`leave ${path}`);
			}
		},
	};
	return { files, quarantined, locks, port };
};

const PATH = '/project/plan/next.md';

const document = `---
schemaVersion: 1
horizons:
  - version: 0.5.0
    entries: []
---
# Notes

Prose that must survive a write.
`;

const addHorizon =
	(version: string) =>
	(roadmap: IRoadmap): { ok: true; value: IRoadmap } => ({
		ok: true,
		value: {
			...roadmap,
			horizons: [...roadmap.horizons, { version, entries: [] }],
		},
	});

describe('MarkdownRoadmapStore', () => {
	it('reads a project with no roadmap file as an empty roadmap', async () => {
		const disk = fakeDisk();
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		expect(await store.read()).toEqual({
			ok: true,
			value: { schemaVersion: 1, horizons: [] },
		});
	});

	it('reads the data from the front matter', async () => {
		const disk = fakeDisk({ [PATH]: document });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		const result = await store.read();
		expect(result.ok && result.value.horizons[0]?.version).toBe('0.5.0');
	});

	it('keeps the prose and runs the whole read-change-write under the lock', async () => {
		const disk = fakeDisk({ [PATH]: document });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		const result = await store.update(addHorizon('0.6.0'));
		expect(result.ok).toBe(true);
		const written = disk.files.get(PATH) ?? '';
		expect(written).toContain('Prose that must survive a write.');
		expect(written).toContain('0.6.0');
		expect(disk.locks).toEqual([`enter ${PATH}`, `leave ${PATH}`]);
	});

	it('quarantines an unreadable file instead of treating it as empty', async () => {
		const disk = fakeDisk({ [PATH]: '---\nhorizons: [unclosed\n---\n' });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		const result = await store.update(addHorizon('0.6.0'));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain('moved to');
		expect(disk.quarantined).toEqual([`${PATH}.corrupt`]);
		expect(disk.files.has(PATH)).toBe(false);
	});

	it('quarantines a markdown file that has no front matter', async () => {
		const disk = fakeDisk({ [PATH]: '# just prose\n' });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		const result = await store.update(addHorizon('0.6.0'));
		expect(result.ok).toBe(false);
		expect(disk.quarantined).toHaveLength(1);
	});

	it('reports a file it cannot parse on read without moving it', async () => {
		const disk = fakeDisk({ [PATH]: '# just prose\n' });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		expect((await store.read()).ok).toBe(false);
		expect(disk.files.get(PATH)).toBe('# just prose\n');
	});

	it('leaves a file of a newer schema version untouched', async () => {
		const future = '---\nschemaVersion: 2\nhorizons: []\n---\n';
		const disk = fakeDisk({ [PATH]: future });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		const result = await store.update(addHorizon('0.6.0'));
		expect(result.ok).toBe(false);
		expect(disk.files.get(PATH)).toBe(future);
		expect(disk.quarantined).toEqual([]);
	});

	it('writes nothing when the mutation refuses', async () => {
		const disk = fakeDisk({ [PATH]: document });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		const result = await store.update(() => ({
			ok: false,
			reason: 'not allowed',
		}));
		expect(result).toEqual({ ok: false, reason: 'not allowed' });
		expect(disk.files.get(PATH)).toBe(document);
	});

	it('refuses to write a roadmap that breaks the schema', async () => {
		const disk = fakeDisk({ [PATH]: document });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		const result = await store.update((roadmap) => ({
			ok: true,
			value: { ...roadmap, schemaVersion: 7 },
		}));
		expect(result.ok).toBe(false);
		expect(disk.files.get(PATH)).toBe(document);
	});

	it('redacts a secret before the text reaches the disk', async () => {
		const disk = fakeDisk({ [PATH]: document });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		const secret = `ghp_${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'}`;
		await store.update((roadmap) => ({
			ok: true,
			value: {
				...roadmap,
				horizons: [
					{
						version: '0.7.0',
						entries: [
							{
								id: 'e1',
								title: `Rotate ${secret}`,
								kind: 'chore',
								state: 'proposed',
								gates: [],
							},
						],
					},
				],
			},
		}));
		const written = disk.files.get(PATH) ?? '';
		expect(written).not.toContain(secret);
		expect(written).toContain('[REDACTED]');
	});

	it('keeps a data-only file free of front matter fences', async () => {
		const path = '/project/plan/next.yaml';
		const disk = fakeDisk({ [path]: 'schemaVersion: 1\nhorizons: []\n' });
		const store = new MarkdownRoadmapStore({ path, files: disk.port });
		await store.update(addHorizon('1.0.0'));
		const written = disk.files.get(path) ?? '';
		expect(written.startsWith('schemaVersion: 1')).toBe(true);
		expect(written).not.toContain('---');
	});

	it('uses only the path it was given', async () => {
		const disk = fakeDisk({ [PATH]: document });
		const store = new MarkdownRoadmapStore({
			path: PATH,
			files: disk.port,
		});
		await store.update(addHorizon('0.6.0'));
		expect([...disk.files.keys()]).toEqual([PATH]);
	});
});

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MarkdownRoadmapStore } from '../../../../src/lib/store/markdown-roadmap.store';
import { createNodeRoadmapFilePort } from '../../../../src/lib/store/node-roadmap-file-port.service';

describe('createNodeRoadmapFilePort', () => {
	let dir = '';

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'roadmap-port-'));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('reads a missing file as undefined', async () => {
		const port = createNodeRoadmapFilePort();
		expect(await port.read(join(dir, 'absent.md'))).toBeUndefined();
	});

	it('writes, reads back and serialises two concurrent updates', async () => {
		const path = join(dir, 'plan.md');
		const store = new MarkdownRoadmapStore({
			path,
			files: createNodeRoadmapFilePort(),
		});
		const add = (version: string) =>
			store.update((roadmap) => ({
				ok: true,
				value: {
					...roadmap,
					horizons: [...roadmap.horizons, { version, entries: [] }],
				},
			}));
		await Promise.all([add('1.0.0'), add('2.0.0')]);
		const result = await store.read();
		expect(result.ok && result.value.horizons).toHaveLength(2);
	});

	it('moves an unreadable file aside and keeps its bytes', async () => {
		const path = join(dir, 'plan.md');
		await writeFile(path, 'not a roadmap');
		const port = createNodeRoadmapFilePort();
		const backup = await port.quarantine(path);
		expect(backup).not.toBeNull();
		expect(await port.read(path)).toBeUndefined();
		expect(await readFile(backup ?? '', 'utf8')).toBe('not a roadmap');
	});
});

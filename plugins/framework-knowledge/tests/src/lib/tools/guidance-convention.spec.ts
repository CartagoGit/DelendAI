/**
 * guidance-convention.spec.ts — the tool seeds its cache from the
 * project's pack, names where the answer came from, and weighs what the
 * project already does.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IKnowledgeToolOptions } from '../../../../src/lib/contracts/interfaces/knowledge-cache.interface';
import { runFrameworkGuidance } from '../../../../src/lib/tools/guidance.tool';

let dir: string;
let options: IKnowledgeToolOptions;

const lock = (version: string) =>
	writeFile(
		join(dir, 'bun.lock'),
		JSON.stringify({
			packages: { '@angular/core': [`@angular/core@${version}`] },
		}),
	);

const packRule = (id: string, force: string, marker: string) => ({
	id,
	topic: 'templates',
	statement: `statement of ${id}`,
	force,
	appliesTo: '>=17',
	source: `https://example.test/${id}`,
	retrievedAt: '2026-09-01T00:00:00Z',
	pattern: { directory: 'src', suffix: '.html', marker },
});

const writePack = (rules: readonly unknown[]) =>
	writeFile(
		join(dir, '.delendai', 'knowledge', 'angular.json'),
		JSON.stringify({ framework: 'angular', rules }),
	);

const ask = async () =>
	(await runFrameworkGuidance({ topic: 'templates' }, options))
		.structuredContent as Record<string, unknown>;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'fk-guidance-'));
	options = {
		namespacePrefix: 't',
		workspaceRootAbs: dir,
		cacheRootAbs: join(dir, '.cache'),
	};
	await mkdir(join(dir, '.delendai', 'knowledge'), { recursive: true });
	await mkdir(join(dir, 'src'), { recursive: true });
	await writeFile(
		join(dir, 'package.json'),
		JSON.stringify({ dependencies: { '@angular/core': '^17.0.0' } }),
	);
	await lock('17.3.2');
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('framework guidance from a pack', () => {
	it('answers from the pack and names the lockfile entry and the pack', async () => {
		await writePack([packRule('control-flow', 'recommended', '@if')]);
		const out = await ask();
		expect(out.status).toBe('resolved');
		expect(out.provenance).toEqual({
			lockEntry: expect.stringContaining('17.3.2'),
			pack: '.delendai/knowledge/angular.json',
		});
		expect(out.resolution).toMatchObject({ ruleId: 'control-flow' });
	});

	it('reseeds when the lockfile entry changes', async () => {
		await writePack([
			packRule('control-flow', 'recommended', '@if'),
			{
				...packRule('defer', 'recommended', '@defer'),
				appliesTo: '>=18',
			},
		]);
		const first = await ask();
		expect(first.rules).toHaveLength(1);
		await lock('18.1.0');
		const second = await ask();
		expect(second.version).toBe('18.1.0');
		expect(second.rules).toHaveLength(2);
	});

	it('says there is no knowledge when the project has no pack', async () => {
		const out = await ask();
		expect(out.status).toBe('no-knowledge');
		expect(out.provenance).toEqual({
			lockEntry: expect.stringContaining('17.3.2'),
		});
	});

	it('tells a project that already does X to do X', async () => {
		await writePack([
			packRule('control-flow', 'recommended', '@if'),
			packRule('ng-if', 'supported', '*ngIf'),
		]);
		for (const index of [0, 1, 2, 3, 4, 5]) {
			await writeFile(
				join(dir, 'src', `a${String(index)}.html`),
				'<p *ngIf="x"></p>',
			);
		}
		const out = await ask();
		expect(out.convention).toMatchObject({ ruleId: 'ng-if', sample: 6 });
		expect(out.resolution).toMatchObject({
			ruleId: 'ng-if',
			source: 'detected-convention',
		});
	});

	it('follows the framework when the project has no clear habit', async () => {
		await writePack([
			packRule('control-flow', 'recommended', '@if'),
			packRule('ng-if', 'supported', '*ngIf'),
		]);
		await writeFile(join(dir, 'src', 'a.html'), '<p *ngIf="x"></p>');
		const out = await ask();
		expect(out.convention).toBeUndefined();
		expect(out.resolution).toMatchObject({
			ruleId: 'control-flow',
			source: 'framework-recommendation',
		});
	});
});

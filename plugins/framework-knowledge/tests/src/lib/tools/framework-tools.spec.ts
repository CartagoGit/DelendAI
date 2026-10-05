/**
 * framework-tools.spec.ts — the guidance and source tools against a
 * temporary project with a manifest, a lockfile and a cache.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeKnowledge } from '../../../../src/lib/cache/knowledge-cache';
import type { IKnowledgeToolOptions } from '../../../../src/lib/contracts/interfaces/knowledge-cache.interface';
import type { IKnowledgeRecord } from '../../../../src/lib/contracts/interfaces/knowledge-record.interface';
import { runFrameworkGuidance } from '../../../../src/lib/tools/guidance.tool';
import { runFrameworkSource } from '../../../../src/lib/tools/source.tool';

const LOCK_ENTRY = 'lockfile:@angular/core@17.3.2';

let dir: string;
let options: IKnowledgeToolOptions;

const writeProject = async (lockVersion: string | undefined) => {
	await writeFile(
		join(dir, 'package.json'),
		JSON.stringify({ dependencies: { '@angular/core': '^17.0.0' } }),
	);
	if (lockVersion !== undefined) {
		await writeFile(
			join(dir, 'bun.lock'),
			JSON.stringify({
				packages: {
					'@angular/core': [`@angular/core@${lockVersion}`],
				},
			}),
		);
	}
};

const rule = (
	id: string,
	force: IKnowledgeRecord['force'],
): IKnowledgeRecord => ({
	id,
	frameworkId: 'angular',
	appliesToVersion: '17.x',
	topic: 'templates',
	statement: `statement of ${id}`,
	force,
	evidence: {
		source: `https://angular.dev/${id}`,
		retrievedAt: '2026-09-01T00:00:00Z',
	},
});

const seed = (records: readonly IKnowledgeRecord[]) =>
	writeKnowledge(options.cacheRootAbs, {
		key: { frameworkId: 'angular', version: '17.3.2' },
		lockEntry: LOCK_ENTRY,
		records,
	});

const payload = (result: { structuredContent?: unknown }) =>
	result.structuredContent as Record<string, unknown>;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'framework-tools-'));
	await mkdir(join(dir, 'cache'));
	options = {
		namespacePrefix: 'dl',
		workspaceRootAbs: dir,
		cacheRootAbs: join(dir, 'cache'),
	};
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('framework_guidance', () => {
	it('reports unresolved when the project has no known framework', async () => {
		await writeFile(join(dir, 'package.json'), '{}');
		const out = payload(
			await runFrameworkGuidance({ topic: 'templates' }, options),
		);
		expect(out).toMatchObject({ ok: true, status: 'unresolved' });
	});

	it('reports unresolved rather than guessing a version from a range', async () => {
		await writeProject(undefined);
		const out = payload(
			await runFrameworkGuidance({ topic: 'templates' }, options),
		);
		expect(out).toMatchObject({
			status: 'unresolved',
			framework: 'angular',
		});
		expect(out).not.toHaveProperty('version');
	});

	it('reports no knowledge on a cache miss, naming the reason', async () => {
		await writeProject('17.3.2');
		const out = payload(
			await runFrameworkGuidance({ topic: 'templates' }, options),
		);
		expect(out).toMatchObject({
			status: 'no-knowledge',
			version: '17.3.2',
		});
		expect(String(out.note)).toContain('absent');
	});

	it('says the topic is empty when the cache holds other topics only', async () => {
		await writeProject('17.3.2');
		await seed([rule('a', 'recommended')]);
		const out = payload(
			await runFrameworkGuidance({ topic: 'routing' }, options),
		);
		expect(out).toMatchObject({ status: 'no-knowledge' });
		expect(String(out.note)).toContain('nothing for this topic');
	});

	it('resolves to the recommended rule and leaves the evidence out', async () => {
		await writeProject('17.3.2');
		await seed([
			rule('inline-template', 'supported'),
			rule('file-template', 'recommended'),
		]);
		const result = await runFrameworkGuidance(
			{ topic: 'templates' },
			options,
		);
		const out = payload(result);
		expect(out).toMatchObject({
			status: 'resolved',
			framework: 'angular',
			version: '17.3.2',
			resolution: {
				outcome: 'resolved',
				ruleId: 'file-template',
				source: 'framework-recommendation',
			},
		});
		expect(JSON.stringify(out)).not.toContain('angular.dev');
	});

	it('falls back to a supported rule, and omits a resolution when all are removed', async () => {
		await writeProject('17.3.2');
		await seed([rule('a', 'supported')]);
		expect(
			payload(
				await runFrameworkGuidance({ topic: 'templates' }, options),
			),
		).toMatchObject({ resolution: { ruleId: 'a', source: 'default' } });
		await seed([rule('a', 'removed')]);
		expect(
			payload(
				await runFrameworkGuidance({ topic: 'templates' }, options),
			),
		).not.toHaveProperty('resolution');
	});

	it('reports a changed lockfile entry as a miss', async () => {
		await writeProject('17.3.2');
		await seed([rule('a', 'recommended')]);
		await writeProject('17.3.3');
		const out = payload(
			await runFrameworkGuidance({ topic: 'templates' }, options),
		);
		expect(out).toMatchObject({
			status: 'no-knowledge',
			version: '17.3.3',
		});
	});

	it('narrows detection to the requested framework', async () => {
		await writeProject('17.3.2');
		const out = payload(
			await runFrameworkGuidance(
				{ topic: 'templates', framework: 'react' },
				options,
			),
		);
		expect(out).toMatchObject({ status: 'unresolved' });
	});
});

describe('framework_source', () => {
	it('returns the evidence behind one rule', async () => {
		await writeProject('17.3.2');
		await seed([rule('a', 'recommended')]);
		const out = payload(await runFrameworkSource({ ruleId: 'a' }, options));
		expect(out).toMatchObject({
			ok: true,
			ruleId: 'a',
			evidence: { source: 'https://angular.dev/a' },
		});
	});

	it('refuses an unresolved version with a stable code', async () => {
		await writeProject(undefined);
		const result = await runFrameworkSource({ ruleId: 'a' }, options);
		expect(result.isError).toBe(true);
		expect(payload(result)).toMatchObject({
			error: { code: 'unresolved' },
		});
	});

	it('refuses a project without a framework', async () => {
		await writeFile(join(dir, 'package.json'), '{}');
		const result = await runFrameworkSource({ ruleId: 'a' }, options);
		expect(result.isError).toBe(true);
	});

	it('names an unknown rule', async () => {
		await writeProject('17.3.2');
		await seed([rule('a', 'recommended')]);
		const result = await runFrameworkSource({ ruleId: 'zzz' }, options);
		expect(result.isError).toBe(true);
		expect(payload(result)).toMatchObject({
			error: { code: 'unknown-rule' },
		});
	});
});

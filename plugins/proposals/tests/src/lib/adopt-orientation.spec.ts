/**
 * adopt-orientation.spec.ts — f00116 S3.
 *
 * Booting the proposals plugin in a workspace WITHOUT a store surfaces
 * a knowledge nudge naming `proposal_adopt`; with a store present the
 * nudge is absent. And the adopt tool composes apply + migrate in one
 * call.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';

import proposalsPlugin from '../../../src/index';
import { buildAdoptRegistration } from '@delendai/proposals/lib/tools/adopt.tool';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

let root = '';

const mkCtx = () => ({
	workspace: { root, resolve: (rel: string) => join(root, rel) },
	corePaths: {
		cacheDir: '.cache/delendai',
		docsDir: 'docs/delendai',
	},
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: '.cache/delendai/proposals',
	pluginDocsDir: 'docs/delendai/proposals',
	namespacePrefix: 'proposals',
	options: {},
	args: {},
});

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'adopt-orientation-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('orientation nudge when the store is missing (f00116 S3)', () => {
	it('names proposal_adopt when there is no store', async () => {
		const result = await proposalsPlugin.register(mkCtx() as never);
		const nudge = result.knowledge?.find(
			(k: { id: string }) => k.id === 'proposals-store-missing',
		);
		expect(nudge).toBeDefined();
		expect(nudge?.body).toContain('proposal_adopt');
		expect(nudge?.body).toContain('apply: true');
	});

	it('is absent once the store exists', async () => {
		mkdirSync(join(root, 'docs/delendai/proposals/ready'), {
			recursive: true,
		});
		const result = await proposalsPlugin.register(mkCtx() as never);
		expect(
			result.knowledge?.some(
				(k: { id: string }) => k.id === 'proposals-store-missing',
			),
		).toBe(false);
	});
});

describe('apply + migrate compose in one call (f00116 S3)', () => {
	it('bootstraps the store AND migrates a foreign scheme together', async () => {
		mkdirSync(join(root, 'docs/rfcs'), { recursive: true });
		writeFileSync(
			join(root, 'docs/rfcs/one.md'),
			'# Ship exports\n\nBody.\n',
			'utf8',
		);
		const adopt = await capture(
			buildAdoptRegistration({
				namespacePrefix: 'proposals',
				workspaceRoot: root,
				proposalsDirAbs: join(root, 'docs/delendai/proposals'),
				indexPathAbs: join(
					root,
					'.cache/delendai/proposals/index.json',
				),
				lockPathAbs: join(root, '.cache/agents.lock.json'),
				counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			}),
		);
		const report = parse(
			await adopt({ apply: true, migrate: { roots: ['docs/rfcs'] } }),
		);
		expect(report.ok).toBe(true);
		expect(report.applied).toBe(true);
		expect(report.migration.migrated).toHaveLength(1);
		const migratedId = report.migration.migrated[0]!.id;
		expect(
			existsSync(
				join(
					root,
					`docs/delendai/proposals/ready/feats/${migratedId}-ship-exports.md`,
				),
			),
		).toBe(true);
		// The migrated proposal is visible to the freshly built index.
		expect(
			existsSync(join(root, '.cache/delendai/proposals/index.json')),
		).toBe(true);
	});
});

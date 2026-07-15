/**
 * adopt-apply.spec.ts — f00116 S1.
 *
 * `proposal_adopt` used to be analysis-only: it printed a plan and left
 * the agent to hand-create the store. With `apply: true` it EXECUTES
 * the bootstrap (7 status folders + .gitkeep + README + index),
 * idempotently and atomically. Dry-run stays the default.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { buildAdoptRegistration } from '@mcp-vertex/proposals/lib/tools/adopt.tool';
import { STATUS_TO_FOLDER } from '@mcp-vertex/proposals/lib/contracts/constants/proposal-glossary.constant';

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

describe('proposal_adopt apply mode (f00116 S1)', () => {
	let root = '';
	let proposalsDirAbs = '';
	let adopt: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'adopt-apply-'));
		proposalsDirAbs = join(root, 'docs/mcp-vertex/proposals');
		adopt = await capture(
			buildAdoptRegistration({
				namespacePrefix: 'proposals',
				workspaceRoot: root,
				proposalsDirAbs,
				indexPathAbs: join(
					root,
					'.cache/mcp-vertex/proposals/index.json',
				),
				lockPathAbs: join(root, '.cache/agents.lock.json'),
				counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			}),
		);
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('stays read-only by default (no apply flag, nothing written)', async () => {
		const report = parse(await adopt({}));
		expect(report.ok).toBe(true);
		expect(report.applied).toBe(false);
		expect(existsSync(join(proposalsDirAbs, 'ready'))).toBe(false);
	});

	it('apply:true bootstraps the full canonical layout in a bare repo', async () => {
		const report = parse(await adopt({ apply: true }));
		expect(report.ok).toBe(true);
		expect(report.applied).toBe(true);
		for (const folder of Object.values(STATUS_TO_FOLDER)) {
			expect(
				existsSync(join(proposalsDirAbs, folder, '.gitkeep')),
				`missing ${folder}/.gitkeep`,
			).toBe(true);
		}
		expect(existsSync(join(proposalsDirAbs, 'README.md'))).toBe(true);
		const readme = await readFile(
			join(proposalsDirAbs, 'README.md'),
			'utf8',
		);
		expect(readme).toContain('create_proposal');
		// The index was (re)built as part of the bootstrap.
		expect(
			existsSync(join(root, '.cache/mcp-vertex/proposals/index.json')),
		).toBe(true);
		expect(report.created.length).toBeGreaterThan(7);
	});

	it('re-running apply is an idempotent no-op (everything skipped)', async () => {
		await adopt({ apply: true });
		const second = parse(await adopt({ apply: true }));
		expect(second.ok).toBe(true);
		expect(second.created).toEqual([]);
		expect(second.skipped.length).toBeGreaterThan(7);
	});

	it('apply on a PARTIAL store only fills the gaps (existing files untouched)', async () => {
		await adopt({ apply: true });
		// Simulate a hand-rolled README the bootstrap must not clobber.
		const readmePath = join(proposalsDirAbs, 'README.md');
		const { writeFile } = await import('node:fs/promises');
		await writeFile(readmePath, '# my custom guide\n', 'utf8');
		rmSync(join(proposalsDirAbs, 'paused'), {
			recursive: true,
			force: true,
		});
		const report = parse(await adopt({ apply: true }));
		expect(report.created).toContain('paused/.gitkeep');
		expect(await readFile(readmePath, 'utf8')).toBe('# my custom guide\n');
	});
});

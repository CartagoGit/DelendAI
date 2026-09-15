/**
 * detail-levels-coverage.script.spec.ts — pins the contract of
 * `tools/scripts/lint/detail-levels-coverage.script.ts`: every tool
 * registration is judged on its own, so one adopted tool does not hide a
 * sibling in the same file that still lacks the `detail` contract.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	detectDetailCoverage,
	formatReport,
} from './detail-levels-coverage.script.ts';

const roots: string[] = [];

const makeRepo = async (
	files: Readonly<Record<string, string>>,
): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'detail-coverage-'));
	roots.push(root);
	for (const [rel, text] of Object.entries(files)) {
		const full = join(root, rel);
		await mkdir(join(full, '..'), { recursive: true });
		await writeFile(full, text, 'utf8');
	}
	return root;
};

afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

const MIXED_TOOLS = [
	"import { DETAIL_LEVELS, projectDetail } from '@delendai/core/public';",
	'const DetailSchema = z.enum(DETAIL_LEVELS);',
	'export const regs = [',
	'\t{',
	"\t\tid: 'demo_adopted',",
	'\t\tregister: (server) => {',
	"\t\t\tserver.registerTool('demo_adopted', { inputSchema: z.object({ detail: DetailSchema.optional() }) },",
	"\t\t\t\t(args) => projectDetail(args, {}, 'full'));",
	'\t\t},',
	'\t},',
	'\t{',
	"\t\tid: 'demo_legacy',",
	'\t\tregister: (server) => {',
	"\t\t\tserver.registerTool('demo_legacy', { inputSchema: z.object({}) }, (args) => args);",
	'\t\t},',
	'\t},',
	'];',
].join('\n');

describe('detectDetailCoverage', () => {
	it('judges each registration in a file separately', async () => {
		const root = await makeRepo({
			'plugins/demo/src/lib/tools/tools.ts': MIXED_TOOLS,
		});

		const report = await detectDetailCoverage(root);

		expect(report.scannedTools).toBe(2);
		expect(report.adopted).toEqual([
			'plugins/demo/src/lib/tools/tools.ts#demo_adopted',
		]);
		expect(report.findings).toEqual([
			{
				file: 'plugins/demo/src/lib/tools/tools.ts',
				tool: 'demo_legacy',
				reasons: [
					'missing detail: DetailSchema.optional() in input schema',
					'missing projectDetail(...) projection',
				],
			},
		]);
	});

	it('reports the file-wide markers when a file never adopted the contract', async () => {
		const root = await makeRepo({
			'plugins/demo/src/lib/tools/plain.tool.ts':
				"export const r = { id: 'plain', register: (server) => server.registerTool('plain', {}, () => ({})) };",
			'plugins/demo/src/lib/tools/helpers.ts':
				'export const noTools = 1;',
			'plugins/demo/node_modules/x/src/lib/tools/ignored.ts':
				"server.registerTool('ignored', {}, () => ({}));",
		});

		const report = await detectDetailCoverage(root);

		expect(report.scannedTools).toBe(1);
		expect(report.adopted).toEqual([]);
		expect(report.findings[0]?.tool).toBe('plain');
		expect(report.findings[0]?.reasons).toEqual([
			'missing DETAIL_LEVELS import/usage',
			'missing DetailSchema = z.enum(DETAIL_LEVELS)',
			'missing detail: DetailSchema.optional() in input schema',
			'missing projectDetail(...) projection',
		]);
	});

	it('formats adopted and pending registrations as a warning-only report', async () => {
		const root = await makeRepo({
			'plugins/demo/src/lib/tools/tools.ts': MIXED_TOOLS,
		});

		const text = formatReport(await detectDetailCoverage(root));

		expect(text).toContain('1 adopted, 1 pending, 2 tool registrations');
		expect(text).toContain(
			'  - plugins/demo/src/lib/tools/tools.ts#demo_adopted',
		);
		expect(text).toContain('pending (warning only):');
		expect(text).toContain('      missing projectDetail(...) projection');
	});
});

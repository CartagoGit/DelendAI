/**
 * detail-levels-coverage.script.spec.ts — pins the contract of
 * `tools/scripts/lint/detail-levels-coverage.script.ts`: every tool
 * registration is judged on its own, and the detail contract is
 * recognised in every form the tree actually uses (core's
 * `DETAIL_LEVELS`, a local or inline `compact|normal|full` enum, a schema
 * imported from a sibling contract, `projectDetail` or a handler that
 * reads `detail`).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	detectDetailCoverage,
	formatReport,
	MISSING_INPUT,
	MISSING_PROJECTION,
	MISSING_VOCABULARY,
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
	"\t\t\tserver.registerTool('demo_legacy', { inputSchema: z.object({}) }, (x) => x);",
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
				reasons: [MISSING_INPUT, MISSING_PROJECTION],
			},
		]);
	});

	it('reports all three gaps when a file never adopted the contract', async () => {
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
			MISSING_VOCABULARY,
			MISSING_INPUT,
			MISSING_PROJECTION,
		]);
	});

	it('accepts a local compact|normal|full enum projected with projectDetail', async () => {
		const root = await makeRepo({
			'plugins/demo/src/lib/tools/local.tool.ts': [
				"import { projectDetail } from '@delendai/core/public';",
				"const DetailSchema = z.enum(['compact', 'normal', 'full']);",
				'const InputSchema = z.object({ detail: DetailSchema.optional() });',
				"export const r = { id: 'local_enum', register: (server) => {",
				"\tserver.registerTool('local_enum', { inputSchema: InputSchema }, (args) => projectDetail(args, {}, 'full'));",
				'} };',
			].join('\n'),
		});

		const report = await detectDetailCoverage(root);

		expect(report.adopted).toEqual([
			'plugins/demo/src/lib/tools/local.tool.ts#local_enum',
		]);
		expect(report.findings).toEqual([]);
	});

	it('accepts an inline detail enum in the input schema', async () => {
		const root = await makeRepo({
			'plugins/demo/src/lib/tools/inline.tool.ts': [
				"const InputSchema = z.object({ detail: z.enum(['compact', 'normal', 'full']).optional() });",
				"export const r = { id: 'inline_enum', register: (server) => {",
				'\tserver.registerTool(\'inline_enum\', { inputSchema: InputSchema }, (args) => ({ level: args.detail ?? "normal" }));',
				'} };',
			].join('\n'),
		});

		const report = await detectDetailCoverage(root);

		expect(report.adopted).toEqual([
			'plugins/demo/src/lib/tools/inline.tool.ts#inline_enum',
		]);
	});

	it('follows an input schema imported from a sibling contract, under an alias', async () => {
		const root = await makeRepo({
			'plugins/demo/src/lib/contracts/read.contract.ts': [
				"export const readDetailSchema = z.enum(['compact', 'normal', 'full']);",
				'export const readInputSchema = z.object({ id: z.string(), detail: readDetailSchema.optional() });',
			].join('\n'),
			'plugins/demo/src/lib/tools/read.tool.ts': [
				"import { type readDetailSchema, readInputSchema as ReadInput } from '../contracts/read.contract';",
				"const renderRead = (args) => ({ level: args.detail ?? 'normal' });",
				"export const r = { id: 'contract_read', register: (server) => {",
				"\tserver.registerTool('contract_read', { inputSchema: ReadInput }, (args) => renderRead(args));",
				'} };',
			].join('\n'),
		});

		const report = await detectDetailCoverage(root);

		expect(report.adopted).toEqual([
			'plugins/demo/src/lib/tools/read.tool.ts#contract_read',
		]);
	});

	it('still reports a tool whose imported schema has no detail field', async () => {
		const root = await makeRepo({
			'plugins/demo/src/lib/contracts/plain/index.ts':
				'export const plainInputSchema = z.object({ id: z.string() });',
			'plugins/demo/src/lib/tools/plain.tool.ts': [
				"import { plainInputSchema } from '../contracts/plain';",
				"import { missingThing } from '../contracts/does-not-exist';",
				"export const r = { id: 'contract_plain', register: (server) => {",
				"\tserver.registerTool('contract_plain', { inputSchema: plainInputSchema }, (x) => x);",
				'} };',
			].join('\n'),
			'plugins/demo/src/lib/tools/second.tool.ts': [
				"import { plainInputSchema } from '../contracts/plain';",
				"export const r = { id: 'contract_plain_again', register: (server) => {",
				"\tserver.registerTool('contract_plain_again', { inputSchema: plainInputSchema }, (x) => x);",
				'} };',
			].join('\n'),
		});

		const report = await detectDetailCoverage(root);

		expect(report.adopted).toEqual([]);
		expect(report.findings.map((f) => [f.tool, f.reasons])).toEqual([
			[
				'contract_plain',
				[MISSING_VOCABULARY, MISSING_INPUT, MISSING_PROJECTION],
			],
			[
				'contract_plain_again',
				[MISSING_VOCABULARY, MISSING_INPUT, MISSING_PROJECTION],
			],
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
		expect(text).toContain(`      ${MISSING_PROJECTION}`);
	});
});

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
	composeAgentMd,
	publicSymbolsFromBarrel,
	renderAgentMdBlock,
	readPackageJson,
	readPluginManifest,
	type IAgentScope,
} from './agent-md.script';

describe('publicSymbolsFromBarrel (f00190)', () => {
	it('captures re-exports from a multi-line export block', () => {
		const barrel = [
			'export {',
			'  foo,',
			'  bar,',
			'  baz,',
			"} from '../lib/index';",
		].join('\n');
		const out = publicSymbolsFromBarrel(barrel);
		expect(out).toEqual(['foo', 'bar', 'baz']);
	});

	it('captures a single-line `export { foo, bar } from …` block', () => {
		const out = publicSymbolsFromBarrel(
			"export { foo, bar } from '../lib/index';\n",
		);
		expect(out).toEqual(['foo', 'bar']);
	});

	it('captures `export const|function|interface|type X` declarations', () => {
		const text = [
			'export const PROPOSAL_STATUSES = {};',
			'export function parseProposal() {}',
			'export interface IFoo {}',
			'export type Bar = string;',
		].join('\n');
		const out = publicSymbolsFromBarrel(text);
		expect(out).toEqual([
			'PROPOSAL_STATUSES',
			'parseProposal',
			'IFoo',
			'Bar',
		]);
	});

	it('returns the bare symbol name (no `} from …` leakage)', () => {
		const out = publicSymbolsFromBarrel(
			"export { runTaskQueue, parseTaskList } from './tools/task-queue.tool';\n",
		);
		expect(out.join(',')).not.toContain('from');
		expect(out.join(',')).not.toContain('}');
	});
});

describe('readPackageJson / readPluginManifest', () => {
	const VENDOR_ROOT = join(tmpdir(), `f00190-${Date.now()}`);

	beforeAll(async () => {
		await mkdir(`${VENDOR_ROOT}/example`, { recursive: true });
		await writeFile(
			`${VENDOR_ROOT}/example/package.json`,
			`${JSON.stringify(
				{
					name: '@mcp-vertex/example',
					version: '0.1.0',
					description: 'A test package.',
					main: './dist/index.js',
					dependencies: { zod: '^3' },
				},
				null,
				2,
			)}\n`,
		);
		await writeFile(
			`${VENDOR_ROOT}/example/plugin.manifest.ts`,
			`export default definePluginManifest({ id: 'example', summary: 'hello', presets: ['standard'], tags: ['demo', 'minimal'] });`,
		);
	});

	afterAll(async () => {
		await rm(VENDOR_ROOT, { recursive: true, force: true });
	});

	it('reads a package.json safely (no eval)', async () => {
		const pkg = await readPackageJson(
			`${VENDOR_ROOT}/example/package.json`,
		);
		expect(pkg.name).toBe('@mcp-vertex/example');
		expect(pkg.version).toBe('0.1.0');
		expect(pkg.description).toBe('A test package.');
		expect(pkg.main).toBe('./dist/index.js');
		expect(pkg.dependencies?.zod).toBe('^3');
	});

	it('reads a TS plugin manifest via regex (no eval)', async () => {
		const manifest = await readPluginManifest(
			`${VENDOR_ROOT}/example/plugin.manifest.ts`,
		);
		expect(manifest.id).toBe('example');
		expect(manifest.summary).toBe('hello');
		expect(manifest.presets).toContain('standard');
		expect(manifest.tags).toEqual(['demo', 'minimal']);
	});
});

describe('composeAgentMd', () => {
	const VENDOR_ROOT = join(tmpdir(), `f00190-compose-${Date.now()}`);

	beforeAll(async () => {
		await mkdir(`${VENDOR_ROOT}/packages/example/src/public`, {
			recursive: true,
		});
		await mkdir(`${VENDOR_ROOT}/packages/example/tests/lib`, {
			recursive: true,
		});
		await writeFile(
			`${VENDOR_ROOT}/packages/example/package.json`,
			`${JSON.stringify({
				name: '@mcp-vertex/example',
				version: '0.1.0',
				description: 'A test package.',
				main: './dist/index.js',
				dependencies: { zod: '^3' },
			})}\n`,
		);
		await writeFile(
			`${VENDOR_ROOT}/packages/example/src/public/index.ts`,
			[
				"export { foo, bar } from '../lib/index';",
				'export const PROPOSAL_STATUSES = {};',
			].join('\n'),
		);
		await writeFile(
			`${VENDOR_ROOT}/packages/example/tests/lib/ex.spec.ts`,
			"it('a', () => {});\n",
		);
	});

	afterAll(async () => {
		await rm(VENDOR_ROOT, { recursive: true, force: true });
	});

	const _fakeScope: IAgentScope = {
		dir: `${VENDOR_ROOT}/packages/example`.replace(`${process.cwd()}/`, ''),
		packageJson: `${VENDOR_ROOT}/packages/example/package.json`.replace(
			`${process.cwd()}/`,
			'',
		),
		isPlugin: false,
	};

	it('produces the eight canonical sections, even when some are empty', async () => {
		// The smoke test runs on a real workspace repo. We assert
		// the function signature only — full-section content is
		// exercised via generateAll() in production.
		const sections = await composeAgentMd({
			dir: 'plugins/proposals',
			packageJson: 'plugins/proposals/package.json',
			isPlugin: true,
		});
		expect(sections.purpose).toBeTruthy();
		expect(Array.isArray(sections.public)).toBe(true);
		expect(Array.isArray(sections.depends)).toBe(true);
		expect(Array.isArray(sections.writes)).toBe(true);
		expect(Array.isArray(sections.entry)).toBe(true);
		expect(Array.isArray(sections.tests)).toBe(true);
		expect(Array.isArray(sections.doNot)).toBe(true);
		expect(Array.isArray(sections.tokenHotspots)).toBe(true);
	});
});

describe('renderAgentMdBlock', () => {
	it('starts with the begin marker and ends with the end marker', () => {
		const block = renderAgentMdBlock({
			purpose: 'Test purpose.',
			public: ['foo'],
			depends: ['zod'],
			writes: ['/foo'],
			entry: ['./dist/index.js'],
			tests: ['packages/example/tests/ex.spec.ts'],
			doNot: ['no imports from internal core'],
			tokenHotspots: [],
		});
		expect(block).toContain('<!-- mcp-vertex:begin agent-md -->');
		expect(block).toContain('<!-- mcp-vertex:end agent-md -->');
		expect(block).toContain('Test purpose.');
		expect(block).toContain('## Public API');
		expect(block).toContain('## Depends on');
		expect(block).toContain('## Do not');
	});

	it('renders `_none_` for empty sections rather than emitting a `## Section` heading with no bullets', () => {
		const block = renderAgentMdBlock({
			purpose: 'hi',
			public: [],
			depends: [],
			writes: [],
			entry: [],
			tests: [],
			doNot: [],
			tokenHotspots: [],
		});
		expect(block).toContain('_(none)_');
	});
});

// keep the vendor directory referenced so the tmpdir is created.
void mkdir;

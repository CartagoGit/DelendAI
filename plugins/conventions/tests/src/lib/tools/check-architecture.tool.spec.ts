/**
 * Specs for `conventions_check_architecture` (f00549 S4).
 *
 * Driven through an in-memory reader so each case proves the report
 * DETECTS a crossing on a synthetic tree. A report validated only by a
 * green run against this repository could be green because it reads
 * nothing, which is why the samples and the empty-scan diagnostic are
 * asserted as carefully as the findings.
 */
import { describe, expect, it } from 'vitest';

import type { IArchitectureReader } from '../../../../src/lib/contracts/interfaces/check-architecture.interface';
import { runCheckArchitecture } from '../../../../src/lib/tools/check-architecture.tool';

const parse = (result: { content: Array<{ text?: string }> }) =>
	JSON.parse(result.content[0]?.text ?? '{}');

/** A reader over a flat `path -> text` map; directories are inferred. */
const memoryReader = (files: Record<string, string>): IArchitectureReader => ({
	async list(relDir) {
		const prefix = relDir === '' ? '' : `${relDir}/`;
		const names = new Map<string, boolean>();
		let exists = relDir === '';
		for (const path of Object.keys(files)) {
			if (!path.startsWith(prefix)) continue;
			exists = true;
			const rest = path.slice(prefix.length);
			const slash = rest.indexOf('/');
			if (slash === -1) names.set(rest, false);
			else names.set(rest.slice(0, slash), true);
		}
		if (!exists) throw new Error(`ENOENT: ${relDir}`);
		return [...names].map(([name, isDirectory]) => ({ name, isDirectory }));
	},
	async readText(relPath) {
		return files[relPath];
	},
});

const run = (
	files: Record<string, string>,
	args: Parameters<typeof runCheckArchitecture>[0] = {},
) =>
	runCheckArchitecture(args, {
		namespacePrefix: 'conventions',
		reader: memoryReader(files),
	}).then(parse);

const VIOLATIONS: Record<string, string> = {
	'packages/contracts/src/a.ts':
		"import { readFile } from 'node:fs/promises';\n",
	'packages/state/src/b.ts':
		"import type { S } from '@delendai/state-sqlite';\n",
	'packages/client/src/c.ts':
		"import type {\n\tIFoo,\n} from '@delendai/core/public';\n",
	'packages/cli/src/d.ts': "import { x } from '@delendai/core/lib/x';\n",
	'plugins/demo/src/e.ts': "import { y } from '/home/someone/y';\n",
};

describe('runCheckArchitecture — detection', () => {
	it('detects a crossing for every declared rule', async () => {
		const out = await run(VIOLATIONS);
		expect(out.ok).toBe(true);
		expect(
			out.findings
				.map((f: { enforcedBy: string }) => f.enforcedBy)
				.sort(),
		).toEqual([
			'lint:cli-imports',
			'lint:no-absolute-local-imports',
			'lint:no-core-public-types-in-client',
			'lint:no-node-imports-in-contracts',
			'lint:no-node-imports-in-state',
		]);
		expect(out.newCount).toBe(5);
	});

	it('reports file, line, specifier and the rule in its own words', async () => {
		const out = await run({
			'packages/cli/src/d.ts':
				"\n\nimport { x } from '@delendai/core/lib/x';\n",
		});
		expect(out.findings[0]).toMatchObject({
			file: 'packages/cli/src/d.ts',
			line: 3,
			specifier: '@delendai/core/lib/x',
			enforcedBy: 'lint:cli-imports',
			baselineKey:
				'packages/cli/src/d.ts:@delendai/core/lib/x:lint:cli-imports',
			baselined: false,
		});
		expect(out.findings[0].because).toContain('public API');
	});

	it('does not flag the sanctioned route out of the client layer', async () => {
		const out = await run({
			'packages/client/src/c.ts':
				"import type { IFoo } from '@delendai/core/contracts';\n",
		});
		expect(out.total).toBe(0);
		expect(out.filesScanned).toBe(1);
	});

	it('skips the directories every lint skips', async () => {
		const out = await run({
			'node_modules/x/a.ts': "import { y } from '/home/y';\n",
			'packages/cli/dist/a.ts': "import { y } from '/home/y';\n",
		});
		expect(out.filesScanned).toBe(0);
	});
});

describe('runCheckArchitecture — baseline', () => {
	it('keeps accepted debt visible but not new', async () => {
		const first = await run(VIOLATIONS);
		const accepted = first.findings
			.filter(
				(f: { enforcedBy: string }) =>
					f.enforcedBy === 'lint:cli-imports',
			)
			.map((f: { baselineKey: string }) => f.baselineKey);
		const out = await run(VIOLATIONS, { baseline: accepted });
		expect(out.total).toBe(5);
		expect(out.baselinedCount).toBe(1);
		expect(out.newCount).toBe(4);
	});
});

describe('runCheckArchitecture — a green report must be earned', () => {
	it('reports how many files each detector read', async () => {
		const out = await run(VIOLATIONS);
		const byId = Object.fromEntries(
			out.detectors.map(
				(d: { detector: string; filesInScope: number }) => [
					d.detector,
					d.filesInScope,
				],
			),
		);
		expect(byId['no-node-imports-in-contracts']).toBe(1);
		// Every .ts file is in scope for the absolute-import lint.
		expect(byId['no-absolute-local-imports']).toBe(5);
	});

	it('says an empty scan is not evidence of a clean tree', async () => {
		const out = await run({ 'docs/readme.md': '# hi\n' });
		expect(out.filesScanned).toBe(0);
		expect(out.diagnostic).toContain('not evidence of a clean tree');
	});

	it('names roots that do not exist', async () => {
		const out = await run(VIOLATIONS, { roots: ['nope'] });
		expect(out.filesScanned).toBe(0);
		expect(out.diagnostic).toContain('nope');
	});

	it('caps the listed findings but counts them all', async () => {
		const many: Record<string, string> = {};
		for (let index = 0; index < 205; index += 1) {
			many[`plugins/demo/src/f${index}.ts`] =
				"import { y } from '/home/y';\n";
		}
		const out = await run(many);
		expect(out.total).toBe(205);
		expect(out.findings).toHaveLength(200);
		expect(out.truncated).toBe(true);
	});
});

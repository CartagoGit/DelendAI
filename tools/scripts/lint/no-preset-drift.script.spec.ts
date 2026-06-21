import { describe, expect, it } from 'vitest';
import { detectDrift, formatReport } from './no-preset-drift.script';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('no-preset-drift.script', () => {
	it('flags an unknown preset name', async () => {
		const root = await makeTmpTree({
			'docs/install.md': 'Use --preset=foo to load foo.\n',
		});
		const findings = await detectDrift([root]);
		expect(findings.length).toBe(1);
		expect(findings[0]?.kind).toBe('unknown-preset');
		expect(findings[0]?.detail).toContain('--preset=foo');
		await rm(root, { recursive: true });
	});

	it('flags a verbatim --plugins= list that matches a preset', async () => {
		const root = await makeTmpTree({
			'docs/install.md': 'Run --plugins=git,search here.\n',
		});
		const findings = await detectDrift([root]);
		expect(findings.length).toBe(1);
		expect(findings[0]?.kind).toBe('verbatim-preset-list');
		expect(findings[0]?.detail).toContain('preset "minimal"');
		await rm(root, { recursive: true });
	});

	it('does not flag a --plugins= list that is a strict subset of a preset', async () => {
		const root = await makeTmpTree({
			'docs/install.md': 'Run --plugins=git only.\n',
		});
		const findings = await detectDrift([root]);
		expect(findings.length).toBe(0);
		await rm(root, { recursive: true });
	});

	it('does not flag a clean tree', async () => {
		const root = await makeTmpTree({
			'docs/install.md': 'Use --preset=full and forget about it.\n',
		});
		const findings = await detectDrift([root]);
		expect(findings.length).toBe(0);
		await rm(root, { recursive: true });
	});

	it('formatReport prints 0 violations for an empty list', () => {
		expect(formatReport([])).toContain('0 violations');
	});

	it('formatReport prints one row per finding', () => {
		const out = formatReport([
			{
				absPath: '/x',
				relPath: 'x.md',
				line: 7,
				kind: 'unknown-preset',
				detail: 'preset foo is unknown',
			},
		]);
		expect(out).toContain('1 violation');
		expect(out).toContain('x.md:7');
		expect(out).toContain('preset foo is unknown');
	});
});

const makeTmpTree = async (
	files: Readonly<Record<string, string>>,
): Promise<string> => {
	const root = join(
		tmpdir(),
		`no-preset-drift-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(root, { recursive: true });
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(root, rel);
		await mkdir(join(abs, '..'), { recursive: true });
		await writeFile(abs, content, 'utf8');
	}
	return root;
};

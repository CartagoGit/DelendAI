import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildProjectContract } from '../../../../src/lib/contract/project-contract.service';

describe('buildProjectContract', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});
	const project = (): string => {
		const root = mkdtempSync(join(tmpdir(), 'contract-'));
		roots.push(root);
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({ dependencies: { '@angular/core': '19.2.0' } }),
		);
		mkdirSync(join(root, 'src'));
		writeFileSync(
			join(root, 'src/tokens.css'),
			':root {\n  --color-primary: #0055ff;\n}\n',
		);
		return root;
	};

	it('is valid and empty when none of the contributing plugins is active', async () => {
		expect(
			await buildProjectContract({
				workspaceRoot: project(),
				active: () => false,
				optionsOf: () => ({}),
			}),
		).toEqual({ from: [] });
	});

	it('takes each part from the plugin that owns it', async () => {
		const contract = await buildProjectContract({
			workspaceRoot: project(),
			active: () => true,
			optionsOf: (plugin) =>
				plugin === 'style-convention'
					? { tokenFiles: ['src/tokens.css'] }
					: {},
		});
		expect(contract.from).toEqual([
			'framework-knowledge',
			'style-convention',
			'conventions',
		]);
		expect(contract.framework?.id).toBe('angular');
		expect(contract.style?.tokens).toEqual([
			{ name: '--color-primary', value: '#0055ff' },
		]);
		expect(contract.placement).toEqual({ profile: 'typescript' });
	});
});

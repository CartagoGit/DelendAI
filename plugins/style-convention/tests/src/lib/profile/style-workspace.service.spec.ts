/**
 * style-workspace.service.spec.ts — a project's design tokens are the
 * ones it declares, in its token files or in any stylesheet under its
 * style roots.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IStyleProfile } from '../../../../src/lib/contracts/interfaces/selector-graph.interface';
import { openStyleWorkspace } from '../../../../src/lib/profile/style-workspace.service';

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

const profile = (tokenFiles: readonly string[]): IStyleProfile => ({
	architecture: 'scss-bem',
	overrides: [],
	layers: [],
	styleRoots: ['src'],
	markupRoots: [],
	tokenFiles,
	sharedPrefixes: [],
	sharedAuthority: '',
});

describe('openStyleWorkspace', () => {
	it('counts the tokens a component stylesheet declares beside the configured token file', async () => {
		const root = await mkdtemp(join(tmpdir(), 'style-workspace-'));
		roots.push(root);
		await mkdir(join(root, 'src', 'card'), { recursive: true });
		await writeFile(
			join(root, 'src', 'tokens.css'),
			':root {\n\t--brand: red;\n}\n',
		);
		await writeFile(
			join(root, 'src', 'card', 'card.scss'),
			'$card-gap: 4px;\n.card {\n\tgap: $card-gap;\n}\n',
		);
		const workspace = await openStyleWorkspace(
			root,
			profile(['src/tokens.css']),
		);
		expect(workspace.tokens.map((token) => token.name).sort()).toEqual([
			'$card-gap',
			'--brand',
		]);
	});
});

/**
 * refactor-consent.spec.ts — a plan is applied with the token the server
 * issued for it, end to end through both tools.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { IToolRegistration } from '@delendai/core/contracts';
import { fakePartial } from '@delendai/test-kit';

import { buildRefactorRenameToolRegistrations } from './refactor-rename.tool';

interface IPlan {
	readonly files: readonly {
		readonly path: string;
		readonly hunks: unknown;
	}[];
	readonly consentToken: string;
}

describe('refactor_apply consent', () => {
	const applyWith = async (edit: (plan: IPlan) => IPlan) => {
		const dir = mkdtempSync(join(tmpdir(), 'refactor-consent-'));
		mkdirSync(join(dir, 'root'));
		writeFileSync(join(dir, 'root', 'a.ts'), 'const foo = 42;\n');
		const written: string[] = [];
		const registerTool = vi.fn();
		const handlerOf = (name: string) =>
			registerTool.mock.calls.find((call) => call[0] === name)?.[2];
		for (const registration of buildRefactorRenameToolRegistrations({
			namespacePrefix: 't',
			workspaceRootAbs: dir,
			writeFileAtomic: async (path) => {
				written.push(path);
			},
		})) {
			await registration.register(
				fakePartial<
					Parameters<IToolRegistration['register']>[0],
					'registerTool'
				>({
					registerTool,
				}),
			);
		}
		const planned = await handlerOf('t_refactor_rename')?.({
			root: 'root',
			from: 'foo',
			to: 'bar',
			scopePaths: ['root/a.ts'],
		});
		const plan: IPlan = JSON.parse(
			JSON.stringify(planned),
		).structuredContent;
		const result = await handlerOf('t_refactor_apply')?.({
			root: 'root',
			...edit(plan),
		});
		return { result: JSON.stringify(result), written };
	};

	it('writes the plan the server issued the token for', async () => {
		const { written } = await applyWith((plan) => plan);
		expect(written).toHaveLength(1);
	});

	it('writes nothing with an invented token', async () => {
		const { result, written } = await applyWith((plan) => ({
			...plan,
			consentToken: 'user-confirmed',
		}));
		expect(result).toContain('consent-refused');
		expect(written).toEqual([]);
	});

	it('writes nothing for a diff edited after the plan', async () => {
		const { result, written } = await applyWith((plan) => ({
			...plan,
			files: plan.files.map((file) => ({ ...file, hunks: [] })),
		}));
		expect(result).toContain('consent-refused');
		expect(written).toEqual([]);
	});
});

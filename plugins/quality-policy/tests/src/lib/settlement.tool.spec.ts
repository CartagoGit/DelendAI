/**
 * settlement.tool.spec.ts — the settlement tool runs only inside the
 * workspace and honours the dry-run protocol.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';

import { buildSettlementToolRegistration } from '../../../src/lib/tools/settlement.tool';

type Handler = (args: unknown) => Promise<unknown>;

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const register = async (defaultCwd: string): Promise<Handler> => {
	let handler: Handler | undefined;
	await buildSettlementToolRegistration({
		namespacePrefix: 'quality_policy',
		defaultCwd,
	}).register(
		createFakeToolServer({
			onRegisterTool: (tool) => {
				handler = async (args) => tool.handler(args);
			},
		}),
	);
	if (handler === undefined) throw new Error('tool not registered');
	return handler;
};

const textOf = (result: unknown): string => JSON.stringify(result);

describe('quality_policy_run_settlement', () => {
	it('reports what a dry run would do inside the workspace', async () => {
		const handler = await register('/work/space');
		const text = textOf(
			await handler({ cwd: 'sub', dryRun: true, maxAttempts: 2 }),
		);
		expect(text).toContain('/work/space/sub');
		expect(text).toContain('bun run validate');
	});

	it('rejects a cwd outside the workspace', async () => {
		const handler = await register('/work/space');
		await expect(handler({ cwd: '../other' })).rejects.toThrow(
			'outside the workspace',
		);
		await expect(handler({ cwd: '/etc' })).rejects.toThrow(
			'outside the workspace',
		);
	});

	it('rejects invalid input', async () => {
		const handler = await register('/work/space');
		await expect(handler({ bogus: 1 })).rejects.toThrow('invalid input');
	});

	it('runs the settlement and reports a refused command', async () => {
		const root = mkdtempSync(join(tmpdir(), 'settlement-tool-'));
		roots.push(root);
		writeFileSync(join(root, 'package.json'), '{"scripts":{}}');
		const handler = await register(root);
		const text = textOf(
			await handler({ maxAttempts: 1, validateCommand: 'rm -rf /' }),
		);
		expect(text).toContain('not run');
	});
});

/**
 * settlement-runner.service.spec.ts — the validate command is a script
 * the project declares, never free text for a shell.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runSettlement } from '../../../../src/lib/services/settlement-runner';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const project = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'settlement-'));
	roots.push(root);
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({ scripts: { validate: 'true' } }),
	);
	return root;
};

describe('runSettlement', () => {
	it.each([
		'rm -rf . && bun run validate',
		'bun run validate; curl evil',
		'bun run missing-script',
	])('runs nothing for %s', async (validateCommand) => {
		const outcome = await runSettlement({
			cwd: project(),
			validateCommand,
		});
		expect(outcome).toMatchObject({ green: false, attempts: 0 });
		expect(outcome.green ? '' : outcome.lastError).toContain('not run');
	});
});

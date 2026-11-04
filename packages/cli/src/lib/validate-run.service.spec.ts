import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { VALIDATE_LOG_RELATIVE_PATH } from '@delendai/proposals/public';

import { declaredValidateSteps, runValidate } from './validate-run.service';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

/** A project that is not this repository: no bun, no validate script. */
const project = (files: Record<string, string>): string => {
	const dir = mkdtempSync(join(tmpdir(), 'validate-run-'));
	dirs.push(dir);
	for (const [name, text] of Object.entries(files)) {
		writeFileSync(join(dir, name), text);
	}
	return dir;
};

const matrix = (commands: readonly string[]) =>
	JSON.stringify({
		validationMatrix: {
			scopes: {
				gates: commands.map((command) => ({
					command,
					expect: 'exit0',
				})),
			},
		},
	});

const journal = (dir: string) =>
	readFileSync(join(dir, VALIDATE_LOG_RELATIVE_PATH), 'utf8')
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line) as Record<string, unknown>);

describe('delendai validate in any project (x00712)', () => {
	it('runs the declared gates and journals a pass the close can read', async () => {
		const dir = project({
			'delendai.config.json': matrix(['true', 'exit 0']),
		});
		const outcome = await runValidate(dir);
		expect(outcome).toMatchObject({
			declared: true,
			passed: true,
			failed: [],
		});
		expect(journal(dir)).toEqual([
			expect.objectContaining({
				result: 'pass',
				exitCode: 0,
				command: 'true && exit 0',
			}),
		]);
	});

	it('runs every gate, and names the ones that failed', async () => {
		const dir = project({
			'delendai.config.json': matrix(['false', 'true', 'exit 3']),
		});
		const outcome = await runValidate(dir);
		expect(outcome).toMatchObject({
			declared: true,
			passed: false,
			failed: ['gates: false', 'gates: exit 3'],
		});
		expect(journal(dir)[0]).toMatchObject({
			result: 'fail',
			failedSteps: ['gates: false', 'gates: exit 3'],
		});
	});

	it("runs a project's own validate script with its own package manager", () => {
		const dir = project({
			'package.json': JSON.stringify({
				scripts: { validate: 'eslint .' },
			}),
			'pnpm-lock.yaml': '',
		});
		expect(declaredValidateSteps(dir)).toEqual([
			{ scope: 'package', command: 'pnpm run validate' },
		]);
	});

	it('runs nothing, and journals nothing, when the project declares nothing', async () => {
		const dir = project({
			'package.json': JSON.stringify({ scripts: {} }),
		});
		expect(await runValidate(dir, () => 0)).toEqual({ declared: false });
		expect(() => journal(dir)).toThrow();
	});
});

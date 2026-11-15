import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';
import type { IRehearsalCommandRunner } from '@delendai/integration/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';

import {
	runIntegrationActivate,
	runIntegrationDeactivate,
	runIntegrationResume,
} from './integration-activation.command';

const configOf = (engine: string): string =>
	`{\n\t"development": {\n\t\t"integration": {\n\t\t\t"engine": "${engine}"\n\t\t}\n\t}\n}\n`;

const withProject = async (
	engine: string,
	run: (ctx: ICliCommandContext, dir: string) => Promise<void>,
): Promise<void> => {
	const dir = mkdtempSync(join(tmpdir(), 'integration-activation-'));
	try {
		writeFileSync(join(dir, 'delendai.config.json'), configOf(engine));
		await run(fakePartial<ICliCommandContext>({ cwd: dir }), dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

const gh =
	(calls: string[] = []): IRehearsalCommandRunner =>
	async (args) => {
		const line = args.join(' ');
		calls.push(line);
		if (line.startsWith('repo view'))
			return { exitCode: 0, stdout: 'o/proj\n', stderr: '' };
		if (line.includes('/pulls?'))
			return {
				exitCode: 0,
				stdout: JSON.stringify([
					{
						number: 4,
						node_id: 'N4',
						labels: [{ name: 'delendai:paused' }],
					},
					{ number: 5, node_id: 'N5', labels: [] },
				]),
				stderr: '',
			};
		if (line.includes('git/ref/heads/'))
			return {
				exitCode: 0,
				stdout: JSON.stringify({ object: { sha: 'a'.repeat(40) } }),
				stderr: '',
			};
		if (line.includes('/workflows/'))
			return {
				exitCode: 0,
				stdout: JSON.stringify({ workflow_runs: [] }),
				stderr: '',
			};
		if (/^(secret|variable) list/u.test(line))
			return { exitCode: 0, stdout: '', stderr: '' };
		if (line.includes('/installation'))
			return { exitCode: 1, stdout: '', stderr: 'HTTP 404' };
		return { exitCode: 0, stdout: '{}', stderr: '' };
	};

describe('integration activate, deactivate and resume', () => {
	it('[<500ms] refuses to activate with no evidence and changes nothing', async () => {
		await withProject('none', async (ctx, dir) => {
			const result = await runIntegrationActivate(ctx, gh());
			expect(result.code).toBe(EXIT_CODE.RUNTIME);
			expect(result.error).toContain('no fast rehearsal report');
			expect(result.error).toContain('no real rehearsal report');
			expect(
				readFileSync(join(dir, 'delendai.config.json'), 'utf8'),
			).toBe(configOf('none'));
		});
	});

	it('[<500ms] deactivates to none and removes the generated workflows', async () => {
		await withProject('land', async (ctx, dir) => {
			mkdirSync(join(dir, '.github/workflows'), { recursive: true });
			writeFileSync(join(dir, '.github/workflows/land.yml'), 'x');
			writeFileSync(join(dir, '.github/workflows/land-signal.yml'), 'x');
			const result = await runIntegrationDeactivate(ctx, gh());
			expect(result.code).toBe(EXIT_CODE.OK);
			expect(
				readFileSync(join(dir, 'delendai.config.json'), 'utf8'),
			).toBe(configOf('none'));
			expect(existsSync(join(dir, '.github/workflows/land.yml'))).toBe(
				false,
			);
			expect(
				existsSync(join(dir, '.github/workflows/land-signal.yml')),
			).toBe(false);
		});
	});

	it('[<500ms] refuses to resume while the engine is none', async () => {
		await withProject('none', async (ctx) => {
			const calls: string[] = [];
			const result = await runIntegrationResume(ctx, gh(calls));
			expect(result.code).toBe(EXIT_CODE.RUNTIME);
			expect(result.error).toContain('engine is none');
			expect(calls).toEqual([]);
		});
	});

	it('[<500ms] resumes only the paused pull requests once the engine is land', async () => {
		await withProject('land', async (ctx) => {
			const calls: string[] = [];
			const result = await runIntegrationResume(ctx, gh(calls));
			expect(result.code).toBe(EXIT_CODE.OK);
			expect(result.text).toContain('#4');
			expect(result.text).not.toContain('#5');
			expect(
				calls.filter((call) => call.includes('DELETE')),
			).toHaveLength(1);
		});
	});
});

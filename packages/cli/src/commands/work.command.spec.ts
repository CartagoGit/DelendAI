/**
 * work.command.spec.ts — what the CLI adds to the unit-of-work engine's
 * answer when an agent enters a unit.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNoopContext } from '../lib/noop-context.factory';
import { createWorkCommand, withSlicesView } from './work.command';

const globals = (json: boolean) => ({
	workspace: '/work',
	json,
	format: json ? ('json' as const) : ('text' as const),
	lang: 'en',
	noColor: true,
	plugins: [],
});

const roots: string[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('withSlicesView', () => {
	it('names the slices view in the payload of a unit that was entered', () => {
		const written = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		const result = withSlicesView(
			{ code: 0, data: { ref: 'refs/heads/work/a', path: '/work/a' } },
			createNoopContext('/work', globals(true)),
		);
		expect(result.data).toMatchObject({
			ref: 'refs/heads/work/a',
			read: expect.stringContaining('view `slices`'),
		});
		// A machine reads the payload; nothing is printed beside it.
		expect(written).not.toHaveBeenCalled();
	});

	it('says it in words to a person', () => {
		const written = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		withSlicesView(
			{ code: 0, data: { ref: 'refs/heads/work/a' } },
			createNoopContext('/work', globals(false)),
		);
		expect(written).toHaveBeenCalledWith(
			expect.stringMatching(/^read\s+the open slices/u),
		);
	});

	it('adds nothing to an entry that was refused', () => {
		const refused = { code: 2 as const, error: 'held by another' };
		expect(
			withSlicesView(refused, createNoopContext('/work', globals(true))),
		).toBe(refused);
	});
});

describe('work deliver', () => {
	const command = createWorkCommand();

	it('says what it needs', async () => {
		const result = await command.run(
			['deliver'],
			createNoopContext('/work', globals(true)),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('work deliver --proposal=<id>');
	});

	const unitRepo = async () => {
		const root = mkdtempSync(join(tmpdir(), 'work-deliver-'));
		roots.push(root);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, stdio: 'ignore' });
		git('init', '-q', '-b', 'develop');
		git('config', 'user.email', 'work@example.com');
		git('config', 'user.name', 'Work');
		git('config', 'commit.gpgsign', 'false');
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				development: {
					profile: 'shared-checkout-pr',
					branches: { namespacePrefix: 'delendai' },
				},
			}),
		);
		git('add', '-A');
		git('commit', '-q', '-m', 'base');
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		return root;
	};

	it('moves the proposal as the agent named, from wherever it stands', async () => {
		const root = await unitRepo();
		const asked: unknown[] = [];
		const ctx = {
			...createNoopContext(root, { ...globals(true), workspace: root }),
			request: async <TOut>(_tool: string, args: object) => {
				asked.push(args);
				return { ok: false, reason: 'held back' } as TOut;
			},
		};
		const unit = [
			'--proposal=x00001',
			'--slice=S1',
			'--agent=claude-opus-5',
			'--topic=probe',
		];
		await command.run(
			['checkpoint', ...unit, '--paths=a.ts', '--message=feat: a'],
			ctx,
		);
		const result = await command.run(['deliver', ...unit], ctx);
		expect(result.error).toBe('held back');
		expect(asked).toEqual([
			{
				id: 'x00001',
				to: 'in-progress',
				reason: 'Proved and delivered.',
				agent: 'claude-opus-5',
				checkout: root,
			},
		]);
	});

	it('goes on to the proof, with the whole unit by default', async () => {
		const ctx = {
			...createNoopContext('/nowhere', globals(true)),
			request: async <TOut>() => ({ ok: true }) as TOut,
		};
		const result = await command.run(
			['deliver', '--proposal=x00001', '--reason=done'],
			ctx,
		);
		// No repository here: the unit cannot be found, and nothing moves.
		expect(result.code).not.toBe(0);
		expect(result.error).not.toContain('work deliver --proposal=<id>');
	});
});

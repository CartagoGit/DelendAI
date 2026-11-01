/**
 * work.command.spec.ts — what the CLI adds to the unit-of-work engine's
 * answer when an agent enters a unit.
 */
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

afterEach(() => {
	vi.restoreAllMocks();
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

	it('moves the proposal from the unit it stands in, as the agent named', async () => {
		const asked: unknown[] = [];
		const ctx = {
			...createNoopContext('/work/unit', globals(true)),
			request: async <TOut>(_tool: string, args: object) => {
				asked.push(args);
				return { ok: false, reason: 'held back' } as TOut;
			},
		};
		const result = await command.run(
			['deliver', '--proposal=x00001', '--agent=claude-opus-5'],
			ctx,
		);
		expect(result.error).toBe('held back');
		expect(asked).toEqual([
			{
				id: 'x00001',
				to: 'in-progress',
				reason: 'Proved and delivered.',
				agent: 'claude-opus-5',
				checkout: '/work/unit',
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
		// No repository here: the proof is what refuses.
		expect(result.code).not.toBe(0);
		expect(result.error).not.toContain('work deliver --proposal=<id>');
	});
});

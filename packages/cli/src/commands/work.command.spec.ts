/**
 * work.command.spec.ts — what the CLI adds to the unit-of-work engine's
 * answer when an agent enters a unit. The tests that load a plugin or run a
 * real repository are in work-enter.command.e2e.spec.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNoopContext } from '../lib/noop-context.factory';
import {
	createWorkCommand,
	printPathOnly,
	withSlicesView,
} from './work.command';

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
	it('[<50ms] names the slices view in the payload of a unit that was entered', () => {
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

	it('[<50ms] says it in words to a person', () => {
		const written = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		withSlicesView(
			{ code: 0, data: { ref: 'refs/heads/work/a' } },
			createNoopContext('/work', globals(false)),
		);
		expect(written).toHaveBeenCalledWith(
			expect.stringMatching(/^read\s+the open slices/u),
		);
	});

	it('[<50ms] adds nothing to an entry that was refused', () => {
		const refused = { code: 2 as const, error: 'held by another' };
		expect(
			withSlicesView(refused, createNoopContext('/work', globals(true))),
		).toBe(refused);
	});
});

describe('work deliver', () => {
	const command = createWorkCommand();

	it('[<50ms] says what it needs', async () => {
		const result = await command.run(
			['deliver'],
			createNoopContext('/work', globals(true)),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('work deliver --proposal=<id>');
	});

	it('[<200ms] goes on to the proof, with the whole unit by default', async () => {
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

describe('work prove and publish', () => {
	const command = createWorkCommand();
	it.each(['prove', 'publish'])(
		'%s looks for its unit from where it runs',
		async (action) => {
			const ctx = createNoopContext('/nowhere', globals(true));
			const result = await command.run(
				[action, '--proposal=x00001', '--locate'],
				ctx,
			);
			// No repository here: the unit is not found, and nothing is run.
			expect(result.code).not.toBe(0);
		},
	);
});

describe('printPathOnly', () => {
	it('[<50ms] prints the path alone', () => {
		const written = vi
			.spyOn(process.stdout, 'write')
			.mockImplementation(() => true);
		expect(printPathOnly({ code: 0, data: { path: '/w' } })).toEqual({
			code: 0,
		});
		expect(written).toHaveBeenCalledWith('/w\n');
		written.mockRestore();
	});

	it('[<50ms] fails an answer with no path, so a script cannot carry on', () => {
		expect(printPathOnly({ code: 0, data: {} }).code).not.toBe(0);
	});

	it('[<50ms] keeps a refusal as it came', () => {
		const refused = { code: 4 as const, error: 'held' };
		expect(printPathOnly(refused)).toEqual(refused);
	});
});

describe('work offline', () => {
	it('[<50ms] starts no server for any subcommand but deliver', () => {
		const { offline } = createWorkCommand();
		const isOffline = (args: readonly string[]): boolean =>
			typeof offline === 'function' ? offline(args) : offline === true;
		for (const sub of [
			'status',
			'enter',
			'checkpoint',
			'swarm',
			'prove',
			'publish',
			'retire',
		]) {
			expect(isOffline([sub])).toBe(true);
		}
		expect(isOffline(['deliver', '--proposal=x1'])).toBe(false);
	});
});

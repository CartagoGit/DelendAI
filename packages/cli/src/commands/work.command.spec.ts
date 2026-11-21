/**
 * work.command.spec.ts — what the CLI adds to the unit-of-work engine's
 * answer when an agent enters a unit. The tests that load a plugin or run a
 * real repository are in work-enter.command.e2e.spec.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import type { IGitInCheckout } from '../contracts/interfaces/git-in-checkout.interface';
import { revalidatePortsOf } from '../lib/work-revalidate-ports.service';
import { createNoopContext } from '../lib/noop-context.factory';
import {
	createWorkCommand,
	deliverPortsOf,
	endsWorktree,
	leaveWorktree,
	loadedOnce,
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

describe('work revalidate', () => {
	it('[<200ms] chooses none in a project with no ready proposals and exits 0', async () => {
		const result = await createWorkCommand().run(
			['revalidate'],
			createNoopContext('/nonexistent-project', globals(true)),
		);
		expect(result.code).toBe(0);
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
		expect(isOffline(['revalidate'])).toBe(false);
	});
});

describe('deliverPortsOf', () => {
	const asked: unknown[] = [];
	const ctx = {
		...createNoopContext('/nowhere', globals(true)),
		request: async <TOut>(_tool: string, input: unknown) => {
			asked.push(input);
			return { ok: true } as TOut;
		},
	};
	const run = {
		id: 'x1',
		reason: 'done',
		agent: 'me',
		urgent: undefined,
		unitFlags: ['--proposal=x1', '--slice=S2'],
	};

	it('[<200ms] names the slice of the flags, and `all` without one', () => {
		expect(deliverPortsOf(ctx, run).slice).toBe('S2');
		expect(
			deliverPortsOf(ctx, { ...run, unitFlags: ['--proposal=x1'] }).slice,
		).toBe('all');
	});

	it('[<200ms] asks the tool for a preflight that moves nothing', async () => {
		await deliverPortsOf(ctx, run).preflight(undefined);
		expect(asked.at(-1)).toMatchObject({
			id: 'x1',
			to: 'review',
			preflight: true,
			agent: 'me',
			checkout: '/nowhere',
		});
	});

	it('[<200ms] runs the transition in the checkout it is given', async () => {
		await deliverPortsOf(ctx, { ...run, agent: undefined }).transition(
			'in-progress',
			'/nonexistent',
		);
		const last = asked.at(-1) as Record<string, unknown>;
		expect(last).toMatchObject({
			to: 'in-progress',
			checkout: '/nonexistent',
		});
		expect(last).not.toHaveProperty('agent');
	});

	it('[<200ms] reads no open pull request when the forge cannot be read', async () => {
		expect(
			await deliverPortsOf(ctx, run).readOpenPullRequest('refs/heads/x'),
		).toBeUndefined();
	});

	it('[<200ms] runs the unit engine for locate, the pre-checks, prove and publish', async () => {
		const ports = deliverPortsOf(ctx, run);
		for (const port of [
			ports.locate,
			ports.precheck,
			ports.coveragePrecheck,
			ports.prove,
			ports.publish,
		]) {
			expect((await port()).code).not.toBe(0);
		}
	});
});

describe('revalidatePortsOf', () => {
	/** A git that keeps its commits in memory: no process is spawned. */
	const memoryGit = () => {
		const log: string[] = ['base'];
		const dirty = new Set<string>();
		const git: IGitInCheckout = (args) => {
			const [verb] = args;
			if (verb === 'rev-parse') {
				return args[1] === 'HEAD'
					? { ok: true, out: `${log.at(-1) ?? ''}\n` }
					: { ok: false, out: '' };
			}
			if (verb === 'status') {
				return {
					ok: true,
					out: [...dirty].map((path) => `?? ${path}`).join('\0'),
				};
			}
			if (verb === 'commit') {
				log.push(`c${String(log.length)}`);
				dirty.clear();
			}
			if (verb === 'reset') {
				log.splice(log.indexOf(args[2] ?? '') + 1);
			}
			return { ok: true, out: '' };
		};
		return { git, log, dirty };
	};

	it('[<50ms] commits what a transition wrote, marks the unit and undoes back to the mark', async () => {
		const { git, log, dirty } = memoryGit();
		const ctx = {
			...createNoopContext('/work', globals(true)),
			request: (async () => {
				dirty.add('docs/p.md');
				return { ok: true };
			}) as ICliCommandContext['request'],
		};
		const ports = revalidatePortsOf(
			ctx,
			'claude-sonnet-5-5',
			'tool',
			() => git,
		);
		const mark = ports.mark('/unit');
		expect(mark).toBe('base');
		const answer = await ports.transition({
			id: 'f1',
			to: 'review',
			reason: 'why',
			worktree: '/unit',
		});
		expect(answer).toEqual({ ok: true });
		expect(log).toEqual(['base', 'c1']);
		ports.undo('/unit', mark ?? '');
		expect(log).toEqual(['base']);
		expect(await ports.developSha('/unit')).toBeUndefined();
		expect(await ports.proposals()).toEqual([]);
	});

	it('[<50ms] prints a line to stdout', () => {
		const write = vi
			.spyOn(process.stdout, 'write')
			.mockImplementation(() => true);
		revalidatePortsOf(
			createNoopContext('/work', globals(true)),
			undefined,
			'tool',
		).print('f1');
		expect(write).toHaveBeenCalledWith('f1\n');
	});

	it('[<50ms] refuses to enter the unit when the engine answers no path', async () => {
		const ports = revalidatePortsOf(
			createNoopContext('/nonexistent-project', globals(true)),
			'claude-sonnet-5-5',
			'tool',
		);
		await expect(ports.enter()).rejects.toThrow();
	});
});

/** A module store that fails every load once the worktree is removed. */
const worktree = () => {
	const events: string[] = [];
	let removed = false;
	return {
		events,
		remove: () => {
			removed = true;
			events.push('removed');
		},
		load: async () => {
			events.push('load');
			if (removed) throw new Error('ENOENT');
			return { sized: 'answer' };
		},
	};
};

describe('loadedOnce', () => {
	it('[<20ms] a sizer preloaded before the removal still sizes the answer after it and never loads again', async () => {
		const unit = worktree();
		const loaded = loadedOnce(unit.load);
		loaded.preload();
		unit.remove();
		expect((await loaded.get()).sized).toBe('answer');
		expect(unit.events).toEqual(['load', 'removed']);
	});

	it('[<20ms] an answer without preloading loads once', async () => {
		const unit = worktree();
		const loaded = loadedOnce(unit.load);
		loaded.preload();
		await loaded.get();
		await loaded.get();
		expect(unit.events).toEqual(['load']);
	});

	it('[<20ms] loads on first use without a preload', async () => {
		const unit = worktree();
		const loaded = loadedOnce(unit.load);
		expect(unit.events).toEqual([]);
		await loaded.get();
		expect(unit.events).toEqual(['load']);
	});

	it('[<20ms] a failed preload surfaces on use, not as an unhandled rejection', async () => {
		const loaded = loadedOnce(async () => {
			throw new Error('boom');
		});
		loaded.preload();
		await expect(loaded.get()).rejects.toThrow('boom');
	});
});

describe('endsWorktree', () => {
	it('[<20ms] is true for the verbs that can end a unit only', () => {
		expect(['deliver', 'publish', 'prove'].every(endsWorktree)).toBe(true);
		expect(['enter', 'status'].some(endsWorktree)).toBe(false);
	});
});

describe('leaveWorktree', () => {
	const ctx = createNoopContext('/shared/.cache/wt/unit', globals(true));

	it('[<20ms] a deliver or publish run from a unit worktree continues from the shared checkout root', () => {
		const moves: string[] = [];
		const left = leaveWorktree(ctx, {
			locate: () => ({
				top: '/shared/.cache/wt/unit',
				commonDir: '/shared/.git',
			}),
			chdir: (path) => moves.push(path),
		});
		expect(left.cwd).toBe('/shared');
		expect(moves).toEqual(['/shared']);
	});

	it('[<20ms] a run outside a linked worktree keeps its directory', () => {
		const moves: string[] = [];
		const ports = (top: string | undefined) => ({
			locate: () =>
				top === undefined
					? undefined
					: { top, commonDir: '/shared/.git' },
			chdir: (path: string) => moves.push(path),
		});
		expect(leaveWorktree(ctx, ports('/shared'))).toBe(ctx);
		expect(leaveWorktree(ctx, ports(undefined))).toBe(ctx);
		expect(moves).toEqual([]);
	});
});

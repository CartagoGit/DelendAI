import { describe, expect, it } from 'vitest';

import {
	createStepReuse,
	type IStepReuseDeps,
	MAX_STEP_PASSES,
	parseStepPasses,
	reusedLine,
	reuseForbidden,
	stepKey,
} from './step-reuse';

const INPUTS = { 'lint-docs': ['.'] };

/** A checkout in memory: what git says, and the store's text. */
const world = (
	over: { status?: string; entries?: string; stored?: string } = {},
) => {
	const state = {
		status: over.status ?? '',
		entries: over.entries ?? '100644 aaa 0\tone.md',
		stored: over.stored,
		calls: [] as string[],
	};
	const deps: IStepReuseDeps = {
		git: (args) => {
			state.calls.push(args[0] ?? '');
			if (args[0] === 'status') return state.status;
			if (args[0] === 'ls-files') return state.entries;
			return 'f'.repeat(40);
		},
		read: () => state.stored,
		write: (text) => {
			state.stored = text;
			return true;
		},
		now: () => new Date('2026-11-13T10:00:00.000Z'),
	};
	return { state, deps };
};

describe('stepKey', () => {
	const parts = {
		label: 'lint-docs',
		command: 'bun a',
		changed: ['a.ts'],
		entries: 'x',
	};

	it('[<7ms] changes with each part and with nothing else', () => {
		expect(stepKey(parts)).toBe(stepKey({ ...parts }));
		for (const change of [
			{ label: 'other' },
			{ command: 'bun b' },
			{ changed: ['b.ts'] },
			{ entries: 'y' },
		]) {
			expect(stepKey({ ...parts, ...change })).not.toBe(stepKey(parts));
		}
	});
});

describe('a step with declared inputs', () => {
	it('[<7ms] is skipped on the inputs it passed on, and not before', () => {
		const { deps } = world();
		const reuse = createStepReuse(deps, false, INPUTS);
		expect(reuse.attempt('lint-docs', 'cmd', [])).toBeUndefined();
		reuse.record('lint-docs', 'cmd', []);
		const pass = reuse.attempt('lint-docs', 'cmd', []);
		expect(pass && reusedLine(pass)).toBe(
			'reused: lint-docs (inputs unchanged since fffffffff)',
		);
	});

	it('[<7ms] runs again when its inputs, command or changed files moved', () => {
		const { state, deps } = world();
		const reuse = createStepReuse(deps, false, INPUTS);
		reuse.record('lint-docs', 'cmd', ['a.ts']);
		expect(reuse.attempt('lint-docs', 'cmd', ['b.ts'])).toBeUndefined();
		expect(reuse.attempt('lint-docs', 'other', ['a.ts'])).toBeUndefined();
		state.entries = '100644 bbb 0\tone.md';
		expect(reuse.attempt('lint-docs', 'cmd', ['a.ts'])).toBeUndefined();
	});

	it('[<7ms] is neither skipped nor recorded while its inputs have edits', () => {
		const { state, deps } = world({ status: ' M one.md' });
		const reuse = createStepReuse(deps, false, INPUTS);
		reuse.record('lint-docs', 'cmd', []);
		expect(state.stored).toBeUndefined();
		state.status = '';
		expect(reuse.attempt('lint-docs', 'cmd', [])).toBeUndefined();
	});

	it('[<7ms] is never reused when reuse is forbidden', () => {
		const { state, deps } = world();
		createStepReuse(deps, false, INPUTS).record('lint-docs', 'cmd', []);
		const forced = createStepReuse(deps, true, INPUTS);
		expect(forced.attempt('lint-docs', 'cmd', [])).toBeUndefined();
		const before = state.stored;
		forced.record('lint-docs', 'cmd', ['x']);
		expect(state.stored).toBe(before);
	});

	it('[<7ms] reads nothing where git cannot answer', () => {
		const { deps } = world();
		const reuse = createStepReuse(
			{
				...deps,
				git: () => {
					throw new Error('not a repository');
				},
			},
			false,
			INPUTS,
		);
		expect(reuse.attempt('lint-docs', 'cmd', [])).toBeUndefined();
	});
});

describe('a step with no declared inputs', () => {
	it('[<7ms] always runs and is never recorded', () => {
		const { state, deps } = world();
		const reuse = createStepReuse(deps, false, INPUTS);
		reuse.record('lint-security', 'cmd', []);
		expect(state.stored).toBeUndefined();
		expect(state.calls).toEqual([]);
		expect(reuse.attempt('lint-security', 'cmd', [])).toBeUndefined();
	});
});

describe('the store', () => {
	it('[<7ms] keeps a bounded list, newest first, one a key', () => {
		const { state, deps } = world({
			stored: JSON.stringify(
				Array.from({ length: MAX_STEP_PASSES }, (_, i) => ({
					key: `k${String(i)}`,
					label: 'lint-docs',
					commit: 'c',
					at: 't',
				})),
			),
		});
		createStepReuse(deps, false, INPUTS).record('lint-docs', 'cmd', []);
		const passes = parseStepPasses(state.stored ?? '');
		expect(passes).toHaveLength(MAX_STEP_PASSES);
		expect(passes[0]?.label).toBe('lint-docs');
	});

	it('[<7ms] ignores a store that is not records', () => {
		expect(parseStepPasses('nope')).toEqual([]);
		expect(parseStepPasses('[{"key":1}]')).toEqual([]);
	});
});

describe('reuseForbidden', () => {
	it('[<7ms] honours the flag and the environment variable', () => {
		expect(reuseForbidden(['--no-reuse'], {})).toBe(true);
		expect(reuseForbidden([], { DELENDAI_PROVE_NO_REUSE: '1' })).toBe(true);
		expect(reuseForbidden([], { CI: '1' })).toBe(false);
	});
});

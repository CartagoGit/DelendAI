import { describe, expect, it, vi } from 'vitest';

import {
	FULL_SUITE_ENV,
	fullSuiteRefusal,
	guardFullSuite,
	SANCTIONED_SUITE_ENV,
	lowerAgentPriority,
} from './agent-full-suite-guard';

const bare = ['node', 'vitest', 'run'];

describe('fullSuiteRefusal', () => {
	it.each(['DELENDAI_AGENT_ID', 'AI_AGENT', 'CLAUDECODE'])(
		'refuses an unfiltered run when %s is set',
		(name) => {
			const line = fullSuiteRefusal(bare, { [name]: '1' });
			expect(line).toContain('delendai work prove');
			expect(line).not.toContain('\n');
		},
	);

	it.each([
		['a file filter', [...bare, 'a.spec.ts'], {}],
		['a project flag', [...bare, '--project', 'x'], {}],
		['a changed flag', [...bare, '--changed'], {}],
		['the full-suite env', bare, { [FULL_SUITE_ENV]: '1' }],
		['CI', bare, { CI: 'true' }],
		['a vitest worker', bare, { VITEST_WORKER_ID: '1' }],
	])('allows %s', (_name, argv, extra) => {
		expect(
			fullSuiteRefusal(argv, { CLAUDECODE: '1', ...extra }),
		).toBeUndefined();
	});

	it('allows a run with no agent identity', () => {
		expect(fullSuiteRefusal(bare, {})).toBeUndefined();
	});
});

describe('the env prove gives its steps', () => {
	it('lets a sanctioned job run the whole suite', () => {
		expect(
			fullSuiteRefusal(bare, {
				CLAUDECODE: '1',
				...SANCTIONED_SUITE_ENV,
			}),
		).toBeUndefined();
	});
});

describe('lowerAgentPriority', () => {
	it('lowers an agent run and ignores a refusing host', () => {
		const apply = vi.fn();
		lowerAgentPriority({ CLAUDECODE: '1' }, apply);
		expect(apply).toHaveBeenCalledWith(0, 19);
		expect(() =>
			lowerAgentPriority({ CLAUDECODE: '1' }, () => {
				throw new Error('denied');
			}),
		).not.toThrow();
	});

	it('leaves a person and a worker alone', () => {
		const apply = vi.fn();
		lowerAgentPriority({}, apply);
		lowerAgentPriority({ CLAUDECODE: '1', VITEST_WORKER_ID: '1' }, apply);
		expect(apply).not.toHaveBeenCalled();
	});
});

describe('guardFullSuite', () => {
	it('exits on a refused run', () => {
		const exit = vi.fn() as unknown as (code: number) => never;
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		guardFullSuite(bare, { CLAUDECODE: '1' }, exit);
		expect(exit).toHaveBeenCalledWith(1);
		write.mockRestore();
	});

	it('lets a filtered run go on', () => {
		const exit = vi.fn() as unknown as (code: number) => never;
		guardFullSuite([...bare, 'a.spec.ts'], {}, exit);
		expect(exit).not.toHaveBeenCalled();
	});
});

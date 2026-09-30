/**
 * The `close_slice` gate runs the project's declared gate as a resumable
 * job. These run real processes against a real git tree: the behaviour
 * under test is precisely what a process, a tree hash and a clock do, and
 * a stub would only restate the assumption.
 */
import { execFileSync } from 'node:child_process';
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runCloseSliceGateProbe } from '@delendai/proposals/lib/tools/authoring.tool';
import type {
	ICloseGateDeps,
	ICloseGateProcessPort,
} from '@delendai/proposals/lib/contracts/interfaces/close-slice-gate.interface';
import {
	declaredGateSteps,
	runCloseSliceGate,
} from '@delendai/proposals/lib/tools/close-slice-gate';

const directories: string[] = [];

afterAll(() => {
	for (const dir of directories)
		rmSync(dir, { recursive: true, force: true });
});

const scratch = (prefix: string): string => {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	directories.push(dir);
	return dir;
};

/** A git checkout whose `validate` script is `command`; runs are counted outside the tree. */
const checkoutWithGate = (
	command: string,
): {
	readonly cwd: string;
	readonly counter: string;
	readonly store: string;
} => {
	const cwd = scratch('close-gate-tree-');
	const store = scratch('close-gate-store-');
	const counter = join(scratch('close-gate-count-'), 'runs');
	execFileSync('git', ['init', '-q'], { cwd });
	writeFileSync(
		join(cwd, 'package.json'),
		JSON.stringify({
			name: 'fixture',
			private: true,
			scripts: { validate: command.replaceAll('$COUNTER', counter) },
		}),
	);
	return { cwd, counter, store };
};

const depsFor = (
	fixture: { readonly cwd: string; readonly store: string },
	extra: Partial<ICloseGateDeps> = {},
): ICloseGateDeps => ({
	storeRoot: fixture.store,
	cwd: fixture.cwd,
	readDeclaration: async (path) => {
		const file = join(fixture.cwd, path);
		return existsSync(file) ? readFileSync(file, 'utf8') : null;
	},
	...extra,
});

const runsRecorded = (counter: string): number =>
	existsSync(counter)
		? readFileSync(counter, 'utf8').split('\n').filter(Boolean).length
		: 0;

describe('runCloseSliceGate', () => {
	it('answers pending with a handle when the gate outlives the wait, then passes on resume', async () => {
		const fixture = checkoutWithGate('sleep 2 && echo ran >> $COUNTER');

		const first = await runCloseSliceGate(
			depsFor(fixture, { waitMs: 100 }),
		);

		expect(first.state).toBe('pending');
		expect(first.handle).toMatch(/^gate-/);

		const resumed = await runCloseSliceGate(
			depsFor(fixture, { waitMs: 10_000 }),
		);

		expect(resumed.state).toBe('pass');
		expect(resumed.handle).toBe(first.handle);
		expect(runsRecorded(fixture.counter)).toBe(1);
	});

	it('never reports a still-running gate as a pass through the probe', async () => {
		const fixture = checkoutWithGate('sleep 2');

		const probe = await runCloseSliceGateProbe(
			depsFor(fixture, { waitMs: 100 }),
		);

		expect(probe.ok).toBe(false);
		expect(probe.severity).toBe('error');
		expect(probe.gate?.state).toBe('pending');
	});

	it('reuses a recorded green result for the same tree and reruns when the tree changes', async () => {
		const fixture = checkoutWithGate('echo ran >> $COUNTER');

		const first = await runCloseSliceGate(depsFor(fixture));
		const second = await runCloseSliceGate(depsFor(fixture));

		expect(first).toMatchObject({ state: 'pass', reused: false });
		expect(second).toMatchObject({ state: 'pass', reused: true });
		expect(runsRecorded(fixture.counter)).toBe(1);

		appendFileSync(join(fixture.cwd, 'changed.txt'), 'new content');
		const third = await runCloseSliceGate(depsFor(fixture));

		expect(third).toMatchObject({ state: 'pass', reused: false });
		expect(runsRecorded(fixture.counter)).toBe(2);
	});

	it('keeps the tree identity when only host state or a lock file changes', async () => {
		const fixture = checkoutWithGate('echo ran >> $COUNTER');
		const state = join(fixture.cwd, '.cache');
		mkdirSync(state, { recursive: true });
		const deps = depsFor(fixture, { stateRoots: [state] });

		await runCloseSliceGate(deps);
		writeFileSync(join(state, 'lock.json'), 'held');
		writeFileSync(join(fixture.cwd, 'proposal.md.mutex'), 'owner 1');
		const again = await runCloseSliceGate(deps);

		expect(again).toMatchObject({ state: 'pass', reused: true });
		expect(runsRecorded(fixture.counter)).toBe(1);
	});

	it('blocks on a failing gate and reports the step and its output', async () => {
		const fixture = checkoutWithGate('echo lint exploded && exit 3');

		const verdict = await runCloseSliceGate(depsFor(fixture));

		expect(verdict.state).toBe('fail');
		expect(verdict.findings.join('\n')).toContain('lint exploded');
		expect(verdict.findings.join('\n')).toContain('gate step failed');
	});

	it('runs a failed gate again on the next call instead of remembering the failure', async () => {
		const fixture = checkoutWithGate('echo ran >> $COUNTER && exit 1');

		await runCloseSliceGate(depsFor(fixture));
		await runCloseSliceGate(depsFor(fixture));

		expect(runsRecorded(fixture.counter)).toBe(2);
	});

	it('reports a gate that exceeds its timeout as unverifiable, stopped, and never green', async () => {
		const fixture = checkoutWithGate('sleep 30');

		const verdict = await runCloseSliceGate(
			depsFor(fixture, { waitMs: 5_000, timeoutMs: 300 }),
		);

		expect(verdict.state).toBe('unverifiable');
		expect(verdict.findings.join('\n')).toContain('stopped after 300 ms');
	});

	it('reports a run whose process vanished as unverifiable', async () => {
		const fixture = checkoutWithGate('true');
		const vanishing: ICloseGateProcessPort = {
			start: () => 2_147_483_000,
			isAlive: () => false,
			killGroup: () => undefined,
		};

		const verdict = await runCloseSliceGate(
			depsFor(fixture, { process: vanishing, waitMs: 1_000 }),
		);

		expect(verdict.state).toBe('unverifiable');
	});

	it('says so when the project declares no gate', async () => {
		const cwd = scratch('close-gate-empty-');
		execFileSync('git', ['init', '-q'], { cwd });

		const verdict = await runCloseSliceGate(
			depsFor({ cwd, store: scratch('close-gate-store-') }),
		);

		expect(verdict.state).toBe('unverifiable');
		expect(verdict.findings.join('\n')).toContain('declares no gate');
	});

	it('says so when the checkout cannot be fingerprinted', async () => {
		const fixture = checkoutWithGate('true');

		const verdict = await runCloseSliceGate(
			depsFor(fixture, { fingerprint: async () => undefined }),
		);

		expect(verdict.state).toBe('unverifiable');
	});
});

describe('declaredGateSteps', () => {
	const config = JSON.stringify({
		validationMatrix: {
			scopes: {
				web: [{ command: 'run web' }],
				api: [{ command: 'run api' }],
			},
		},
	});
	const read = async (path: string): Promise<string | null> =>
		path === 'delendai.config.json' ? config : null;

	it('narrows the declared matrix to the slice scopes', async () => {
		const steps = await declaredGateSteps(read, ['api']);

		expect(steps).toEqual([{ scope: 'api', command: 'run api' }]);
	});

	it('runs the whole declared gate when no scope matches, never nothing', async () => {
		const steps = await declaredGateSteps(read, ['unknown']);

		expect(steps.map((step) => step.command)).toEqual([
			'run web',
			'run api',
		]);
	});
});

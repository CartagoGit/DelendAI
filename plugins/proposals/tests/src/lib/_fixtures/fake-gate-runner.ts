/**
 * A simulated close-slice gate runner and clock, for specs that must drive
 * the runner's states (held, finished, vanished) by construction instead of
 * racing a spawned process and the wall clock.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
	ICloseGateDeps,
	ICloseGateProcessPort,
} from '@delendai/proposals/lib/contracts/interfaces/close-slice-gate.interface';

/** What a started runner does: finish at once, stay running, or vanish. */
export type IFakeOutcome =
	| {
			readonly kind: 'finish';
			readonly code: number;
			readonly output?: string;
	  }
	| { readonly kind: 'hold' }
	| { readonly kind: 'vanish' };

/**
 * A simulated runner and clock. `start` writes the files the real runner
 * script writes (`steps.txt`, `output.log`, `done`); the clock moves only
 * when the gate sleeps or the test advances it.
 */
export const fakeRunner = (initial: IFakeOutcome) => {
	let outcome = initial;
	let time = 0;
	let nextPid = 1_000;
	const started: string[] = [];
	const held = new Map<number, string>();
	const killed: number[] = [];
	const finish = (dir: string, code: number, output = ''): void => {
		writeFileSync(join(dir, 'steps.txt'), `0 ${code}\n`);
		writeFileSync(join(dir, 'output.log'), output);
		writeFileSync(join(dir, 'done'), '');
	};
	const port: ICloseGateProcessPort = {
		start: (runner) => {
			const dir = dirname(runner);
			const pid = nextPid++;
			started.push(dir);
			if (outcome.kind === 'finish')
				finish(dir, outcome.code, outcome.output);
			else if (outcome.kind === 'hold') held.set(pid, dir);
			return pid;
		},
		isAlive: (pid) => held.has(pid),
		killGroup: (pid) => {
			killed.push(pid);
			held.delete(pid);
		},
	};
	return {
		started,
		killed,
		/** What runners started from now on do. */
		setOutcome: (next: IFakeOutcome): void => {
			outcome = next;
		},
		/** The gate steps run so far. */
		runs: (): number => started.length,
		advance: (ms: number): void => {
			time += ms;
		},
		/** Let every held runner finish with `code`. */
		release: (code = 0): void => {
			for (const [pid, dir] of held) {
				finish(dir, code);
				held.delete(pid);
			}
		},
		deps: {
			process: port,
			now: () => time,
			sleep: async (ms: number) => {
				time += ms;
			},
		} satisfies Partial<ICloseGateDeps>,
	};
};

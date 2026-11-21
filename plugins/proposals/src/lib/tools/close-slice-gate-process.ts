/**
 * close-slice-gate-process.ts — the detached process a gate run lives in.
 *
 * The gate outlives the tool call that started it: it is a process group
 * of its own writing to files, so a host that cancels the call after a
 * minute cannot kill it, and a later call can find out how it ended.
 */
// effect-boundary-authorized: the gate is a detached process group that must outlive the tool call, which ctx.effects does not offer.
import { spawn } from 'node:child_process';

import { donePath, outputPath, progressPath } from './close-slice-gate-store';
import type {
	ICloseGateProcessPort,
	ICloseGateStep,
} from '../contracts/interfaces/close-slice-gate.interface';

/** Environment variables that make a suite behave as an agent's shell, not CI's. */
const AGENT_ENVIRONMENT_VARIABLES = ['CLAUDECODE', 'AI_AGENT'] as const;

const shellQuote = (value: string): string =>
	`'${value.replaceAll("'", `'\\''`)}'`;

/**
 * The runner script: each step in order, its exit code appended to the
 * progress file, the run stopping at the first failing step, an end marker
 * written last. A runner that dies before the marker never counts as green.
 */
export const renderRunnerScript = (
	dir: string,
	cwd: string,
	steps: readonly ICloseGateStep[],
): string =>
	[
		'#!/bin/bash',
		`cd ${shellQuote(cwd)} || { echo "1 1" >> ${shellQuote(progressPath(dir))}; touch ${shellQuote(donePath(dir))}; exit 0; }`,
		...steps.flatMap((step, index) => [
			`echo ${shellQuote(`>>> [${step.scope}] ${step.command}`)} >> ${shellQuote(outputPath(dir))}`,
			`/bin/bash -c ${shellQuote(step.command)} >> ${shellQuote(outputPath(dir))} 2>&1`,
			`code=$?`,
			`echo "${index} $code" >> ${shellQuote(progressPath(dir))}`,
			`if [ "$code" -ne 0 ]; then touch ${shellQuote(donePath(dir))}; exit 0; fi`,
		]),
		`touch ${shellQuote(donePath(dir))}`,
		'',
	].join('\n');

export const systemGateProcess: ICloseGateProcessPort = {
	start: (runner, cwd) => {
		const env: NodeJS.ProcessEnv = { ...process.env };
		for (const name of AGENT_ENVIRONMENT_VARIABLES) delete env[name];
		const child = spawn('/bin/bash', [runner], {
			cwd,
			env,
			detached: true,
			stdio: 'ignore',
		});
		child.on('error', () => undefined);
		child.unref();
		return child.pid;
	},
	isAlive: (pid) => {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	},
	killGroup: (pid) => {
		try {
			process.kill(-pid, 'SIGKILL');
		} catch {
			// Already gone: nothing left to stop.
		}
	},
};

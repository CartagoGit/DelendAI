/**
 * close-slice-gate-store.ts — where a `close_slice` gate run keeps its state.
 *
 * One directory per (tree, gate) key holds everything a later call needs to
 * resume the run: the job description, the steps' exit codes as they
 * finish, the combined output and, once settled green, the verdict. Only a
 * green verdict outlives its report: a failed or unverifiable run is
 * reported once and cleared, so the next call runs the gate again.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from '@delendai/core/public';

const JOB_FILE = 'job.json';
const VERDICT_FILE = 'verdict.json';
const PROGRESS_FILE = 'steps.txt';
const DONE_FILE = 'done';
const OUTPUT_FILE = 'output.log';
const RUNNER_FILE = 'run.sh';
const OUTPUT_TAIL_LINES = 40;

export interface ICloseGateStep {
	readonly scope: string;
	readonly command: string;
}

/** What was started: enough to resume, time out or report the run. */
export interface ICloseGateJob {
	readonly handle: string;
	readonly tree: string;
	readonly steps: readonly ICloseGateStep[];
	readonly cwd: string;
	readonly startedAtMs: number;
	readonly timeoutMs: number;
	readonly pid: number;
}

export interface ICloseGateGreenVerdict {
	readonly tree: string;
	readonly steps: number;
	readonly passedAt: string;
}

export interface ICloseGateProgress {
	/** The runner reached its end marker (whatever the exit codes say). */
	readonly finished: boolean;
	/** One exit code per step that ran, in order. */
	readonly exitCodes: readonly number[];
}

export const jobDirectory = (storeRoot: string, handle: string): string =>
	join(storeRoot, handle);

export const runnerPath = (dir: string): string => join(dir, RUNNER_FILE);
export const outputPath = (dir: string): string => join(dir, OUTPUT_FILE);
export const progressPath = (dir: string): string => join(dir, PROGRESS_FILE);
export const donePath = (dir: string): string => join(dir, DONE_FILE);

const readTextIfPresent = async (path: string): Promise<string | undefined> => {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			return undefined;
		throw error;
	}
};

const readJsonIfPresent = async <T>(path: string): Promise<T | undefined> => {
	const text = await readTextIfPresent(path);
	if (text === undefined) return undefined;
	try {
		return JSON.parse(text) as T;
	} catch {
		return undefined;
	}
};

export const prepareJobDirectory = async (dir: string): Promise<void> => {
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	await writeFile(outputPath(dir), '', 'utf8');
};

export const writeRunner = async (dir: string, script: string): Promise<void> =>
	writeFile(runnerPath(dir), script, { encoding: 'utf8', mode: 0o755 });

export const writeJob = async (
	dir: string,
	job: ICloseGateJob,
): Promise<void> => writeFileAtomic(join(dir, JOB_FILE), JSON.stringify(job));

export const readJob = (dir: string): Promise<ICloseGateJob | undefined> =>
	readJsonIfPresent<ICloseGateJob>(join(dir, JOB_FILE));

export const writeGreenVerdict = async (
	dir: string,
	verdict: ICloseGateGreenVerdict,
): Promise<void> =>
	writeFileAtomic(join(dir, VERDICT_FILE), JSON.stringify(verdict));

export const readGreenVerdict = (
	dir: string,
): Promise<ICloseGateGreenVerdict | undefined> =>
	readJsonIfPresent<ICloseGateGreenVerdict>(join(dir, VERDICT_FILE));

export const readProgress = async (
	dir: string,
): Promise<ICloseGateProgress> => {
	const finished = (await readTextIfPresent(donePath(dir))) !== undefined;
	const lines = (await readTextIfPresent(progressPath(dir))) ?? '';
	const exitCodes = lines
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => Number(line.trim().split(/\s+/)[1]));
	return { finished, exitCodes };
};

export const readOutputTail = async (dir: string): Promise<string> => {
	const text = (await readTextIfPresent(outputPath(dir))) ?? '';
	return text.split('\n').slice(-OUTPUT_TAIL_LINES).join('\n').trim();
};

export const clearJob = (dir: string): Promise<void> =>
	rm(dir, { recursive: true, force: true });

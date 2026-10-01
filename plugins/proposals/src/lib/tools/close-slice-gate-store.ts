/**
 * close-slice-gate-store.ts — where a `close_slice` gate run keeps its state.
 *
 * One directory per (tree, gate) key holds everything a later call needs to
 * resume the run: the job description, the steps' exit codes as they
 * finish, the combined output and, once settled green, the verdict. Only a
 * green verdict outlives its report: a failed or unverifiable run is
 * reported once and cleared, so the next call runs the gate again.
 */
// effect-boundary-authorized: the gate's run state is files a detached process writes and later calls read; they are not workspace content.
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from '@delendai/core/public';

import type {
	ICloseGateGreenVerdict,
	ICloseGateJob,
	ICloseGateProgress,
} from '../contracts/interfaces/close-slice-gate.interface';
import { readTextOrNull } from '../proposals/index-reader';

const JOB_FILE = 'job.json';
const VERDICT_FILE = 'verdict.json';
const PROGRESS_FILE = 'steps.txt';
const DONE_FILE = 'done';
const OUTPUT_FILE = 'output.log';
const RUNNER_FILE = 'run.sh';
const OUTPUT_TAIL_LINES = 40;

export const jobDirectory = (storeRoot: string, handle: string): string =>
	join(storeRoot, handle);

export const runnerPath = (dir: string): string => join(dir, RUNNER_FILE);
export const outputPath = (dir: string): string => join(dir, OUTPUT_FILE);
export const progressPath = (dir: string): string => join(dir, PROGRESS_FILE);
export const donePath = (dir: string): string => join(dir, DONE_FILE);

const readTextIfPresent = async (path: string): Promise<string | undefined> =>
	(await readTextOrNull(path)) ?? undefined;

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
	await writeFileAtomic(outputPath(dir), '');
};

export const writeRunner = async (dir: string, script: string): Promise<void> =>
	writeFileAtomic(runnerPath(dir), script);

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

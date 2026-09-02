/**
 * settlement-runner.ts — q00013 S3.
 *
 * Runs full validate during a SETTLING phase. Bounded retries
 * with backoff. Returns either a green head sha (success) or a
 * list of failing files (caller dispatches the repair agent).
 *
 * Implementation note: we shell out to `bun run validate` via
 * the existing process runner rather than re-implementing it.
 * The runner reports the last failing command's stderr summary.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ISettlementRunnerOptions {
	readonly cwd: string;
	readonly maxAttempts?: number;
	readonly backoffMs?: (attempt: number) => number;
	readonly validateCommand?: string;
}

export type SettlementOutcome =
	| {
			readonly green: true;
			readonly headSha: string;
			readonly attempts: number;
	  }
	| {
			readonly green: false;
			readonly attempts: number;
			readonly failingFiles: readonly string[];
			readonly lastError: string;
	  };

const defaultBackoff = (attempt: number): number =>
	Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));

export const runSettlement = async (
	options: ISettlementRunnerOptions,
): Promise<SettlementOutcome> => {
	const maxAttempts = options.maxAttempts ?? 3;
	const backoffMs = options.backoffMs ?? defaultBackoff;
	const cmd = options.validateCommand ?? 'bun run validate';

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const { stdout } = await execFileAsync('sh', ['-c', cmd], {
				cwd: options.cwd,
				timeout: 600_000,
				maxBuffer: 16 * 1024 * 1024,
			});
			const head = await headShortSha(options.cwd);
			return { green: true, headSha: head, attempts: attempt };
		} catch (error) {
			const e = error as NodeJS.ErrnoException & {
				stdout?: string;
				stderr?: string;
				killed?: boolean;
			};
			const lastError =
				e.killed === true
					? `validate timed out on attempt ${attempt}`
					: (e.stderr ?? e.stdout ?? e.message ?? 'unknown').slice(
							0,
							2000,
						);
			const failing = extractFailingFiles(lastError);
			if (attempt === maxAttempts) {
				return {
					green: false,
					attempts: attempt,
					failingFiles: failing,
					lastError,
				};
			}
			await sleep(backoffMs(attempt));
		}
	}
	// Unreachable: the loop returns inside.
	return {
		green: false,
		attempts: maxAttempts,
		failingFiles: [],
		lastError: 'settlement runner exited without producing a result',
	};
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const headShortSha = async (cwd: string): Promise<string> => {
	const { stdout } = await execFileAsync(
		'git',
		['rev-parse', '--short', 'HEAD'],
		{ cwd },
	);
	return stdout.trim();
};

const extractFailingFiles = (stderr: string): readonly string[] => {
	const out = new Set<string>();
	const lines = stderr.split('\n');
	for (const line of lines) {
		// Heuristic: TypeScript / Biome / lint output typically names
		// the offending file as `<path>.ts(<line>,<col>)`. Keep the
		// path and discard the coordinates.
		const match = /^([\w./-]+\.[cm]?[jt]sx?)/u.exec(line.trim());
		if (match !== null && match[1] !== undefined) {
			out.add(match[1]);
		}
	}
	return Array.from(out);
};

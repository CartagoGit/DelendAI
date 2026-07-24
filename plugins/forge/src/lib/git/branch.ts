import { spawn } from 'node:child_process';

export interface ISpawnedProcess {
	readonly stdout?: NodeJS.ReadableStream | null;
	readonly stderr?: NodeJS.ReadableStream | null;
	on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): this;
	on(event: 'close', listener: (code: number | null) => void): this;
	kill(signal?: NodeJS.Signals | number): boolean;
}

export type ISpawnLike = (
	command: string,
	args: readonly string[],
	options: { cwd?: string; stdio: 'pipe' },
) => ISpawnedProcess;

export interface IGitCommandOptions {
	readonly spawnFn?: ISpawnLike;
}

const defaultSpawn: ISpawnLike = (command, args, options) =>
	spawn(command, [...args], options) as unknown as ISpawnedProcess;

const runGit = async (
	args: readonly string[],
	cwd: string,
	options: IGitCommandOptions = {},
): Promise<string> =>
	new Promise((resolve, reject) => {
		const child = (options.spawnFn ?? defaultSpawn)('git', args, {
			cwd,
			stdio: 'pipe',
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdoutChunks.push(
				typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
			);
		});
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderrChunks.push(
				typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
			);
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if ((code ?? 1) !== 0) {
				reject(
					new Error(
						Buffer.concat(stderrChunks).toString().trim() ||
							`git ${args.join(' ')} failed`,
					),
				);
				return;
			}
			resolve(Buffer.concat(stdoutChunks).toString().trim());
		});
	});

export const getCurrentBranch = async (
	cwd: string,
	options: IGitCommandOptions = {},
): Promise<string> => runGit(['branch', '--show-current'], cwd, options);

export const getDefaultBranch = async (
	cwd: string,
	options: IGitCommandOptions = {},
): Promise<string> => {
	const ref = await runGit(
		['symbolic-ref', 'refs/remotes/origin/HEAD'],
		cwd,
		options,
	);
	return ref.replace(/^refs\/remotes\/origin\//u, '');
};

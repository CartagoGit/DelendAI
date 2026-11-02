/**
 * detection-machine.service.ts — this machine as agent detection reads it:
 * the executables on PATH, the packages each package manager installed
 * globally, and the extensions of every IDE installed.
 *
 * It reads names and manifests only. A package manager that is not
 * installed answers nothing; an IDE folder that does not exist is skipped.
 */
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

import type { IDetectionMachine } from '../contracts/interfaces/agent-detection.interface';
import type { IClientCommandRunner } from '../contracts/interfaces/known-client.interface';
import { windowsAppDataUnderWsl } from '../platform/user-directories.helper';
import { runClientCommand } from './client-command-runner.service';

const HELP_TIMEOUT_MS = 3000;
const LIST_TIMEOUT_MS = 10_000;

const entries = async (dir: string): Promise<readonly string[]> =>
	readdir(dir).catch(() => []);

/** The folders each IDE keeps its extensions or plugins in, for this home. */
export const ideExtensionDirs = (
	home: string,
	windowsHomes: readonly string[] = [],
): readonly { readonly ide: string; readonly dir: string }[] => {
	const vscodeLike: readonly (readonly [string, string])[] = [
		['VS Code', '.vscode'],
		['VS Code (remote)', '.vscode-server'],
		['VSCodium', '.vscode-oss'],
		['Cursor', '.cursor'],
		['Windsurf', '.windsurf'],
	];
	const homes = [home, ...windowsHomes];
	return [
		...homes.flatMap((root) =>
			vscodeLike.map(([ide, folder]) => ({
				ide,
				dir: join(root, folder, 'extensions'),
			})),
		),
		{ ide: 'JetBrains', dir: join(home, '.local', 'share', 'JetBrains') },
	];
};

/** Package names from `npm ls -g --json`-shaped output. */
export const npmGlobalNames = (output: string): readonly string[] => {
	try {
		const parsed = JSON.parse(output) as {
			dependencies?: Record<string, unknown>;
		};
		return Object.keys(parsed.dependencies ?? {});
	} catch {
		return [];
	}
};

/** The first word of each line: `pipx list --short`, `uv tool list`. */
export const firstWords = (output: string): readonly string[] =>
	output
		.split('\n')
		.map((line) => line.trim().split(/\s+/u)[0] ?? '')
		.filter((word) => word.length > 0 && !word.startsWith('-'));

export const realDetectionMachine = (
	options: {
		readonly env?: Readonly<Record<string, string | undefined>>;
		readonly run?: IClientCommandRunner;
		readonly home?: string;
		readonly cwd?: string;
	} = {},
): IDetectionMachine => {
	const env = options.env ?? process.env;
	const run = options.run ?? runClientCommand;
	const home = options.home ?? homedir();
	const cwd = options.cwd ?? home;
	const output = async (command: string): Promise<string> => {
		const answer = await run(command, { cwd, timeoutMs: LIST_TIMEOUT_MS });
		return answer.code === 0 ? answer.output : '';
	};
	return {
		executables: async () => [
			...new Set(
				(
					await Promise.all(
						(env.PATH ?? '')
							.split(delimiter)
							.filter(Boolean)
							.map(entries),
					)
				).flat(),
			),
		],
		globalPackages: async () => {
			const bunGlobal = await readFile(
				join(home, '.bun', 'install', 'global', 'package.json'),
				'utf8',
			).catch(() => '');
			const [npm, pnpm, pipx, uv] = await Promise.all([
				output('npm ls -g --depth=0 --json 2>/dev/null'),
				output('pnpm ls -g --depth=0 --json 2>/dev/null'),
				output('pipx list --short 2>/dev/null'),
				output('uv tool list 2>/dev/null'),
			]);
			const pnpmFirst = (() => {
				try {
					const parsed = JSON.parse(pnpm) as readonly {
						dependencies?: Record<string, unknown>;
					}[];
					return Object.keys(parsed[0]?.dependencies ?? {});
				} catch {
					return [];
				}
			})();
			return [
				...npmGlobalNames(npm),
				...npmGlobalNames(bunGlobal),
				...pnpmFirst,
				...firstWords(pipx),
				...firstWords(uv),
			];
		},
		ideExtensions: async () => {
			const windowsHomes = windowsAppDataUnderWsl().map((appData) =>
				join(appData, '..', '..'),
			);
			const found = await Promise.all(
				ideExtensionDirs(home, windowsHomes).map(async ({ ide, dir }) =>
					Promise.all(
						(await entries(dir)).map(async (id) => ({
							ide,
							id,
							manifest: await readFile(
								join(dir, id, 'package.json'),
								'utf8',
							).catch(() => undefined),
						})),
					),
				),
			);
			return found.flat();
		},
		help: async (executable) => {
			const answer = await run(
				`'${executable.replace(/'/gu, `'\\''`)}' --help 2>&1`,
				{
					cwd,
					timeoutMs: HELP_TIMEOUT_MS,
				},
			);
			return answer.output;
		},
	};
};

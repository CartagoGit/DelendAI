/**
 * capability-gateway.service.ts — the gateway a server's context gives
 * the call proxy: the contract, the raw-answer store, the components.
 *
 * Built lazily and once per server: a session that never names a
 * capability reads nothing and pays nothing for it.
 */
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { classifyPath } from '@delendai/conventions/public';

import type {
	ICapabilityGateway,
	IProjectContract,
	IProjectContractInput,
} from '../contracts/interfaces/project-contract.interface';
import { buildProjectContract } from './project-contract.service';

const run = promisify(execFile);
const COMPONENT_FILE = /(?:\.component\.ts|\.(?:tsx|jsx|vue|svelte|astro))$/u;
const MAX_COMPONENTS = 2000;

export const createCapabilityGateway = (
	input: IProjectContractInput & {
		/** Absolute directory the raw answers are written to. */
		readonly rawDir: string;
	},
): ICapabilityGateway => {
	let contract: Promise<IProjectContract> | undefined;
	let components: Promise<readonly string[]> | undefined;
	return {
		contract: () => {
			contract ??= buildProjectContract(input);
			return contract;
		},
		keep: async (handle, json) => {
			const path = join(
				input.rawDir,
				`${handle.replace(/[^a-z0-9-]/giu, '_')}.json`,
			);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, json);
		},
		components: () => {
			components ??= run('git', ['ls-files', '-z'], {
				cwd: input.workspaceRoot,
				maxBuffer: 64 * 1024 * 1024,
			})
				.then(({ stdout }) =>
					stdout
						.split('\0')
						.filter((path) => COMPONENT_FILE.test(path))
						.slice(0, MAX_COMPONENTS),
				)
				.catch(() => []);
			return components;
		},
		...(input.active('conventions')
			? {
					roleOf: (path: string) => {
						const role = classifyPath(path);
						return role === 'other' ? undefined : role;
					},
				}
			: {}),
	};
};

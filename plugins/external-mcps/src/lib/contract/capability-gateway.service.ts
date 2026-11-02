/**
 * capability-gateway.service.ts — the gateway a server's context gives
 * the call proxy: the contract, the raw-answer store, the components.
 *
 * Built lazily and once per server: a session that never names a
 * capability reads nothing and pays nothing for it.
 */
import { join } from 'node:path';

import type { IGitRunner } from '@delendai/core/public';
import { writeFileAtomic } from '@delendai/core/public';

import { classifyPath } from '@delendai/conventions/public';

import type {
	ICapabilityGateway,
	IProjectContract,
	IProjectContractInput,
} from '../contracts/interfaces/project-contract.interface';
import { buildProjectContract } from './project-contract.service';

const COMPONENT_FILE = /(?:\.component\.ts|\.(?:tsx|jsx|vue|svelte|astro))$/u;
const MAX_COMPONENTS = 2000;

export const createCapabilityGateway = (
	input: IProjectContractInput & {
		/** Absolute directory the raw answers are written to. */
		readonly rawDir: string;
		/** The host's git runner, for the tracked file list; none lists nothing. */
		readonly git?: IGitRunner | undefined;
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
			await writeFileAtomic(
				join(
					input.rawDir,
					`${handle.replace(/[^a-z0-9-]/giu, '_')}.json`,
				),
				json,
			);
		},
		components: () => {
			components ??= (
				input.git?.(['ls-files', '-z']) ?? Promise.resolve(undefined)
			)
				.then((listed) =>
					listed?.ok === true
						? listed.output
								.split('\u0000')
								.filter((path) => COMPONENT_FILE.test(path))
								.slice(0, MAX_COMPONENTS)
						: [],
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

/**
 * project-contract.service.ts — the project's contract, assembled from
 * the plugins that own each part.
 *
 * framework-knowledge says what the installed framework version allows,
 * style-convention who owns styles and which design tokens exist,
 * conventions where a file belongs. Each part is read only when its
 * plugin is active: a server with none of them still gets a valid, smaller
 * contract, so the gateway never depends on all three being loaded.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveInstalledFramework } from '@delendai/framework-knowledge/public';
import {
	designTokensOf,
	resolveStyleProfile,
	styleOptionsSchema,
} from '@delendai/style-convention/public';

import type {
	IProjectContract,
	IProjectContractInput,
} from '../contracts/interfaces/project-contract.interface';

/** Enough tokens to name the vocabulary; the rest stay in the token files. */
const MAX_TOKENS = 60;

const frameworkPart = async (
	input: IProjectContractInput,
): Promise<IProjectContract['framework']> => {
	if (!input.active('framework-knowledge')) return undefined;
	const installed = await resolveInstalledFramework(
		input.workspaceRoot,
	).catch(() => undefined);
	return installed === undefined
		? undefined
		: { id: installed.frameworkId, version: installed.version };
};

const stylePart = async (
	input: IProjectContractInput,
): Promise<IProjectContract['style']> => {
	if (!input.active('style-convention')) return undefined;
	const parsed = styleOptionsSchema.safeParse(
		input.optionsOf('style-convention'),
	);
	const profile = resolveStyleProfile(parsed.success ? parsed.data : {});
	const tokens: { name: string; value: string }[] = [];
	for (const file of profile.tokenFiles) {
		const text = await readFile(
			join(input.workspaceRoot, file),
			'utf8',
		).catch(() => undefined);
		if (text === undefined) continue;
		for (const token of designTokensOf({ path: file, text }))
			tokens.push({ name: token.name, value: token.value });
	}
	return {
		architecture: profile.architecture,
		tokens: tokens.slice(0, MAX_TOKENS),
	};
};

export const buildProjectContract = async (
	input: IProjectContractInput,
): Promise<IProjectContract> => {
	const framework = await frameworkPart(input);
	const style = await stylePart(input);
	const placement = input.active('conventions')
		? {
				profile:
					typeof input.optionsOf('conventions').profile === 'string'
						? String(input.optionsOf('conventions').profile)
						: 'typescript',
			}
		: undefined;
	return {
		...(framework === undefined ? {} : { framework }),
		...(style === undefined ? {} : { style }),
		...(placement === undefined ? {} : { placement }),
		from: [
			...(framework === undefined ? [] : ['framework-knowledge']),
			...(style === undefined ? [] : ['style-convention']),
			...(placement === undefined ? [] : ['conventions']),
		],
	};
};

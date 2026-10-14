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
import { SafeWorkspaceReader } from '@delendai/core/public';
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
): Promise<
	| (NonNullable<IProjectContract['style']> & {
			readonly truncatedTokens?: number;
	  })
	| undefined
> => {
	if (!input.active('style-convention')) return undefined;
	const parsed = styleOptionsSchema.safeParse(
		input.optionsOf('style-convention'),
	);
	const profile = resolveStyleProfile(parsed.success ? parsed.data : {});
	const reader = new SafeWorkspaceReader(input.workspaceRoot);
	const tokens: { name: string; value: string }[] = [];
	for (const file of profile.tokenFiles) {
		const text = await reader
			.readText(file)
			.then((read) => read.content)
			.catch(() => undefined);
		if (text === undefined) continue;
		for (const token of designTokensOf({ path: file, text }))
			tokens.push({ name: token.name, value: token.value });
	}
	return {
		architecture: profile.architecture,
		tokens: tokens.slice(0, MAX_TOKENS),
		...(tokens.length > MAX_TOKENS
			? { truncatedTokens: tokens.length }
			: {}),
	};
};

export const buildProjectContract = async (
	input: IProjectContractInput,
): Promise<IProjectContract> => {
	const framework = await frameworkPart(input);
	const resolvedStyle = await stylePart(input);
	const declaredProfile = input.optionsOf('conventions').profile;
	const placement = input.active('conventions')
		? {
				profile:
					typeof declaredProfile === 'string'
						? String(declaredProfile)
						: 'typescript',
			}
		: undefined;
	const unresolved: {
		part: 'framework' | 'style' | 'placement';
		reason: string;
	}[] = [];
	if (framework === undefined)
		unresolved.push({
			part: 'framework',
			reason: 'no framework the project depends on was resolved (framework-knowledge inactive, or none found)',
		});
	else if (framework.version === undefined)
		unresolved.push({
			part: 'framework',
			reason: `the installed version of ${framework.id} could not be read`,
		});
	if (resolvedStyle === undefined)
		unresolved.push({
			part: 'style',
			reason: 'style-convention is not active',
		});
	else if (resolvedStyle.truncatedTokens !== undefined)
		unresolved.push({
			part: 'style',
			reason: `only the first ${String(MAX_TOKENS)} of ${String(resolvedStyle.truncatedTokens)} design tokens are compared`,
		});
	if (placement === undefined)
		unresolved.push({
			part: 'placement',
			reason: 'conventions is not active',
		});
	else if (typeof declaredProfile !== 'string')
		unresolved.push({
			part: 'placement',
			reason: 'no conventions profile is configured; the TypeScript profile was assumed',
		});
	const style =
		resolvedStyle === undefined
			? undefined
			: {
					architecture: resolvedStyle.architecture,
					tokens: resolvedStyle.tokens,
				};
	return {
		...(framework === undefined ? {} : { framework }),
		...(style === undefined ? {} : { style }),
		...(unresolved.length === 0 ? {} : { unresolved }),
		...(placement === undefined ? {} : { placement }),
		from: [
			...(framework === undefined ? [] : ['framework-knowledge']),
			...(style === undefined ? [] : ['style-convention']),
			...(placement === undefined ? [] : ['conventions']),
		],
	};
};

import {
	nodeDynamicImport,
	resolvePluginSpecifier,
} from '@mcp-vertex/core/public';

import type { IEnvSchema, IEnvVarSchema } from '../validate/env-schema';
import { extractRequirements, type IZodLike } from './extract';
import type { IEnvRequirement } from './types';

const asPluginOptionsSchema = (mod: unknown): IZodLike | undefined => {
	if (mod === null || typeof mod !== 'object') return undefined;
	const candidate =
		'default' in mod ? (mod as { default: unknown }).default : mod;
	if (candidate === null || typeof candidate !== 'object') {
		return undefined;
	}
	if (!('optionsSchema' in candidate)) return undefined;
	const optionsSchema = (candidate as { optionsSchema?: unknown })
		.optionsSchema;
	if (optionsSchema === undefined || optionsSchema === null) return undefined;
	return optionsSchema as IZodLike;
};

const dedupeRequirements = (
	requirements: readonly IEnvRequirement[],
): readonly IEnvRequirement[] => {
	const seen = new Set<string>();
	return requirements.filter((requirement) => {
		const key = [
			requirement.plugin,
			requirement.var,
			requirement.provider ?? '',
			requirement.capability,
		].join('|');
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

export const loadRequirementsFromPluginNames = async (
	pluginNames: readonly string[],
): Promise<readonly IEnvRequirement[]> => {
	const requirements: IEnvRequirement[] = [];
	for (const pluginName of pluginNames) {
		if (pluginName === 'env') continue;
		for (const specifier of resolvePluginSpecifier(pluginName)) {
			try {
				const mod = await nodeDynamicImport(specifier);
				const optionsSchema = asPluginOptionsSchema(mod);
				if (optionsSchema === undefined) break;
				requirements.push(
					...extractRequirements(pluginName, optionsSchema),
				);
				break;
			} catch {}
		}
	}
	return dedupeRequirements(requirements);
};

export const buildSchemaFromRequirements = (
	requirements: readonly IEnvRequirement[],
): IEnvSchema => {
	const vars: Record<string, IEnvVarSchema> = {};
	for (const requirement of requirements) {
		const existing = vars[requirement.var];
		const reason =
			requirement.provider !== undefined
				? `${requirement.plugin}/${requirement.provider}: ${requirement.capability}`
				: `${requirement.plugin}: ${requirement.capability}`;
		if (existing === undefined) {
			vars[requirement.var] = {
				type: 'string',
				required: requirement.required,
				description: reason,
			};
			continue;
		}
		vars[requirement.var] = {
			...existing,
			required: existing.required === true || requirement.required,
			description:
				existing.description === undefined ||
				existing.description === reason
					? (existing.description ?? reason)
					: `${existing.description}; ${reason}`,
		};
	}
	return { vars };
};

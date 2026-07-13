import { z } from 'zod';

import type {
	ConfigurationCenterSection,
	IConfigurationCenterInput,
	IConfigurationCenterResult,
	IConfigurationCenterSnapshot,
} from '../contracts/interfaces/configuration-center.interface';
import { redactSecrets } from '../shared/redact';

export const serializeConfigurationSchema = (
	schema: unknown,
): Readonly<Record<string, unknown>> | undefined => {
	try {
		return z.toJSONSchema(schema as z.ZodType) as Readonly<
			Record<string, unknown>
		>;
	} catch {
		return undefined;
	}
};

const redactValue = <T>(value: T): { value: T; redactions: number } => {
	const redacted = redactSecrets(JSON.stringify(value));
	return {
		value: JSON.parse(redacted.text) as T,
		redactions: redacted.redactions,
	};
};

export const buildConfigurationCenterSnapshot = (
	input: IConfigurationCenterInput,
): IConfigurationCenterSnapshot => {
	const redactedConfig = redactValue(input.config);
	const redactedPlugins = redactValue(input.plugins);
	return {
		configSchema: input.configSchema,
		config: redactedConfig.value,
		redactions: redactedConfig.redactions + redactedPlugins.redactions,
		plugins: [...redactedPlugins.value].sort((a, b) =>
			a.id.localeCompare(b.id),
		),
		artifacts: [...input.artifacts].sort(
			(a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
		),
		unavailableArtifactKinds: [...(input.unavailableArtifactKinds ?? [])],
	};
};

export const readConfigurationCenterSection = (
	snapshot: IConfigurationCenterSnapshot,
	section: ConfigurationCenterSection,
	cursor: number,
	limit: number,
): IConfigurationCenterResult => {
	const list =
		section === 'plugins'
			? snapshot.plugins
			: section === 'artifacts'
				? snapshot.artifacts
				: [];
	const total = list.length;
	const safeCursor = Math.min(cursor, total);
	const nextCursor = safeCursor + limit < total ? safeCursor + limit : null;
	const page = { cursor: safeCursor, nextCursor, total };
	if (section === 'summary') {
		return {
			section,
			page,
			summary: {
				plugins: snapshot.plugins.length,
				activePlugins: snapshot.plugins.filter((entry) => entry.active)
					.length,
				artifacts: snapshot.artifacts.length,
				unavailableArtifactKinds: snapshot.unavailableArtifactKinds,
			},
		};
	}
	if (section === 'config') {
		return {
			section,
			page,
			configSchema: snapshot.configSchema,
			config: snapshot.config,
			redactions: snapshot.redactions,
		};
	}
	if (section === 'plugins') {
		return {
			section,
			page,
			plugins: snapshot.plugins.slice(safeCursor, safeCursor + limit),
		};
	}
	return {
		section,
		page,
		artifacts: snapshot.artifacts.slice(safeCursor, safeCursor + limit),
	};
};

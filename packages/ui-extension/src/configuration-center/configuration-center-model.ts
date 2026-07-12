import type {
	ConfigurationArtifactKind,
	IConfigurationArtifact,
} from '@mcp-vertex/client';

import type {
	ConfigurationCenterTab,
	IConfigurationArtifactModel,
	IConfigurationCenterCopy,
	IConfigurationCenterModel,
	IConfigurationCenterSource,
	IConfigurationPluginModel,
	IConfigurationProviderModel,
} from '../contracts/interfaces/configuration-center.interface';
import {
	buildConfigurationFields,
	containsRedactedValue,
} from './configuration-center-fields';

const DEFAULT_COPY: IConfigurationCenterCopy = {
	title: 'Configuration Center',
	subtitle: 'Project configuration, plugins and owned artifacts',
	searchPlaceholder: 'Search plugins and artifacts',
	save: 'Save changes',
	saving: 'Saving…',
	saved: 'Configuration saved',
	discard: 'Discard',
	restartRequired: 'Restart the MCP server to apply runtime changes.',
	conflict: 'The file changed outside this editor. Reload before saving.',
	invalid: 'Some values need attention before they can be saved.',
	empty: 'Nothing to show here yet.',
	unavailable: 'Ownership metadata is unavailable.',
	active: 'Active',
	inactive: 'Inactive',
	bundled: 'Bundled',
	userLocal: 'Project',
	external: 'External',
	schemaUnavailable: 'No editable schema advertised; values are preserved.',
	unsupportedField:
		'This field uses raw JSON because its schema is not supported.',
	redacted: 'Secret value hidden',
	tabs: {
		general: 'General',
		plugins: 'Plugins',
		providers: 'Providers',
		agents: 'Agents',
		skills: 'Skills',
		prompts: 'Prompts',
	},
};

const mergeCopy = (
	copy: Partial<IConfigurationCenterCopy> | undefined,
): IConfigurationCenterCopy => ({
	...DEFAULT_COPY,
	...copy,
	tabs: { ...DEFAULT_COPY.tabs, ...(copy?.tabs ?? {}) },
});

const artifactTabKind: Readonly<
	Record<'agents' | 'skills' | 'prompts', ConfigurationArtifactKind>
> = {
	agents: 'agent',
	skills: 'skill',
	prompts: 'prompt',
};

const artifactsOf = (
	artifacts: readonly IConfigurationArtifact[],
	kind: ConfigurationArtifactKind,
): readonly IConfigurationArtifactModel[] =>
	artifacts
		.filter((entry) => entry.kind === kind)
		.map((entry) => ({
			...entry,
			ownerLabel: entry.owner.id ?? 'Unknown owner',
		}))
		.sort(
			(left, right) =>
				left.ownerLabel.localeCompare(right.ownerLabel) ||
				left.id.localeCompare(right.id),
		);

const providersOf = (
	config: Readonly<Record<string, unknown>>,
): readonly IConfigurationProviderModel[] => {
	const providers = Array.isArray(config.providers) ? config.providers : [];
	return providers.map((value, index) => {
		const record =
			value !== null && typeof value === 'object' && !Array.isArray(value)
				? (value as Readonly<Record<string, unknown>>)
				: {};
		const id =
			typeof record.id === 'string' ? record.id : `provider-${index + 1}`;
		return {
			id,
			index,
			kind: typeof record.kind === 'string' ? record.kind : 'unknown',
			modelId:
				typeof record.modelId === 'string' ? record.modelId : 'unknown',
			field: {
				id: `field-providers-${index}`,
				path: ['providers', index],
				label: id,
				description: 'Provider definition',
				kind: 'json',
				value,
				required: true,
				readOnly: containsRedactedValue(value),
				known: true,
			},
		};
	});
};

const recordOf = (value: unknown): Readonly<Record<string, unknown>> =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: {};

const externalServerOf = (
	source: IConfigurationCenterSource,
	serverId: string,
): unknown => {
	const plugins = recordOf(source.document.value.plugins);
	const external = recordOf(plugins['external-mcps']);
	const options = recordOf(external.options);
	const servers = recordOf(options.servers);
	return servers[serverId];
};

const pluginModelsOf = (
	source: IConfigurationCenterSource,
): readonly IConfigurationPluginModel[] =>
	[...source.plugins]
		.sort((left, right) => left.id.localeCompare(right.id))
		.map((plugin) => {
			const externalServerId = plugin.id.startsWith('ext.')
				? plugin.id.slice(4)
				: undefined;
			const externalServer =
				externalServerId === undefined
					? undefined
					: externalServerOf(source, externalServerId);
			const fields =
				externalServerId !== undefined && externalServer !== undefined
					? [
							{
								id: `field-external-server-${externalServerId}`,
								path: [
									'plugins',
									'external-mcps',
									'options',
									'servers',
									externalServerId,
								],
								label: 'Server definition',
								description:
									'External MCP command, arguments and enabled state.',
								kind: 'json' as const,
								value: externalServer,
								required: true,
								readOnly: containsRedactedValue(externalServer),
								known: false,
							},
						]
					: plugin.optionsSchema === undefined
						? []
						: buildConfigurationFields(
								plugin.optionsSchema,
								plugin.options,
								['plugins', plugin.id, 'options'],
							);
			return {
				...plugin,
				fields,
				unsupportedFields: fields.filter(
					(field) => field.kind === 'unsupported' || !field.known,
				).length,
			};
		});

export const buildConfigurationCenterModel = (
	source: IConfigurationCenterSource,
): IConfigurationCenterModel => {
	const copy = mergeCopy(source.copy);
	const config = source.document.value;
	const rootFields = buildConfigurationFields(
		source.configSchema,
		config,
	).filter(
		(field) => field.path[0] !== 'plugins' && field.path[0] !== 'providers',
	);
	const plugins = pluginModelsOf(source);
	const providers = providersOf(config);
	const artifacts = {
		agents: artifactsOf(source.artifacts, artifactTabKind.agents),
		skills: artifactsOf(source.artifacts, artifactTabKind.skills),
		prompts: artifactsOf(source.artifacts, artifactTabKind.prompts),
	};
	const unavailable = new Set(source.unavailableArtifactKinds);
	const counts: Readonly<Record<ConfigurationCenterTab, number>> = {
		general: rootFields.length,
		plugins: plugins.length,
		providers: providers.length,
		agents: artifacts.agents.length,
		skills: artifacts.skills.length,
		prompts: artifacts.prompts.length,
	};
	const tabs = (
		[
			'general',
			'plugins',
			'providers',
			'agents',
			'skills',
			'prompts',
		] as const
	).map((id) => ({
		id,
		label: copy.tabs[id],
		count: counts[id],
		unavailable:
			id === 'agents' || id === 'skills' || id === 'prompts'
				? unavailable.has(artifactTabKind[id])
				: false,
	}));
	return {
		document: source.document,
		state: source.state ?? 'ready',
		issues: source.issues ?? [],
		activeTab: source.activeTab ?? 'general',
		copy,
		tabs,
		generalFields: rootFields,
		plugins,
		providers,
		artifacts,
	};
};

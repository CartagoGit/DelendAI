import type {
	ConfigurationArtifactKind,
	ConfigurationPathSegment,
	IConfigurationArtifact,
	IConfigurationDocumentSnapshot,
	IConfigurationPlugin,
	IConfigurationValidationIssue,
} from '@mcp-vertex/client';

export type ConfigurationCenterTab =
	| 'general'
	| 'plugins'
	| 'providers'
	| 'agents'
	| 'skills'
	| 'prompts';

export type ConfigurationCenterState =
	| 'ready'
	| 'saving'
	| 'conflict'
	| 'invalid';

export type ConfigurationFieldKind =
	| 'text'
	| 'number'
	| 'boolean'
	| 'select'
	| 'json'
	| 'unsupported';

export interface IConfigurationField {
	readonly id: string;
	readonly path: readonly ConfigurationPathSegment[];
	readonly label: string;
	readonly description?: string;
	readonly kind: ConfigurationFieldKind;
	readonly value: unknown;
	readonly choices?: readonly string[];
	readonly required: boolean;
	readonly readOnly: boolean;
	readonly known: boolean;
}

export interface IConfigurationPluginModel extends IConfigurationPlugin {
	readonly fields: readonly IConfigurationField[];
	readonly unsupportedFields: number;
}

export interface IConfigurationProviderModel {
	readonly id: string;
	readonly index: number;
	readonly kind: string;
	readonly modelId: string;
	readonly field: IConfigurationField;
}

export interface IConfigurationArtifactModel extends IConfigurationArtifact {
	readonly ownerLabel: string;
}

export interface IConfigurationCenterTabModel {
	readonly id: ConfigurationCenterTab;
	readonly label: string;
	readonly count: number;
	readonly unavailable: boolean;
}

export interface IConfigurationCenterCopy {
	readonly title: string;
	readonly subtitle: string;
	readonly searchPlaceholder: string;
	readonly save: string;
	readonly saving: string;
	readonly saved: string;
	readonly discard: string;
	readonly restartRequired: string;
	readonly conflict: string;
	readonly invalid: string;
	readonly empty: string;
	readonly unavailable: string;
	readonly active: string;
	readonly inactive: string;
	readonly bundled: string;
	readonly userLocal: string;
	readonly external: string;
	readonly schemaUnavailable: string;
	readonly unsupportedField: string;
	readonly redacted: string;
	readonly custom: string;
	readonly enabled: string;
	readonly enabledDescription: string;
	readonly path: string;
	readonly pathDescription: string;
	readonly prefix: string;
	readonly prefixDescription: string;
	readonly options: string;
	readonly pluginOptionsDescription: string;
	readonly serverDefinition: string;
	readonly serverDefinitionDescription: string;
	readonly providerDefinition: string;
	readonly preservedExtensionField: string;
	readonly unknownOwner: string;
	readonly capabilityTools: string;
	readonly capabilityPrompts: string;
	readonly capabilityResources: string;
	readonly tabs: Readonly<Record<ConfigurationCenterTab, string>>;
}

export interface IConfigurationCenterSource {
	readonly document: IConfigurationDocumentSnapshot;
	readonly configSchema: Readonly<Record<string, unknown>>;
	readonly plugins: readonly IConfigurationPlugin[];
	readonly artifacts: readonly IConfigurationArtifact[];
	readonly unavailableArtifactKinds: readonly ConfigurationArtifactKind[];
	readonly state?: ConfigurationCenterState;
	readonly issues?: readonly IConfigurationValidationIssue[];
	readonly activeTab?: ConfigurationCenterTab;
	readonly copy?: Partial<IConfigurationCenterCopy>;
}

export interface IConfigurationCenterModel {
	readonly document: IConfigurationDocumentSnapshot;
	readonly state: ConfigurationCenterState;
	readonly issues: readonly IConfigurationValidationIssue[];
	readonly activeTab: ConfigurationCenterTab;
	readonly copy: IConfigurationCenterCopy;
	readonly tabs: readonly IConfigurationCenterTabModel[];
	readonly generalFields: readonly IConfigurationField[];
	readonly plugins: readonly IConfigurationPluginModel[];
	readonly providers: readonly IConfigurationProviderModel[];
	readonly artifacts: Readonly<
		Record<
			'agents' | 'skills' | 'prompts',
			readonly IConfigurationArtifactModel[]
		>
	>;
}

export interface IRenderConfigurationCenterOptions {
	readonly model: IConfigurationCenterModel;
	readonly nonce?: string;
	readonly lang?: string;
}

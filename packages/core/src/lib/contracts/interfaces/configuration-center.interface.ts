import type { ActivationSource } from './activation-report.interface';
import type { PluginOrigin } from './plugin-origin.interface';

export type ConfigurationCenterSection =
	| 'summary'
	| 'config'
	| 'plugins'
	| 'artifacts';

export type ConfigurationArtifactKind =
	| 'agent'
	| 'skill'
	| 'prompt'
	| 'resource'
	| 'knowledge';

export type ConfigurationOwnerOrigin = PluginOrigin | 'unknown';

export interface IConfigurationOwner {
	readonly id: string | null;
	readonly origin: ConfigurationOwnerOrigin;
}

export interface IConfigurationArtifact {
	readonly id: string;
	readonly kind: ConfigurationArtifactKind;
	readonly owner: IConfigurationOwner;
}

export interface IConfigurationPluginCapabilities {
	readonly tools: number;
	readonly prompts: number;
	readonly resources: number;
	readonly knowledge: number;
	readonly skills: number;
}

export interface IConfigurationPlugin {
	readonly id: string;
	readonly origin: PluginOrigin;
	readonly active: boolean;
	readonly source: ActivationSource;
	readonly path?: string | undefined;
	readonly prefix?: string | undefined;
	readonly options: Readonly<Record<string, unknown>>;
	readonly optionsSchema?: Readonly<Record<string, unknown>> | undefined;
	readonly schemaStatus: 'available' | 'unavailable';
	readonly configExample?: Readonly<Record<string, unknown>> | undefined;
	readonly capabilities: IConfigurationPluginCapabilities;
}

export interface IConfigurationCenterSummary {
	readonly plugins: number;
	readonly activePlugins: number;
	readonly artifacts: number;
	readonly unavailableArtifactKinds: readonly ConfigurationArtifactKind[];
}

export interface IConfigurationCenterSnapshot {
	readonly configSchema: Readonly<Record<string, unknown>>;
	readonly config: Readonly<Record<string, unknown>>;
	readonly redactions: number;
	readonly plugins: readonly IConfigurationPlugin[];
	readonly artifacts: readonly IConfigurationArtifact[];
	readonly unavailableArtifactKinds: readonly ConfigurationArtifactKind[];
}

export interface IConfigurationCenterPage {
	readonly cursor: number;
	readonly nextCursor: number | null;
	readonly total: number;
}

export interface IConfigurationCenterResult {
	readonly section: ConfigurationCenterSection;
	readonly page: IConfigurationCenterPage;
	readonly summary?: IConfigurationCenterSummary | undefined;
	readonly configSchema?: Readonly<Record<string, unknown>> | undefined;
	readonly config?: Readonly<Record<string, unknown>> | undefined;
	readonly redactions?: number | undefined;
	readonly plugins?: readonly IConfigurationPlugin[] | undefined;
	readonly artifacts?: readonly IConfigurationArtifact[] | undefined;
}

export interface IConfigurationCenterInput {
	readonly configSchema: Readonly<Record<string, unknown>>;
	readonly config: Readonly<Record<string, unknown>>;
	readonly plugins: readonly IConfigurationPlugin[];
	readonly artifacts: readonly IConfigurationArtifact[];
	readonly unavailableArtifactKinds?:
		| readonly ConfigurationArtifactKind[]
		| undefined;
}

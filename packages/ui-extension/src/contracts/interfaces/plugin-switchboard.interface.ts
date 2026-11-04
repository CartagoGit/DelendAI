/** Host-agnostic plugin activation switchboard contracts (f00107 S3). */
export type PluginSwitchboardOrigin = 'bundled' | 'user-local' | 'external';
export type PluginSwitchboardSource = 'preset' | 'config' | 'flag';
export type PluginSwitchboardBadge = 'ours' | 'yours' | 'external';

export interface IPluginActivationPayloadEntry {
	readonly id: string;
	readonly origin: PluginSwitchboardOrigin;
	readonly active: boolean;
	readonly source: PluginSwitchboardSource;
	readonly toolCount: number;
}

export interface IPluginActivationOverviewPayload {
	readonly activationReport?: {
		readonly entries: readonly IPluginActivationPayloadEntry[];
	};
}

export interface IPluginSwitchboardRow {
	readonly id: string;
	readonly origin: PluginSwitchboardOrigin;
	readonly badge: PluginSwitchboardBadge;
	readonly active: boolean;
	readonly nextActive: boolean;
	readonly source: PluginSwitchboardSource;
	readonly toolCount: number;
}

export interface IPluginSwitchboardGroup {
	readonly origin: PluginSwitchboardOrigin;
	readonly badge: PluginSwitchboardBadge;
	readonly rows: readonly IPluginSwitchboardRow[];
}

export interface IPluginSwitchboardReadyModel {
	readonly kind: 'ready';
	readonly groups: readonly IPluginSwitchboardGroup[];
	readonly total: number;
	readonly active: number;
}

export interface IPluginSwitchboardUnavailableModel {
	readonly kind: 'unavailable';
	readonly hint: string;
}

export type IPluginSwitchboardModel =
	| IPluginSwitchboardReadyModel
	| IPluginSwitchboardUnavailableModel;

/**
 * host-byok.interface.ts — the models an editor serves on the person's
 * own keys, by name only.
 */

/** One model a BYOK provider serves, as the editor describes it. */
export interface IHostByokModel {
	readonly id: string;
	readonly name?: string | undefined;
	/** The host of the endpoint the editor sends it to; never the path or query. */
	readonly endpointHost?: string | undefined;
	readonly toolCalling?: boolean | undefined;
	readonly vision?: boolean | undefined;
	readonly thinking?: boolean | undefined;
	readonly contextWindow?: number | undefined;
	readonly reasoningEfforts?: readonly string[] | undefined;
}

/** One provider the person configured in an editor profile. */
export interface IHostByokProvider {
	/** The editor user directory it was read from. */
	readonly host: string;
	/** The profile's folder under `profiles/`, or `default` for the user directory itself. */
	readonly profile: string;
	/** The profile's name as the editor shows it, when it says. */
	readonly profileName?: string | undefined;
	/** The provider's name in the editor (`Alibaba Token Plan`). */
	readonly name: string;
	/** The editor's vendor id (`customendpoint`, `minimax`, `xai-grok`). */
	readonly vendor: string;
	/** The models it lists; empty for a vendor whose models the editor asks it for. */
	readonly models: readonly IHostByokModel[];
}

/** The roster as the server detected it on this machine. */
export interface IHostByokSnapshot {
	/** When it was detected, ISO 8601. */
	readonly detectedAt: string;
	/** The editor user directories looked in; empty when the machine has none. */
	readonly hosts: readonly string[];
	readonly providers: readonly IHostByokProvider[];
}

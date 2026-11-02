/**
 * public-catalogue.interface.ts — the public catalogues delendai names
 * agents and models by, and the copies it keeps of them.
 */

/** `catalogues` in a configuration: sources read before the defaults. */
export interface ICatalogueSources {
	readonly agents?: readonly string[] | undefined;
	readonly models?: readonly string[] | undefined;
}

/** Which catalogue: the agents that can be driven, or the models and providers. */
export type IPublicCatalogueKind = 'agents' | 'models';

/** Where a copy came from and when, so a stale or archived copy says so. */
export interface ICatalogueCopyMeta {
	readonly source: string;
	/** The shape of the compact data; a copy of another shape is fetched again. */
	readonly format: number;
	/** When this content was downloaded. */
	readonly fetchedAt: string;
	/** When a source was last asked whether it changed. */
	readonly checkedAt: string;
	/** sha256 of the downloaded body; empty for a copy migrated from an older layout. */
	readonly sha256: string;
	readonly etag?: string | undefined;
	readonly lastModified?: string | undefined;
	/** Digest of the source list the copy was read under; another list rechecks it. */
	readonly sourcesKey?: string | undefined;
}

/** A compact catalogue and its provenance, as cached and as shipped. */
export interface ICatalogueCopy<T> {
	readonly meta: ICatalogueCopyMeta;
	readonly data: T;
}

/** Which layer a read was served from. */
export type ICatalogueOrigin = 'source' | 'unchanged' | 'cache' | 'snapshot';

export interface ICatalogueRead<T> extends ICatalogueCopy<T> {
	readonly origin: ICatalogueOrigin;
}

/** A conditional GET; injected so specs need no network. */
export type ICatalogueConditionalFetch = (
	url: string,
	init: {
		readonly etag?: string | undefined;
		readonly lastModified?: string | undefined;
		readonly timeoutMs: number;
	},
) => Promise<{
	readonly status: number;
	readonly body?: string | undefined;
	readonly etag?: string | undefined;
	readonly lastModified?: string | undefined;
}>;

/** How a registry agent is started, by the means its publisher offers. */
export interface IAgentPackageLaunch {
	readonly package: string;
	readonly args?: readonly string[] | undefined;
	readonly env?: Readonly<Record<string, string>> | undefined;
}

/** One platform's release archive of an agent. */
export interface IAgentBinaryLaunch {
	readonly archive: string;
	readonly cmd: string;
	readonly args?: readonly string[] | undefined;
	readonly sha256?: string | undefined;
}

export interface IAgentDistribution {
	readonly npx?: IAgentPackageLaunch | undefined;
	readonly uvx?: IAgentPackageLaunch | undefined;
	/** By platform: `linux-x86_64`, `darwin-aarch64`, `windows-x86_64`... */
	readonly binary?: Readonly<Record<string, IAgentBinaryLaunch>> | undefined;
}

/** One agent of the Agent Client Protocol registry, kept compact. */
export interface IRegistryAgent {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly description?: string | undefined;
	readonly repository?: string | undefined;
	readonly distribution: IAgentDistribution;
}

export interface IAgentRegistry {
	readonly agents: readonly IRegistryAgent[];
}

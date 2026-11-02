/**
 * project-contract.interface.ts — what the project requires of anything
 * an external answer turns into.
 */

/** The project's side of an external call: each part present only when its plugin is. */
export interface IProjectContract {
	/** The framework the project depends on, and the version installed. */
	readonly framework?: {
		readonly id: string;
		readonly version: string | undefined;
	};
	/** Who owns styles, and the design tokens to use instead of literals. */
	readonly style?: {
		readonly architecture: string;
		readonly tokens: readonly {
			readonly name: string;
			readonly value: string;
		}[];
	};
	/** The conventions profile that says where a file belongs. */
	readonly placement?: { readonly profile: string };
	/** The plugins that contributed a part; empty is still a valid contract. */
	readonly from: readonly string[];
	/**
	 * Each part that could not be resolved, or was only resolved in part,
	 * and why: an empty finding list then never reads as full conformance.
	 */
	readonly unresolved?: readonly {
		readonly part: 'framework' | 'style' | 'placement';
		readonly reason: string;
	}[];
}

/** What building the contract reads; injected so it runs without the plugins. */
export interface IProjectContractInput {
	readonly workspaceRoot: string;
	/** Whether a peer plugin is active in this server. */
	readonly active: (plugin: string) => boolean;
	/** A peer plugin's configured options, as the project declared them. */
	readonly optionsOf: (plugin: string) => Readonly<Record<string, unknown>>;
}

/** What the call proxy spends a capability on, composed from the plugin's context. */
export interface ICapabilityGateway {
	readonly contract: () => Promise<IProjectContract>;
	/** Keeps a raw answer behind its handle. */
	readonly keep: (handle: string, json: string) => Promise<void>;
	/** The project's component files, workspace-relative. */
	readonly components: () => Promise<readonly string[]>;
	/** The conventions role of a path, when the conventions plugin is active. */
	readonly roleOf?: (path: string) => string | undefined;
}

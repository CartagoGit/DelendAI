/**
 * Who integrates ready work: `land`, the one stateless integrator, or
 * `none`, when the forge or a person merges and delendai integrates nothing.
 */
export const INTEGRATION_ENGINES = ['land', 'none'] as const;
export type IIntegrationEngine = (typeof INTEGRATION_ENGINES)[number];

/** Who the integrator acts as: a GitHub App, or a personal access token. Never the workflow token. */
export const INTEGRATION_IDENTITY_KINDS = ['app', 'pat'] as const;
export type IIntegrationIdentityKind =
	(typeof INTEGRATION_IDENTITY_KINDS)[number];

/** Whether the integrator groups overlapping pull requests into one batch. */
export const INTEGRATION_BATCHING_MODES = ['overlap', 'off'] as const;
export type IIntegrationBatching = (typeof INTEGRATION_BATCHING_MODES)[number];

/** The identity the integrator's token is minted from; only the names are policy, never a value. */
export interface IIntegrationIdentity {
	readonly kind: IIntegrationIdentityKind;
	/** `app`: the variable holding the App id. */
	readonly appIdVariable: string;
	/** `app`: the secret holding the App private key. */
	readonly keySecret: string;
	/** `pat`: the secret holding the token. */
	readonly tokenSecret: string;
}

/** The commands and paths a project owns to regenerate derived files. */
export interface IIntegrationDerived {
	readonly paths: readonly string[];
	readonly command: string;
}

/**
 * Commands a project owns that the integrator runs in its own checkout.
 * An empty string means the project has none: the integrator then falls
 * back to the policy's `zones` and does nothing extra to a batch.
 */
export interface IIntegrationCommands {
	/**
	 * Prints the zones (CI jobs) a change from `<base>` to `<head>` can
	 * affect, one per line, or `*` for all of them. Run with those two
	 * revisions as its last arguments.
	 */
	readonly jobs: string;
	/** Run in a batch's tree after its members merged, before the derived files are regenerated. */
	readonly normalizeBatch: string;
}

/** The hourly safety net on the default branch. */
export interface IIntegrationWatchdog {
	readonly enabled: boolean;
	readonly cron: string;
}

/** What the rehearsal reads: the secret names it needs and the scenarios it runs. */
export interface IIntegrationRehearsal {
	readonly secrets: readonly string[];
	readonly scenarios: readonly string[];
}

/** The options of the integration plugin; every one has a default, and with engine `none` none acts. */
export interface IPolicyIntegrationOptions {
	readonly identity: IIntegrationIdentity;
	readonly batching: IIntegrationBatching;
	/** The prefix of the labels the integrator owns. */
	readonly labels: { readonly prefix: string };
	readonly derived: IIntegrationDerived;
	readonly commands: IIntegrationCommands;
	/** Globs that declare the project's zones (sections), for grouping and dispatch. */
	readonly zones: readonly string[];
	/** The workflows whose completion signals the integrator. */
	readonly signalWorkflows: readonly string[];
	/** The workflows that scan the integration branch. */
	readonly scanWorkflows: readonly string[];
	readonly watchdog: IIntegrationWatchdog;
	readonly rehearsal: IIntegrationRehearsal;
}

/** The integration axis's switch: the engine, and the protocol the repository records. */
export interface IPolicyIntegrationEngine extends IPolicyIntegrationOptions {
	/** The actor that integrates ready work; the one switch every reader reads. */
	readonly engine: IIntegrationEngine;
	/**
	 * The integration protocol the repository runs. A process built for an
	 * older one (a host server started before the change) refuses to move
	 * refs or pull requests and says to restart.
	 */
	readonly protocol: number;
	/**
	 * True only when the project lands pull requests with no required
	 * check. Off, an empty `requiredChecks` lands nothing: nothing was proved.
	 */
	readonly landWithoutChecks: boolean;
}

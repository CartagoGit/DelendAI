import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

/** The integrator's identity as the policy declares it; names only, never a value. */
export type IDoctorIdentity =
	IResolvedDevelopmentPolicy['integration']['identity'];

/** What the doctor may ask the forge. Names and permission levels only: no secret value is ever read. */
export interface IIntegrationDoctorProbe {
	/** Names of the repository's Actions variables. */
	readonly variables: () => Promise<readonly string[]>;
	/** Names of the repository's Actions secrets. */
	readonly secrets: () => Promise<readonly string[]>;
	/** The permissions granted to the installed App, or `undefined` when they cannot be read. */
	readonly installationPermissions: () => Promise<
		Readonly<Record<string, string>> | undefined
	>;
}

/** One thing the doctor checked. */
export interface IDoctorCheck {
	readonly name: string;
	readonly ok: boolean;
	readonly detail: string;
}

export interface IDoctorReport {
	readonly ok: boolean;
	readonly checks: readonly IDoctorCheck[];
}

/** The document the owner gives GitHub once to create the App. */
export interface IAppManifest {
	readonly name: string;
	readonly url: string;
	readonly public: false;
	readonly hook_attributes: {
		readonly url: string;
		readonly active: boolean;
	};
	readonly default_events: readonly string[];
	readonly default_permissions: Readonly<Record<string, 'read' | 'write'>>;
}

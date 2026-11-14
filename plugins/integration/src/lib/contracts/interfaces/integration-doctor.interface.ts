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
	/** What the forge says about the App's installation on the repository. */
	readonly installationPermissions: () => Promise<IInstallationReading>;
}

/** One thing the doctor checked. */
/**
 * The forge answers the installation only to an App's own credential: a user
 * credential gets `unverifiable`, which is not the same as `not-installed`.
 */
export type IInstallationReading =
	| {
			readonly status: 'granted';
			readonly permissions: Readonly<Record<string, string>>;
	  }
	| { readonly status: 'not-installed' }
	| { readonly status: 'unverifiable' };

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

/**
 * Contract shapes for `./credential-seam`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `credential-seam.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `credential-seam.ts`, so no import site changes.
 */

import type { FORGE_CREDENTIAL_SOURCES } from './credential-seam.constant';

export type IForgeCredentialSource = (typeof FORGE_CREDENTIAL_SOURCES)[number];

/**
 * A description of the credential situation. It carries no secret, and by
 * construction cannot: every field is either an enum or a boolean.
 */
export interface IForgeCredentialSeam {
	readonly source: IForgeCredentialSource;
	/**
	 * True when a token variable is exported. False does NOT mean
	 * unauthenticated — `gh` may still hold a login — which is why an
	 * unreadable property is `NOT_EXECUTABLE` rather than "no credential".
	 */
	readonly tokenVariablePresent: boolean;
	/** Safe to log: names the mechanism, never the material. */
	readonly description: string;
}

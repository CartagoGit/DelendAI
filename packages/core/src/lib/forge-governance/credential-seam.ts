/**
 * credential-seam.ts — describes WHICH credential the forge adapter will
 * end up using, without ever handling its value.
 *
 * The rule this file enforces is deliberately blunt: nothing in forge
 * governance reads, stores, logs, serialises or persists a token. The
 * `gh` CLI already resolves `GH_TOKEN`, then `GITHUB_TOKEN`, then its own
 * keyring login, and it does so in the child process — so the correct
 * design is to spawn `gh` with the ambient environment inherited and stay
 * ignorant of what it authenticated with. This module therefore reports
 * only PRESENCE (`typeof value === 'string' && value.length > 0`), never
 * the value, and there is intentionally no accessor that returns one.
 *
 * That also means the runtime is NOT designed around a permanent admin
 * PAT. `IForgeCredentialSeam.source` is the substitution point: a
 * fine-grained runtime token, a GitHub App installation token minted per
 * run, or an OIDC-exchanged short-lived credential all arrive the same
 * way — by being present in the environment the adapter's child process
 * inherits. Adding one means adding a `source` here and, at most, an
 * `env` passthrough on the spawn; it never means adding a token
 * parameter to a broker function, and no result type in this subsystem
 * has a field that could carry one.
 */

/** Where the child process will get its authentication from. */
export const FORGE_CREDENTIAL_SOURCES = [
	/** `GH_TOKEN` is exported in the ambient environment. */
	'gh-token-env',
	/** `GITHUB_TOKEN` is exported (CI's default injection). */
	'github-token-env',
	/** Neither is set; `gh` will use its own stored login, if any. */
	'gh-cli-login',
] as const;
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

/** Presence check only. The value is read into nothing and returned nowhere. */
const isPresent = (value: string | undefined): boolean =>
	typeof value === 'string' && value.trim().length > 0;

/**
 * Classify the ambient credential situation. Takes the environment as a
 * parameter so tests never depend on the real one — and so a future
 * per-run App token can be injected by handing this a scoped environment
 * instead of mutating the process's.
 */
export const resolveForgeCredentialSeam = (
	env: Readonly<Record<string, string | undefined>> = process.env,
): IForgeCredentialSeam => {
	if (isPresent(env.GH_TOKEN)) {
		return {
			source: 'gh-token-env',
			tokenVariablePresent: true,
			description:
				'GH_TOKEN is exported; the gh CLI child process will use it. Its value is never read by delendai.',
		};
	}
	if (isPresent(env.GITHUB_TOKEN)) {
		return {
			source: 'github-token-env',
			tokenVariablePresent: true,
			description:
				'GITHUB_TOKEN is exported; the gh CLI child process will use it. Its value is never read by delendai.',
		};
	}
	return {
		source: 'gh-cli-login',
		tokenVariablePresent: false,
		description:
			'No token variable is exported; the gh CLI will fall back to its own stored login. Properties it cannot read are reported NOT_EXECUTABLE, never as a pass.',
	};
};

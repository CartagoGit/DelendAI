/**
 * resolver.ts — Turn `ICommitPolicyIdentity` into an `IResolvedAuthor`
 * (a Name + Email + optional label) using only the inputs the host
 * supplied.
 *
 * Pure over `(identity, ctx)` — the IGitRunner is passed in so the
 * resolver can ask git (`config --global user.name`, etc.) but
 * never the process environment directly: env-mode reads come
 * through `ctx.envVars` so tests can inject any environment.
 *
 * No side effects, no I/O surprises: every resolution returns
 * either a fully-populated `IResolvedAuthor` or `{ ok: false,
 * reason }` with a human-readable message for the agent.
 */

import type { IGitRunner } from '@delendai/core/public';

import type { ICommitPolicyIdentity } from '../contracts/options';

/**
 * What the resolver returns on success. `authorFlag` is the
 * exact `Name <email>` string to pass to `git commit --author=`.
 */
export interface IResolvedAuthor {
	readonly authorFlag: string;
	readonly displayName: string;
	readonly email: string;
	/** Optional human label, e.g. "global git config". */
	readonly label: string;
}

/** Failure variant. The reason is surfaced to the user verbatim. */
export type IAuthorResolution =
	| { readonly ok: true; readonly author: IResolvedAuthor }
	| { readonly ok: false; readonly reason: string };

/**
 * Inputs the resolver needs beyond the identity mode itself.
 *
 * `hostIdentity` mirrors `IResolvedHostIdentity` from core but we
 * keep the surface local so a host that does not declare an
 * identity still works (the resolver falls back gracefully).
 */
export interface IIdentityResolverContext {
	readonly run: IGitRunner;
	/** Read-only env access — keeps tests deterministic. */
	readonly envVars: Readonly<Record<string, string | undefined>>;
	/** Optional host identity (host + model name from the LLM driver). */
	readonly hostIdentity?:
		| {
				readonly host?: string | undefined;
				readonly model?: string | undefined;
		  }
		| undefined;
}

/** Trim a value, falling back to `undefined` when empty. */
const trimmedOrUndefined = (value: string | undefined): string | undefined => {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * `git config --global user.name` / `--global user.email`. Returns
 * undefined on failure or empty values — never throws.
 */
const readGlobalIdentity = async (
	run: IGitRunner,
): Promise<{ name?: string; email?: string; reason?: string }> => {
	const nameResult = await run(['config', '--global', 'user.name']);
	const emailResult = await run(['config', '--global', 'user.email']);
	const name = trimmedOrUndefined(nameResult.output);
	const email = trimmedOrUndefined(emailResult.output);
	if (name === undefined && email === undefined) {
		return {
			reason: 'no global git user.name / user.email configured',
		};
	}
	return {
		...(name !== undefined ? { name } : {}),
		...(email !== undefined ? { email } : {}),
	};
};

/**
 * `git config user.name` / `user.email` (repo-local). Falls back to
 * `--global` so a fresh clone can still resolve to the human's
 * workstation identity.
 */
const readRepoOrGlobalIdentity = async (
	run: IGitRunner,
): Promise<{ name?: string; email?: string; reason?: string }> => {
	const repoName = await run(['config', 'user.name']);
	const repoEmail = await run(['config', 'user.email']);
	const name = trimmedOrUndefined(repoName.output);
	const email = trimmedOrUndefined(repoEmail.output);
	if (name !== undefined || email !== undefined) {
		return {
			...(name !== undefined ? { name } : {}),
			...(email !== undefined ? { email } : {}),
		};
	}
	return readGlobalIdentity(run);
};

const formatAuthorFlag = (name: string, email: string): string => {
	const trimmedName = name.trim();
	const trimmedEmail = email.trim();
	if (
		trimmedName.includes('@') ||
		trimmedName.includes('<') ||
		trimmedName.includes('>')
	) {
		// Defensive: a malformed name that already looks like an
		// `Name <email>` line should not be double-wrapped. Pass
		// the email through unchanged so the caller still gets a
		// usable author flag.
		return `${trimmedName} <${trimmedEmail}>`;
	}
	return `${trimmedName} <${trimmedEmail}>`;
};

const missingMessage = (mode: string, key: 'name' | 'email'): string =>
	`identity.mode="${mode}" resolved to an empty ${key === 'name' ? 'user.name' : 'user.email'}`;

type IdentityModeResolver<T extends ICommitPolicyIdentity> = (
	identity: T,
	ctx: IIdentityResolverContext,
) => Promise<IAuthorResolution>;

/**
 * Universal resolver signature — each entry in the registry accepts
 * the full discriminated union and narrows internally. This keeps
 * the Map values uniformly typed (covariant over `T` would not
 * satisfy `Map<v, IdentityModeResolver<ICommitPolicyIdentity>>`).
 */
type AnyIdentityModeResolver = IdentityModeResolver<ICommitPolicyIdentity>;

type ExplicitIdentity = Extract<ICommitPolicyIdentity, { mode: 'explicit' }>;
type AgentIdentity = Extract<ICommitPolicyIdentity, { mode: 'agent' }>;
type RepoIdentity = Extract<ICommitPolicyIdentity, { mode: 'repo' }>;
type GlobalIdentity = Extract<ICommitPolicyIdentity, { mode: 'global' }>;
type EnvIdentity = Extract<ICommitPolicyIdentity, { mode: 'env' }>;
type AutoIdentity = Extract<ICommitPolicyIdentity, { mode: 'auto' }>;

const resolveExplicit: IdentityModeResolver<ExplicitIdentity> = async (
	identity,
	_ctx,
) => {
	const { name, email } = identity.owner;
	if (name.trim().length === 0) {
		return { ok: false, reason: missingMessage('explicit', 'name') };
	}
	if (email.trim().length === 0) {
		return { ok: false, reason: missingMessage('explicit', 'email') };
	}
	return {
		ok: true,
		author: {
			authorFlag: formatAuthorFlag(name, email),
			displayName: name,
			email,
			label: 'explicit owner',
		},
	};
};

const resolveAgent: IdentityModeResolver<AgentIdentity> = async (
	identity,
	ctx,
) => {
	const host = ctx.hostIdentity?.host;
	const model = ctx.hostIdentity?.model;
	const name =
		trimmedOrUndefined(host) ??
		trimmedOrUndefined(identity.fallbackName) ??
		(await readGlobalIdentity(ctx.run)).name;
	const email =
		trimmedOrUndefined(model) !== undefined
			? `${trimmedOrUndefined(model)}@${trimmedOrUndefined(host) ?? 'local'}`
			: (trimmedOrUndefined(identity.fallbackEmail) ??
				(await readGlobalIdentity(ctx.run)).email);
	if (name === undefined) {
		return { ok: false, reason: missingMessage('agent', 'name') };
	}
	if (email === undefined) {
		return { ok: false, reason: missingMessage('agent', 'email') };
	}
	return {
		ok: true,
		author: {
			authorFlag: formatAuthorFlag(name, email),
			displayName: name,
			email,
			label: 'agent (host identity)',
		},
	};
};

const resolveRepo: IdentityModeResolver<RepoIdentity> = async (
	_identity,
	ctx,
) => {
	const got = await readRepoOrGlobalIdentity(ctx.run);
	if (got.name === undefined || got.email === undefined) {
		return {
			ok: false,
			reason: got.reason ?? missingMessage('repo', 'name'),
		};
	}
	return {
		ok: true,
		author: {
			authorFlag: formatAuthorFlag(got.name, got.email),
			displayName: got.name,
			email: got.email,
			label: 'repo + global fallback',
		},
	};
};

const resolveGlobal: IdentityModeResolver<GlobalIdentity> = async (
	_identity,
	ctx,
) => {
	const got = await readGlobalIdentity(ctx.run);
	if (got.name === undefined || got.email === undefined) {
		return {
			ok: false,
			reason: got.reason ?? missingMessage('global', 'name'),
		};
	}
	return {
		ok: true,
		author: {
			authorFlag: formatAuthorFlag(got.name, got.email),
			displayName: got.name,
			email: got.email,
			label: 'global git config',
		},
	};
};

const resolveEnv: IdentityModeResolver<EnvIdentity> = async (
	_identity,
	ctx,
) => {
	const name = trimmedOrUndefined(ctx.envVars.GIT_AUTHOR_NAME);
	const email = trimmedOrUndefined(ctx.envVars.GIT_AUTHOR_EMAIL);
	if (name === undefined) {
		return {
			ok: false,
			reason: 'identity.mode="env" but GIT_AUTHOR_NAME is not set',
		};
	}
	if (email === undefined) {
		return {
			ok: false,
			reason: 'identity.mode="env" but GIT_AUTHOR_EMAIL is not set',
		};
	}
	return {
		ok: true,
		author: {
			authorFlag: formatAuthorFlag(name, email),
			displayName: name,
			email,
			label: 'GIT_AUTHOR_* env',
		},
	};
};

const resolveAuto: IdentityModeResolver<AutoIdentity> = async (
	_identity,
	ctx,
) => {
	// Deterministic priority: env > global > repo > agent
	// (so on a workstation with global user.name set, that's
	// what wins — matching the user's "al nombre global"
	// dogfooding requirement).
	const envName = trimmedOrUndefined(ctx.envVars.GIT_AUTHOR_NAME);
	const envEmail = trimmedOrUndefined(ctx.envVars.GIT_AUTHOR_EMAIL);
	if (envName !== undefined && envEmail !== undefined) {
		return {
			ok: true,
			author: {
				authorFlag: formatAuthorFlag(envName, envEmail),
				displayName: envName,
				email: envEmail,
				label: 'auto → env',
			},
		};
	}
	const global = await readGlobalIdentity(ctx.run);
	if (global.name !== undefined && global.email !== undefined) {
		return {
			ok: true,
			author: {
				authorFlag: formatAuthorFlag(global.name, global.email),
				displayName: global.name,
				email: global.email,
				label: 'auto → global',
			},
		};
	}
	const repo = await readRepoOrGlobalIdentity(ctx.run);
	if (repo.name !== undefined && repo.email !== undefined) {
		return {
			ok: true,
			author: {
				authorFlag: formatAuthorFlag(repo.name, repo.email),
				displayName: repo.name,
				email: repo.email,
				label: 'auto → repo',
			},
		};
	}
	const host = ctx.hostIdentity?.host;
	const model = ctx.hostIdentity?.model;
	if (
		trimmedOrUndefined(host) !== undefined &&
		trimmedOrUndefined(model) !== undefined
	) {
		const name = trimmedOrUndefined(host) as string;
		const email = `${trimmedOrUndefined(model) as string}@${name}`;
		return {
			ok: true,
			author: {
				authorFlag: formatAuthorFlag(name, email),
				displayName: name,
				email,
				label: 'auto → agent',
			},
		};
	}
	return {
		ok: false,
		reason: 'identity.mode="auto" could not resolve an author from env, global git config, repo git config, or host identity',
	};
};

/**
 * Registry of identity-mode resolvers. Adding a new mode means
 * (1) extending `COMMIT_POLICY_IDENTITY_MODES` in `contracts/options.ts`,
 * (2) writing a `resolve<Mode>` here, and (3) wiring it in the
 * `IDENTITY_RESOLVERS` map. No new `case` arm needed.
 */
const IDENTITY_RESOLVERS = new Map<
	ICommitPolicyIdentity['mode'],
	AnyIdentityModeResolver
>([
	['explicit', resolveExplicit as AnyIdentityModeResolver],
	['agent', resolveAgent as AnyIdentityModeResolver],
	['repo', resolveRepo as AnyIdentityModeResolver],
	['global', resolveGlobal as AnyIdentityModeResolver],
	['env', resolveEnv as AnyIdentityModeResolver],
	['auto', resolveAuto as AnyIdentityModeResolver],
]);

/**
 * Resolve one identity mode. The exported entry point —
 * `resolveAuthor(identity, ctx)` is the only public symbol.
 */
export const resolveAuthor = async (
	identity: ICommitPolicyIdentity,
	ctx: IIdentityResolverContext,
): Promise<IAuthorResolution> => {
	const resolver = IDENTITY_RESOLVERS.get(identity.mode);
	if (resolver === undefined) {
		return {
			ok: false,
			reason: `identity.mode="${identity.mode}" has no registered resolver`,
		};
	}
	return resolver(identity, ctx);
};

/**
 * profile-registry.ts — resolve a profile id to its rule table
 * (f00113 S1).
 *
 * `typescript` (the default) WRAPS the core's canonical
 * `DEFAULT_TS_RULES` — same objects, no copy — so the core contract's
 * parity spec keeps guarding a single source of truth. The non-TS
 * profiles are plugin-local data tables (see the sibling
 * `*.profile.ts` modules).
 */
import {
	classifyPath,
	TYPESCRIPT_RULES,
} from '../services/typescript-profile.service';
import { GO_PROFILE } from './go.profile';
import type { ILanguageProfile } from './profile.contract';
import { PYTHON_PROFILE } from './python.profile';
import { RUST_PROFILE } from './rust.profile';

/** TS wraps the core rules; `classifyPath` stays the classifier. */
export const TYPESCRIPT_PROFILE: ILanguageProfile = {
	id: 'typescript',
	displayName: 'TypeScript',
	fileExtensions: ['.ts', '.tsx'],
	// DEFAULT_TS_RULES entries are `{ name: Role; match }` — a `Role` is
	// a string, so the core table satisfies the open contract as-is.
	rules: TYPESCRIPT_RULES,
};

export const CONVENTION_PROFILE_IDS = [
	'typescript',
	'python',
	'rust',
	'go',
] as const;

export type IConventionProfileId = (typeof CONVENTION_PROFILE_IDS)[number];

const PROFILES: Readonly<Record<IConventionProfileId, ILanguageProfile>> = {
	typescript: TYPESCRIPT_PROFILE,
	python: PYTHON_PROFILE,
	rust: RUST_PROFILE,
	go: GO_PROFILE,
};

export type IProfileResolution =
	| { readonly ok: true; readonly profile: ILanguageProfile }
	| {
			readonly ok: false;
			readonly reason: string;
			readonly supported: readonly string[];
	  };

/** Resolve a profile id (default `typescript`), or a structured error. */
export const resolveProfile = (id?: string): IProfileResolution => {
	const target = id ?? 'typescript';
	const profile = PROFILES[target as IConventionProfileId];
	if (profile === undefined) {
		return {
			ok: false,
			reason: `unknown conventions profile "${target}"`,
			supported: [...CONVENTION_PROFILE_IDS],
		};
	}
	return { ok: true, profile };
};

/**
 * The core's own classifier, re-exported for the parity spec: the
 * registry's `typescript` profile must classify exactly like it.
 */
export { classifyPath as classifyTypeScriptPath };

/**
 * skills/sources/types.ts — q00009 / f00262.
 *
 * Portable skill resolver types. The whole point of this module is
 * that a consumer project that only ever installed `delendai` from
 * `npm` (or `bun add`) can resolve skills WITHOUT having the monorepo
 * layout on disk.
 *
 * The contract is:
 *
 *   - `ISkillDescriptor` — what `list()` returns. Compact: id, version,
 *     description, tags, appliesTo, source, owner, hash, estimatedBodyTokens.
 *   - `ILoadedSkill` — what `load(id)` returns. Adds `body` and `loadedAtIso`.
 *   - `ISkillSource` — the source contract: list() + load(id). Pure I/O,
 *     pure cache, no orchestration. Sources are independent.
 *
 * Sources are composed by a resolver that enforces precedence
 * (workspace > plugin > core > remote). The resolver is in `resolver.ts`.
 */

export interface ISkillDescriptor {
	readonly id: string;
	readonly version: string;
	readonly description: string;
	readonly tags: readonly string[];
	readonly appliesTo: readonly string[];
	readonly source: 'workspace' | 'package' | 'plugin' | 'core' | 'remote';
	readonly owner: string;
	readonly hash: string;
	readonly estimatedBodyTokens: number;
}

export interface ILoadedSkill extends ISkillDescriptor {
	readonly body: string;
	readonly loadedAtIso: string;
}

export interface ISkillSource {
	readonly id: string;
	readonly source: ISkillDescriptor['source'];
	list(): Promise<readonly ISkillDescriptor[]>;
	load(id: string): Promise<ILoadedSkill | null>;
}

export interface ISkillResolverOptions {
	readonly sources: readonly ISkillSource[];
	/** Optional clock injection; default = `new Date()`. */
	readonly now?: () => Date;
	/** Hash function for descriptor hash; default = constant string for tests. */
	readonly hash?: (text: string) => string;
}

export interface ISkillResolverListResult {
	readonly descriptors: readonly ISkillDescriptor[];
	/** Map id -> source.id of the source that won precedence. */
	readonly winningSources: Readonly<Record<string, string>>;
}

export interface ISkillResolverLoadResult {
	readonly skill: ILoadedSkill | null;
	readonly sourceId: string | null;
}

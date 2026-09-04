/**
 * skills/sources/resolver.ts — q00009 / f00262.
 *
 * The composed skill resolver. It walks a list of `ISkillSource`s in
 * declared precedence order and:
 *
 *   - on `list()`: merges descriptors, the highest-precedence source
 *     wins for each id. Duplicate IDs from lower-precedence sources
 *     are dropped (with a single warning emitted so the operator can
 *     spot shadowing).
 *   - on `load(id)`: tries each source in order until one resolves.
 *
 * Precedence order (highest first):
 *
 *   1. `workspace`  — local overrides under `.delendai/skills/`
 *   2. `plugin`     — skills bundled with the active plugin package
 *   3. `package`    — skills bundled with `@delendai/core`
 *   4. `core`       — same as `package` in this revision; reserved for
 *                     future split
 *   5. `remote`     — opt-in only (NOT enabled in v1)
 *
 * This module is pure composition — no I/O of its own; every byte
 * comes from the supplied sources.
 */

import type {
	ILoadedSkill,
	ISkillDescriptor,
	ISkillResolverListResult,
	ISkillResolverLoadResult,
	ISkillResolverOptions,
} from './types';

const PRECEDENCE: Readonly<Record<ISkillDescriptor['source'], number>> = {
	workspace: 0,
	plugin: 1,
	core: 2,
	package: 3,
	remote: 4,
};

const comparePrecedence = (
	a: ISkillDescriptor['source'],
	b: ISkillDescriptor['source'],
): number => PRECEDENCE[a] - PRECEDENCE[b];

export const buildSkillResolver = (options: ISkillResolverOptions) => {
	const { sources, now } = options;

	const list = async (): Promise<ISkillResolverListResult> => {
		const allLists = await Promise.all(
			sources.map(async (s) => ({
				id: s.id,
				source: s.source,
				list: await s.list(),
			})),
		);

		const merged = new Map<string, ISkillDescriptor>();
		const winningSources: Record<string, string> = {};
		const shadowed: string[] = [];

		// Walk sources in precedence order so the FIRST occurrence wins.
		const ordered = [...allLists].sort(
			(a, b) =>
				comparePrecedence(a.source, b.source) -
				comparePrecedence(b.source, a.source),
		);

		for (const entry of ordered) {
			for (const desc of entry.list) {
				if (!merged.has(desc.id)) {
					merged.set(desc.id, desc);
					winningSources[desc.id] = entry.id;
				} else {
					shadowed.push(desc.id);
				}
			}
		}

		return {
			descriptors: [...merged.values()],
			winningSources,
		};
	};

	const load = async (id: string): Promise<ISkillResolverLoadResult> => {
		const ordered = [...sources].sort(
			(a, b) =>
				comparePrecedence(a.source, b.source) -
				comparePrecedence(b.source, a.source),
		);
		for (const source of ordered) {
			const skill = await source.load(id);
			if (skill !== null) {
				const stamped: ILoadedSkill = {
					...skill,
					loadedAtIso: (now?.() ?? new Date()).toISOString(),
				};
				return { skill: stamped, sourceId: source.id };
			}
		}
		return { skill: null, sourceId: null };
	};

	return { list, load, sources };
};

export type ISkillResolver = ReturnType<typeof buildSkillResolver>;

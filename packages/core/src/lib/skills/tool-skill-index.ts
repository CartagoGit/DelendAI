/**
 * Which skills explain which tools. A skill names its tools in its
 * frontmatter; this inverts that into a lookup keyed by tool name, so the
 * tool catalogue can point at the playbook without carrying its body.
 */
import type { IToolSurfaceDescriptor } from '../contracts/interfaces/tool-surface.interface';
import type { ISkillCatalogEntry } from './skill-catalog';

/** Tool name to the ids of every skill that names it, sorted by id. */
export const buildToolSkillIndex = (
	entries: readonly Pick<ISkillCatalogEntry, 'id' | 'tools'>[],
): ReadonlyMap<string, readonly string[]> => {
	const index = new Map<string, string[]>();
	for (const entry of [...entries].sort((a, b) => a.id.localeCompare(b.id))) {
		for (const tool of entry.tools ?? []) {
			const skills = index.get(tool) ?? [];
			if (!skills.includes(entry.id)) skills.push(entry.id);
			index.set(tool, skills);
		}
	}
	return index;
};

/**
 * The skill a tool's catalogue entry points to: the one its own plugin
 * leads, since a cross-cutting playbook also names tools it only passes
 * through, otherwise the first that names it.
 */
export const skillForTool = (
	index: ReadonlyMap<string, readonly string[]>,
	toolName: string,
	ownedByPlugin: ReadonlySet<string> = new Set(),
): string | undefined => {
	const skills = index.get(toolName);
	return skills?.find((id) => ownedByPlugin.has(id)) ?? skills?.[0];
};

/**
 * Point each descriptor at the skill that names its tool, leaving the
 * others untouched. The reference is a skill id, a few bytes.
 */
export const withSkillReferences = (
	descriptors: readonly IToolSurfaceDescriptor[],
	entries: readonly Pick<ISkillCatalogEntry, 'id' | 'tools' | 'appliesTo'>[],
): readonly IToolSurfaceDescriptor[] => {
	const index = buildToolSkillIndex(entries);
	if (index.size === 0) return descriptors;
	return descriptors.map((descriptor) => {
		const skill = skillForTool(
			index,
			descriptor.name,
			new Set(
				entries
					.filter(
						(entry) =>
							entry.appliesTo[0] ===
							`@delendai/${descriptor.pluginId ?? ''}`,
					)
					.map((entry) => entry.id),
			),
		);
		return skill === undefined ? descriptor : { ...descriptor, skill };
	});
};

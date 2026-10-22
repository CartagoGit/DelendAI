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

/** The skill a tool's catalogue entry points to: the first that names it. */
export const skillForTool = (
	index: ReadonlyMap<string, readonly string[]>,
	toolName: string,
): string | undefined => index.get(toolName)?.[0];

/**
 * Point each descriptor at the skill that names its tool, leaving the
 * others untouched. The reference is a skill id, a few bytes.
 */
export const withSkillReferences = (
	descriptors: readonly IToolSurfaceDescriptor[],
	entries: readonly Pick<ISkillCatalogEntry, 'id' | 'tools'>[],
): readonly IToolSurfaceDescriptor[] => {
	const index = buildToolSkillIndex(entries);
	if (index.size === 0) return descriptors;
	return descriptors.map((descriptor) => {
		const skill = skillForTool(index, descriptor.name);
		return skill === undefined ? descriptor : { ...descriptor, skill };
	});
};

/**
 * Which catalogue skills belong to an active plugin, with their bodies:
 * what gets installed for the project's hosts.
 */
import type { IPluginSkillSource } from '../contracts/interfaces/agent-role-contribution.interface';
import type { ISkillCatalog, ISkillCatalogEntry } from './skill-catalog';

const SCOPE_PREFIX = '@delendai/';

/** The plugins a skill belongs to: the one it names, else those it applies to. */
const pluginsOf = (entry: ISkillCatalogEntry): readonly string[] =>
	entry.plugin !== undefined
		? [entry.plugin]
		: entry.appliesTo
				.filter((scope) => scope.startsWith(SCOPE_PREFIX))
				.map((scope) => scope.slice(SCOPE_PREFIX.length))
				.filter((name) => name !== '*' && name !== 'core');

/** The skills of the active plugins, each with its body as the plugin ships it. */
export const activePluginSkills = async (
	catalog: ISkillCatalog,
	activePlugins: readonly string[],
): Promise<readonly IPluginSkillSource[]> => {
	const active = new Set(activePlugins);
	const skills: IPluginSkillSource[] = [];
	for (const entry of catalog.entries) {
		if (entry.source === 'workspace') continue;
		const plugin = pluginsOf(entry).find((name) => active.has(name));
		if (plugin === undefined) continue;
		const body = await catalog.loadBody(entry.id);
		if (body === undefined) continue;
		skills.push({ id: entry.id, plugin, body });
	}
	return skills;
};

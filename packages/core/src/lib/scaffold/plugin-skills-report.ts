/**
 * plugin-skills-report.ts — the start-up step that installs the skills the
 * active plugins ship where the project's hosts read skills, and says what
 * it changed.
 */
import type { IPluginSkillChange } from '../contracts/interfaces/agent-role-contribution.interface';
import { projectAgentHosts } from '../hosts/project-hosts.service';
import { syncPluginSkills } from '../hosts/plugin-skills.service';
import { activePluginSkills } from '../skills/active-plugin-skills';
import { buildPortableSkillCatalog } from '../cli/assemble-skills';
import type { ISkillCatalog } from '../skills/skill-catalog';

const said: Record<IPluginSkillChange['action'], string> = {
	created: 'installed',
	updated: 'updated, its source changed',
	removed: 'removed, its plugin is no longer active',
	kept: 'left as it is: it is not as delendai wrote it',
};

/** Never fails a start; only a project with a configuration is written. */
export const reportPluginSkills = async (
	root: string,
	catalog: ISkillCatalog,
	activePlugins: readonly string[],
	declaredHosts?: readonly string[],
	write: (line: string) => void = (line) => process.stderr.write(line),
): Promise<void> => {
	try {
		const changes = await syncPluginSkills({
			root,
			hosts: (await projectAgentHosts({ root, declared: declaredHosts }))
				.hosts,
			skills: await activePluginSkills(catalog, activePlugins),
		});
		for (const change of changes)
			write(
				`[delendai] skill ${change.path} (plugin ${change.plugin}) ${said[change.action]}.\n`,
			);
	} catch (error) {
		write(
			`[delendai] could not sync the plugins' skills: ${error instanceof Error ? error.message : String(error)}\n`,
		);
	}
};

/**
 * Install the skills of the named plugins for a project's hosts, outside a
 * server start (`init`). Each plugin's skills are read from its package.
 */
export const installPluginSkills = async (input: {
	readonly root: string;
	readonly pluginNames: readonly string[];
	readonly declaredHosts?: readonly string[] | undefined;
}): Promise<readonly IPluginSkillChange[]> => {
	const catalog = await buildPortableSkillCatalog({
		workspace: input.root,
		coreVersion: '0.0.0',
		loadedPlugins: input.pluginNames.map((name) => ({
			name,
			resolved: `@delendai/${name}`,
		})),
	});
	return syncPluginSkills({
		root: input.root,
		hosts: (
			await projectAgentHosts({
				root: input.root,
				declared: input.declaredHosts,
			})
		).hosts,
		skills: await activePluginSkills(catalog, input.pluginNames),
	});
};

/**
 * Keeps a project's installed skills in step with the plugins switched on and
 * off while the server runs: each call installs or removes that plugin's
 * skills through the same projection a start uses.
 */
export const createPluginSkillSurfaceSync = (input: {
	readonly root: string;
	readonly catalog: ISkillCatalog;
	readonly initial: readonly string[];
	readonly declaredHosts?: readonly string[] | undefined;
	readonly write?: (line: string) => void;
}): ((plugin: string, active: boolean) => Promise<void>) => {
	const active = new Set(input.initial);
	return async (plugin, on) => {
		const name = plugin.replace(/^@delendai\//u, '');
		if (on) active.add(name);
		else active.delete(name);
		await reportPluginSkills(
			input.root,
			input.catalog,
			[...active],
			input.declaredHosts,
			input.write,
		);
	};
};

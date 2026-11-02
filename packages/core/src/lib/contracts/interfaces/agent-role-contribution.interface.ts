/**
 * agent-role-contribution.interface.ts — an agent role a plugin brings
 * to the projects that activate it.
 */

/** One role a plugin contributes; delendai writes its agent files. */
export interface IAgentRoleContribution {
	/** Kebab-case role id; the agent is named `<prefix>-<role>`. */
	readonly role: string;
	/** One line the host shows in its agent picker. */
	readonly description: string;
	/** What the agent does, in Markdown: the body of its file. */
	readonly instructions: string;
}

/** What syncing the plugins' agents did to one file. */
export interface IPluginAgentChange {
	readonly path: string;
	readonly plugin: string;
	/** `kept` is a file a person edited, which is never rewritten or removed. */
	readonly action: 'created' | 'updated' | 'removed' | 'kept';
}

/** What the start reads of a loaded plugin to write its agents. */
export interface IPluginAgentSource {
	readonly plugin: { readonly name: string };
	readonly registrations: {
		readonly agentRoles?: readonly IAgentRoleContribution[] | undefined;
	};
}

/** A skill a plugin ships, ready to be installed where a host reads skills. */
export interface IPluginSkillSource {
	/** The skill's id: the folder it is installed in. */
	readonly id: string;
	/** The plugin it belongs to. */
	readonly plugin: string;
	/** The `SKILL.md` as the plugin ships it. */
	readonly body: string;
}

/** What syncing the plugins' skills did to one installed file. */
export interface IPluginSkillChange {
	readonly path: string;
	readonly plugin: string;
	/** `kept` is a file without delendai's marker or edited since, never touched. */
	readonly action: 'created' | 'updated' | 'removed' | 'kept';
}

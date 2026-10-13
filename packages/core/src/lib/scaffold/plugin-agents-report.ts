/**
 * plugin-agents-report.ts — the start-up step that writes the agents the
 * loaded plugins contribute and says what it changed.
 */
import type {
	IPluginAgentChange,
	IPluginAgentSource,
} from '../contracts/interfaces/agent-role-contribution.interface';
import { syncPluginAgents } from './plugin-agents.service';

const said: Record<IPluginAgentChange['action'], string> = {
	created: 'created',
	updated: 'updated',
	removed: 'removed, its plugin is no longer active',
	kept: 'left as it is: it was edited by hand',
};

/** Never fails a start; only a project with a configuration is written. */
export const reportPluginAgents = async (
	root: string,
	namespacePrefix: string,
	loaded: readonly IPluginAgentSource[],
	write: (line: string) => void = (line) => process.stderr.write(line),
): Promise<void> => {
	try {
		const changes = await syncPluginAgents({
			root,
			namespacePrefix,
			contributions: loaded.flatMap(({ plugin, registrations }) =>
				(registrations.agentRoles ?? []).map((role) => ({
					plugin: plugin.name,
					role,
				})),
			),
		});
		for (const change of changes)
			write(
				`[delendai] agent ${change.path} (plugin ${change.plugin}) ${said[change.action]}.\n`,
			);
	} catch (error) {
		write(
			`[delendai] could not sync the plugins' agents: ${error instanceof Error ? error.message : String(error)}\n`,
		);
	}
};

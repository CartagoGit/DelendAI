/**
 * plugin-agents.service.ts — the agents the project's plugins contribute
 * exist exactly while the plugin is active.
 *
 * The agents a project got were a fixed list written for delendai's own
 * roles, whatever the project activated. A plugin, including one the
 * project ships itself, can now declare the roles it brings
 * (`agentRoles`); at each start every contributed role has its agent for
 * each host the project uses, a role whose plugin left (or a host the
 * project no longer uses) has its agents removed,
 * and a changed declaration rewrites them. Each file carries a marker
 * with the hash of what delendai wrote: a file a person edited since is
 * reported and never rewritten or removed.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { AGENT_HOSTS } from '../contracts/constants/agent-hosts.constant';
import { DEFAULT_DELENDAI_SERVER_NAME } from '../contracts/constants/mcp-server-name.constant';
import type { IAgentHost } from '../contracts/interfaces/agent-host.interface';
import { renderAgentForHosts } from '../hosts/agent-renderers.helper';
import { projectAgentHosts } from '../hosts/project-hosts.service';
import type {
	IAgentRoleContribution,
	IPluginAgentChange,
} from '../contracts/interfaces/agent-role-contribution.interface';
import { writeFileAtomic } from '../shared/atomic-write';
import { findDelendaiServerName } from './detect-existing-install';
import { hostToolSetReference } from './mcp-server-name.helper';

const MARKER =
	/\n<!-- delendai:plugin-agent plugin=(\S+) sha=([0-9a-f]+) -->\n?$/u;
const ROLE_ID = /^[a-z][a-z0-9-]*$/u;

const hash = (text: string): string =>
	createHash('sha256').update(text).digest('hex').slice(0, 16);

const signed = (content: string, plugin: string): string =>
	`${content}\n<!-- delendai:plugin-agent plugin=${plugin} sha=${hash(content)} -->\n`;

/** The plugin that wrote a file, and whether it is as delendai wrote it. */
const readSigned = (
	text: string,
): { readonly plugin: string; readonly untouched: boolean } | undefined => {
	const match = MARKER.exec(text);
	if (match === null) return undefined;
	const content = text.slice(0, match.index);
	return { plugin: match[1] ?? '', untouched: hash(content) === match[2] };
};

const serverName = async (root: string): Promise<string> => {
	for (const file of ['.vscode/mcp.json', '.mcp.json']) {
		const text = await readFile(join(root, file), 'utf8').catch(
			() => undefined,
		);
		const found =
			text === undefined ? undefined : findDelendaiServerName(text);
		if (found !== undefined) return found;
	}
	return DEFAULT_DELENDAI_SERVER_NAME;
};

/** The files one contributed role is written to, one per agent host. */
const renderRole = (
	prefix: string,
	server: string,
	role: IAgentRoleContribution,
	hosts: readonly IAgentHost[],
): readonly { readonly path: string; readonly content: string }[] =>
	renderAgentForHosts(hosts, {
		name: `${prefix}-${role.role}`,
		description: role.description.replace(/\s+/gu, ' ').trim(),
		instructions: role.instructions,
		entryPoint: false,
		serverToolSet: hostToolSetReference(server),
	});

export const syncPluginAgents = async (input: {
	readonly root: string;
	readonly namespacePrefix: string;
	readonly contributions: readonly {
		readonly plugin: string;
		readonly role: IAgentRoleContribution;
	}[];
	readonly apply?: boolean;
	/** The hosts to write for; the project's own (declared or found) when absent. */
	readonly hosts?: readonly IAgentHost[];
}): Promise<readonly IPluginAgentChange[]> => {
	const apply = input.apply !== false;
	const hosts = input.hosts ?? projectAgentHosts({ root: input.root }).hosts;
	const server = await serverName(input.root);
	const wanted = new Map<
		string,
		{ readonly plugin: string; readonly content: string }
	>();
	for (const { plugin, role } of input.contributions) {
		if (!ROLE_ID.test(role.role)) continue;
		for (const file of renderRole(
			input.namespacePrefix,
			server,
			role,
			hosts,
		))
			wanted.set(file.path, {
				plugin,
				content: signed(file.content, plugin),
			});
	}
	const changes: IPluginAgentChange[] = [];
	for (const [path, file] of wanted) {
		const existing = await readFile(join(input.root, path), 'utf8').catch(
			() => undefined,
		);
		if (existing === file.content) continue;
		const mark = existing === undefined ? undefined : readSigned(existing);
		if (existing !== undefined && mark?.untouched !== true) {
			changes.push({ path, plugin: file.plugin, action: 'kept' });
			continue;
		}
		if (apply) await writeFileAtomic(join(input.root, path), file.content);
		changes.push({
			path,
			plugin: file.plugin,
			action: existing === undefined ? 'created' : 'updated',
		});
	}
	// Every host's folder is swept: an agent written for a host the project
	// no longer uses goes like one whose plugin left.
	for (const dir of AGENT_HOSTS.flatMap((host) =>
		host.agents === undefined ? [] : [host.agents.dir],
	)) {
		const files = await readdir(join(input.root, dir)).catch(
			() => [] as string[],
		);
		for (const file of files) {
			const path = `${dir}/${file}`;
			if (wanted.has(path)) continue;
			const text = await readFile(join(input.root, path), 'utf8').catch(
				() => undefined,
			);
			const mark = text === undefined ? undefined : readSigned(text);
			if (mark === undefined) continue;
			if (!mark.untouched) {
				changes.push({ path, plugin: mark.plugin, action: 'kept' });
				continue;
			}
			if (apply) await rm(join(input.root, path), { force: true });
			changes.push({ path, plugin: mark.plugin, action: 'removed' });
		}
	}
	return changes;
};

/**
 * agent-grant-reconcile.service.ts — the agents delendai generated grant
 * the server the project actually registers.
 *
 * A Copilot agent reaches a server's tools only through a `<reference>/*`
 * grant in its `tools:` list. Renaming the server in `.vscode/mcp.json`,
 * or an agent written under another default, left every agent granting a
 * server that no longer existed: the agents were there and saw none of
 * delendai's tools, and nothing said so. At each start the grants of the
 * agents named with the project's prefix are compared with the servers
 * the project registers; a grant of no registered server is replaced by
 * delendai's. An agent is delendai's when it is named with the project's
 * prefix (`delendai init`) or after one of delendai's roles
 * (`adopt_project`). Grants of the project's other servers, and agents
 * delendai did not name, are never touched.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AGENT_SLOTS } from '../contracts/constants/agent-slots.constant';
import type { IAgentGrantChange } from '../contracts/interfaces/agent-grant-reconcile.interface';
import { writeFileAtomic } from '../shared/atomic-write';
import { findDelendaiServerName } from './detect-existing-install';
import { hostToolSetReference } from './mcp-server-name.helper';

const MCP_CONFIG_FILES = ['.vscode/mcp.json', '.mcp.json'] as const;
const COPILOT_AGENTS_DIR = '.github/agents';

/** delendai's role names, as `adopt_project` writes them and in kebab case. */
const ROLE_NAMES: ReadonlySet<string> = new Set(
	AGENT_SLOTS.flatMap((slot) => [slot, slot.replaceAll('_', '-')]),
);

/** Whether delendai wrote an agent of this name: its prefix, or a role. */
export const namedByDelendai = (
	name: string | undefined,
	prefix: string,
): boolean =>
	name !== undefined &&
	(name === prefix || name.startsWith(`${prefix}-`) || ROLE_NAMES.has(name));

const readText = (path: string): Promise<string | undefined> =>
	readFile(path, 'utf8').catch(() => undefined);

/** Every server key the project registers, and which of them is delendai. */
const registeredServers = async (
	root: string,
): Promise<{
	readonly names: readonly string[];
	readonly delendai?: string;
}> => {
	const names: string[] = [];
	let delendai: string | undefined;
	for (const file of MCP_CONFIG_FILES) {
		const text = await readText(join(root, file));
		if (text === undefined) continue;
		delendai ??= findDelendaiServerName(text);
		try {
			const parsed = JSON.parse(text) as Record<string, unknown>;
			const servers = parsed.servers ?? parsed.mcpServers;
			if (typeof servers === 'object' && servers !== null)
				names.push(...Object.keys(servers));
		} catch {
			// An unreadable config registers nothing; detection said so already.
		}
	}
	return delendai === undefined ? { names } : { names, delendai };
};

/** The `name:` and `tools:` lines of a file's front matter, when it has one. */
export const frontMatter = (
	text: string,
): { readonly name?: string; readonly toolsLine?: string } => {
	const lines = text.split('\n');
	if (lines[0]?.trim() !== '---') return {};
	const end = lines.indexOf('---', 1);
	if (end < 0) return {};
	const head = lines.slice(1, end);
	const name = head
		.find((line) => line.startsWith('name:'))
		?.slice('name:'.length)
		.trim();
	const toolsLine = head.find((line) => /^tools:\s*\[.*\]\s*$/u.test(line));
	return {
		...(name === undefined ? {} : { name }),
		...(toolsLine === undefined ? {} : { toolsLine }),
	};
};

/**
 * Rewrites the server grant of every agent delendai named (`<prefix>` or
 * `<prefix>-<role>`) whose grant names no registered server. Returns
 * what changed; with `apply: false` it only reports.
 */
export const reconcileAgentGrants = async (input: {
	readonly root: string;
	readonly namespacePrefix: string;
	readonly apply?: boolean;
}): Promise<readonly IAgentGrantChange[]> => {
	const servers = await registeredServers(input.root);
	if (servers.delendai === undefined) return [];
	const granted = `${hostToolSetReference(servers.delendai)}/*`;
	const registered = new Set(servers.names.map(hostToolSetReference));
	const entries = await readdir(join(input.root, COPILOT_AGENTS_DIR)).catch(
		() => [] as string[],
	);
	const changes: IAgentGrantChange[] = [];
	for (const entry of entries.filter((file) => file.endsWith('.agent.md'))) {
		const path = join(COPILOT_AGENTS_DIR, entry);
		const text = await readText(join(input.root, path));
		if (text === undefined) continue;
		const { name, toolsLine } = frontMatter(text);
		if (
			!namedByDelendai(name, input.namespacePrefix) ||
			toolsLine === undefined
		)
			continue;
		const inner = toolsLine.slice(
			toolsLine.indexOf('[') + 1,
			toolsLine.lastIndexOf(']'),
		);
		const tools = inner
			.split(',')
			.map((tool) => tool.trim())
			.filter((tool) => tool.length > 0);
		const removed = tools.filter(
			(tool) =>
				tool.endsWith('/*') &&
				!registered.has(tool.slice(0, -'/*'.length)),
		);
		if (removed.length === 0 && tools.includes(granted)) continue;
		const kept = tools.filter((tool) => !removed.includes(tool));
		const next = kept.includes(granted) ? kept : [...kept, granted];
		changes.push({ path, removed, granted });
		if (input.apply !== false)
			await writeFileAtomic(
				join(input.root, path),
				text.replace(toolsLine, `tools: [${next.join(', ')}]`),
			);
	}
	return changes;
};

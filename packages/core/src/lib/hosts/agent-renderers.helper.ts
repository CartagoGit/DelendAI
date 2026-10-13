/**
 * agent-renderers.helper.ts — one agent, written in each host's format.
 *
 * delendai's agents and every plugin's agent roles are declared once,
 * host-neutral. Each host that reads agent files gets its own front matter
 * and tool grants from here; no writer carries a host's format of its own.
 */
import type {
	IAgentFileFormat,
	IAgentHost,
	IHostNeutralAgent,
} from '../contracts/interfaces/agent-host.interface';

const frontMatter = (lines: readonly string[]): string =>
	['---', ...lines, '---'].join('\n');

const HEADERS: Readonly<
	Record<IAgentFileFormat, (agent: IHostNeutralAgent) => string>
> = {
	// VS Code Copilot: tools are granted by server tool set, and only the
	// entry point appears in the agent picker.
	copilot: (agent) =>
		frontMatter([
			`name: ${agent.name}`,
			`description: ${agent.description}`,
			`tools: [read, search, edit, execute, todo, ${agent.entryPoint ? 'agent, ' : ''}${agent.serverToolSet}/*]`,
			`user-invocable: ${String(agent.entryPoint)}`,
		]),
	// Claude Code and Codex CLI: name and description; tools are inherited.
	claude: (agent) =>
		frontMatter([
			`name: ${agent.name}`,
			`description: ${agent.description}`,
		]),
	codex: (agent) =>
		frontMatter([
			`name: ${agent.name}`,
			`description: ${agent.description}`,
		]),
	// OpenCode: the file name is the agent's name; `mode` says whether a
	// person picks it or another agent delegates to it.
	opencode: (agent) =>
		frontMatter([
			`description: ${agent.description}`,
			`mode: ${agent.entryPoint ? 'primary' : 'subagent'}`,
		]),
};

/** The file `agent` is written to for `host`, or nothing for a host without agent files. */
export const renderAgentFor = (
	host: IAgentHost,
	agent: IHostNeutralAgent,
): { readonly path: string; readonly content: string } | undefined =>
	host.agents === undefined
		? undefined
		: {
				path: `${host.agents.dir}/${agent.name}${host.agents.suffix}`,
				content: `${HEADERS[host.agents.format](agent)}\n\n${agent.instructions.trim()}\n`,
			};

/** Every agent file the hosts read, one per host that reads agent files. */
export const renderAgentForHosts = (
	hosts: readonly IAgentHost[],
	agent: IHostNeutralAgent,
): readonly { readonly path: string; readonly content: string }[] =>
	hosts.flatMap((host) => {
		const file = renderAgentFor(host, agent);
		return file === undefined ? [] : [file];
	});

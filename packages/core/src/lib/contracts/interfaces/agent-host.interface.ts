/**
 * agent-host.interface.ts — an editor or agent host delendai writes agents
 * and instructions for, and an agent written once for all of them.
 */

/** The agent file formats delendai renders. */
export type IAgentFileFormat = 'copilot' | 'claude' | 'codex' | 'opencode';

/** One host: where its agents and instructions go, and how it is recognised. */
export interface IAgentHost {
	readonly id: string;
	readonly label: string;
	/** Where its agent files go, when it reads agent files at all. */
	readonly agents?: {
		readonly dir: string;
		/** File name for an agent named `name`. */
		readonly suffix: string;
		readonly format: IAgentFileFormat;
	};
	/** The instructions file it reads, relative to the project root. */
	readonly instructions?: string;
	/** Paths in the project, or variables in the environment, that mean it is in use. */
	readonly evidence: {
		readonly paths: readonly string[];
		readonly env?: readonly string[];
	};
}

/** An agent as delendai declares it, before any host's format. */
export interface IHostNeutralAgent {
	/** Kebab-case, already prefixed (`delendai-orchestrator`). */
	readonly name: string;
	readonly description: string;
	readonly instructions: string;
	/** The one agent a person picks; the others are subagents. */
	readonly entryPoint: boolean;
	/** The MCP server key its tools come from, for hosts that grant by server. */
	readonly serverToolSet: string;
}

/** Why these hosts were chosen. */
export type IProjectHostsSource = 'declared' | 'detected' | 'none';

export interface IProjectHosts {
	readonly hosts: readonly IAgentHost[];
	readonly source: IProjectHostsSource;
}

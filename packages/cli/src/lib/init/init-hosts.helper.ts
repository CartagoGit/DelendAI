/**
 * init-hosts.helper.ts — the hosts `init` writes for, and the files their
 * instructions block goes into, read from core's `AGENT_HOSTS`: a host
 * declared there gets its block with no edit here.
 */
import {
	AGENT_HOSTS,
	projectAgentHosts,
	type IAgentHost,
} from '@delendai/core/cli';

import type { IHostInstructionTarget } from '../../contracts/interfaces/init.interface';

/** The hosts init writes the server's configuration for whatever it finds. */
const INIT_CONFIGURED_HOSTS: readonly string[] = ['copilot', 'claude'];

/**
 * The hosts whose instructions init writes whatever it finds: the
 * configured ones, and the terminal agents that read `AGENTS.md`.
 */
const INIT_INSTRUCTED_HOSTS: readonly string[] = [
	...INIT_CONFIGURED_HOSTS,
	'agents-md',
];

/** The bootstrap part in effect for a host, when it is not the repo-level rules. */
const APPENDIX_OF_HOST: Readonly<Record<string, string>> = {
	copilot: '- Bootstrap §8.1 (Copilot close-marker contract) is in effect.',
	claude: '- Bootstrap §8.2 (keep the main thread cheap) is in effect.',
};
const REPO_LEVEL_APPENDIX = '- Bootstrap §7 (repo-level rules) is in effect.';

/** The block every host-instructions file receives, before its appendix. */
const HOST_INSTRUCTIONS_CANONICAL_BODY =
	'# delendai host hints (auto-generated)\n\n' +
	'See `docs/delendai/host-hints/agent-instructions.generated.md` for the live agent catalog.';

/** The whole block a target receives. */
export const hostInstructionsBody = (target: IHostInstructionTarget): string =>
	`${HOST_INSTRUCTIONS_CANONICAL_BODY}\n\n${target.appendix}`;

/**
 * The hosts init writes for: the project's declared hosts, or every host
 * delendai knows, or the ones found in the project plus `always`.
 */
export const initHosts = async (
	workspaceRoot: string,
	options: {
		readonly hosts?: readonly string[] | undefined;
		readonly everyHost?: boolean | undefined;
	},
	always: readonly string[] = INIT_CONFIGURED_HOSTS,
): Promise<readonly IAgentHost[]> => {
	if (options.everyHost === true) return AGENT_HOSTS;
	const found = await projectAgentHosts({
		root: workspaceRoot,
		declared: options.hosts,
	});
	// Declared hosts are the project's word.
	if (found.source === 'declared') return found.hosts;
	return AGENT_HOSTS.filter(
		(host) => always.includes(host.id) || found.hosts.includes(host),
	);
};

/** Each instructions file the given hosts read, once, in catalog order. */
export const hostInstructionTargets = (
	hosts: readonly IAgentHost[],
): readonly IHostInstructionTarget[] => {
	const byPath = new Map<string, string[]>();
	for (const host of hosts) {
		if (host.instructions === undefined) continue;
		byPath.set(host.instructions, [
			...(byPath.get(host.instructions) ?? []),
			host.id,
		]);
	}
	return [...byPath].map(([relPath, ids]) => ({
		relPath,
		hosts: ids,
		appendix:
			ids
				.map((id) => APPENDIX_OF_HOST[id])
				.find((each) => each !== undefined) ?? REPO_LEVEL_APPENDIX,
	}));
};

/** The instructions files init writes, for the hosts it writes instructions for. */
export const initInstructionTargets = async (
	workspaceRoot: string,
	options: {
		readonly hosts?: readonly string[] | undefined;
		readonly everyHost?: boolean | undefined;
	},
): Promise<readonly IHostInstructionTarget[]> =>
	hostInstructionTargets(
		await initHosts(workspaceRoot, options, INIT_INSTRUCTED_HOSTS),
	);

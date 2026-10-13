/**
 * project-hosts.service.ts — the hosts this project uses: the ones it
 * declares, or else the ones found in it.
 *
 * Every project used to get agents for Copilot, Claude Code and Codex,
 * used or not, and nothing for the host it actually used. The hosts are
 * now `hosts` in delendai.config.json (or `DELENDAI_HOSTS` for one run);
 * a project that declares none gets the hosts its tree and environment
 * show, and the agent folders already there count, so no host a project
 * relies on is dropped.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
	AGENT_HOSTS,
	HOSTS_VARIABLE,
} from '../contracts/constants/agent-hosts.constant';
import type {
	IAgentHost,
	IProjectHosts,
} from '../contracts/interfaces/agent-host.interface';

const byIds = (ids: readonly string[]): readonly IAgentHost[] =>
	AGENT_HOSTS.filter((host) => ids.includes(host.id));

/** Whether `host` shows in the project at `root` or in `env`. */
export const hostInUse = (
	root: string,
	host: IAgentHost,
	env: NodeJS.ProcessEnv,
): boolean =>
	host.evidence.paths.some((path) => existsSync(join(root, path))) ||
	(host.evidence.env ?? []).some((name) => env[name] !== undefined);

export const projectAgentHosts = (input: {
	readonly root: string;
	/** `hosts` from the configuration, when it says. */
	readonly declared?: readonly string[] | undefined;
	readonly env?: NodeJS.ProcessEnv;
}): IProjectHosts => {
	const env = input.env ?? process.env;
	const fromEnv = env[HOSTS_VARIABLE]
		?.split(',')
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
	const declared = fromEnv ?? input.declared;
	if (declared !== undefined)
		return { hosts: byIds(declared), source: 'declared' };
	const detected = AGENT_HOSTS.filter((host) =>
		hostInUse(input.root, host, env),
	);
	return detected.length > 0
		? { hosts: detected, source: 'detected' }
		: { hosts: [], source: 'none' };
};

/** The ids a configuration may name in `hosts`. */
export const knownHostIds = (): readonly string[] =>
	AGENT_HOSTS.map((host) => host.id);

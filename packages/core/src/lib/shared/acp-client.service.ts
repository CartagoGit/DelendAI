/**
 * acp-client.service.ts — start an agent from its registry entry and run
 * one prompt turn with it over stdio.
 *
 * The registry says how each agent is distributed: an npx or uvx package
 * with its arguments, or a per-platform release archive. A package is
 * fetched from the network only when the project allowed that exact
 * package and version (`trustedAgentPackages`), and runs pinned; a binary
 * runs from where it was installed. The process is stopped when the turn ends or times out.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';

import type {
	IAcpIntroduction,
	IAcpLaunch,
	IAcpPromptInput,
	IAcpPromptResult,
} from '../contracts/interfaces/acp.interface';
import type {
	IAgentPackageLaunch,
	IRegistryAgent,
} from '../contracts/interfaces/public-catalogue.interface';
import { registryPlatform } from '../platform/registry-platform.helper';
import { introduceAcpAgent, promptAcpAgent } from './acp-session.service';
import { TRUSTED_AGENT_PACKAGES_SETTING } from '../contracts/constants/trusted-agent-packages.constant';

/**
 * An ACP stream over a process's stdio. Node's web streams and the global
 * ones are the same objects under two declarations; the conversion is
 * made here, once.
 */
export const acpStdioStream = async (
	input: NodeJS.WritableStream,
	output: NodeJS.ReadableStream,
) =>
	(await import('@agentclientprotocol/sdk')).ndJsonStream(
		Writable.toWeb(
			input as Writable,
		) as unknown as WritableStream<Uint8Array>,
		Readable.toWeb(
			output as Readable,
		) as unknown as ReadableStream<Uint8Array>,
	);

const DEFAULT_TURN_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * The package as it is fetched: the registry's pinned version, or the
 * agent's own when the package names none. `npx` and `uvx` both read
 * `name@version`.
 */
export const pinnedPackage = (pkg: string, version: string): string =>
	pkg.lastIndexOf('@') > 0 || pkg.includes('==') || version.length === 0
		? pkg
		: `${pkg}@${version}`;

/**
 * The package `agent` would fetch from the network to start, with the
 * tool that fetches it; undefined for an agent that fetches nothing.
 */
const fetchedPackage = (
	agent: IRegistryAgent,
): { readonly tool: 'npx' | 'uvx'; readonly spec: string } | undefined => {
	const { npx, uvx } = agent.distribution;
	if (npx !== undefined)
		return { tool: 'npx', spec: pinnedPackage(npx.package, agent.version) };
	if (uvx !== undefined)
		return { tool: 'uvx', spec: pinnedPackage(uvx.package, agent.version) };
	return undefined;
};

/**
 * Why `agent` will not be started here although it could: its package
 * would be fetched from the network and the project has not allowed that
 * exact package and version. Undefined when nothing stops it.
 */
export const acpFetchRefusal = (
	agent: IRegistryAgent,
	trusted: ReadonlySet<string> = new Set(),
): string | undefined => {
	const fetched = fetchedPackage(agent);
	if (fetched === undefined || trusted.has(fetched.spec)) return undefined;
	return `${agent.id} would be fetched from the network (${fetched.tool} ${fetched.spec}) and this project has not allowed that package: add "${fetched.spec}" to \`${TRUSTED_AGENT_PACKAGES_SETTING}\` in delendai.config.json, or install the agent`;
};

/**
 * How to start `agent` here: its package through npx or uvx, pinned and
 * only when the project allowed that package (`trusted`), else its binary
 * from `installedDir`. `undefined` when neither is available.
 */
export const acpLaunchOf = (
	agent: IRegistryAgent,
	options: {
		readonly platform?: string;
		readonly installedDir?: string;
		/** The exact `name@version` packages the project allows fetching. */
		readonly trusted?: ReadonlySet<string>;
	} = {},
): IAcpLaunch | undefined => {
	const { npx, uvx, binary } = agent.distribution;
	const fetched = fetchedPackage(agent);
	if (
		fetched !== undefined &&
		acpFetchRefusal(agent, options.trusted) === undefined
	) {
		const extra: Partial<IAgentPackageLaunch> =
			(fetched.tool === 'npx' ? npx : uvx) ?? {};
		return {
			command: fetched.tool,
			args:
				fetched.tool === 'npx'
					? ['-y', fetched.spec, ...(extra.args ?? [])]
					: [fetched.spec, ...(extra.args ?? [])],
			env: extra.env,
			fromNetwork: `${fetched.tool} ${fetched.spec}`,
		};
	}
	const build = binary?.[options.platform ?? registryPlatform()];
	if (build === undefined || options.installedDir === undefined)
		return undefined;
	return {
		command: join(options.installedDir, build.cmd),
		args: [...(build.args ?? [])],
	};
};

/** Start `launch`, run one turn, stop the process. Rejects on a start failure or a timeout. */
export { registryPlatform };

export const runAcpAgent = async (
	launch: IAcpLaunch,
	input: IAcpPromptInput & {
		readonly timeoutMs?: number | undefined;
		/** Aborting it stops the agent and fails the turn (a cancel). */
		readonly signal?: AbortSignal | undefined;
	},
): Promise<IAcpPromptResult> => {
	const child = spawn(launch.command, [...launch.args], {
		cwd: input.cwd,
		env: { ...process.env, ...launch.env },
		stdio: ['pipe', 'pipe', 'ignore'],
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const failed = new Promise<never>((_, reject) => {
		child.once('error', reject);
		child.once('exit', (code) =>
			reject(
				new Error(
					`${launch.command} exited (${String(code)}) before the turn ended`,
				),
			),
		);
		timer = setTimeout(
			() =>
				reject(
					new Error(
						`${launch.command} took longer than the turn allows`,
					),
				),
			input.timeoutMs ?? DEFAULT_TURN_TIMEOUT_MS,
		);
		const abort = (): void =>
			reject(new Error(`${launch.command}: the turn was cancelled`));
		if (input.signal?.aborted === true) abort();
		input.signal?.addEventListener('abort', abort, { once: true });
	});
	try {
		const stream = await acpStdioStream(child.stdin, child.stdout);
		return await Promise.race([promptAcpAgent(stream, input), failed]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		child.removeAllListeners('exit');
		child.kill();
	}
};

/** Start `launch`, greet it, stop it: what the agent says it is, at no cost. */
export const introduceAgent = async (
	launch: IAcpLaunch,
	cwd: string,
	timeoutMs = 30_000,
): Promise<IAcpIntroduction> => {
	const child = spawn(launch.command, [...launch.args], {
		cwd,
		env: { ...process.env, ...launch.env },
		stdio: ['pipe', 'pipe', 'ignore'],
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const failed = new Promise<never>((_, reject) => {
		child.once('error', reject);
		timer = setTimeout(
			() =>
				reject(
					new Error(
						`${launch.command} did not answer within ${String(timeoutMs)} ms`,
					),
				),
			timeoutMs,
		);
	});
	try {
		const stream = await acpStdioStream(child.stdin, child.stdout);
		return await Promise.race([introduceAcpAgent(stream), failed]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		child.kill();
	}
};

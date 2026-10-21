/**
 * acp-client.service.ts — start an agent from its registry entry and run
 * one prompt turn with it over stdio.
 *
 * The registry says how each agent is distributed: an npx or uvx package
 * with its arguments, or a per-platform release archive. Packages run as
 * the registry names them (pinned versions); a binary runs from where it
 * was installed. The process is stopped when the turn ends or times out.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';

import { ndJsonStream } from '@agentclientprotocol/sdk';

import type {
	IAcpLaunch,
	IAcpPromptInput,
	IAcpPromptResult,
} from '../contracts/interfaces/acp.interface';
import type { IRegistryAgent } from '../contracts/interfaces/public-catalogue.interface';
import { promptAcpAgent } from './acp-session.service';

const DEFAULT_TURN_TIMEOUT_MS = 10 * 60 * 1000;

/** The registry's platform key for this machine: `linux-x86_64`, `darwin-aarch64`... */
export const registryPlatform = (
	platform: string = process.platform,
	arch: string = process.arch,
): string =>
	`${platform === 'win32' ? 'windows' : platform}-${arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : arch}`;

/**
 * How to start `agent` here: its package through npx or uvx, else its
 * binary from `installedDir`. `undefined` when neither is available.
 */
export const acpLaunchOf = (
	agent: IRegistryAgent,
	options: {
		readonly platform?: string;
		readonly installedDir?: string;
	} = {},
): IAcpLaunch | undefined => {
	const { npx, uvx, binary } = agent.distribution;
	if (npx !== undefined)
		return {
			command: 'npx',
			args: ['-y', npx.package, ...(npx.args ?? [])],
			env: npx.env,
		};
	if (uvx !== undefined)
		return {
			command: 'uvx',
			args: [uvx.package, ...(uvx.args ?? [])],
			env: uvx.env,
		};
	const build = binary?.[options.platform ?? registryPlatform()];
	if (build === undefined || options.installedDir === undefined)
		return undefined;
	return {
		command: join(options.installedDir, build.cmd),
		args: [...(build.args ?? [])],
	};
};

/** Start `launch`, run one turn, stop the process. Rejects on a start failure or a timeout. */
export const runAcpAgent = async (
	launch: IAcpLaunch,
	input: IAcpPromptInput & { readonly timeoutMs?: number | undefined },
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
	});
	try {
		const stream = ndJsonStream(
			Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
			Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
		);
		return await Promise.race([promptAcpAgent(stream, input), failed]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		child.removeAllListeners('exit');
		child.kill();
	}
};

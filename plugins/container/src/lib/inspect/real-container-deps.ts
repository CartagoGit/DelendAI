import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
	probeTool,
	realProbeDeps,
	type IExternalTool,
} from '@delendai/core/public';

import { DOCKER_TOOL, KUBECTL_TOOL } from './cli-tools';
import type { IContainerInspectDeps } from './types';

const execFileAsync = promisify(execFile);

const TOOL_BY_NAME: Readonly<Record<string, IExternalTool>> = {
	docker: DOCKER_TOOL,
	kubectl: KUBECTL_TOOL,
};

const formatInstallHint = (tool: IExternalTool, command?: string): string =>
	command !== undefined
		? `\`${tool.bin}\` not found on PATH. Install with \`${command}\` and retry.`
		: `\`${tool.bin}\` not found on PATH. Install ${tool.bin} and retry.`;

export const realContainerInspectDeps: IContainerInspectDeps = {
	async probeBinary(name) {
		const tool = TOOL_BY_NAME[name];
		if (tool === undefined) {
			return {
				present: false,
				hint: `Unknown binary: ${name}`,
			};
		}
		const result = await probeTool(tool, realProbeDeps());
		if (!result.available) {
			return {
				present: false,
				hint: formatInstallHint(tool, result.installHint?.command),
			};
		}
		return { present: true };
	},
	async exec(cmd) {
		const [bin, ...args] = cmd;
		if (bin === undefined || bin.length === 0) {
			throw new Error('container inspect exec requires a binary name');
		}
		try {
			const outcome = await execFileAsync(bin, [...args], {
				encoding: 'utf8',
				maxBuffer: 4 * 1024 * 1024,
			});
			return {
				stdout: outcome.stdout,
				stderr: outcome.stderr,
			};
		} catch (error) {
			const failure = error as {
				stdout?: string | Buffer;
				stderr?: string | Buffer;
				message: string;
			};
			const stdout =
				typeof failure.stdout === 'string'
					? failure.stdout
					: Buffer.isBuffer(failure.stdout)
						? failure.stdout.toString('utf8')
						: '';
			const stderr =
				typeof failure.stderr === 'string'
					? failure.stderr
					: Buffer.isBuffer(failure.stderr)
						? failure.stderr.toString('utf8')
						: '';
			throw new Error(stderr.trim() || stdout.trim() || failure.message);
		}
	},
};

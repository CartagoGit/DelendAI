#!/usr/bin/env bun
/**
 * Keep checked-in MCP clients on one of the two canonical launches:
 *
 *   1. the published-package launch `delendai init` emits for external
 *      consumers (`bunx --package @delendai/cli delendai __serve …`), or
 *   2. the repo-local dogfood launch that runs the host from source
 *      (`bun tools/scripts/host/host-server.script.ts --workspace=…`) while
 *      `@delendai/cli` is not published to npm
 *      (see commit "fix(launch): workspace mcp.json launches the local
 *      host source, not the unpublished npm package").
 *
 * Anything else is drift and fails the gate.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildCanonicalLaunch } from '../../../packages/cli/src/lib/server-args.service';

interface ISelfHostFinding {
	readonly file: string;
	readonly detail: string;
}

interface IServerEntry {
	readonly type?: unknown;
	readonly command?: unknown;
	readonly args?: unknown;
}

interface IClientConfig {
	readonly mcpServers?: Readonly<Record<string, IServerEntry>>;
	readonly servers?: Readonly<Record<string, IServerEntry>>;
}

interface ILaunchShape {
	readonly command: string;
	readonly args: readonly string[];
}

const HOST_SCRIPT_REL = 'tools/scripts/host/host-server.script.ts';

const CONFIGS = [
	{ file: '.mcp.json', collection: 'mcpServers', workspace: '.' },
	{
		file: '.vscode/mcp.json',
		collection: 'servers',
		workspace: '${workspaceFolder}',
	},
] as const;

const localDogfoodLaunch = (workspace: string): ILaunchShape => ({
	command: 'bun',
	args: [HOST_SCRIPT_REL, `--workspace=${workspace}`],
});

const localDogfoodWatchLaunch = (workspace: string): ILaunchShape => ({
	command: 'bun',
	args: ['--watch', HOST_SCRIPT_REL, `--workspace=${workspace}`],
});

const sameArgs = (actual: unknown, expected: readonly string[]): boolean =>
	Array.isArray(actual) &&
	actual.every((value) => typeof value === 'string') &&
	JSON.stringify(actual) === JSON.stringify(expected);

const matchesLaunch = (entry: IServerEntry, launch: ILaunchShape): boolean =>
	entry.command === launch.command && sameArgs(entry.args, launch.args);

const describeLaunch = (launch: ILaunchShape): string =>
	`${JSON.stringify(launch.command)} ${JSON.stringify(launch.args)}`;

export const detectSelfHostDogfoodDrift = async (
	root: string,
): Promise<readonly ISelfHostFinding[]> => {
	const findings: ISelfHostFinding[] = [];
	for (const target of CONFIGS) {
		let config: IClientConfig;
		try {
			config = JSON.parse(
				await readFile(join(root, target.file), 'utf8'),
			) as IClientConfig;
		} catch (error) {
			findings.push({
				file: target.file,
				detail: `cannot read valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			});
			continue;
		}

		const entries = config[target.collection];
		const entry = entries?.['delendai'];
		if (entry === undefined) {
			findings.push({
				file: target.file,
				detail: `missing ${target.collection}.delendai`,
			});
			continue;
		}
		if (entry.type !== 'stdio') {
			findings.push({
				file: target.file,
				detail: 'delendai entry must use type "stdio"',
			});
		}
		const accepted: readonly ILaunchShape[] = [
			buildCanonicalLaunch({ workspace: target.workspace }),
			localDogfoodLaunch(target.workspace),
			localDogfoodWatchLaunch(target.workspace),
		];
		if (!accepted.some((launch) => matchesLaunch(entry, launch))) {
			findings.push({
				file: target.file,
				detail: `launch drift: got ${JSON.stringify(entry.command)} ${JSON.stringify(entry.args)}; accepted: ${accepted
					.map(describeLaunch)
					.join(' OR ')}`,
			});
		}
	}
	return findings;
};

export const formatSelfHostDogfoodReport = (
	findings: readonly ISelfHostFinding[],
): string => {
	if (findings.length === 0) return 'self-host-dogfood: 0 violations.\n';
	return `self-host-dogfood: ${findings.length} violation${findings.length === 1 ? '' : 's'}.\n${findings
		.map((finding) => `  ${finding.file}: ${finding.detail}`)
		.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const findings = await detectSelfHostDogfoodDrift(process.cwd());
	process.stderr.write(formatSelfHostDogfoodReport(findings));
	return findings.length === 0 ? 0 : 1;
};

if (import.meta.main) process.exit(await main());

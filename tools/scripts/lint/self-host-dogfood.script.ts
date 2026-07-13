#!/usr/bin/env bun
/** Keep checked-in MCP clients identical to the launch emitted by `mcpv init`. */
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

const CONFIGS = [
	{ file: '.mcp.json', collection: 'mcpServers', workspace: '.' },
	{
		file: '.vscode/mcp.json',
		collection: 'servers',
		workspace: '${workspaceFolder}',
	},
] as const;

const sameArgs = (actual: unknown, expected: readonly string[]): boolean =>
	Array.isArray(actual) &&
	actual.every((value) => typeof value === 'string') &&
	JSON.stringify(actual) === JSON.stringify(expected);

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
		const entry = entries?.['mcp-vertex'];
		const expected = buildCanonicalLaunch({ workspace: target.workspace });
		if (entry === undefined) {
			findings.push({
				file: target.file,
				detail: `missing ${target.collection}.mcp-vertex`,
			});
			continue;
		}
		if (entry.type !== 'stdio') {
			findings.push({
				file: target.file,
				detail: 'mcp-vertex entry must use type "stdio"',
			});
		}
		if (entry.command !== expected.command) {
			findings.push({
				file: target.file,
				detail: `command drift: expected ${JSON.stringify(expected.command)}, got ${JSON.stringify(entry.command)}`,
			});
		}
		if (!sameArgs(entry.args, expected.args)) {
			findings.push({
				file: target.file,
				detail: `args drift: expected ${JSON.stringify(expected.args)}, got ${JSON.stringify(entry.args)}`,
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

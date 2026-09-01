#!/usr/bin/env bun
/**
 * a00072 S3.b — `quality:gate` runner.
 *
 * Runs every configured quality scope (the same map the `run_quality`
 * tool surfaces) and exits non-zero if any scope reports a failure
 * (a scope is "failed" when at least one command in it exits non-zero,
 * is blocked by the command policy, or times out). Designed to be
 * appended to the `validate` script so a red tree cannot pass the
 * gate.
 *
 * The script is a thin CLI shim around the plugin's exported
 * `resolveScopes` + `runScope` + `createCommandRunner` helpers, so
 * the rule of "the plugin owns the logic, the runner is a CLI"
 * holds. No re-implementation.
 *
 * Configuration is read from `mcp-vertex.config.json` under
 * `quality.scopes` (a `Record<string, readonly string[]>` — each
 * scope name maps to the list of shell commands to run). When the
 * config is missing or malformed, the gate fails closed because
 * there is nothing to scan.
 *
 * Exit codes:
 *   0 — every scope is clean (every command exited 0).
 *   1 — at least one scope reported a failed command.
 *   2 — the scope resolver failed (no scopes configured, reader
 *       missing, etc.). The gate cannot make a decision, so it
 *       fails closed.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	createCommandRunner,
	resolveScopes,
	runScope,
} from '@mcp-vertex/quality/public';

const out = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

interface IFlatFileReader {
	readFile: (relativePath: string) => Promise<string | undefined>;
	exists: (relativePath: string) => Promise<boolean>;
	listDir: (relativePath: string) => Promise<readonly string[]>;
}

// x00186 (F27 sibling): `--workspace <abs>` (space or `=` form) takes
// precedence, then MCP_VERTEX_WORKSPACE, else cwd with a warning — the
// same fallback order host-server.script.ts uses for the same flag.
const resolveWorkspace = (argv: readonly string[]): string => {
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined) continue;
		if (token.startsWith('--workspace='))
			return token.slice('--workspace='.length);
		if (token === '--workspace') {
			const next = argv[i + 1];
			if (next !== undefined) return next;
		}
	}
	const fromEnv = process.env.MCP_VERTEX_WORKSPACE;
	if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
	err('[mcp-vertex] warning: using cwd as workspace');
	return process.cwd();
};

const flatReader = (cwd: string): IFlatFileReader => ({
	readFile: async (relativePath) => {
		try {
			return await readFile(join(cwd, relativePath), 'utf8');
		} catch {
			return undefined;
		}
	},
	exists: async (relativePath) => {
		try {
			await readFile(join(cwd, relativePath), 'utf8');
			return true;
		} catch {
			return false;
		}
	},
	listDir: async (_relativePath) => {
		// The quality gate does not need a directory listing — every
		// scope is read from the config. Returning an empty array
		// keeps the IFileReader shape satisfied without paying for a
		// directory walk.
		return [];
	},
});

const loadQualityScopes = async (
	cwd: string,
): Promise<Record<string, readonly string[]>> => {
	const configPath = join(cwd, 'mcp-vertex.config.json');
	try {
		const raw = await readFile(configPath, 'utf8');
		const parsed = JSON.parse(raw) as {
			plugins?: {
				quality?: {
					options?: { scopes?: Record<string, readonly string[]> };
				};
			};
		};
		return parsed.plugins?.quality?.options?.scopes ?? {};
	} catch {
		return {};
	}
};

const main = async (): Promise<number> => {
	const cwd = resolveWorkspace(process.argv.slice(2));
	const reader = flatReader(cwd);
	const configuredScopes = await loadQualityScopes(cwd);
	const scopeResult = await resolveScopes(reader, {
		scopes: configuredScopes,
	});
	const names = Object.keys(scopeResult);
	if (names.length === 0) {
		err('quality:gate: no quality scopes configured — failing closed.');
		return 2;
	}

	const runner = createCommandRunner();
	const failingScopes: string[] = [];
	let totalCommands = 0;

	for (const name of names) {
		// A name that resolves to no commands is a config bug, not an empty
		// scope: silently running zero commands would report the gate as
		// passing without having checked anything.
		const commands = scopeResult[name];
		if (commands === undefined) {
			err(`quality:gate: scope=${name} has no commands configured`);
			return 2;
		}
		const result = await runScope(name, commands, cwd, runner);
		totalCommands += result.results.length;
		if (result.ok) {
			out(
				`quality:gate: scope=${name} ok (${result.results.length} cmd)`,
			);
			continue;
		}
		const failed = result.results.filter((cmd) => !cmd.ok);
		const failingSummary = failed
			.map((cmd) => `${cmd.command} (code=${cmd.code})`)
			.join(', ');
		failingScopes.push(`${name} (${failingSummary})`);
		err(`quality:gate: scope=${name} FAILED — ${failingSummary}`);
		// Print what the child actually said. The runner already captures a
		// tail; swallowing it turns every failure here into an exit code with
		// no evidence, which is exactly the shape of gate nobody can act on.
		for (const cmd of failed) {
			const tail = cmd.tail?.trim();
			err(`quality:gate: --- output of \`${cmd.command}\` ---`);
			err(
				tail === undefined || tail.length === 0
					? '(the command produced no output — it most likely never started)'
					: tail,
			);
		}
	}

	out(
		`quality:gate: ${names.length} scope(s) / ${totalCommands} command(s) scanned; ${failingScopes.length} failing`,
	);

	if (failingScopes.length > 0) {
		err(
			`quality:gate: FAILED — failing scopes: ${failingScopes.join(' | ')}`,
		);
		return 1;
	}
	out('quality:gate: passed (every scope OK).');
	return 0;
};

process.exit(await main());

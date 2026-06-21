#!/usr/bin/env bun
/**
 * This repo's own MCP host entrypoint (M44). Until now `.mcp.json` ran the
 * generic CLI directly (`cli.ts --preset=swarm`), which only assembles
 * plugins — a host that wants its own tool (not a generic plugin everyone
 * else installs) has no way to add one. This script reuses every bit of the
 * CLI's assembly (`parseCliArgs` + `assembleCliConfig`, same `--preset=swarm`
 * this repo always used) and layers one host-only `extraTools` entry on top:
 * `rename_audit`, which used to be a manual `grep` repeated every session.
 *
 * Equivalent to `cli.ts`'s own `runCli`, minus the `init`/`--check`/`--doctor`
 * branches a long-running server process never needs.
 */
import {
	assembleCliConfig,
	createMcpProject,
	gracefulShutdown,
	parseCliArgs,
} from '@mcp-vertex/core/public';

import { buildRenameAuditToolRegistration } from './host/rename-audit-tool';

const run = async (): Promise<void> => {
	const cwd = process.cwd();
	// `--preset=swarm` is this repo's default; any flag the caller passes
	// (e.g. VS Code's `--workspace=${workspaceFolder}`) is forwarded after it.
	const args = parseCliArgs(
		['--preset=swarm', ...process.argv.slice(2)],
		cwd,
	);
	const { config, loadResult } = await assembleCliConfig(args);
	for (const error of loadResult.errors) {
		process.stderr.write(`[mcp-vertex] plugin error: ${error.message}\n`);
	}

	const namespacePrefix = config.namespacePrefix ?? 'mcp-vertex';
	const extended = {
		...config,
		extraTools: [
			...(config.extraTools ?? []),
			buildRenameAuditToolRegistration({
				namespacePrefix,
				workspace: config.workspace,
			}),
		],
	};

	const assembled = await createMcpProject(extended);
	await assembled.start();

	// Install signal handlers so the Bun host exits cleanly when VS Code /
	// Copilot closes the parent shell. Without this, every abrupt close
	// leaves a Bun zombie holding the workspace's agents.lock.json,
	// which makes the next session's first tool call slow enough to
	// trip the client MCP timeout. See docs/proposals/done/fixes/x123.
	const onSignal = (code: number): void => {
		void gracefulShutdown(assembled.server, { exitCode: code });
	};
	process.on('SIGTERM', () => onSignal(143));
	process.on('SIGINT', () => onSignal(130));
	process.on('SIGHUP', () => onSignal(129));
	process.on('beforeExit', () => {
		// beforeExit fires when the event loop drains naturally;
		// gracefulShutdown's idempotent guard makes the no-op safe
		// when we got here via SIGTERM first.
		void assembled.server.close().catch(() => undefined);
	});
};

void run();

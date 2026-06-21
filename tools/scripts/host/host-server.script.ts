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

import { buildRenameAuditToolRegistration } from './rename-audit-tool';

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

	// Install signal handlers BEFORE `await assembled.start()`. The
	// `start()` call can take several seconds on a cold start (loading
	// the swarm preset of 9 plugins), and any SIGINT/SIGTERM that
	// arrives during that window must be handled gracefully — not
	// terminate the process with the signal still set. The handler
	// closure captures `assembled`, which is assigned synchronously
	// before `start()` resolves, so the reference is always live by
	// the time a signal can arrive. See docs/proposals/done/fixes/x00006.
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

	await assembled.start();
};

void run();

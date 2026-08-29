#!/usr/bin/env bun
/**
 * This repo's own MCP host entrypoint (M44). It reuses the CLI's assembly
 * path (`parseCliArgs` + `assembleCliConfig`) and defaults to
 * `--preset=swarm` when the caller did not explicitly choose a plugin surface.
 * Equivalent to `cli.ts`'s own `runCli`, minus the `init`/`--check`/`--doctor`
 * branches a long-running server process never needs.
 */
import {
	assembleCliConfig,
	createMcpProject,
	gracefulShutdown,
	hasExplicitPluginSurfaceSelection,
	parseCliArgs,
} from '@mcp-vertex/core/public';
import {
	renderStartupReportAnsi,
	renderStartupReportPlain,
	shouldUseAnsiColors,
} from '@mcp-vertex/core/public';

// x00186 (F27): `--workspace <abs>` (space or `=` form) already threads
// through parseCliArgs's own `tokens.workspace ?? cwd` resolution
// regardless of this function — but there was no MCP_VERTEX_WORKSPACE
// env-var fallback, and no signal when the caller silently got cwd.
// Resolving it explicitly here adds both.
export const resolveWorkspaceFlag = (
	argv: readonly string[],
): string | undefined => {
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
	return undefined;
};

export const hasHelpFlag = (argv: readonly string[]): boolean =>
	argv.includes('--help') || argv.includes('-h');

const run = async (): Promise<void> => {
	const forwarded = process.argv.slice(2);
	if (hasHelpFlag(forwarded)) {
		process.stdout.write(
			[
				'mcp-vertex MCP host',
				'',
				'Usage: bun tools/scripts/host/host-server.script.ts [options]',
				'',
				'  --workspace <path>   Workspace root',
				'  --preset <name>      Plugin preset',
				'  --plugins <a,b>      Plugins to load',
				'  --surface <mode>     MCP surface mode',
				'  --help, -h           Show this help',
			].join('\n') + '\n',
		);
		return;
	}
	const explicitWorkspace =
		resolveWorkspaceFlag(forwarded) ?? process.env.MCP_VERTEX_WORKSPACE;
	const cwd =
		explicitWorkspace !== undefined && explicitWorkspace !== ''
			? explicitWorkspace
			: process.cwd();
	if (explicitWorkspace === undefined || explicitWorkspace === '') {
		process.stderr.write('[mcp-vertex] warning: using cwd as workspace\n');
	}
	const parsedForwarded = parseCliArgs(forwarded, cwd);
	// Repo default: when the caller did not explicitly choose a plugin surface,
	// fall back to `--preset=swarm`. If the caller *did* pass --preset/--plugins,
	// trust that explicit selection and do not hide it behind an implicit preset.
	const effectiveArgv = hasExplicitPluginSurfaceSelection(parsedForwarded)
		? forwarded
		: ['--preset=swarm', ...forwarded];
	// `assembleCliConfig` then adds plugin entries from
	// `mcp-vertex.config.json` and applies exclude-plugins to the final set.
	const args = parseCliArgs(effectiveArgv, cwd);
	const { config, loadResult, startupReportColor, buildStartupReport } =
		await assembleCliConfig(args);
	for (const error of loadResult.errors) {
		process.stderr.write(`[mcp-vertex] plugin error: ${error.message}\n`);
	}

	const assembled = await createMcpProject(config);
	const surfaceRuntime = config.toolSurfaceRuntime?.get();
	const surfaceMode = config.toolSurfacePlan?.mode ?? 'managed';
	const schemaBytesByRegistrationId =
		surfaceRuntime === undefined
			? undefined
			: {
					...surfaceRuntime.measureSchemaBytes('native'),
					...surfaceRuntime.measureSchemaBytes(surfaceMode),
				};
	const startupReport = buildStartupReport(schemaBytesByRegistrationId);
	const startupText =
		startupReportColor === 'always'
			? renderStartupReportAnsi(startupReport, {
					...process.env,
					FORCE_COLOR: '1',
				})
			: startupReportColor === 'never'
				? renderStartupReportPlain(startupReport)
				: shouldUseAnsiColors()
					? renderStartupReportAnsi(startupReport)
					: renderStartupReportPlain(startupReport);
	if (startupText.length > 0) process.stderr.write(`${startupText}\n`);

	// Install signal handlers BEFORE `await assembled.start()`. The
	// `start()` call can take several seconds on a cold start (loading
	// the swarm preset of 9 plugins), and any SIGINT/SIGTERM that
	// arrives during that window must be handled gracefully — not
	// terminate the process with the signal still set. The handler
	// closure captures `assembled`, which is assigned synchronously
	// before `start()` resolves, so the reference is always live by
	// the time a signal can arrive. See docs/mcp-vertex/proposals/done/fixes/x00006.
	const onSignal = (code: number): void => {
		void gracefulShutdown(assembled.server, { exitCode: code });
	};
	process.on('SIGTERM', () => onSignal(143));
	process.on('SIGINT', () => onSignal(130));
	process.on('SIGHUP', () => onSignal(129));
	// Deterministic e2e handshake. Tests opt in explicitly so production hosts
	// do not gain banner noise, and signals are never sent based on a timer that
	// can expire before cold plugin assembly reaches this point.
	if (process.env.MCP_VERTEX_TEST_READY === '1') {
		process.stderr.write('[mcp-vertex] signal-handlers-ready\n');
	}
	process.on('beforeExit', () => {
		// beforeExit fires when the event loop drains naturally;
		// gracefulShutdown's idempotent guard makes the no-op safe
		// when we got here via SIGTERM first.
		void assembled.server.close().catch(() => undefined);
	});

	await assembled.start();
};

// a00083 F26: a terminal `.catch` so a rejected boot surfaces as a
// structured error and exits with code 1 instead of an unhandled
// rejection that CI wrappers / host supervisors cannot parse.
const handleBootFailure = (err: unknown): void => {
	process.stderr.write(
		`[mcp-vertex] boot failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
	);
	process.exit(1);
};

// Guarded so a spec file can `import { resolveWorkspaceFlag }` from this
// module (to unit-test the argv parsing) without also booting a real server.
if (import.meta.main) {
	run().catch(handleBootFailure);
}

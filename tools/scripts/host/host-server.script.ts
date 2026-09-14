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
	createFileSystemJournal,
	DEFAULT_MIGRATIONS,
	ensureWorkspaceMigrated,
	createMcpProject,
	gracefulShutdown,
	hasExplicitPluginSurfaceSelection,
	parseCliArgs,
} from '@delendai/core/public';
import {
	renderStartupReportAnsi,
	renderStartupReportPlain,
	shouldUseAnsiColors,
} from '@delendai/core/public';
import {
	createStartupGovernanceSeam,
	createWriteGitRunner,
	renderStartupGate,
	runStartupGate,
	startCheckoutHydration,
	startupGateWarnings,
} from '@delendai/core/public';
import type { IMigrationRunResult } from '@delendai/core/public';
import {
	openStartupStatePorts,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

/**
 * Fail-closed switch for the boot-time reconciliation. Default OFF, and
 * deliberately so: a DEGRADED workspace is exactly the situation in which
 * an operator needs the server up to ask it what is wrong, and refusing
 * to start would hide the report behind the failure it describes. A
 * supervised deployment that would rather not serve at all sets this.
 */
/**
 * One stderr line per thing that happened at boot — a migration that ran
 * or failed, a configuration change that was applied or refused — so an
 * operator learns why their workspace changed under them.
 */
export const describeMigrationRun = (
	result: IMigrationRunResult,
): readonly string[] => {
	const lines: string[] = [];
	for (const outcome of result.outcomes) {
		if (outcome.status === 'migrated')
			lines.push(`migrated: ${outcome.id}`);
		if (outcome.status === 'failed')
			lines.push(`migration failed: ${outcome.id} — ${outcome.reason}`);
	}
	const transitions = result.transitions;
	if (transitions?.skipped !== undefined)
		lines.push(`config: ${transitions.skipped}`);
	for (const outcome of transitions?.outcomes ?? []) {
		if (outcome.status === 'failed') {
			lines.push(
				`config change failed: ${outcome.id} — ${outcome.reason}`,
			);
			continue;
		}
		for (const step of outcome.steps)
			lines.push(`config: ${step.kind} ${step.detail}`);
	}
	return lines;
};

export const STARTUP_STRICT_ENV = 'DELENDAI_STARTUP_STRICT';

/**
 * How often the server re-checks whether the forge has moved past this
 * clone. `0` turns it off.
 *
 * WHY a running server has to look at all: the boot-time reconciler
 * already advances a shared checkout the forge left behind, but a boot
 * happens once and pull requests land all afternoon. Measured on this
 * repository: the checkout was brought level and was four merges behind
 * again within the hour, with nothing local in a position to notice —
 * git has no hook for "a remote moved", and the forge cannot push into a
 * laptop. The only long-lived local process is this one.
 */
export const HYDRATION_INTERVAL_ENV = 'DELENDAI_HYDRATION_INTERVAL_MS';

/** The interval, or 0 when the operator turned it off. */
export const hydrationIntervalMs = (
	env: Readonly<Record<string, string | undefined>>,
): number | undefined => {
	const raw = env[HYDRATION_INTERVAL_ENV];
	if (raw === undefined || raw.trim().length === 0) return undefined;
	const parsed = Number(raw);
	// An unreadable value falls back to the default rather than to
	// silence: "off" is a decision somebody makes on purpose, never a
	// typo's side effect. `undefined` means "core's cadence"; only an
	// explicit 0 turns the refresh off.
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return Math.trunc(parsed);
};

export const isStartupStrict = (
	env: NodeJS.ProcessEnv = process.env,
): boolean => env[STARTUP_STRICT_ENV] === '1';

// x00186 (F27): `--workspace <abs>` (space or `=` form) already threads
// through parseCliArgs's own `tokens.workspace ?? cwd` resolution
// regardless of this function — but there was no DELENDAI_WORKSPACE
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
			`${[
				'delendai MCP host',
				'',
				'Usage: bun tools/scripts/host/host-server.script.ts [options]',
				'',
				'  --workspace <path>   Workspace root',
				'  --preset <name>      Plugin preset',
				'  --plugins <a,b>      Plugins to load',
				'  --surface <mode>     MCP surface mode',
				'  --help, -h           Show this help',
			].join('\n')}\n`,
		);
		return;
	}
	const explicitWorkspace =
		resolveWorkspaceFlag(forwarded) ?? process.env.DELENDAI_WORKSPACE;
	const cwd =
		explicitWorkspace !== undefined && explicitWorkspace !== ''
			? explicitWorkspace
			: process.cwd();
	if (explicitWorkspace === undefined || explicitWorkspace === '') {
		process.stderr.write('[delendai] warning: using cwd as workspace\n');
	}
	// Heal the workspace BEFORE anything reads it. The CLI entrypoint has
	// always done this; the MCP host never did, so a project opened from
	// an editor kept its legacy identity and, now, would never follow an
	// edit to `delendai.config.json`. Quiet when there is nothing to do.
	await ensureWorkspaceMigrated({
		migrations: DEFAULT_MIGRATIONS,
		journal: createFileSystemJournal(),
		workspaceRoot: cwd,
		report: (result) => {
			for (const line of describeMigrationRun(result))
				process.stderr.write(`[delendai] ${line}\n`);
		},
	});
	const parsedForwarded = parseCliArgs(forwarded, cwd);
	// Repo default: when the caller did not explicitly choose a plugin surface,
	// fall back to `--preset=swarm`. If the caller *did* pass --preset/--plugins,
	// trust that explicit selection and do not hide it behind an implicit preset.
	const effectiveArgv = hasExplicitPluginSurfaceSelection(parsedForwarded)
		? forwarded
		: ['--preset=swarm', ...forwarded];
	// `assembleCliConfig` then adds plugin entries from
	// `delendai.config.json` and applies exclude-plugins to the final set.
	const args = parseCliArgs(effectiveArgv, cwd);
	const { config, loadResult, startupReportColor, buildStartupReport } =
		await assembleCliConfig(args);
	for (const error of loadResult.errors) {
		process.stderr.write(`[delendai] plugin error: ${error.message}\n`);
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
	// NO reconciliation -> NO READY. The gate consults the resolved
	// development policy first (a `shared-direct` project reconciles
	// nothing and boots exactly as before), and its verdict is folded
	// into the operator report BEFORE the server is started, so a
	// DEGRADED workspace can never be announced as operational.
	//
	// `developmentPolicy` is optional on the host-config contract (a
	// hand-built config may omit it), so its absence is reported as an
	// unreconciled boot rather than defaulted to a model nobody chose.
	const policy = config.developmentPolicy;
	const gate =
		policy === undefined
			? undefined
			: await runStartupGate({
					policy,
					workspaceRoot: config.workspace.root,
					agentId:
						process.env.DELENDAI_AGENT_ID ??
						`host@${config.metadata.name}`,
					lockPath: config.workspace.resolve(
						`${config.corePaths?.cacheDir ?? '.cache/delendai'}/startup/reconcile.lock`,
					),
					databasePath: resolveProposalsDbPaths(config.workspace.root)
						.databasePath,
					git: createWriteGitRunner(config.workspace.root),
					// The concrete storage engine. Core declares the
					// ports and may not import `bun:sqlite`, so the
					// binding is injected here by the one process that
					// legitimately knows which database this host uses.
					// Without it the reconciler learns nothing about the
					// state and reports `unverifiable` — honest, but
					// never READY.
					openStatePorts: openStartupStatePorts,
					// Read-only, mutations disabled: a boot INSPECTS the
					// forge's live governance and never repairs it. The
					// credential is never read by delendai — `gh` picks
					// it up from the ambient environment itself — and a
					// forge it cannot reach yields "not read", from
					// which nothing is inferred.
					governance: createStartupGovernanceSeam({
						cwd: config.workspace.root,
					}),
				});
	const startupReport = buildStartupReport(
		schemaBytesByRegistrationId,
		gate === undefined
			? [
					{
						severity: 'error' as const,
						code: 'startup-reconciliation',
						message:
							'NOT EXECUTED — this host config carries no resolved development policy, so the boot could not decide whether reconciliation was required.',
					},
				]
			: startupGateWarnings(gate),
	);
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
	// Printed separately from the report's warning list as well: a
	// blocked workspace has to be legible at a glance, not one line
	// among many.
	if (gate !== undefined) {
		process.stderr.write(
			`${renderStartupGate(gate)
				.map((line) => `[delendai] ${line}`)
				.join('\n')}\n`,
		);
	}
	if (
		gate?.kind === 'reconciled' &&
		gate.report.status === 'DEGRADED' &&
		isStartupStrict()
	) {
		process.stderr.write(
			`[delendai] ${STARTUP_STRICT_ENV}=1 and the workspace is DEGRADED; refusing to start.\n`,
		);
		process.exit(1);
	}

	// Keep looking, for as long as this process is up. The boot-time
	// gate above brought the checkout level exactly once; this is what
	// keeps it level while pull requests land. It may only fast-forward
	// a clean tree that is merely behind — the rules live in the
	// checkout phase, and the watch borrows them rather than restating
	// them — and every pass that moves the tree says so on stderr,
	// because silently changing what somebody is looking at is its own
	// kind of surprise.
	const hydrationInterval = hydrationIntervalMs(process.env);
	const hydration =
		policy === undefined || hydrationInterval === 0
			? undefined
			: startCheckoutHydration({
					run: createWriteGitRunner(config.workspace.root),
					policy,
					...(hydrationInterval === undefined
						? {}
						: { intervalMs: hydrationInterval }),
					onHydrated: (message) => {
						process.stderr.write(`[delendai] ${message}\n`);
					},
				});

	// Install signal handlers BEFORE `await assembled.start()`. The
	// `start()` call can take several seconds on a cold start (loading
	// the swarm preset of 9 plugins), and any SIGINT/SIGTERM that
	// arrives during that window must be handled gracefully — not
	// terminate the process with the signal still set. The handler
	// closure captures `assembled`, which is assigned synchronously
	// before `start()` resolves, so the reference is always live by
	// the time a signal can arrive. See docs/delendai/proposals/done/fixes/x00006.
	const onSignal = (code: number): void => {
		hydration?.stop();
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

	// Deterministic e2e handshake — emitted AFTER `start()` resolves so the
	// test never races a child whose event loop has already drained. An empty
	// workspace + 0 plugins can make `start()` return synchronously, in which
	// case the child would exit cleanly with code 0 before the parent has a
	// chance to send SIGTERM. Production hosts never see this marker; only
	// opt-in tests do.
	if (process.env.DELENDAI_TEST_READY === '1') {
		process.stderr.write('[delendai] signal-handlers-ready\n');
		// Keep the event loop alive until a signal arrives. Without this,
		// `start()` can return synchronously when the workspace has 0 plugins,
		// the loop drains, and the host exits cleanly with code 0 before the
		// parent sends SIGTERM/SIGINT. The 1ms interval is unref'd after the
		// handshake so a signal can still tear it down promptly.
		await new Promise<void>((resolve) => {
			const keepAlive = setInterval(() => undefined, 1_000);
			const onExit = (): void => {
				clearInterval(keepAlive);
				resolve();
			};
			process.once('SIGTERM', onExit);
			process.once('SIGINT', onExit);
			process.once('SIGHUP', onExit);
		});
	}
};

// a00083 F26: a terminal `.catch` so a rejected boot surfaces as a
// structured error and exits with code 1 instead of an unhandled
// rejection that CI wrappers / host supervisors cannot parse.
const handleBootFailure = (err: unknown): void => {
	process.stderr.write(
		`[delendai] boot failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
	);
	process.exit(1);
};

// Guarded so a spec file can `import { resolveWorkspaceFlag }` from this
// module (to unit-test the argv parsing) without also booting a real server.
if (import.meta.main) {
	run().catch(handleBootFailure);
}

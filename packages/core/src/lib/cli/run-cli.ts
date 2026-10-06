/**
 * run-cli.ts — the `delendai` bin's process entry, the `--check`/
 * `--doctor` report, the `--verbose` diagnostics and the first-start
 * blueprint hook (r00009: extracted verbatim from `assemble.ts`, which
 * now owns ONLY the config-assembly concern).
 */
import { join } from 'node:path';

import {
	analyzeProject,
	buildServerBlueprint,
	createWorkspaceFileReader,
} from '../bootstrap/index';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { IDelendaiHostConfig } from '../contracts/interfaces/host-config.interface';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import { parseCliArgs } from '../plugins/parse-cli-args';
import type { IDelendaiCliArgs } from '../plugins/parse-cli-args';
import { createMcpProject } from '../project/create-mcp-project';
import { gracefulShutdown } from './graceful-shutdown';
import {
	createFileSystemBlueprintWriter,
	type IBlueprintWriter,
} from '../shared/blueprint-writer';
import { trimTrailingChar } from '../shared/string-normalize';
import { assembleCliConfig, type IAssembleCliDeps } from './assemble';
import {
	renderStartupReportAnsi,
	renderStartupReportPlain,
	shouldUseAnsiColors,
} from '../startup-report/renderer';

export interface IDoctorReport {
	readonly ok: boolean;
	readonly configPath: string;
	readonly config: {
		readonly present: boolean;
		readonly issues: readonly string[];
	};
	readonly paths: { readonly cacheDir: string; readonly docsDir: string };
	readonly plugins: {
		readonly requested: readonly string[];
		readonly loaded: readonly string[];
		readonly errors: readonly string[];
	};
	readonly counts: {
		readonly tools: number;
		readonly prompts: number;
		readonly resources: number;
	};
	/** True if the real MCP server assembled without registration errors. */
	readonly assembles: boolean;
	readonly assemblyError?: string;
}

/**
 * `--check` diagnostics: validate the config file, resolve and load
 * every requested plugin, and report what the server WOULD expose —
 * without starting the stdio transport. The fast way to debug a setup
 * in any environment before wiring it into a client.
 */
export const runDoctor = async (
	args: IDelendaiCliArgs,
	deps: IAssembleCliDeps = {},
): Promise<IDoctorReport> => {
	// Single source of truth: assembleCliConfig already read + diagnosed the
	// config file from one read; reuse that instead of reading it again.
	const { config, loadResult, configDiagnostic, configPath } =
		await assembleCliConfig(args, deps);
	const configDiag = configDiagnostic;

	// Assemble the REAL server (no stdio) to catch registration errors
	// (e.g. duplicate tool ids) that a config-only check would miss.
	let assembles = true;
	let assemblyError: string | undefined;
	try {
		await createMcpProject(config);
	} catch (error) {
		assembles = false;
		assemblyError = error instanceof Error ? error.message : String(error);
	}

	return {
		ok:
			configDiag.issues.length === 0 &&
			loadResult.errors.length === 0 &&
			assembles,
		configPath,
		config: configDiag,
		paths: config.corePaths ?? {
			cacheDir: args.cacheDir,
			docsDir: args.docsDir,
		},
		plugins: {
			requested: args.plugins,
			loaded: loadResult.loaded.map((entry) => entry.plugin.name),
			errors: loadResult.errors.map((error) => error.message),
		},
		counts: {
			tools: config.extraTools?.length ?? 0,
			prompts: config.extraPrompts?.length ?? 0,
			resources: config.extraResources?.length ?? 0,
		},
		assembles,
		...(assemblyError !== undefined ? { assemblyError } : {}),
	};
};

/**
 * First-start hook: analyze the project and persist an EXHAUSTIVE
 * blueprint for a project-specific MCP server to the cache, so an agent
 * can review and materialise it. Idempotent (writes once) and never
 * writes into the repo itself. Skipped by `--mcp-project-create=false`.
 * If a server already exists, the blueprint's notes explain how to
 * integrate it with delendai organically.
 *
 * r00003 S1 (F-002, S + D): the existence check + mkdir + writeFile
 * triple was a race condition with two concurrent first-starts able to
 * both pass the check and clobber each other's bytes. The body now
 * delegates to `IBlueprintWriter.writeOnce`, which serializes the
 * existence check + write under a `withFileMutex` keyed by the
 * absolute path, and uses `writeFileAtomic` so readers never observe
 * a half-written file.
 */
export const prepareServerBlueprintOnStart = async (
	args: IDelendaiCliArgs,
	// The already-resolved cacheDir (CLI flag → config file → default). Passing
	// it avoids drift: the blueprint must land under the SAME cacheDir as the
	// rest of the store, including when it comes from delendai.config.json.
	resolvedCacheDir?: string,
	// Dependency-injection seam for tests and alternative storage
	// (e.g. an in-memory writer). Defaults to the filesystem-backed
	// implementation keyed by the workspace root.
	writer: IBlueprintWriter = createFileSystemBlueprintWriter(),
): Promise<{ written: boolean; path: string }> => {
	const cacheDir =
		resolvedCacheDir ?? args.tokens.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir;
	const relPath = `${trimTrailingChar(cacheDir, '/')}/bootstrap/blueprint.json`;

	// Idempotency is the writer's responsibility (SRP): `writeOnce`
	// repeats the existence/corruption check inside its mutex, so a
	// pre-check here would only duplicate that policy and re-introduce
	// the TOCTOU window this slice removed.
	const reader = createWorkspaceFileReader({
		root: args.workspace,
		resolve: (rel) => join(args.workspace, rel),
	});
	const analysis = await analyzeProject(reader);
	const blueprint = buildServerBlueprint(analysis, {
		tests: args.mcpProjectTests,
	});
	return writer.writeOnce(args.workspace, relPath, {
		generatedAt: new Date().toISOString(),
		blueprint,
	});
};

// ---------------------------------------------------------------------------
// `--verbose` observability
// ---------------------------------------------------------------------------

export interface IAssemblyDiagnostics {
	readonly workspace: string;
	readonly cacheDir: string;
	readonly docsDir: string;
	readonly plugins: {
		readonly requested: readonly string[];
		readonly loaded: ReadonlyArray<{
			readonly name: string;
			readonly version?: string;
		}>;
		readonly errors: readonly string[];
	};
	readonly counts: {
		readonly tools: number;
		readonly prompts: number;
		readonly resources: number;
	};
	readonly registrationOrder: readonly string[];
}

/** Pure: assemble a diagnostics snapshot of what the server will expose. */
export const buildAssemblyDiagnostics = (
	args: IDelendaiCliArgs,
	loadResult: IPluginLoadResult,
	config: IDelendaiHostConfig,
	registrationOrder: readonly string[],
): IAssemblyDiagnostics => ({
	workspace: args.workspace,
	cacheDir: args.cacheDir,
	docsDir: args.docsDir,
	plugins: {
		requested: args.plugins,
		loaded: loadResult.loaded.map((e) => ({
			name: e.plugin.name,
			...(e.plugin.version !== undefined
				? { version: e.plugin.version }
				: {}),
		})),
		errors: loadResult.errors.map((e) => e.message),
	},
	counts: {
		tools: config.extraTools?.length ?? 0,
		prompts: config.extraPrompts?.length ?? 0,
		resources: config.extraResources?.length ?? 0,
	},
	registrationOrder,
});

/** Pure: render diagnostics as stderr lines (stdout is the MCP transport). */
export const formatVerbose = (d: IAssemblyDiagnostics): string => {
	const loaded = d.plugins.loaded
		.map((p) => (p.version ? `${p.name}@${p.version}` : p.name))
		.join(', ');
	return `${[
		`[delendai] verbose: workspace=${d.workspace} cacheDir=${d.cacheDir} docsDir=${d.docsDir}`,
		`[delendai] verbose: plugins requested=[${d.plugins.requested.join(', ')}] loaded=[${loaded}] errors=${d.plugins.errors.length}`,
		`[delendai] verbose: counts tools=${d.counts.tools} prompts=${d.counts.prompts} resources=${d.counts.resources}`,
		`[delendai] verbose: registrationOrder=[${d.registrationOrder.join(', ')}]`,
	].join('\n')}\n`;
};

/** Entry point for the `delendai` bin. */
export const runCli = async (
	argv: readonly string[],
	cwd: string,
): Promise<void> => {
	// `init`: merge the delendai server into the detected IDE configs and exit.
	if (argv[0] === 'init') {
		const { runInit } = await import('./run-init');
		await runInit(argv.slice(1), cwd);
		return;
	}

	const args = parseCliArgs(argv, cwd);

	// `--check`/`--doctor`: print a diagnostic report and exit (no stdio).
	if (args.tokens.check !== undefined || args.tokens.doctor !== undefined) {
		const report = await runDoctor(args);
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		if (!report.ok) process.exitCode = 1;
		return;
	}

	const {
		config,
		loadResult,
		configDiagnostic,
		startupReportColor,
		buildStartupReport,
		evidenceStore,
	} = await assembleCliConfig(args);
	for (const error of loadResult.errors) {
		// stderr only: stdout is the MCP stdio transport.
		process.stderr.write(`[delendai] plugin error: ${error.message}\n`);
	}
	// S1: config issues (schema violations, dead docsDir/roots) are
	// warnings, not boot failures — but they must be visible in the host's
	// server log, not only behind an explicit `--check`.
	for (const issue of configDiagnostic.issues) {
		process.stderr.write(`[delendai] config warning: ${issue}\n`);
	}
	const assembled = await createMcpProject(config);
	const surfaceRuntime = config.toolSurfaceRuntime?.get();
	const surfaceMode = config.toolSurfacePlan?.mode ?? 'managed';
	const schemaBytesByRegistrationId =
		surfaceRuntime === undefined
			? undefined
			: {
					// The native map supplies the full comparable baseline; the
					// effective map adds router/bootstrap entries that native may
					// intentionally hide.
					...surfaceRuntime.measureSchemaBytes('native'),
					...surfaceRuntime.measureSchemaBytes(surfaceMode),
				};
	const startupReport = buildStartupReport(schemaBytesByRegistrationId);
	await evidenceStore.write('startup-report', startupReport, {
		recordedAt: new Date(startupReport.generatedAtIso),
	});
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
	// `--verbose`: dump an assembly diagnostic to stderr before going live.
	if (args.tokens.verbose !== undefined) {
		process.stderr.write(
			formatVerbose(
				buildAssemblyDiagnostics(
					args,
					loadResult,
					config,
					assembled.registrationOrder,
				),
			),
		);
	}
	await assembled.start();

	// AUD-E02 / r00039: own the teardown the same way the eager path always
	// promised but never wired up. `assembled.dispose()` is idempotent and
	// disposes every plugin runtime (lazy or eager, whichever ran) in
	// reverse activation order BEFORE the transport itself closes, so a
	// plugin's `dispose()` still has a live server to report through if it
	// needs to. `gracefulShutdown` owns the process exit; deliberately not a
	// `try/finally` around `start()` — `start()` resolves once the stdio
	// transport connects, not when the server eventually closes, so
	// disposing there would tear plugins down immediately after boot.
	const onShutdownSignal =
		(exitCode: number): (() => void) =>
		(): void => {
			void assembled
				.dispose()
				.catch((error: unknown) => {
					process.stderr.write(
						`[delendai] dispose() failed during shutdown: ${error instanceof Error ? error.message : String(error)}\n`,
					);
				})
				.finally(() => {
					void gracefulShutdown(assembled.server, { exitCode });
				});
		};
	process.on('SIGTERM', onShutdownSignal(143));
	process.on('SIGINT', onShutdownSignal(130));

	// Fast boot: the one-time server blueprint is prepared AFTER the server
	// is live and off the critical path — analysing the repo + writing the
	// cache file must never delay the first MCP response. Best-effort.
	if (args.mcpProjectCreate) {
		void prepareServerBlueprintOnStart(args, config.corePaths?.cacheDir)
			.then((result) => {
				if (result.written) {
					process.stderr.write(
						`[delendai] wrote a project MCP server blueprint to ${result.path}; review it or call delendai_plan_mcp_project.\n`,
					);
				}
			})
			.catch(() => undefined);
	}
};

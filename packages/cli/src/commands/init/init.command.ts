/**
 * f00084 S2 — `init` command entrypoint.
 *
 * Registers as a top-level CLI command (`delendai init`). The `run` step:
 *   1. Collects answers (S1 schema, S2 prompts).
 *   2. Renders the bundle (S2 render).
 *   3. Writes the bundle via the safe-writer primitives (S2 writers).
 *   4. Prints the summary as plain text (or JSON when --json).
 *
 * S5 (migration offer) and S6 (e2e) live in their own modules and are
 * scheduled in a follow-up slice; this command provides the hook for them.
 *
 * The shared render+write runner (`runInitWithAnswers`) is also
 * consumed by `init:default` (f00103) — that command skips the
 * interactive prompts and pre-bakes the operator's chosen defaults.
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import type { IInitFlags } from '../../contracts/interfaces/init.interface';
import type { ICanonicalLaunch } from '../../contracts/interfaces/canonical-launch.interface';
import type { IFinding } from '@delendai/core/public';
import {
	HostEntryNotFoundError,
	resolveHostEntryPath,
} from '../../lib/init/host-entry-resolver.service';
import {
	nodeDynamicImport,
	parseConfigFile,
	parseJsonc,
	resolvePluginSpecifier,
} from '@delendai/core/public';
import {
	buildSchemaFromRequirements,
	checkSchema,
	extractRequirements,
	parseEnv,
} from '@delendai/env/public';
import { InitAnswers } from '../../lib/init/init-answers.schema';
import type { IInitAnswers } from '../../lib/init/init-answers.types';
import { detectTargetProject } from '../../lib/init/init-detection.service';
import { printInitHumanSummary } from '../../lib/init/init-human-summary.service';
import { collectInitAnswers } from '../../lib/init/init-prompts.service';
import {
	renderInitBundle,
	resolvePluginSet,
} from '../../lib/init/init-render.service';
import { buildCanonicalLaunch } from '../../lib/server-args.service';
import { readConfigText } from '../../lib/config-file.service';
import { buildCoreSkillProjection } from '../../lib/init/core-skill-projection.service';
import {
	writeCoreSkillProjection,
	writeGenericMcpJson,
	writeDelendaiConfig,
	writeVscodeMcpJson,
	writeWorkspaceText,
} from '../../lib/init/init-writers.factory';

// f00037/f00093: canonical home is contracts/interfaces/init.interface.ts.
// Re-exported here for the init-default spec that imports the flag type.
export type { IInitFlags } from '../../contracts/interfaces/init.interface';

import { dirname, join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const HIGH_ENV_SEVERITIES = new Set(['critical', 'high']);

const resolveHostRootFromEntry = (entryPath: string): string | undefined => {
	let current = dirname(entryPath);
	for (let depth = 0; depth < 6; depth += 1) {
		if (
			existsSync(join(current, 'package.json')) &&
			(existsSync(join(current, 'plugins')) ||
				existsSync(join(current, 'packages')))
		) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return undefined;
};

const candidatePluginSourceSpecifiers = (
	pluginName: string,
	hostEntryPath?: string,
): readonly string[] => {
	if (hostEntryPath === undefined) return [];
	const hostRoot = resolveHostRootFromEntry(hostEntryPath);
	if (hostRoot === undefined) return [];
	return [
		resolve(hostRoot, 'plugins', pluginName, 'src', 'index.ts'),
		resolve(hostRoot, 'packages', pluginName, 'src', 'index.ts'),
	].filter((path) => existsSync(path));
};

const readEnvWarningFindings = async (
	workspaceRoot: string,
	resolvedPlugins: readonly string[],
	hostEntryPath?: string,
): Promise<readonly IFinding[]> => {
	if (!resolvedPlugins.includes('env')) return [];
	const requirements = [] as ReturnType<
		typeof extractRequirements
	> extends readonly (infer T)[]
		? T[]
		: never[];
	for (const pluginName of resolvedPlugins) {
		if (pluginName === 'env') continue;
		for (const specifier of [
			...resolvePluginSpecifier(pluginName),
			...candidatePluginSourceSpecifiers(pluginName, hostEntryPath),
		]) {
			try {
				const mod = await nodeDynamicImport(specifier);
				if (
					mod === null ||
					typeof mod !== 'object' ||
					!('default' in mod)
				) {
					continue;
				}
				const plugin = (mod as { default: { optionsSchema?: unknown } })
					.default;
				if (plugin.optionsSchema === undefined) break;
				requirements.push(
					...extractRequirements(
						pluginName,
						plugin.optionsSchema as never,
					),
				);
				break;
			} catch {}
		}
	}
	if (requirements.length === 0) return [];
	const schema = buildSchemaFromRequirements(requirements);
	let content = '';
	try {
		content = await readFile(join(workspaceRoot, '.env'), 'utf8');
	} catch {
		content = '';
	}
	const findings: readonly IFinding[] = checkSchema(
		parseEnv(content),
		schema,
	);
	return findings.filter((finding) =>
		HIGH_ENV_SEVERITIES.has(finding.severity),
	);
};

const printEnvWarningBlock = (findings: readonly IFinding[]): void => {
	if (findings.length === 0) return;
	process.stderr.write('delendai › env warning\n');
	process.stderr.write(
		'high/critical env findings detected before bootstrap:\n',
	);
	for (const finding of findings) {
		process.stderr.write(`- ${finding.message}\n`);
	}
	process.stderr.write('\n');
};

const applyExtraOptions = (
	config: Record<string, unknown>,
	extraOptions: Record<string, Record<string, unknown>>,
): Record<string, unknown> => {
	const plugins = config.plugins;
	if (
		plugins === undefined ||
		typeof plugins !== 'object' ||
		plugins === null
	) {
		return config;
	}
	for (const [pluginId, overrides] of Object.entries(extraOptions)) {
		const pluginConfig = (plugins as Record<string, unknown>)[pluginId];
		if (
			pluginConfig === undefined ||
			typeof pluginConfig !== 'object' ||
			pluginConfig === null
		) {
			process.stderr.write(
				`warning: init override ignored for unresolved plugin "${pluginId}"\n`,
			);
			continue;
		}
		// since the config now lists every plugin the catalog
		// knows about, being present in the file no longer means the
		// preset resolved it. An override aimed at a plugin the preset
		// left off is still ignored — and still says so, because
		// silently writing options onto a disabled plugin looks like it
		// worked.
		if ((pluginConfig as { enabled?: unknown }).enabled === false) {
			process.stderr.write(
				`warning: init override ignored for unresolved plugin "${pluginId}"\n`,
			);
			continue;
		}
		const typedPluginConfig = pluginConfig as {
			options?: Record<string, unknown>;
		};
		typedPluginConfig.options ??= {};
		for (const [key, value] of Object.entries(overrides)) {
			typedPluginConfig.options[key] = value;
		}
	}
	return config;
};

export const parseFlags = (args: readonly string[]): IInitFlags => {
	const out: {
		dryRun: boolean;
		force: boolean;
		delendaiRoot?: string;
		pluginPathsRoot?: string;
	} = { dryRun: false, force: false };
	for (const arg of args) {
		if (arg === '--dry-run') out.dryRun = true;
		else if (arg === '--force') out.force = true;
		else if (arg.startsWith('--delendai-root='))
			out.delendaiRoot = arg.slice('--delendai-root='.length);
		else if (arg.startsWith('--plugin-paths-root='))
			out.pluginPathsRoot = arg.slice('--plugin-paths-root='.length);
	}
	return out;
};

/**
 * Run detection against the target workspace and decorate a partial
 * answers object with the result. Pure-ish — only does IO through
 * `detectTargetProject`, whose own surface already swallows analyzer
 * failures. Used by both `init` (interactive) and `init:default`
 * (non-interactive) so detection runs exactly once per invocation.
 */
export const detectAndDecorateAnswers = async (
	workspaceRoot: string,
	flags: IInitFlags,
	partial: Partial<IInitAnswers>,
): Promise<IInitAnswers> => {
	let detected: IInitAnswers['detected'];
	try {
		const d = await detectTargetProject(
			workspaceRoot,
			flags.pluginPathsRoot !== undefined
				? { explicitPluginPathsRoot: flags.pluginPathsRoot }
				: {},
		);
		detected = {
			language: d.language,
			framework: d.framework,
			packageManager: d.packageManager,
			monorepoTool: d.monorepoTool,
			hasMcpProject: d.hasMcpProject,
			mcpEvidence: [...d.mcpEvidence],
			pluginPathsRoot: d.pluginPathsRoot,
			sourceRoot: d.sourceRoot,
			hostEntryPath: d.hostEntryPath,
			hostEntrySource: d.hostEntrySource,
		};
	} catch {
		detected = undefined;
	}
	return InitAnswers.parse({
		workspaceRoot,
		...(detected !== undefined ? { detected } : {}),
		...partial,
		// A command-line replacement request is always intentional. The
		// non-interactive defaults stay merge-safe, but `--force` remains the
		// explicit escape hatch for a full replacement.
		force: flags.force || partial.force === true,
	});
};

/**
 * Shared runner consumed by both `init` (interactive) and `init:default`
 * (non-interactive). Takes pre-built answers (already merged with
 * detection by `detectAndDecorateAnswers`) and runs:
 *   1. Host-entry path resolution (S2, f00088).
 *   2. Bundle render (S2-S5).
 *   3. Dry-run / write dispatch (writers.ts).
 *
 * The function NEVER prompts — pure rendering + writing pipeline. The
 * `ctx.globals.extraOptions` overrides (`--options-<plugin>-<k>=<v>`)
 * are applied to the rendered config block before writing.
 */
export const runInitWithAnswers = async (
	ctx: ICliCommandContext,
	flags: IInitFlags,
	answers: IInitAnswers,
): Promise<ICliCommandResult> => {
	// resolve the host entry path before rendering. When
	// `--delendai-root` is set, it wins; otherwise we probe the
	// consumer's workspace in priority order (node_modules, dist,
	// sibling delendai/, sibling delendai-core/). A typed error
	// surfaces the hint when nothing matches.
	let launch: ICanonicalLaunch = buildCanonicalLaunch({
		workspace: '${workspaceFolder}',
	});
	if (flags.delendaiRoot !== undefined) {
		try {
			const resolved = resolveHostEntryPath(ctx.cwd, {
				explicitRoot: flags.delendaiRoot,
			});
			launch = {
				command: 'bun',
				args: [
					resolved.path,
					'--workspace=${workspaceFolder}',
					'--config=${workspaceFolder}/delendai.config.json',
				],
			};
		} catch (error) {
			if (error instanceof HostEntryNotFoundError) {
				return {
					code: EXIT_CODE.NOT_FOUND,
					data: {
						ok: false,
						error: { reason: error.message, nextAction: 'retry' },
						attempted: error.attempted,
					},
				};
			}
			throw error;
		}
	}
	const resolvedPlugins = resolvePluginSet(answers);
	const envWarningFindings = await readEnvWarningFindings(
		answers.workspaceRoot,
		resolvedPlugins,
		flags.delendaiRoot,
	);
	if (!ctx.globals.json) {
		printEnvWarningBlock(envWarningFindings);
	}
	const bundle = await renderInitBundle(answers, { launch });
	const currentConfig = parseConfigFile(
		await readConfigText(answers.workspaceRoot),
	);
	const skillProjection = answers.copyCoreSkills
		? await buildCoreSkillProjection(
				currentConfig.docsDir ?? 'docs/delendai',
			)
		: [];

	if (flags.dryRun) {
		if (!ctx.globals.json) {
			printInitHumanSummary({
				answers,
				written: [...bundle.files, ...skillProjection].map((f) => ({
					path: join(answers.workspaceRoot, f.relPath),
					kind: 'written' as const,
				})),
				dryRun: true,
			});
		}
		return {
			code: EXIT_CODE.OK,
			data: {
				ok: true,
				dryRun: true,
				files: [...bundle.files, ...skillProjection],
				summary: bundle.summary,
			},
			// printInitHumanSummary above already covers the
			// non-`--json` case; don't ALSO dump this as JSON.
			suppressDefaultPrint: !ctx.globals.json,
		};
	}

	// Narrow union for the `written` accumulator: `kind` is the
	// string-literal union across every writer (writeDelendaiConfig
	// → 'written' | 'exists'; writeVscodeMcpJson → also 'merged' and
	// 'skipped'; writeWorkspaceText → also 'skipped'), and
	// `preserved` is only populated on the merge branch. Casting
	// each push site to `string` (the previous type) forced us to
	// re-narrow later in the recap map; declaring the union here
	// once lets every push be checked without a cast.
	const written: Array<{
		path: string;
		kind: 'written' | 'exists' | 'merged' | 'skipped';
		preserved?: readonly string[];
	}> = [];
	let configReadyForSkillProjection = true;
	for (const file of bundle.files) {
		if (file.relPath === 'delendai.config.json') {
			// the rendered bundle is JSONC — one comment above
			// every plugin entry — so it is read with the JSONC parser
			// and handed to the writer as TEXT, not re-stringified. An
			// `--option` override still applies to the value; when one
			// is present the comments cannot be carried through the
			// object round trip, and that is stated rather than hidden.
			const parsed = parseJsonc(file.content).value as Record<
				string,
				unknown
			>;
			const hasOverrides = ctx.globals.extraOptions !== undefined;
			const withOverrides = hasOverrides
				? applyExtraOptions(parsed, ctx.globals.extraOptions ?? [])
				: parsed;
			const result = await writeDelendaiConfig(
				answers.workspaceRoot,
				withOverrides,
				answers.force,
				hasOverrides ? undefined : file.content,
			);
			written.push({ path: result.path, kind: result.kind });
			configReadyForSkillProjection = result.kind !== 'exists';
			continue;
		}
		// `.vscode/mcp.json` is the only other file that needs a
		// merge-aware writer: the operator may already have other
		// MCP servers wired up (filesystem, github, docker, …) and
		// we must not silently overwrite them. `writeVscodeMcpJson`
		// reads the existing document, upserts the `delendai`
		// entry, and preserves everything else. See the writer for
		// the three-way outcome (`written` / `merged` / `exists`).
		//
		// `hostEntryPath` is the local resolved at the top of this
		// function (the result of `resolveHostEntryPath`) — using
		// the same name avoids the shadowing bug we hit when an
		// earlier revision declared a separate local with the same
		// name. We intentionally reuse the resolved launcher path
		// (which honours `--delendai-root` and the priority chain
		// in `host-entry-resolver`) rather than the detection-only
		// `answers.detected?.hostEntryPath`, which can be undefined
		// when detection fails.
		if (file.relPath === '.vscode/mcp.json') {
			const result = await writeVscodeMcpJson(
				answers.workspaceRoot,
				launch,
				answers.hostInstructions,
				answers.serverName,
			);
			// The merge writer can return a `preserved` list alongside
			// `kind: 'merged'`. We MUST carry it forward to both the
			// recap (so the operator sees "preserved 2 server(s): …")
			// and the JSON envelope (so `--json` consumers can decide
			// whether a merge was a no-op or actually rewrote the
			// file). The branch discriminates by `kind` to keep the
			// push object narrow enough that other writers (whose
			// `IHostServerEntryWriteResult` shape doesn't include `preserved`)
			// don't accidentally leak fields.
			if (result.kind === 'merged') {
				written.push({
					path: result.path,
					kind: result.kind,
					preserved: result.preserved,
				});
			} else {
				written.push({ path: result.path, kind: result.kind });
			}
			continue;
		}
		if (file.relPath === '.mcp.json') {
			const result = await writeGenericMcpJson(
				answers.workspaceRoot,
				buildCanonicalLaunch({ workspace: '.' }),
				answers.hostInstructions,
				answers.serverName,
			);
			written.push(
				result.kind === 'merged'
					? {
							path: result.path,
							kind: result.kind,
							preserved: result.preserved,
						}
					: { path: result.path, kind: result.kind },
			);
			continue;
		}
		const mode = answers.hostInstructions;
		const result = await writeWorkspaceText(
			answers.workspaceRoot,
			file.relPath,
			file.content,
			mode,
		);
		written.push({ path: result.path, kind: result.kind });
	}

	if (answers.copyCoreSkills && configReadyForSkillProjection) {
		const config = parseConfigFile(
			await readConfigText(answers.workspaceRoot),
		);
		const skillWrites = await writeCoreSkillProjection(
			answers.workspaceRoot,
			config.docsDir ?? 'docs/delendai',
			answers.force,
		);
		written.push(...skillWrites);
	}

	if (!ctx.globals.json) {
		// The `written` accumulator is already typed with the
		// recap-side union (path/kind/preserved), so the recap
		// accepts it directly without a remap.
		printInitHumanSummary({
			answers,
			written,
			dryRun: false,
		});
	}

	return {
		code: EXIT_CODE.OK,
		data: { ok: true, written, summary: bundle.summary },
		// printInitHumanSummary above already covers the
		// non-`--json` case; don't ALSO dump this as JSON.
		suppressDefaultPrint: !ctx.globals.json,
	};
};

export const initCommand: ICliCommand = {
	name: 'init',
	summary: 'Interactive workspace bootstrap for delendai.',
	usage: 'init [--dry-run] [--force] [--delendai-root=<path>] [--plugin-paths-root=<path>]',
	run: async (args, ctx): Promise<ICliCommandResult> => {
		const flags = parseFlags(args);
		// Detect first so the prompts can show the operator what was
		// found before the first question renders.
		const detectedAnswers = await detectAndDecorateAnswers(ctx.cwd, flags, {
			preset: 'swarm',
			extraPlugins: [],
			excludedPlugins: [],
			hostInstructions: 'append',
			copyCoreSkills: true,
			generateAgentMd: true,
			migrateFromLegacy: true,
		});
		// Run the interactive prompts — the operator can override any
		// default the detector populated.
		const answers = await collectInitAnswers(ctx.cwd, {
			...detectedAnswers,
			force: flags.force,
			workspaceRoot: ctx.cwd,
		});
		return runInitWithAnswers(ctx, flags, answers);
	},
};

/**
 * f00103 — `init:default` non-interactive bootstrap.
 *
 * The operator's repeat-use path: when you've already answered the
 * prompts once and you want the same defaults applied across every
 * project you own (the operator's reported workflow: "el comando que
 * realmente usaré para mis proyectos").
 *
 * Defaults — matching the answers selected at the top of f00088 S2's
 * reference prompt flow:
 *
 *   - preset:               vertex    (snapshot of mcp-vertex.config.json —
 *                                    conventions, docs, search, git,
 *                                    web-fetch, status-marker, test-convention,
 *                                    quality, issues, audit)
 *   - extraPlugins:         []        (no additions on top of the preset)
 *   - excludedPlugins:      []        (nothing filtered out)
 *   - hostInstructions:     overwrite (replace existing AGENTS.md / CLAUDE.md /
 *                                    .github/copilot-instructions.md blocks)
 *   - copyCoreSkills:       true      (publish core skills under docs/)
 *   - generateAgentMd:      true      (emit .github/agents/*.agent.md)
 *   - migrateFromLegacy:    true      (scaffold f00001 if proposals is loaded)
 *   - force:                true      (auto-yes for overwriting the config)
 *
 * No interactive prompts — safe to run from a shell script, a CI
 * bootstrap, or a fresh checkout. The host-entry path resolution still
 * goes through `host-entry-resolver` and surfaces the typed hint when
 * it fails (use `--mcp-vertex-root=<abs/path>` to override).
 *
 * Same flag surface as `init` (`--dry-run`, `--force`, `--mcp-vertex-root`,
 * `--plugin-paths-root`, `--options-<plugin>-<k>=<v>`).
 */
import type {
	ICliCommand,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import type { IInitAnswers } from './init-answers.schema';
import {
	detectAndDecorateAnswers,
	parseFlags,
	runInitWithAnswers,
} from './init.command';
import { printInitHumanSummary } from './init-human-summary';
import { COLOR_ON } from '../../lib/color';

const INIT_DEFAULT_ANSWERS: Partial<IInitAnswers> = {
	preset: 'vertex',
	extraPlugins: [],
	excludedPlugins: [],
	hostInstructions: 'overwrite',
	copyCoreSkills: true,
	generateAgentMd: true,
	migrateFromLegacy: true,
	// `force` is the only knob `init:default` overrides away from the
	// interactive command's default: the operator asked for "que todo
	// se migre con un yes", so existing `mcp-vertex.config.json` files
	// are overwritten without prompting. The CLI `--force` flag still
	// controls nothing here (it stays true regardless); passing
	// `--no-force` is intentionally not supported in this command.
	force: true,
};

export const initDefaultCommand: ICliCommand = {
	name: 'init:default',
	summary:
		'Non-interactive bootstrap with the operator defaults (vertex preset + overwrite + skills + agents + scaffold).',
	usage: 'init:default [--dry-run] [--mcp-vertex-root=<path>] [--plugin-paths-root=<path>]',
	run: async (args, ctx): Promise<ICliCommandResult> => {
		const flags = parseFlags(args);

		// Brief operator-facing banner — written to stderr so it does
		// not corrupt the JSON envelope when `--json` is the global mode.
		// (The structured, coloured recap is rendered AFTER the run
		// returns, see below; this banner is just a heartbeat.)
		process.stderr.write(
			'mcp-vertex › workspace bootstrap (defaults: vertex preset + overwrite + skills + agents + scaffold)\n',
		);

		const answers = await detectAndDecorateAnswers(
			ctx.cwd,
			flags,
			INIT_DEFAULT_ANSWERS,
		);
		const result = await runInitWithAnswers(ctx, flags, answers);

		// Render a coloured human recap on stderr — stdout keeps the
		// pipe-safe JSON envelope (`{ ok, written, summary }`) so
		// `--json` and shell pipelines still work end-to-end.
		//
		// Print it whenever `--json` is off and the run succeeded. The
		// palette inside `lib/color.ts` decides whether ANSI escapes
		// are emitted (NO_COLOR / FORCE_COLOR=0 / !isTTY → plain text);
		// we no longer gate the print itself on TTY because some
		// terminals (e.g. VS Code's integrated terminal) report
		// `process.stdout.isTTY === false` even when the operator can
		// see colours. Piped output always works because the palette
		// strips itself when stdout is not a TTY.
		if (!ctx.globals.json && result.data !== undefined) {
			const data = result.data as {
				ok?: boolean;
				written?: ReadonlyArray<{ path: string; kind: string }>;
				files?: ReadonlyArray<{ relPath: string; content: string }>;
				dryRun?: boolean;
			};
			// Suppress the recap only on the ok:false branch — the
			// command already prints a useful error via `result.error`.
			if (data.ok !== false) {
				const written = (data.written ?? data.files ?? []).map(
					(f) => {
						const path =
							'path' in f
								? f.path
								: joinPath(ctx.cwd, f.relPath);
						return {
							path,
							kind:
								'kind' in f
									? (f.kind as
											| 'written'
											| 'exists'
											| 'skipped')
									: ('written' as const),
						};
					},
				);
				printInitHumanSummary({
					answers,
					written,
					dryRun: data.dryRun ?? flags.dryRun,
					enabled: COLOR_ON,
				});
			}
		}

		return result;
	},
};

/** Tiny helper so we don't pull in `node:path` just for one join. */
const joinPath = (cwd: string, rel: string): string => {
	if (rel.startsWith('/')) return rel;
	const sep = cwd.endsWith('/') ? '' : '/';
	return `${cwd}${sep}${rel}`;
};

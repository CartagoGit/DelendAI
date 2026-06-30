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
		process.stderr.write(
			'mcp-vertex › workspace bootstrap (defaults: vertex preset + overwrite + skills + agents + scaffold)\n',
		);

		const answers = await detectAndDecorateAnswers(
			ctx.cwd,
			flags,
			INIT_DEFAULT_ANSWERS,
		);
		return runInitWithAnswers(ctx, flags, answers);
	},
};

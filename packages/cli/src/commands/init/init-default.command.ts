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
 *   - preset:               vertex    (snapshot of delendai.config.json —
 *                                    conventions, docs, search, git,
 *                                    web-fetch, status-marker, test-convention,
 *                                    quality, issues, audit)
 *   - extraPlugins:         []        (no additions on top of the preset)
 *   - excludedPlugins:      []        (nothing filtered out)
 *   - hostInstructions:     append (replace only the managed delendai block)
 *   - copyCoreSkills:       true      (publish core skills under docs/)
 *   - generateAgentMd:      true      (emit .github/agents/*.agent.md)
 *   - migrateFromLegacy:    true      (scaffold f00001 if proposals is loaded)
 *   - force:                false     (merge project preferences safely)
 *
 * No interactive prompts — safe to run from a shell script, a CI
 * bootstrap, or a fresh checkout. The host-entry path resolution still
 * goes through `host-entry-resolver` and surfaces the typed hint when
 * it fails (use `--delendai-root=<abs/path>` to override).
 *
 * Same flag surface as `init` (`--dry-run`, `--force`, `--delendai-root`,
 * `--plugin-paths-root`, `--options-<plugin>-<k>=<v>`).
 */
import type {
	ICliCommand,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type { IInitAnswers } from '../../lib/init/init-answers.types';
import {
	detectAndDecorateAnswers,
	parseFlags,
	runInitWithAnswers,
} from './init.command';
import { printInitDefaultHelp } from '../../lib/init/init-default-help.service';

const INIT_DEFAULT_ANSWERS: Partial<IInitAnswers> = {
	preset: 'vertex',
	extraPlugins: [],
	excludedPlugins: [],
	hostInstructions: 'append',
	copyCoreSkills: true,
	generateAgentMd: true,
	migrateFromLegacy: true,
	// The consumer repository owns its configuration. Defaults fill missing
	// capabilities, but never replace a committed preference; an operator who
	// truly wants replacement can still choose the explicit `--force` path.
	force: false,
};

export const initDefaultCommand: ICliCommand = {
	name: 'init:default',
	summary:
		'Non-interactive bootstrap with safe project-preserving defaults (vertex preset + managed instructions + skills + agents + scaffold).',
	usage: 'init:default [--dry-run] [--delendai-root=<path>] [--plugin-paths-root=<path>]',
	run: async (args, ctx): Promise<ICliCommandResult> => {
		// Honour `--help` / `-h` as an early-return before any IO. The
		// global dispatcher (`runHumanCli`) only handles `--help` at the
		// top level; per-command help must be intercepted here so that
		// running `delendai init:default --help` does NOT trigger a real
		// bootstrap in the operator's cwd. The help renderer respects
		// `FORCE_COLOR` / `NO_COLOR` via `colorOn()` so piped output
		// stays greppable while interactive shells get the brand
		// colours.
		if (args.includes('--help') || args.includes('-h')) {
			printInitDefaultHelp();
			return { code: EXIT_CODE.OK };
		}

		const flags = parseFlags(args);

		// Brief operator-facing banner — written to stderr so it does
		// not corrupt the JSON envelope when `--json` is the global mode.
		// (The structured, coloured recap is rendered AFTER the run
		// returns, see below; this banner is just a heartbeat.)
		process.stderr.write(
			'delendai › workspace bootstrap (defaults: vertex preset + managed instructions + skills + agents + scaffold)\n',
		);

		const answers = await detectAndDecorateAnswers(
			ctx.cwd,
			flags,
			INIT_DEFAULT_ANSWERS,
		);
		// `runInitWithAnswers` already prints the colored recap on
		// stderr (when `--json` is off). Returning its result is
		// enough — re-printing here would duplicate the recap.
		return runInitWithAnswers(ctx, flags, answers);
	},
};

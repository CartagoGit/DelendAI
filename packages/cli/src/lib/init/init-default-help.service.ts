/**
 * `init:default --help` renderer.
 *
 * Lives in its own module so the colour-aware rendering path is
 * shared with `init-human-summary.ts` (both honour `colorOn()` and
 * the `FORCE_COLOR` / `NO_COLOR` env vars). Splitting it out of
 * `init-default.command.ts` keeps the command handler focused on
 * the run-loop and lets tests cover the help layout in isolation.
 *
 * The help block is written to stderr (mirroring every other CLI
 * surface — the JSON envelope lives on stdout and the recap on
 * stderr) so `--help` is safe to use inside pipelines.
 */
import { c, colorOn, heading, paint } from '../helpers/cli-color.helper';

/**
 * Render the `--help` block honouring the shared palette.
 *
 * Format:
 *
 *   mcp-vertex › init:default
 *   ────────────────────────────────────────────────
 *     Non-interactive bootstrap with the operator defaults
 *     (vertex preset + overwrite + skills + agents + scaffold).
 *
 *   Usage:
 *     init:default [--dry-run] [--mcp-vertex-root=<path>] [...]
 *
 *   Flags:
 *     --dry-run                       preview the bundle without writing
 *     ...
 *     --help, -h                      show this help and exit
 *
 *   JSON:
 *     Pair with `--json` (global flag) for a machine-readable
 *     envelope on stdout. ...
 */
export const renderInitDefaultHelp = (): string => {
	const enabled = colorOn(process.stderr);
	const horiz = '─'.repeat(64);
	const cyan = (t: string): string => (enabled ? c.cyan(t) : t);
	const bold = (t: string): string => (enabled ? c.bold(t) : t);
	const dim = (t: string): string => (enabled ? c.dim(t) : t);

	const lines: string[] = [
		enabled
			? heading('mcp-vertex › init:default')
			: 'mcp-vertex › init:default',
		dim(horiz),
		'',
		`  Non-interactive bootstrap with the operator defaults`,
		`  (vertex preset + overwrite + skills + agents + scaffold).`,
		'',
		bold('Usage:'),
		`  ${cyan('init:default [--dry-run] [--mcp-vertex-root=<path>] [--plugin-paths-root=<path>]')}`,
		'',
		bold('Flags:'),
		`  ${bold('--dry-run')}                       preview the bundle without writing`,
		`  ${bold('--force')}                         auto-yes for existing files (default: true)`,
		`  ${bold('--mcp-vertex-root=<path>')}        path to the mcp-vertex checkout to scaffold from`,
		`  ${bold('--plugin-paths-root=<path>')}      override the detected plugin source root`,
		`  ${bold('--options-<plugin>-<k>=<v>')}      override a plugin option (repeatable)`,
		`  ${bold('--help, -h')}                      show this help and exit`,
		'',
		bold('JSON:'),
		`  Pair with ${cyan('--json')} (global flag) for a machine-readable`,
		`  envelope on stdout. The human recap (this text + the post-`,
		`  run summary) is always written to stderr.`,
		'',
	];

	// `_paint` is intentionally unused — kept exported from `color.ts`
	// for symmetry; suppress the linter.
	void paint;

	return lines.join('\n');
};

/**
 * Convenience helper: write the help block to stderr. The summary
 * helper keeps stdout free for JSON envelopes so this never
 * accidentally pipes into a downstream parser.
 */
export const printInitDefaultHelp = (): void => {
	process.stderr.write(renderInitDefaultHelp());
};

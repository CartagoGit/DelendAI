/**
 * cli-color.helper.ts — shared ANSI palette and formatters for every
 * CLI surface that prints to a terminal (f00093 `helper` role).
 *
 * Disabled when `NO_COLOR` is set, when `FORCE_COLOR=0`, when
 * `process.stdout.isTTY` is false, OR when `process.stderr.isTTY`
 * is false (the recap is printed to stderr — see
 * `init-human-summary.ts`). The helpers below are pure passthroughs
 * in those modes so logs stay greppable. See
 * https://no-color.org/ for the convention.
 *
 * `colorOn()` is **evaluated every call** (not module-load) so the
 * decision is correct even when the CLI is spawned by a long-running
 * process that captures stdout once (e.g. an MCP host or a shell
 * redirector that turns off `isTTY` at spawn time but where the
 * operator can still see the terminal). Callers that want a stable
 * decision can use the `colorOn()` snapshot at the moment they print.
 *
 * Extracted from `init-prompts.ts` so every CLI surface (init,
 * init:default, future commands) shares one palette. Same palette
 * family as the prompts so `init` (interactive) and `init:default`
 * (non-interactive) look identical to the operator.
 */
export const colorOn = (
	target: { isTTY?: boolean } = process.stderr,
): boolean => {
	if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
		return false;
	}
	if (process.env.FORCE_COLOR === '0') return false;
	// Honour explicit opt-in even when the stream is not a TTY —
	// the operator explicitly asked for colour.
	if (
		process.env.FORCE_COLOR !== undefined &&
		process.env.FORCE_COLOR !== '' &&
		process.env.FORCE_COLOR !== '0'
	) {
		return true;
	}
	return Boolean(target.isTTY);
};

/**
 * Convenience accessor: snapshot of `colorOn()` for callers that
 * want to gate rendering once at the call site. New callers should
 * prefer the dynamic `colorOn()` helper.
 *
 * Kept as an export so existing call sites and external plugins
 * keep working.
 */
export const COLOR_ON: boolean = colorOn(process.stderr);

/**
 * Build a colorizer that re-evaluates `colorOn()` on every call. This
 * way the decision honours the runtime environment at print time, not
 * at module-load time (which is the bug the operator hit when the
 * MCP host spawned the CLI with stdout piped but stderr attached).
 */
const ansi =
	(open: number, close: number) =>
	(text: string): string => {
		if (!colorOn(process.stderr)) return text;
		return `\x1b[${open}m${text}\x1b[${close}m`;
	};

export const c = {
	bold: ansi(1, 22),
	dim: ansi(2, 22),
	cyan: ansi(36, 39),
	green: ansi(32, 39),
	yellow: ansi(33, 39),
	red: ansi(31, 39),
	magenta: ansi(35, 39),
	gray: ansi(90, 39),
	blue: ansi(34, 39),
	white: ansi(37, 39),
};

/** Compose one or more colorizers left-to-right. */
export const paint =
	(...styles: ReadonlyArray<(text: string) => string>) =>
	(text: string): string =>
		styles.reduce((acc, style) => style(acc), text);

export const heading = (text: string): string => c.bold(c.cyan(text));
export const subheading = (text: string): string => c.bold(text);
export const hint = (text: string): string => c.dim(c.gray(text));
export const brand = (text: string): string => c.magenta(text);
export const success = (text: string): string => `${c.green('✓')} ${text}`;
export const failure = (text: string): string => `${c.red('✗')} ${text}`;
export const warn = (text: string): string => `${c.yellow('!')} ${text}`;
export const arrow = (text: string): string => `${c.cyan('›')} ${c.bold(text)}`;

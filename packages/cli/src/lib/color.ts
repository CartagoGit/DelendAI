/**
 * Shared ANSI palette for the CLI.
 *
 * Disabled when `NO_COLOR` is set, when `FORCE_COLOR=0`, or when
 * `process.stdout.isTTY` is false. The helpers below are pure
 * passthroughs in those modes so logs stay greppable. See
 * https://no-color.org/ for the convention.
 *
 * Extracted from `init-prompts.ts` so every CLI surface (init,
 * init:default, future commands) shares one palette. Same palette
 * family as the prompts so `init` (interactive) and `init:default`
 * (non-interactive) look identical to the operator.
 */
const COLOR_ENABLED = (): boolean => {
	if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
		return false;
	}
	if (process.env.FORCE_COLOR === '0') return false;
	return Boolean(process.stdout.isTTY);
};

export const COLOR_ON: boolean = COLOR_ENABLED();

const ansi = (open: number, close: number) =>
	COLOR_ON
		? (text: string): string => `\x1b[${open}m${text}\x1b[${close}m`
		: (text: string): string => text;

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

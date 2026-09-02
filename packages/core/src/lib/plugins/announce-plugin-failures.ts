import { announceLines } from '../shared/announce-lines';

import type {
	IPluginFailureAnnouncement,
	IPluginLoadFailure,
} from '../contracts/interfaces/plugin-failure-announcement.interface';
import type { IPluginRegisterErrorInfo } from '../contracts/interfaces/plugin-lifecycle-error.interface';

/**
 * Make a plugin that failed to load or register VISIBLE, without letting
 * it take the server down.
 *
 * The loader already degrades correctly: a plugin that cannot be
 * resolved, whose context build throws, whose options do not validate,
 * or whose `register()` throws is collected into `errors` /
 * `registerErrors` and skipped, and every other plugin still loads. What
 * was missing is the other half — nothing ever said so. The failure
 * reached the operator only as an absence: tools that should exist do
 * not, a preset is short, a downstream gate reports a number that does
 * not add up. An agent then has no way to distinguish "this capability
 * was never installed" from "this capability failed to start", so it
 * retries the same call, or worse, treats the gap as a task to fix.
 *
 * Announcing is deliberately a pure formatter plus a thin writer: the
 * failures are already collected by the loader, so this only decides
 * what an operator needs to read, and the caller decides where it goes.
 */
const describeError = (error: unknown): string => {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return String(error);
};

/**
 * Build the operator-facing announcement.
 *
 * One line per failure, plus a single closing line stating the
 * invariant — that the server is still up and everything else is
 * working. That last line matters as much as the failures: without it a
 * reader cannot tell a degraded start from a fatal one, and an agent
 * reading the transcript cannot tell whether to keep going.
 */
export const buildPluginFailureAnnouncement = (input: {
	readonly loadErrors: readonly IPluginLoadFailure[];
	readonly registerErrors: readonly IPluginRegisterErrorInfo[];
	readonly loadedCount: number;
	/**
	 * Whether this is the start-up sweep. The "nothing loaded, your
	 * workspace is not set up" diagnosis is only meaningful at boot: a
	 * lazy plugin that fails minutes later, when an agent first reaches
	 * for its tools, has no bearing on whether `bun install` was run —
	 * and telling the operator to install and rebuild at that point sends
	 * them after the wrong problem. Defaults to true, which is what every
	 * boot-time caller means.
	 */
	readonly atBoot?: boolean | undefined;
}): IPluginFailureAnnouncement => {
	const lines: string[] = [];
	for (const failure of input.loadErrors) {
		lines.push(
			`[mcp-vertex] plugin "${failure.specifier}" did NOT load: ${failure.message}`,
		);
	}
	for (const failure of input.registerErrors) {
		lines.push(
			`[mcp-vertex] plugin "${failure.pluginName}" failed during ${failure.phase}: ${describeError(failure.error)}`,
		);
	}
	if (lines.length === 0) {
		return { lines: [], failedCount: 0 };
	}
	const failedCount = lines.length;
	// Nothing loaded at all is a different situation from one degraded
	// plugin, and it needs different advice. It almost always means the
	// workspace itself is not ready — a fresh git worktree or a checkout
	// in another project, with no `node_modules` and no build output — so
	// every `@mcp-vertex/*` specifier fails to resolve at once. Telling
	// that reader "do not retry" is useless; telling them to install and
	// build is the actual fix, and saying it here is what stops an agent
	// from spelunking through a cascade of unrelated resolution errors.
	lines.push(
		input.loadedCount === 0 && input.atBoot !== false
			? `[mcp-vertex] ${failedCount} plugin(s) failed and NONE loaded. That usually means this workspace is not set up ` +
					'(a fresh worktree or another project): run `bun install` and `bun run build` here, then retry. ' +
					'The server is up but has no plugin tools.'
			: `[mcp-vertex] ${failedCount} plugin(s) are unavailable; the server started anyway with ${input.loadedCount} working plugin(s). ` +
					'Their tools are absent, not broken — do not retry them, and do not treat the gap as work to do.',
	);
	return { lines, failedCount };
};

/**
 * Write the announcement to stderr. Never throws: a failure to report a
 * failure must not become a third failure that stops the server.
 */
export const announcePluginFailures = (
	announcement: IPluginFailureAnnouncement,
	write?: (line: string) => void,
): void => {
	announceLines(announcement.lines, write);
};

/**
 * Present a load failure as a register-phase failure so the same
 * observers (`onRegisterError`, which the error-reporting plugin already
 * subscribes to) see it.
 *
 * A plugin that could not be resolved never reaches `register()`, so it
 * produced no `IPluginRegisterErrorInfo` and was invisible to every
 * observer — the failures most worth reporting were precisely the ones
 * that reported nothing. `resolvedSpecifier` carries the specifier that
 * failed, which is all the caller ever had.
 */
export const asRegisterErrorInfo = (
	failure: IPluginLoadFailure,
): IPluginRegisterErrorInfo => ({
	pluginName: failure.specifier,
	resolvedSpecifier: failure.specifier,
	phase: 'register',
	error: new Error(failure.message),
});

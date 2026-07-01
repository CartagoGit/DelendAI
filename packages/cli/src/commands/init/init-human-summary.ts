/**
 * f00103 / f00088 — coloured human-readable summary for the
 * `init` and `init:default` commands.
 *
 * The structured JSON envelope (`{ ok, written, summary }`) stays the
 * canonical machine-readable output (printed to stdout by `runHumanCli`
 * when `--json` is set). This module adds the *operator-facing*
 * rendering: a tight, colored summary written to stderr so:
 *
 *   - The JSON envelope on stdout stays byte-identical and pipe-safe.
 *   - The operator sees a one-screen recap with icons, paths and
 *     the next-action hint (e.g. "run mcpv validate", "open
 *     .vscode/mcp.json", "review f00001") without scrolling.
 *
 * Color is suppressed when:
 *   - `NO_COLOR` is set, or `FORCE_COLOR=0`, or stdout is not a TTY.
 *   - The caller passes `enabled: false` (e.g. for tests or when the
 *     output is being redirected to a file).
 *
 * Pure functions — no IO, no env reads outside the call site.
 */
import type { IInitAnswers } from './init-answers.schema';
import {
	arrow,
	brand,
	c,
	failure,
	heading,
	hint,
	paint,
	subheading,
	success,
	warn,
} from '../../lib/color';

export interface IInitWrittenFile {
	readonly path: string;
	readonly kind: 'written' | 'exists' | 'skipped';
}

export interface IInitHumanInput {
	readonly answers: IInitAnswers;
	readonly written: readonly IInitWrittenFile[];
	readonly dryRun: boolean;
	/** When true, the renderer produces a stripped (no-color) line.
	 * Defaults to the shared palette's `COLOR_ON` (TTY-aware). */
	readonly enabled?: boolean;
}

const pad = (text: string, width: number): string =>
	text.length >= width ? text : text + ' '.repeat(width - text.length);

const label = (key: string): string => paint(c.cyan, c.bold)(pad(key, 16));

const renderKeyValue = (
	key: string,
	value: string,
	enabled: boolean,
): string => {
	const k = enabled ? label(key) : pad(key, 16);
	return `${k} ${enabled ? c.white(value) : value}`;
};

const white = (text: string): string =>
	paint((t) => `\x1b[37m${t}\x1b[39m`)(text);

/**
 * Format a coloured, multi-line summary suitable for stderr. The
 * rendered block is self-contained: header, key/value table, list
 * of written files, and a final "what's next" hint list.
 */
export const renderInitHumanSummary = (input: IInitHumanInput): string => {
	const enabled = input.enabled ?? true;
	const { answers, written, dryRun } = input;

	const lines: string[] = [];
	const horiz = '─'.repeat(64);

	// Header
	lines.push(
		enabled
			? heading(
					`mcp-vertex › ${dryRun ? 'dry-run preview' : 'bootstrap complete'}`,
				)
			: `mcp-vertex › ${dryRun ? 'dry-run preview' : 'bootstrap complete'}`,
	);
	lines.push(enabled ? hint(horiz) : horiz);

	// Settings block — concise recap of what we just decided.
	lines.push(enabled ? subheading('Settings') : 'Settings');
	lines.push(renderKeyValue('preset', answers.preset, enabled));
	lines.push(
		renderKeyValue('host-instructions', answers.hostInstructions, enabled),
	);
	lines.push(
		renderKeyValue(
			'copy core skills',
			answers.copyCoreSkills ? 'yes' : 'no',
			enabled,
		),
	);
	lines.push(
		renderKeyValue(
			'generate .agent.md',
			answers.generateAgentMd ? 'yes' : 'no',
			enabled,
		),
	);
	lines.push(
		renderKeyValue(
			'migration offer',
			answers.migrateFromLegacy ? 'yes' : 'no',
			enabled,
		),
	);
	if (answers.extraPlugins.length > 0) {
		lines.push(
			renderKeyValue(
				'extra plugins',
				answers.extraPlugins.join(', '),
				enabled,
			),
		);
	}
	if (answers.excludedPlugins.length > 0) {
		lines.push(
			renderKeyValue(
				'excluded plugins',
				answers.excludedPlugins.join(', '),
				enabled,
			),
		);
	}

	// Files block — one tick per path, color-coded by kind.
	lines.push('');
	lines.push(
		enabled
			? subheading(`Files ${dryRun ? '(would write)' : 'written'}`)
			: `Files ${dryRun ? '(would write)' : 'written'}`,
	);
	if (written.length === 0) {
		lines.push(enabled ? hint('  (none)') : '  (none)');
	} else {
		for (const file of written) {
			const fileName = file.path.split('/').pop() ?? file.path;
			const dirName = file.path.includes('/')
				? file.path.slice(0, file.path.lastIndexOf('/'))
				: '';
			const stamp =
				file.kind === 'written'
					? enabled
						? success('')
						: '[ok]'
					: file.kind === 'exists'
						? enabled
							? warn('')
							: '[exists]'
						: enabled
							? hint('·')
							: '[skip]';
			const tail = enabled ? c.gray(`  ${dirName}/`) : `  ${dirName}/`;
			const main = enabled ? white(fileName) : fileName;
			lines.push(`  ${stamp} ${main}${tail}`);
		}
	}

	// Next-action block — hints that depend on what was actually written.
	lines.push('');
	lines.push(enabled ? subheading("What's next") : "What's next");
	const nextActions: string[] = [];
	if (written.some((w) => w.path.endsWith('mcp-vertex.config.json'))) {
		nextActions.push(
			`review ${brand('mcp-vertex.config.json')} (cacheDir, docsDir, plugin set)`,
		);
		nextActions.push(
			`run ${brand('bun run validate')} to gate the workspace`,
		);
	}
	if (written.some((w) => w.path.endsWith('.vscode/mcp.json'))) {
		nextActions.push(
			`reload VS Code so ${brand('.vscode/mcp.json')} is picked up`,
		);
	}
	if (
		written.some((w) =>
			w.path.includes('/docs/mcp-vertex/proposals/ready/'),
		)
	) {
		const f = written.find((w) =>
			w.path.includes('/docs/mcp-vertex/proposals/ready/'),
		);
		if (f !== undefined) {
			const id = f.path.split('/').pop()?.replace('.md', '') ?? 'f00001';
			nextActions.push(
				`open ${brand(id)} and walk the agent ownership table`,
			);
		}
	}
	if (answers.migrateFromLegacy) {
		nextActions.push(
			`if you had a foreign proposals layout, run ${brand(`bun mcpv scaffold ${answers.preset}`)} to migrate`,
		);
	}
	if (nextActions.length === 0) {
		lines.push(enabled ? hint('  nothing pending.') : '  nothing pending.');
	} else {
		nextActions.forEach((line, idx) => {
			const text = enabled
				? arrow(`${idx + 1}. ${line}`)
				: `  ${idx + 1}. ${line}`;
			lines.push(text);
		});
	}

	lines.push('');
	if (dryRun) {
		lines.push(
			enabled
				? hint('Re-run without --dry-run to apply the changes above.')
				: 'Re-run without --dry-run to apply the changes above.',
		);
	} else {
		lines.push(
			enabled
				? hint(
						'Pass --json to get the machine-readable envelope on stdout.',
					)
				: 'Pass --json to get the machine-readable envelope on stdout.',
		);
	}

	return lines.join('\n') + '\n';
};

/**
 * Convenience helper: write the human summary to stderr so stdout
 * keeps its pipe-safe JSON. No-op when `enabled` is false (callers
 * may pass `false` in tests or when piping to a file).
 */
export const printInitHumanSummary = (input: IInitHumanInput): void => {
	const block = renderInitHumanSummary(input);
	if (input.enabled === false) return;
	process.stderr.write(block);
};

/** Error summary used by `runInitWithAnswers` on the `ok: false` path. */
export const renderInitFailureSummary = (
	reason: string,
	hintText?: string,
): string => {
	const enabled = true;
	const lines: string[] = [
		enabled
			? heading('mcp-vertex › bootstrap failed')
			: 'mcp-vertex › bootstrap failed',
	];
	lines.push(failure(reason));
	if (hintText !== undefined && hintText.length > 0) {
		lines.push(hint(hintText));
	}
	return lines.join('\n') + '\n';
};

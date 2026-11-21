/**
 * init-claude-settings.ts — give a Claude Code project the pre-edit hook.
 *
 * Claude Code runs a PreToolUse hook before every edit tool call and blocks
 * the call when the hook exits with 2. `delendai guard pre-edit` refuses an
 * edit outside the worktree of the unit the agent holds, so the edit never
 * lands in the shared checkout. An extra barrier: the work commands and the
 * commit guard already refuse once it has (x01003). A PostToolUse hook on
 * Bash runs `delendai guard post-shell`, which rescues what a shell command
 * wrote there and says which unit worktree to use (x01052).
 *
 * The settings file belongs to the person. An existing one is edited in
 * place through the JSONC editor, keeping every other key and comment; a
 * hook already there is left alone, so writing it twice changes nothing.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { applyJsoncEdits, parseJsonc } from '@delendai/core/cli';

import { writeWorkspaceFileSafely } from '../config-file.service';

import {
	CANONICAL_CLI_BIN,
	CANONICAL_CLI_PACKAGE,
} from '../../contracts/constants/canonical-launch.constant';
import {
	CLAUDE_SETTINGS_RELPATH,
	POST_SHELL_MATCHER,
	PRE_EDIT_MATCHER,
} from '../../contracts/constants/pre-edit-guard.constant';
import type { IVscodeSettingsResult } from '../../contracts/interfaces/init.interface';

/** The PreToolUse entry that runs the pre-edit guard. */
export const preEditHookEntry = (): Record<string, unknown> => ({
	matcher: PRE_EDIT_MATCHER,
	hooks: [
		{
			type: 'command',
			command: `bunx --package ${CANONICAL_CLI_PACKAGE} ${CANONICAL_CLI_BIN} guard pre-edit`,
		},
	],
});

/** The PostToolUse entry that runs the post-shell guard (x01052). */
export const postShellHookEntry = (): Record<string, unknown> => ({
	matcher: POST_SHELL_MATCHER,
	hooks: [
		{
			type: 'command',
			command: `bunx --package ${CANONICAL_CLI_PACKAGE} ${CANONICAL_CLI_BIN} guard post-shell`,
		},
	],
});

/** The settings a project with no `.claude/settings.json` receives. */
export const claudeSettingsWithHook = (): Record<string, unknown> => ({
	hooks: {
		PreToolUse: [preEditHookEntry()],
		PostToolUse: [postShellHookEntry()],
	},
});

/** One hook this module owns: its event, the command it runs, its entry. */
const OWNED_HOOKS: readonly {
	readonly event: 'PreToolUse' | 'PostToolUse';
	readonly runs: string;
	readonly entry: () => Record<string, unknown>;
}[] = [
	{ event: 'PreToolUse', runs: 'guard pre-edit', entry: preEditHookEntry },
	{
		event: 'PostToolUse',
		runs: 'guard post-shell',
		entry: postShellHookEntry,
	},
];

/** True when some entry of `event` already runs `runs`. */
const hasHook = (entries: readonly unknown[], runs: string): boolean =>
	JSON.stringify(entries).includes(runs);

/** True when every hook this module owns is already in `value`. */
const hasEveryHook = (value: unknown): boolean => {
	const hooks = (value as { hooks?: Record<string, unknown> } | null)?.hooks;
	return OWNED_HOOKS.every(({ event, runs }) => {
		const entries = hooks?.[event];
		return Array.isArray(entries) && hasHook(entries, runs);
	});
};

/**
 * The settings text with the hooks added, or `undefined` when they are
 * all already there or the file is not a settings object we may change.
 */
export const mergePreEditHook = (text: string): string | undefined => {
	const { value, errors } = parseJsonc(text);
	if (errors.length > 0) return undefined;
	if (value === null || typeof value !== 'object' || Array.isArray(value))
		return undefined;
	const hooks = (value as { readonly hooks?: unknown }).hooks;
	if (hooks !== undefined && (hooks === null || typeof hooks !== 'object'))
		return undefined;
	const edits: { path: string[]; value: unknown }[] = [];
	for (const { event, runs, entry } of OWNED_HOOKS) {
		const given = (hooks as Record<string, unknown> | undefined)?.[event];
		if (given !== undefined && !Array.isArray(given)) return undefined;
		const entries = (given ?? []) as readonly unknown[];
		if (hasHook(entries, runs)) continue;
		edits.push({ path: ['hooks', event], value: [...entries, entry()] });
	}
	if (edits.length === 0) return undefined;
	let merged = text;
	for (const edit of edits) merged = applyJsoncEdits(merged, [edit]);
	return merged;
};

/** Ensure the project's Claude Code settings run the pre-edit guard. */
export const ensurePreEditHook = async (
	workspace: string,
): Promise<IVscodeSettingsResult> => {
	const path = join(workspace, CLAUDE_SETTINGS_RELPATH);
	if (!existsSync(path)) {
		const written = await writeWorkspaceFileSafely(
			workspace,
			CLAUDE_SETTINGS_RELPATH,
			`${JSON.stringify(claudeSettingsWithHook(), null, '\t')}\n`,
		);
		return { kind: 'written', path: written };
	}
	const existing = await readFile(path, 'utf8');
	const merged = mergePreEditHook(existing);
	if (merged === undefined) {
		const { value } = parseJsonc(existing);
		return { kind: hasEveryHook(value) ? 'merged' : 'exists', path };
	}
	const written = await writeWorkspaceFileSafely(
		workspace,
		CLAUDE_SETTINGS_RELPATH,
		merged,
	);
	return { kind: 'written', path: written };
};

/**
 * init-claude-settings.ts — give a Claude Code project the pre-edit hook.
 *
 * Claude Code runs a PreToolUse hook before every edit tool call and blocks
 * the call when the hook exits with 2. `delendai guard pre-edit` refuses an
 * edit outside the worktree of the unit the agent holds, so the edit never
 * lands in the shared checkout. An extra barrier: the work commands and the
 * commit guard already refuse once it has (x01003).
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

/** The settings a project with no `.claude/settings.json` receives. */
export const claudeSettingsWithHook = (): Record<string, unknown> => ({
	hooks: { PreToolUse: [preEditHookEntry()] },
});

/** True when some PreToolUse hook already runs the pre-edit guard. */
const hasPreEditHook = (entries: readonly unknown[]): boolean =>
	JSON.stringify(entries).includes('guard pre-edit');

/**
 * The settings text with the hook added, or `undefined` when it is
 * already there or the file is not a settings object we may change.
 */
export const mergePreEditHook = (text: string): string | undefined => {
	const { value, errors } = parseJsonc(text);
	if (errors.length > 0) return undefined;
	if (value === null || typeof value !== 'object' || Array.isArray(value))
		return undefined;
	const hooks = (value as { readonly hooks?: unknown }).hooks;
	if (hooks !== undefined && (hooks === null || typeof hooks !== 'object'))
		return undefined;
	const pre = (hooks as { readonly PreToolUse?: unknown } | undefined)
		?.PreToolUse;
	if (pre !== undefined && !Array.isArray(pre)) return undefined;
	const entries = (pre ?? []) as readonly unknown[];
	if (hasPreEditHook(entries)) return undefined;
	return applyJsoncEdits(text, [
		{
			path: ['hooks', 'PreToolUse'],
			value: [...entries, preEditHookEntry()],
		},
	]);
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
		const pre = (value as { hooks?: { PreToolUse?: unknown } } | null)
			?.hooks?.PreToolUse;
		return {
			kind:
				Array.isArray(pre) && hasPreEditHook(pre) ? 'merged' : 'exists',
			path,
		};
	}
	const written = await writeWorkspaceFileSafely(
		workspace,
		CLAUDE_SETTINGS_RELPATH,
		merged,
	);
	return { kind: 'written', path: written };
};

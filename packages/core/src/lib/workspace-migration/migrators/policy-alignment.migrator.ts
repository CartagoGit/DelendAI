/**
 * policy-alignment.migrator.ts — a configuration an older delendai wrote
 * follows the policy the project works under now.
 *
 * A project that adopted delendai long ago carries settings delendai
 * itself once wrote, such as automatic pushes of the checked-out branch.
 * Under a profile that never pushes the integration branch from the
 * shared checkout, every one of those pushes is refused, and the start
 * warned about it every time, telling the person to edit the file
 * delendai had written. The same check that warns now removes exactly
 * those settings, once, journalled and reported, with JSONC edits that
 * keep the file's comments and formatting. Anything else it would only
 * report stays a warning.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import { policyAlignmentAdvisories } from '../../development-policy/policy-alignment-advisories';
import { readWorkspacePolicy } from '../../work-units/development-policy.service';
import { DEVELOPMENT_POLICY_CONFIG_FILE } from './development-policy.constant';
import {
	CONTRADICTED_PUSH_KEYS,
	POLICY_ALIGNMENT_MIGRATOR_ID,
} from './policy-alignment.constant';

const PUSH_PATH = ['plugins', 'commit-policy', 'options', 'push'] as const;

const bag = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

/** The push keys to remove, or none when the policy does not contradict them. */
const contradictedPushKeys = async (
	workspaceRoot: string,
): Promise<
	{ readonly text: string; readonly keys: readonly string[] } | undefined
> => {
	let text: string;
	try {
		text = await readFile(
			join(workspaceRoot, DEVELOPMENT_POLICY_CONFIG_FILE),
			'utf8',
		);
	} catch {
		return undefined;
	}
	const config = bag(parseJsonc(text));
	const options = bag(bag(bag(config?.plugins)?.['commit-policy'])?.options);
	const push = bag(options?.push);
	if (push === undefined) return undefined;
	const policy = await readWorkspacePolicy(workspaceRoot).catch(
		() => undefined,
	);
	if (policy === undefined) return undefined;
	const contradicted = policyAlignmentAdvisories(
		policy,
		options,
		bag(bag(bag(config?.plugins)?.git)?.options),
	).some(
		(violation) => violation.rule === 'push-automation-contradicts-policy',
	);
	if (!contradicted) return undefined;
	const keys = CONTRADICTED_PUSH_KEYS.filter(
		(key) => push[key] !== undefined,
	);
	return keys.length === 0 ? undefined : { text, keys };
};

export const createPolicyAlignmentMigrator = (): IMigration => ({
	id: POLICY_ALIGNMENT_MIGRATOR_ID,
	detect: async (ctx: IMigrationContext): Promise<boolean> =>
		(await contradictedPushKeys(ctx.workspaceRoot)) !== undefined,
	plan: async (
		ctx: IMigrationContext,
	): Promise<readonly IMigrationPlanStep[]> => {
		const found = await contradictedPushKeys(ctx.workspaceRoot);
		return found === undefined
			? []
			: [
					{
						kind: 'remove-contradicted-settings',
						detail: `remove ${found.keys.map((key) => `\`${PUSH_PATH.join('.')}.${key}\``).join(', ')} from ${DEVELOPMENT_POLICY_CONFIG_FILE}: the development profile never pushes the checked-out branch, so every automatic push was refused`,
					},
				];
	},
	apply: async (ctx: IMigrationContext): Promise<void> => {
		const found = await contradictedPushKeys(ctx.workspaceRoot);
		if (found === undefined) return;
		let text = found.text;
		for (const key of found.keys)
			text = applyEdits(
				text,
				modify(text, [...PUSH_PATH, key], undefined, {
					formattingOptions: { insertSpaces: false, tabSize: 1 },
				}),
			);
		await writeFile(
			join(ctx.workspaceRoot, DEVELOPMENT_POLICY_CONFIG_FILE),
			text,
			'utf8',
		);
	},
});

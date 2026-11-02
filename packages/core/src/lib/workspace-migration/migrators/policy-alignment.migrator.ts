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
import { pushTargetContradiction } from '../../development-policy/push-target-contradiction';
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
	const keys = CONTRADICTED_PUSH_KEYS.filter(
		(key) => push[key] !== undefined,
	);
	// The setting that makes the start IMPOSSIBLE, not merely unwise.
	// The automatic push settings are a warning the owner reads; this
	// one is a refusal that stops the server, and the owner learns it
	// as a dead editor integration rather than as a message. It is
	// removed here for the same reason the others are: the file was
	// written by an older delendai, and the start already says which
	// setting to remove.
	const targetContradicted =
		pushTargetContradiction(policy, options) !== undefined;
	if (targetContradicted) keys.push('branch');
	const automationContradicted = policyAlignmentAdvisories(
		policy,
		options,
		bag(bag(bag(config?.plugins)?.git)?.options),
	).some(
		(violation) => violation.rule === 'push-automation-contradicts-policy',
	);
	if (!targetContradicted && !automationContradicted) return undefined;
	return keys.length === 0 ? undefined : { text, keys };
};

/**
 * Why the keys are being removed, in the words the start would have
 * used. A migration that removes a setting reports the reason it
 * removed it, so the journal and the report say the same thing the
 * refusal said.
 */
const removalReason = (keys: readonly string[]): string =>
	keys.includes('branch')
		? 'the development profile reaches the integration branch through the forge and never by a direct push, so naming it as the push target made every start refuse'
		: 'the development profile never pushes the checked-out branch, so every automatic push was refused';

export const createPolicyAlignmentMigrator = (): IMigration => ({
	id: POLICY_ALIGNMENT_MIGRATOR_ID,
	// A STANDING CHECK, not a rename.
	//
	// What it removes is a setting that contradicts the profile the same
	// file declares — and both are editable at any moment. A person
	// changes the profile, or copies a config from another project, or
	// adds a setting back by hand, and the setting the boot refuses over
	// is there again.
	//
	// The journal would say "already done" from the first time this ran
	// and never ask again, so the auto-heal that names the remedy would
	// be dead in exactly the workspaces that need it. The failure mode
	// is a server that exits on every start with an error naming a
	// setting the tool is supposed to remove and cannot.
	//
	// The cost is one read of the config per boot, and the answer is
	// quiet: a config that agrees with its profile produces no steps and
	// changes no byte.
	convergent: true,
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
						detail: `remove ${found.keys.map((key) => `\`${PUSH_PATH.join('.')}.${key}\``).join(', ')} from ${DEVELOPMENT_POLICY_CONFIG_FILE}: ${removalReason(found.keys)}`,
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

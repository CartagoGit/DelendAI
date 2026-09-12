/**
 * development-policy.migrator.ts — give a workspace the development model
 * it never asked for, because a model nobody adopts is worth nothing.
 *
 * ## Why this runs at startup
 *
 * Every project that has to hand-author seven orthogonal axes before it
 * gets any benefit will instead get none. The runtime already knows
 * enough to propose the right block — which forge this is, whether it can
 * require a check, which branch the work is happening on — so it
 * proposes it once, writes it, and records that it did.
 *
 * ## Why it writes JSONC and never re-parses
 *
 * `delendai.config.json` is allowed to carry comments and a human's
 * formatting. A `JSON.parse` round trip would silently delete both, which
 * is the "blind text substitution over structured files" failure the
 * config migrator already refuses to commit. `modify` + `applyEdits`
 * keeps the round trip lossless.
 *
 * ## Why it never overwrites
 *
 * `detect` is false the moment a `development` block exists. Adoption
 * proposes a model for a workspace that has none; it does not revise a
 * decision somebody made. That is also why this migrator cannot be
 * "re-run to update": there is nothing here that updates.
 *
 * ## Why the evidence is gathered, not assumed
 *
 * The block chosen for a GitHub repository whose checks we can require is
 * not the block for a GitLab instance the team does not administer, and
 * guessing generously in either direction is harmful — see
 * `development-policy/adopt.ts`, which owns the choice and the reasons.
 * This module is the impure edge: it reads the workspace and writes the
 * file. It decides nothing.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';

import { proposeAdoption } from '../../development-policy/adopt';
import type { IAdoptionEvidence } from '../../development-policy/adopt';
import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';

import {
	DEVELOPMENT_POLICY_MIGRATOR_ID,
	DEVELOPMENT_POLICY_CONFIG_FILE,
} from './development-policy.constant';
import { gatherAdoptionEvidence } from './development-policy-evidence';

interface IConfigShape {
	readonly development?: unknown;
	readonly agentWorktree?: unknown;
}

const readConfig = async (
	workspaceRoot: string,
): Promise<{ readonly text: string; readonly parsed: IConfigShape } | null> => {
	try {
		const text = await readFile(
			join(workspaceRoot, DEVELOPMENT_POLICY_CONFIG_FILE),
			'utf8',
		);
		return { text, parsed: (parseJsonc(text) ?? {}) as IConfigShape };
	} catch {
		// No config file at all: this is not a delendai workspace yet, and
		// creating one here would be inventing a project rather than
		// migrating it.
		return null;
	}
};

const evidenceFor = async (
	workspaceRoot: string,
	parsed: IConfigShape,
): Promise<IAdoptionEvidence> =>
	gatherAdoptionEvidence({
		workspaceRoot,
		hasDevelopmentBlock: parsed.development !== undefined,
		...(typeof parsed.agentWorktree === 'boolean'
			? { agentWorktree: parsed.agentWorktree }
			: {}),
	});

export const createDevelopmentPolicyMigrator = (): IMigration => ({
	id: DEVELOPMENT_POLICY_MIGRATOR_ID,

	detect: async (ctx: IMigrationContext): Promise<boolean> => {
		const config = await readConfig(ctx.workspaceRoot);
		// Cheap on purpose: one read, one parse, no git and no network.
		// This runs before every server start, and after the transition
		// every project answers "no" here.
		return config !== null && config.parsed.development === undefined;
	},

	plan: async (
		ctx: IMigrationContext,
	): Promise<readonly IMigrationPlanStep[]> => {
		const config = await readConfig(ctx.workspaceRoot);
		if (config === null || config.parsed.development !== undefined) {
			return [];
		}
		const proposal = await evidenceFor(
			ctx.workspaceRoot,
			config.parsed,
		).then(proposeAdoption);
		if (proposal.block === undefined) return [];
		return [
			{
				kind: 'write-development-block',
				detail: `add \`development\` to ${DEVELOPMENT_POLICY_CONFIG_FILE}: profile "${proposal.block.profile}"`,
			},
			// Every reason is a step of its own, so `--dry-run` shows the
			// operator WHY before anything is written. A migration nobody
			// can audit is a migration they have to trust.
			...proposal.reasons.map((reason) => ({
				kind: 'because',
				detail: reason,
			})),
		];
	},

	apply: async (ctx: IMigrationContext): Promise<void> => {
		const config = await readConfig(ctx.workspaceRoot);
		if (config === null || config.parsed.development !== undefined) return;

		const proposal = await evidenceFor(
			ctx.workspaceRoot,
			config.parsed,
		).then(proposeAdoption);
		if (proposal.block === undefined) return;

		const edits = modify(config.text, ['development'], proposal.block, {
			formattingOptions: { insertSpaces: false, tabSize: 1 },
		});
		await writeFile(
			join(ctx.workspaceRoot, DEVELOPMENT_POLICY_CONFIG_FILE),
			applyEdits(config.text, edits),
			'utf8',
		);
	},
});

/**
 * development-policy.migrator.ts — write down the development model a
 * project is already working under, so it is visible and editable.
 *
 * ## Why this runs at startup
 *
 * A model nobody can see is a model nobody can change. A project that
 * declared nothing is already served a policy (see
 * `resolveEffectivePolicy`); this writes that same policy into
 * `delendai.config.json`, once, so the project has a block to edit.
 *
 * ## Why it decides nothing
 *
 * It asks `readWorkspacePolicy` — the path `delendai work`, the guard and
 * the served instructions already use — and records the answer
 * (`development-policy/adopt.ts`). It reads no forge and probes no
 * network: what it writes is exactly what was already enforced.
 *
 * ## Why it is never silent
 *
 * It edits a file the project owns. The migration is journalled, every
 * surface that describes the policy says it was adopted and written, and
 * the CLI prints what it wrote. A project that does not want the block
 * written states `"development": {}` — a declared, empty block resolves to
 * the same default and is never touched.
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
 * `detect` is false the moment a `development` block exists, and the
 * proposal is empty for a policy that is not a default (legacy fields
 * included). Adoption proposes a model for a workspace that has none; it
 * does not revise a decision somebody made.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';

import { proposeAdoption } from '../../development-policy/adopt';
import type { IAdoptionEvidence } from '../../development-policy/adopt';
import { readWorkspacePolicy } from '../../work-units/development-policy.service';
import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';

import {
	DEVELOPMENT_POLICY_MIGRATOR_ID,
	DEVELOPMENT_POLICY_CONFIG_FILE,
} from './development-policy.constant';
import type { IEvidenceInput } from './development-policy.interface';
import { deriveRequiredChecks } from './development-policy-required-checks';
import type {
	IAdoption,
	IConfigShape,
} from './development-policy-adoption.interface';

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

/** Profiles whose governance is enforced, and so cannot start without checks. */
const PULL_REQUEST_PROFILES: ReadonlySet<string> = new Set([
	'shared-checkout-pr',
	'worktree-pr',
]);

/**
 * The ONE function that proposes a `development` block, for the server's
 * startup migrator and for `delendai init` alike.
 *
 * Without `gatherEvidence` (server start) it records the policy the
 * workspace already resolves, reading nothing from the forge. `init`
 * passes the evidence reader, because declaring a model is the person's
 * own act; it prints the reasons, and what it writes is then declared.
 */
export const adoptionFor = async (
	workspaceRoot: string,
	parsed: IConfigShape,
	gatherEvidence?: (input: IEvidenceInput) => Promise<IAdoptionEvidence>,
): Promise<IAdoption> => {
	// A declared block, even an empty one, is the project's answer.
	if (parsed.development !== undefined) return { reasons: [], forge: 'none' };
	const evidence = await gatherEvidence?.({ workspaceRoot });
	const forge = evidence?.forge ?? 'none';
	const policy = await readWorkspacePolicy(workspaceRoot).catch(
		// A configuration that does not parse is not ours to edit.
		() => undefined,
	);
	if (policy === undefined) return { reasons: [], forge };
	const proposal = proposeAdoption(policy, evidence);
	const { block } = proposal;
	if (block === undefined || !PULL_REQUEST_PROFILES.has(block.profile)) {
		return { ...proposal, forge };
	}
	const derived = await deriveRequiredChecks(workspaceRoot);
	if (derived !== undefined) {
		return {
			block: {
				...block,
				integration: { requiredChecks: derived.checks },
			},
			reasons: [...proposal.reasons, `integration ${derived.reason}`],
			forge,
		};
	}
	if (block.profile === 'shared-checkout-pr') {
		return {
			block: { ...block, profile: 'shared-checkout-merge' },
			reasons: [
				...proposal.reasons,
				'fell back to `shared-checkout-merge`: the pull-request profile is enforced and needs a required check, and no single check could be read from the project workflows. Declare `development.integration.requiredChecks` to choose the pull-request model.',
			],
			forge,
		};
	}
	return {
		block,
		reasons: [
			...proposal.reasons,
			'no required check could be read from the project workflows: declare `development.integration.requiredChecks`, or startup will refuse this profile.',
		],
		forge,
	};
};

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
		const proposal = await adoptionFor(ctx.workspaceRoot, config.parsed);
		if (proposal.block === undefined) return [];
		return [
			{
				kind: 'write-development-block',
				detail: `add \`development\` to ${DEVELOPMENT_POLICY_CONFIG_FILE}: profile "${proposal.block.profile}", integration "${proposal.block.branches.integration}", release "${proposal.block.branches.release}"`,
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

		const proposal = await adoptionFor(ctx.workspaceRoot, config.parsed);
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

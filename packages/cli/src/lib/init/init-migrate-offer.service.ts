/**
 * init-migrate-offer.ts — f00084 S5 + f00089 U1.
 *
 * S5 (legacy): when the user accepts the `migrateFromLegacy` offer,
 * `init` wrote a generic `f00001-migrate-legacy-<scope>.md` regardless of
 * what the target actually contained.
 *
 * U1 turns that STUB into an adoption-PLAN generator:
 *
 *   - `detectForeignProposals` (init-foreign-detect.ts) inventories the
 *     target's own proposal/plan convention (proposals/ rfcs/ adr/ …),
 *   - `allocateNextAdoptionId` computes the next FREE id under our
 *     canonical layout instead of the hardcoded `f00001`, and
 *   - `renderAdoptionPlan` emits an ADVISORY migration proposal that maps
 *     the foreign convention onto ours. It never rewrites, deletes, or
 *     moves the target's existing proposals — the target's own agents
 *     execute the plan.
 *
 * Invariants (AGENTS.md): no `process.cwd()` here; IO is the injected
 * `IFileReader` the caller wires to the workspace; this module is pure
 * data shaping over that reader. Idempotent: re-running emits a plan with
 * the next free id, never overwriting a prior plan in place.
 */

import type { IAdoptionPlan } from '../../contracts/interfaces/init.interface';
import { basename } from 'node:path';

import { renderAdoptionSections } from './init-adoption-plan.builder';
import type { IInitAnswers } from './init-answers.types';
import type { IFileReader } from './init-detection.service';
import {
	allocateNextAdoptionId,
	describeConvention,
	detectForeignProposals,
	type IForeignProposalInventory,
} from './init-foreign-detect.service';
import { PROPOSAL_STATUS_FOLDERS } from './init-proposal-folders.constant';

const slugify = (input: string): string =>
	input
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'workspace';

export const deriveScope = (workspaceRoot: string): string =>
	slugify(basename(workspaceRoot) || 'workspace');

/**
 * a00066: the legacy `renderMigrationProposal` stub (f00084 S5) was
 * REMOVED. It was unwired — the init flow routes every migration offer
 * through {@link renderAdoptionPlan}, which handles the greenfield case
 * too (see `renderForeignSection`'s `!found` branch) — and its hardcoded
 * `f00001` template emitted markdown that FAILED the canonical
 * `lint:proposals` (no `## non-goals`/`## acceptance`, sliceless
 * Status/Files/Gate fields). Keeping a second, lint-failing migration
 * renderer around was a latent trap: a re-wire would have scaffolded a
 * proposal that breaks the adopter's very first `bun run validate`.
 * `renderAdoptionPlan` is the single source of truth.
 */

/** Result of the U1 adoption-plan generator. */

/**
 * Render the foreign-system prose of the plan body (advisory mapping).
 *
 * Folded into the `## why` section as a bolded lead-in rather than its own
 * `## foreign proposal system` H2 — that heading is not part of the
 * canonical proposal scaffold and would fail `lint:proposals`.
 */
const renderForeignSection = (inventory: IForeignProposalInventory): string => {
	if (!inventory.found) {
		return (
			`**Foreign proposal system.** No existing proposal/plan convention was\n` +
			`detected in this project. This plan adopts the canonical delendai\n` +
			`layout from scratch under \`docs/delendai/proposals/\`.\n\n`
		);
	}
	const lines = inventory.conventions
		.map((c) => `- ${describeConvention(c)}`)
		.join('\n');
	const primary = inventory.primary;
	return (
		`**Foreign proposal system.** \`init\` detected an existing proposal/plan\n` +
		`convention in this project:\n\n` +
		`${lines}\n\n` +
		`This plan is **advisory output**: it maps the foreign convention onto the\n` +
		`canonical delendai layout. \`init\` does **not** rewrite, delete, or move\n` +
		`any of the files above — the target's own agents execute the mapping.\n\n` +
		(primary
			? `Primary source to migrate: \`${primary.location}\` ` +
				`(${primary.documentCount} doc(s), id-scheme \`${primary.idScheme}\`).\n\n`
			: '')
	);
};

/**
 * Idempotency guard: find the id of an adoption plan already scaffolded
 * for `scope` in a prior `init` run, so re-running reuses that file
 * instead of allocating a fresh id on every invocation (which would let
 * `init` litter the target with `f00001`, `f00002`, … duplicates).
 *
 * Scans every canonical status folder for `<id>-adopt-delendai-<scope>.md`
 * and returns the existing id, or `undefined` when none exists yet.
 */
const findExistingAdoptionId = async (
	reader: IFileReader,
	scope: string,
): Promise<string | undefined> => {
	// f00154 S2 audit: the previous `\d+` accepted 1+ digits, so a stray
	// pre-padding file like `f1-adopt-delendai-…` was picked up even
	// though the canonical allocator emits 5-digit padded ids. Require
	// at least 5 digits so we only match canonical-shape files and a
	// re-run after a stray legacy file can't reuse it.
	const re = new RegExp(`^(f\\d{5,})-adopt-delendai-${scope}\\.md$`);
	// Scan every canonical status folder (root + 7 sub-folders) so a
	// prior plan that has already transitioned out of `ready` does not
	// cause `init` to allocate a duplicate id.
	for (const folder of PROPOSAL_STATUS_FOLDERS) {
		const dir = `docs/delendai/proposals/${folder}`;
		const entries = await reader.listDir(dir);
		for (const name of entries) {
			const m = name.match(re);
			if (m) return m[1];
		}
	}
	// Plus the root `docs/delendai/proposals/` (which holds the legacy
	// `f00001-migrate-legacy` style stubs).
	const rootEntries = await reader.listDir('docs/delendai/proposals');
	for (const name of rootEntries) {
		const m = name.match(re);
		if (m) return m[1];
	}
	return undefined;
};

/**
 * U1 — emit the adoption-plan proposal.
 *
 * `reader` is injected (DIP); the caller wires it to the workspace. The
 * plan:
 *   - detects the foreign proposal system (inventory),
 *   - reuses an existing adoption plan's id for this scope when one was
 *     already scaffolded (idempotent), otherwise allocates the next FREE
 *     id (never hardcoded `f00001` when a collision is possible),
 *   - and embeds advisory sections for the skill/tool migration that
 *     f00089 U2 fills in (placeholders kept stable for U2 to consume).
 *
 * Returns the file plus the id + inventory so callers (and U2) can read
 * the structured result without re-parsing the markdown.
 */
export const renderAdoptionPlan = async (
	answers: IInitAnswers,
	options: {
		readonly reader: IFileReader;
		/**
		 * The resolved plugin set whose tool namespaces the A4 section maps.
		 * Passed by the bundle orchestrator (which owns `resolvePluginSet`)
		 * to avoid an import cycle; defaults to an empty set so the plan
		 * still renders deterministically when a caller omits it.
		 */
		readonly ourPlugins?: readonly string[];
	},
): Promise<IAdoptionPlan> => {
	const scope = deriveScope(answers.workspaceRoot);
	const inventory = await detectForeignProposals(options.reader);
	const sections = await renderAdoptionSections(options.reader, {
		ourPlugins: options.ourPlugins ?? [],
	});
	const id =
		(await findExistingAdoptionId(options.reader, scope)) ??
		(await allocateNextAdoptionId(options.reader, inventory));
	const relPath = `docs/delendai/proposals/ready/${id}-adopt-delendai-${scope}.md`;
	const date = new Date().toISOString().slice(0, 10);
	const title = inventory.found
		? `Adopt delendai: migrate the existing ${inventory.primary?.kind ?? 'proposal'} system (${scope})`
		: `Adopt delendai workflow (${scope})`;

	const content =
		`---\n` +
		`id: ${id}\n` +
		`status: ready\n` +
		`type: proposal\n` +
		`track: adoption-migration\n` +
		`date: ${date}\n` +
		`kind: feat\n` +
		`title: ${title}\n` +
		`shipped-in: []\n` +
		`recan: []\n` +
		`related:\n` +
		`    - f00084 # init command that scaffolded this proposal\n` +
		`    - f00089 # adoption-plan umbrella\n` +
		`ownership:\n` +
		`    - { agent: technical_investigator, task: 'A1: inventory the foreign proposal/skill/tool surface (do not modify it)' }\n` +
		`    - { agent: proposal_guardian, task: 'A2: map the foreign convention onto the canonical delendai layout' }\n` +
		`globalGate: validate\n` +
		`acceptance:\n` +
		`    - { command: bun run typecheck, expect: exit0 }\n` +
		`    - { command: bun run test, expect: exit0 }\n` +
		`    - { command: bun run validate, expect: exit0 }\n` +
		`---\n\n` +
		`# ${id} — Adopt delendai (${scope})\n\n` +
		`## goal\n\n` +
		`Adopt the delendai workflow in this project: a single canonical\n` +
		`proposals layout, namespace-prefixed tools, the \`{ ok, error }\` envelope,\n` +
		`and a proposals-driven swarm. Where the project already has its own\n` +
		`proposal/plan convention, **migrate** it onto ours rather than starting\n` +
		`a parallel system.\n\n` +
		`## why\n\n` +
		`This proposal was scaffolded by \`delendai init\` (f00089 U1). The id \`${id}\`\n` +
		`was allocated as the next free id in this project's canonical proposals\n` +
		`space — it is **not** a hardcoded \`f00001\`, so it cannot collide with a\n` +
		`proposal that already exists here.\n\n` +
		renderForeignSection(inventory) +
		`## non-goals\n\n` +
		`- **No in-place conversion of foreign files.** The mapping and skill\n` +
		`  migration below are advisory: \`init\` never writes, deletes, or moves\n` +
		`  a foreign proposal, skill, or tool. The target's own agents execute\n` +
		`  the migration.\n` +
		`- **No runtime tool renaming.** The namespace-unification slice is\n` +
		`  plan output; the host enforces prefixing when the server boots.\n` +
		`- **No hardcoded ids.** Ids are allocated as the next free id in the\n` +
		`  target's canonical proposals space, never a fixed \`f00001\`.\n\n` +
		`## slices\n\n` +
		`### S1 — inventory the foreign surface (read-only)\n\n` +
		`- **Status**: pending\n` +
		`- **Files**: \`docs/delendai/proposals/ready/${id}-a1-inventory.md\`\n` +
		`- **Gate**: bun run validate\n\n` +
		`Capture every existing proposal/record, skill, and tool the project\n` +
		`declares. Save the structured output under\n` +
		`\`docs/delendai/proposals/ready/${id}-a1-inventory.md\`. Touch nothing.\n\n` +
		`### S2 — map foreign → canonical\n\n` +
		`- **Status**: pending\n` +
		`- **Files**: \`docs/delendai/proposals/\`\n` +
		`- **Gate**: bun run validate\n\n` +
		`Produce the mapping from the foreign convention to the canonical\n` +
		`delendai layout (file naming, id space, status folders). The mapping\n` +
		`is advisory; converting the foreign files is a later, explicit step the\n` +
		`target's agents perform — \`init\` never converts them in place.\n\n` +
		sections.skillSection +
		sections.toolSection +
		`### S5 — one agent source of truth\n\n` +
		`- **Status**: pending\n` +
		`- **Files**: \`AGENTS.md\`, \`docs/delendai/AGENT-BOOTSTRAP.md\`\n` +
		`- **Gate**: bun run validate\n\n` +
		`Consolidate this project's agent guidance into ONE canonical source:\n` +
		`\`docs/delendai/AGENT-BOOTSTRAP.md\` holds the rules; \`AGENTS.md\` and\n` +
		`\`CLAUDE.md\` stay thin pointers to it. Fold any pre-existing agent\n` +
		`instructions found in this repo (a \`CONTRIBUTING\` agent section, a\n` +
		`custom \`.cursorrules\`, a hand-written \`CLAUDE.md\`) into the bootstrap so\n` +
		`there is no second, drifting copy for agents to disagree over.\n\n` +
		`## acceptance\n\n` +
		`- \`bun run typecheck\` → exit 0.\n` +
		`- \`bun run test\` → exit 0.\n` +
		`- \`bun run validate\` → exit 0.\n` +
		`- The adoption plan is advisory only: no foreign proposal, skill, or\n` +
		`  tool is written, deleted, or moved by \`init\`.\n`;

	return { relPath, content, id, inventory, sections };
};

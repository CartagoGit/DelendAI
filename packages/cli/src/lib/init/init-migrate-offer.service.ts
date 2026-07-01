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

import {
	renderAdoptionSections,
} from './init-adoption-plan.builder';
import type { IInitAnswers } from './init-answers.types';
import type { IFileReader } from './init-detection.service';
import {
	allocateNextAdoptionId,
	describeConvention,
	detectForeignProposals,
	type IForeignProposalInventory,
} from './init-foreign-detect.service';

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
 * S5 legacy stub renderer — kept for the greenfield path (no foreign
 * system, no prior proposals). It hardcodes `f00001` ON PURPOSE: it is
 * only reached when nothing exists to collide with. New callers should
 * prefer `renderAdoptionPlan`, which allocates the next free id.
 */
export const renderMigrationProposal = (
	answers: IInitAnswers,
): {
	readonly relPath: string;
	readonly content: string;
} => {
	const scope = deriveScope(answers.workspaceRoot);
	const relPath = `docs/mcp-vertex/proposals/ready/f00001-migrate-legacy-${scope}.md`;
	const content =
		`---\n` +
		`id: f00001\n` +
		`status: ready\n` +
		`type: proposal\n` +
		`track: legacy-migration\n` +
		`date: ${new Date().toISOString().slice(0, 10)}\n` +
		`kind: feat\n` +
		`title: Migrate legacy mcp-server into mcp-vertex (${scope})\n` +
		`shipped-in: []\n` +
		`recan: []\n` +
		`related:\n` +
		`    - f00084 # init command that scaffolded this proposal\n` +
		`ownership:\n` +
		`    - { agent: technical_investigator, task: 'S1: capture the current state of the legacy mcp-server via analyze_project' }\n` +
		`    - { agent: proposal_guardian, task: 'S2: produce a plan_mcp_project blueprint and lock the migration kind' }\n` +
		`globalGate: validate\n` +
		`acceptance:\n` +
		`    - { command: bun run typecheck, expect: exit0 }\n` +
		`    - { command: bun run test, expect: exit0 }\n` +
		`    - { command: bun run validate, expect: exit0 }\n` +
		`---\n\n` +
		`# f00001 — Migrate legacy mcp-server (${scope})\n\n` +
		`## goal\n\n` +
		`Move the legacy mcp-server in this workspace onto the mcp-vertex model:\n` +
		`canonical launch shape, namespace-prefixed tools, \`{ ok, error: { reason, nextAction } }\`\n` +
		`envelope, plugins for every domain, and proposals-driven workflow.\n\n` +
		`## why\n\n` +
		`This proposal was scaffolded by \`mcpv init\` (f00084 S5) because the\n` +
		`bootstrap detected the \`proposals\` plugin and the user accepted the\n` +
		`migration offer. The legacy mcp-server likely lives under a custom\n` +
		`directory (e.g. \`libs/mcp-server/\`); find it during S1 and capture it\n` +
		`before touching anything.\n\n` +
		`## slices\n\n` +
		`### S1 — snapshot the legacy mcp-server\n\n` +
		`Run \`mcp-vertex_analyze_project\` and \`mcp-vertex_proposals_delegate\`\n` +
		`with \`agent=technical_investigator\` to capture every tool, transport,\n` +
		`and host binding the legacy server declares. Save the structured output\n` +
		`under \`docs/mcp-vertex/proposals/ready/f00001-s1-legacy-snapshot.md\`.\n\n` +
		`### S2 — produce the migration blueprint\n\n` +
		`Run \`mcp-vertex_plan_mcp_project { tests: true }\` and commit the\n` +
		`returned blueprint under\n` +
		`\`docs/mcp-vertex/proposals/ready/f00001-s2-migration-blueprint.md\`.\n` +
		`Decide the migration kind (host / plugin / client) before opening S3.\n\n` +
		`### S3+ — implementation slices\n\n` +
		`Use \`mcp-vertex_proposals_plan\` to validate disjointness of every\n` +
		`slice, then \`mcp-vertex_proposals_auto_work\` to execute. The swarm\n` +
		`will route files to \`implementation_runner\` and run the validation\n` +
		`gate after every slice; \`delivery_verifier\` approves or requests\n` +
		`changes independently.\n`;
	return { relPath, content };
};

/** Result of the U1 adoption-plan generator. */


/** Render the foreign-system section of the plan body (advisory mapping). */
const renderForeignSection = (inventory: IForeignProposalInventory): string => {
	if (!inventory.found) {
		return (
			`## foreign proposal system\n\n` +
			`No existing proposal/plan convention was detected in this project.\n` +
			`This plan adopts the canonical mcp-vertex layout from scratch under\n` +
			`\`docs/mcp-vertex/proposals/\`.\n\n`
		);
	}
	const lines = inventory.conventions
		.map((c) => `- ${describeConvention(c)}`)
		.join('\n');
	const primary = inventory.primary;
	return (
		`## foreign proposal system\n\n` +
		`\`init\` detected an existing proposal/plan convention in this project:\n\n` +
		`${lines}\n\n` +
		`This plan is **advisory output**: it maps the foreign convention onto the\n` +
		`canonical mcp-vertex layout. \`init\` does **not** rewrite, delete, or move\n` +
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
 * Scans every canonical status folder for `<id>-adopt-mcp-vertex-<scope>.md`
 * and returns the existing id, or `undefined` when none exists yet.
 */
const findExistingAdoptionId = async (
	reader: IFileReader,
	scope: string,
): Promise<string | undefined> => {
	const re = new RegExp(`^(f\\d+)-adopt-mcp-vertex-${scope}\\.md$`);
	for (const dir of [
		'docs/mcp-vertex/proposals/ready',
		'docs/mcp-vertex/proposals/done',
		'docs/mcp-vertex/proposals/paused',
		'docs/mcp-vertex/proposals',
	]) {
		const entries = await reader.listDir(dir);
		for (const name of entries) {
			const m = name.match(re);
			if (m) return m[1];
		}
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
	const relPath = `docs/mcp-vertex/proposals/ready/${id}-adopt-mcp-vertex-${scope}.md`;
	const date = new Date().toISOString().slice(0, 10);
	const title = inventory.found
		? `Adopt mcp-vertex: migrate the existing ${inventory.primary?.kind ?? 'proposal'} system (${scope})`
		: `Adopt mcp-vertex workflow (${scope})`;

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
		`    - { agent: proposal_guardian, task: 'A2: map the foreign convention onto the canonical mcp-vertex layout' }\n` +
		`globalGate: validate\n` +
		`acceptance:\n` +
		`    - { command: bun run typecheck, expect: exit0 }\n` +
		`    - { command: bun run test, expect: exit0 }\n` +
		`    - { command: bun run validate, expect: exit0 }\n` +
		`---\n\n` +
		`# ${id} — Adopt mcp-vertex (${scope})\n\n` +
		`## goal\n\n` +
		`Adopt the mcp-vertex workflow in this project: a single canonical\n` +
		`proposals layout, namespace-prefixed tools, the \`{ ok, error }\` envelope,\n` +
		`and a proposals-driven swarm. Where the project already has its own\n` +
		`proposal/plan convention, **migrate** it onto ours rather than starting\n` +
		`a parallel system.\n\n` +
		`## why\n\n` +
		`This proposal was scaffolded by \`mcpv init\` (f00089 U1). The id \`${id}\`\n` +
		`was allocated as the next free id in this project's canonical proposals\n` +
		`space — it is **not** a hardcoded \`f00001\`, so it cannot collide with a\n` +
		`proposal that already exists here.\n\n` +
		renderForeignSection(inventory) +
		`## slices\n\n` +
		`### A1 — inventory the foreign surface (read-only)\n\n` +
		`Capture every existing proposal/record, skill, and tool the project\n` +
		`declares. Save the structured output under\n` +
		`\`docs/mcp-vertex/proposals/ready/${id}-a1-inventory.md\`. Touch nothing.\n\n` +
		`### A2 — map foreign → canonical\n\n` +
		`Produce the mapping from the foreign convention to the canonical\n` +
		`mcp-vertex layout (file naming, id space, status folders). The mapping\n` +
		`is advisory; converting the foreign files is a later, explicit step the\n` +
		`target's agents perform — \`init\` never converts them in place.\n\n` +
		sections.skillSection +
		sections.toolSection +
		`### A5 — single source of truth (filled by f00089 U3)\n\n` +
		`<!-- f00089 U3 embeds the AGENT-BOOTSTRAP + AGENTS consolidation. -->\n` +
		`_Pending f00089 U3._\n`;

	return { relPath, content, id, inventory, sections };
};

/**
 * f00084 S5 — render the first migration proposal.
 *
 * When the user accepts the `migrateFromLegacy` offer, `init` writes
 * `docs/mcp-vertex/proposals/ready/f00001-migrate-legacy-<scope>.md`
 * with a templated frontmatter and two starter slices. The scope is
 * derived from the workspace root directory name so the file is unique
 * across workspaces without manual input.
 */
import { basename } from 'node:path';

import type { IInitAnswers } from './init-answers.schema';

const slugify = (input: string): string =>
	input
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'workspace';

export const deriveScope = (workspaceRoot: string): string =>
	slugify(basename(workspaceRoot) || 'workspace');

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

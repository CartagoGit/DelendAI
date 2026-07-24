/**
 * init-adoption-plan-lints-clean.spec.ts — a00066 (adopter onboarding).
 *
 * The single highest-impact onboarding failure: `mcpv init` scaffolds an
 * adoption/migration proposal INTO the adopter's repo, and that proposal's
 * own `acceptance` block requires `bun run validate` to pass — which runs
 * `lint:proposals` over exactly the file init just wrote. If the generated
 * markdown does not satisfy the canonical proposal linter, the adopter is
 * stuck on their very first validate: the "loops and errors" onboarding
 * must never produce.
 *
 * So we run the REAL linter (`lintProposalMarkdown`, the same function
 * `tools/scripts/lint/proposals.script.ts` walks the repo with) over the
 * actual generated output — greenfield AND foreign-migration — and assert
 * zero issues. This is an "run the artifact" test, not a shape test:
 * it fails if the scaffold and the linter ever drift apart.
 */
import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';
import { lintProposalMarkdown } from '@mcp-vertex/proposals/lib/proposals/proposal-scaffold-linter';

import { renderAdoptionPlan } from './init-migrate-offer.service';
import { InitAnswers } from './init-answers.schema';

/** In-memory reader: keys are workspace-relative file paths. */
const dirReader = (files: Readonly<Record<string, string>>): IFileReader => ({
	async readFile(rel) {
		return files[rel];
	},
	async exists(rel) {
		return rel in files;
	},
	async listDir(rel) {
		const prefix = rel === '' ? '' : `${rel}/`;
		const out: string[] = [];
		for (const key of Object.keys(files)) {
			if (!key.startsWith(prefix)) continue;
			const rest = key.slice(prefix.length);
			if (rest.length === 0) continue;
			const slash = rest.indexOf('/');
			const child = slash === -1 ? rest : rest.slice(0, slash);
			if (!out.includes(child)) out.push(child);
		}
		return out;
	},
});

const answers = (workspaceRoot: string) =>
	InitAnswers.parse({ workspaceRoot, migrateFromLegacy: true });

/** Assert the generated proposal passes the canonical linter, showing every issue on failure. */
const expectLintsClean = (path: string, markdown: string): void => {
	const result = lintProposalMarkdown({ path, markdown });
	expect(result.issues.map((i) => `${i.line}: ${i.message}`).join('\n')).toBe(
		'',
	);
	expect(result.ok).toBe(true);
};

describe('generated adoption plan lints clean against the real proposal linter', () => {
	it('greenfield (no foreign system) — the scaffolded plan passes lint:proposals', async () => {
		const plan = await renderAdoptionPlan(answers('/tmp/acme-greenfield'), {
			reader: dirReader({ 'src/index.ts': '' }),
			ourPlugins: ['proposals', 'docs', 'search'],
		});
		expectLintsClean(plan.relPath, plan.content);
	});

	it('does NOT leak mcp-vertex internal roadmap placeholders into the adopter body', () => {
		// The plan lands in the ADOPTER's repo. Its body must be
		// self-contained advisory content — never a dangling "_Pending
		// f000NN._" / "filled by f000NN" / "<!-- f000NN … -->" reference to
		// one of OUR internal proposals, which the adopter cannot resolve.
		// (Provenance links in the `related:` frontmatter are fine.)
		return renderAdoptionPlan(answers('/tmp/acme-clean'), {
			reader: dirReader({ 'src/index.ts': '' }),
			ourPlugins: ['proposals'],
		}).then((plan) => {
			const body = plan.content.split('\n---\n').slice(1).join('\n---\n');
			expect(body).not.toMatch(/_Pending\s+f\d{5}/i);
			expect(body).not.toMatch(/filled by f\d{5}/i);
			expect(body).not.toMatch(/<!--\s*f\d{5}/i);
		});
	});

	it('foreign migration (rfcs/ present) — the scaffolded plan passes lint:proposals', async () => {
		const plan = await renderAdoptionPlan(answers('/tmp/acme-rfc'), {
			reader: dirReader({
				'rfcs/RFC-0001-adopt-events.md': '# RFC 1',
				'rfcs/RFC-0002-queue.md': '# RFC 2',
				'src/index.ts': '',
			}),
			ourPlugins: ['proposals', 'docs'],
		});
		// The plan must recognise the foreign system…
		expect(plan.inventory.found).toBe(true);
		// …and still emit canonical, lint-clean markdown.
		expectLintsClean(plan.relPath, plan.content);
	});

	it('foreign migration (adr/ present) — the scaffolded plan passes lint:proposals', async () => {
		const plan = await renderAdoptionPlan(answers('/tmp/acme-adr'), {
			reader: dirReader({
				'docs/adr/0001-record-architecture.md': '# ADR 1',
				'docs/adr/0002-pick-db.md': '# ADR 2',
			}),
			ourPlugins: ['proposals'],
		});
		expect(plan.inventory.found).toBe(true);
		expectLintsClean(plan.relPath, plan.content);
	});
});

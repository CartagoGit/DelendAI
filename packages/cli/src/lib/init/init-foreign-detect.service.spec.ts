/**
 * init-foreign-detect.spec.ts — f00089 U1.
 *
 * Exercises the foreign proposal-system detector and the adoption-plan
 * id allocation against an in-memory `IFileReader` so every branch is
 * deterministic and platform-independent. Also covers `renderAdoptionPlan`
 * (init-migrate-offer) for the two properties the slice promises: the id
 * is never a hardcoded `f00001` when a collision is possible, and a second
 * render is idempotent (reuses the existing plan id, never duplicates).
 */
import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';

import {
	allocateNextAdoptionId,
	describeConvention,
	detectForeignProposals,
} from './init-foreign-detect.service';
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

describe('detectForeignProposals (f00089 U1)', () => {
	it('detects a docs/proposals convention with the mcp-vertex id scheme', async () => {
		const reader = dirReader({
			'docs/proposals/f00001-foo.md': '',
			'docs/proposals/f00007-bar.md': '',
			'docs/proposals/README.md': '',
		});
		const inv = await detectForeignProposals(reader);
		expect(inv.found).toBe(true);
		expect(inv.primary?.kind).toBe('proposals');
		expect(inv.primary?.idScheme).toBe('mcp-vertex');
		// README.md is not a record; only the two f-files count.
		expect(inv.primary?.documentCount).toBe(2);
		expect(inv.primary?.maxNumericId).toBe(7);
	});

	it('detects an rfcs convention with the rfc id scheme', async () => {
		const reader = dirReader({
			'rfcs/RFC-0001-thing.md': '',
			'rfcs/rfc-12-other.md': '',
		});
		const inv = await detectForeignProposals(reader);
		expect(inv.primary?.kind).toBe('rfcs');
		expect(inv.primary?.idScheme).toBe('rfc');
		expect(inv.primary?.maxNumericId).toBe(12);
	});

	it('detects an ADR convention and reports the adr scheme for numbered records', async () => {
		const reader = dirReader({
			'docs/adr/0001-record.md': '',
			'docs/adr/0002-another.md': '',
		});
		const inv = await detectForeignProposals(reader);
		expect(inv.primary?.kind).toBe('adr');
		expect(inv.primary?.idScheme).toBe('adr');
		expect(inv.primary?.maxNumericId).toBe(2);
	});

	it('returns found=false when no convention directory holds a record', async () => {
		const reader = dirReader({
			'src/index.ts': '',
			'specs/.gitkeep': '', // present but no markdown record
		});
		const inv = await detectForeignProposals(reader);
		expect(inv.found).toBe(false);
		expect(inv.conventions).toHaveLength(0);
		expect(inv.primary).toBeUndefined();
	});

	it('uses the first non-empty candidate as the primary convention', async () => {
		const reader = dirReader({
			'docs/proposals/f00001-a.md': '',
			'rfcs/RFC-0001-b.md': '',
		});
		const inv = await detectForeignProposals(reader);
		// docs/proposals is earlier in the candidate table than rfcs.
		expect(inv.conventions).toHaveLength(2);
		expect(inv.primary?.kind).toBe('proposals');
	});
});

describe('allocateNextAdoptionId (f00089 U1)', () => {
	it('falls back to f00001 only when nothing exists anywhere', async () => {
		const reader = dirReader({ 'src/index.ts': '' });
		const inv = await detectForeignProposals(reader);
		expect(await allocateNextAdoptionId(reader, inv)).toBe('f00001');
	});

	it('allocates the next free id past our canonical proposals (no hardcode)', async () => {
		const reader = dirReader({
			'docs/mcp-vertex/proposals/ready/f00041-x.md': '',
			'docs/mcp-vertex/proposals/done/f00040-y.md': '',
		});
		const inv = await detectForeignProposals(reader);
		expect(await allocateNextAdoptionId(reader, inv)).toBe('f00042');
	});

	it('lets a numeric foreign primary push the counter but not an rfc one', async () => {
		const numericReader = dirReader({ 'proposals/0099-x.md': '' });
		const numericInv = await detectForeignProposals(numericReader);
		expect(await allocateNextAdoptionId(numericReader, numericInv)).toBe(
			'f00100',
		);

		const rfcReader = dirReader({ 'rfcs/RFC-0099-x.md': '' });
		const rfcInv = await detectForeignProposals(rfcReader);
		// rfc numbers a different id space → must not push our counter.
		expect(await allocateNextAdoptionId(rfcReader, rfcInv)).toBe('f00001');
	});
});

describe('describeConvention (f00089 U1)', () => {
	it('renders a one-line human-readable summary', async () => {
		const reader = dirReader({ 'docs/proposals/f00003-x.md': '' });
		const inv = await detectForeignProposals(reader);
		const line = describeConvention(inv.primary!);
		expect(line).toContain('proposals');
		expect(line).toContain('docs/proposals');
		expect(line).toContain('mcp-vertex');
	});
});

describe('renderAdoptionPlan (f00089 U1)', () => {
	const answers = (workspaceRoot: string) =>
		InitAnswers.parse({ workspaceRoot, migrateFromLegacy: true });

	it('emits an advisory adoption plan with a non-hardcoded allocated id', async () => {
		const reader = dirReader({
			'docs/mcp-vertex/proposals/ready/f00050-existing.md': '',
			'docs/proposals/f00001-foreign.md': '',
		});
		const plan = await renderAdoptionPlan(answers('/tmp/acme-app'), {
			reader,
		});
		// Next free id past f00050, NOT a hardcoded f00001.
		expect(plan.id).toBe('f00051');
		expect(plan.relPath).toBe(
			'docs/mcp-vertex/proposals/ready/f00051-adopt-mcp-vertex-acme-app.md',
		);
		expect(plan.content).toContain('advisory');
		expect(plan.content).not.toMatch(/init.*(rewrite|delete|move).*in place/i);
		expect(plan.inventory.found).toBe(true);
	});

	it('is idempotent: a second render reuses the existing plan id', async () => {
		const files: Record<string, string> = {
			'docs/proposals/f00001-foreign.md': '',
		};
		const reader = dirReader(files);
		const first = await renderAdoptionPlan(answers('/tmp/acme-app'), {
			reader,
		});
		// Simulate `init` having written the plan to disk.
		files[first.relPath] = first.content;
		const second = await renderAdoptionPlan(answers('/tmp/acme-app'), {
			reader,
		});
		expect(second.id).toBe(first.id);
		expect(second.relPath).toBe(first.relPath);
	});
});

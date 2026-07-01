#!/usr/bin/env bun
/**
 * migrate-legacy-proposals.ts — f00016 S11.
 *
 * Moves every `pNNN-*.md` directly under `docs/mcp-vertex/proposals/` onto the new
 * state machine: renamed to `lNNN-<same-slug>.md` (the slug is kept
 * verbatim — an earlier draft of this script assumed a separable
 * "kind word" embedded in the slug to strip, but the 14 real filenames
 * don't follow that pattern consistently; stripping would be lossy and
 * inconsistent, so the slug is untouched), moved into the folder its
 * (mapped) status implies, and patched with the minimal frontmatter a
 * new-system file needs (`id`, `status`, `kind: legacy`, `title`).
 *
 * Body content and section structure are NOT touched here — that's
 * S12's job (best-effort heading aliasing, frontmatter has the legacy
 * tier's only hard requirement: `bun run lint:proposals` never treats
 * an `l`-prefixed file as fatal, only as a permanent warning).
 *
 * Legacy (8-status) -> new (7-status) mapping, per f00016 §2.1's own
 * folding rules:
 *   - done/retired/paused/blocked -> same name, unchanged.
 *   - deferred -> paused + `deferred: true` (exactly what §2.1/§9
 *     describe: "deferred is not a new status, it's paused + a flag").
 *   - pending -> blocked + `blocked_by: [self:needs-triage]` ("pending"
 *     meant "haven't triaged it" per §2.1 — the closest existing
 *     mechanism is the same self-block pattern used for an incomplete
 *     draft, just a different reason token).
 *   - in_progress -> in-progress (respelled, same meaning).
 *   - ready -> ready (unchanged).
 *
 *   bun scripts/migrate-legacy-proposals.ts            # dry-run (default)
 *   bun scripts/migrate-legacy-proposals.ts --apply     # git mv + patch for real
 */
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../../plugins/proposals/src/lib/proposals/frontmatter-parser';
import { STATUS_TO_FOLDER } from '../../../plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant';
import { createGitRunner } from '../../../plugins/proposals/src/lib/shared/git-runner';
import type { IGitRunner } from '../../../plugins/proposals/src/lib/shared/git-runner';

interface IStatusMapping {
	readonly status: string;
	readonly extra?: Readonly<Record<string, string>>;
}

const STATUS_MAP: Readonly<Record<string, IStatusMapping>> = {
	done: { status: 'done' },
	retired: { status: 'retired' },
	paused: { status: 'paused' },
	blocked: { status: 'blocked' },
	deferred: { status: 'paused', extra: { deferred: 'true' } },
	pending: {
		status: 'blocked',
		extra: { blocked_by: '[self:needs-triage]' },
	},
	in_progress: { status: 'in-progress' },
	ready: { status: 'ready' },
};
const DEFAULT_MAPPING: IStatusMapping = {
	status: 'blocked',
	extra: { blocked_by: '[self:needs-triage]' },
};

export interface IMigrationPlan {
	readonly oldAbsPath: string;
	readonly oldFilename: string;
	readonly newFilename: string;
	readonly newFolder: string;
	readonly newAbsPath: string;
	readonly oldStatus: string;
	readonly newStatus: string;
	readonly extraFrontmatter: Readonly<Record<string, string>>;
	readonly title: string;
}

const deriveTitle = (raw: string, id: string): string => {
	const m = raw.match(/^#\s+\S+\s+—\s+(.+)$/m);
	const title = m ? (m[1] ?? '').trim() : '';
	return title.length >= 8 ? title : `Legacy proposal ${id}`;
};

/** Pure planning step — no I/O beyond reading the candidate files. */
export const planMigration = async (
	proposalsDirAbs: string,
): Promise<IMigrationPlan[]> => {
	const dirents = await readdir(proposalsDirAbs, {
		withFileTypes: true,
	}).catch(() => []);
	const plans: IMigrationPlan[] = [];
	for (const dirent of dirents) {
		if (!dirent.isFile() || !dirent.name.endsWith('.md')) continue;
		const m = dirent.name.match(/^p(\d+)-(.+)\.md$/);
		if (!m) continue;
		const num = m[1] ?? '';
		const slug = m[2] ?? '';
		const oldAbsPath = join(proposalsDirAbs, dirent.name);
		const raw = await readFile(oldAbsPath, 'utf8');
		const block = extractYamlBlock(raw);
		const fm = block !== null ? parseFrontmatterBlock(block) : {};
		const oldStatus = typeof fm.status === 'string' ? fm.status : 'pending';
		const mapping = STATUS_MAP[oldStatus] ?? DEFAULT_MAPPING;
		const newFolder =
			STATUS_TO_FOLDER[mapping.status as keyof typeof STATUS_TO_FOLDER];
		const newFilename = `l${num}-${slug}.md`;
		plans.push({
			oldAbsPath,
			oldFilename: dirent.name,
			newFilename,
			newFolder,
			newAbsPath: join(proposalsDirAbs, newFolder, newFilename),
			oldStatus,
			newStatus: mapping.status,
			extraFrontmatter: mapping.extra ?? {},
			title: deriveTitle(raw, `l${num}`),
		});
	}
	return plans.sort((a, b) => a.oldFilename.localeCompare(b.oldFilename));
};

/** Rewrites only `id`/`status`, and appends `kind`/`title`/extras if absent. Body untouched. */
export const patchFrontmatter = (raw: string, plan: IMigrationPlan): string => {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!m) return raw;
	const inner = m[1] ?? '';
	const lines = inner.split(/\r?\n/).map((line) => {
		if (/^id:\s*p\d+/.test(line)) {
			return line.replace(/^id:\s*p(\d+)/, 'id: l$1');
		}
		if (/^status:/.test(line)) return `status: ${plan.newStatus}`;
		return line;
	});
	const hasField = (key: string): boolean =>
		lines.some((l) => new RegExp(`^${key}:`).test(l));
	if (!hasField('kind')) lines.push('kind: legacy');
	if (!hasField('title')) lines.push(`title: ${plan.title}`);
	for (const [key, value] of Object.entries(plan.extraFrontmatter)) {
		if (!hasField(key)) lines.push(`${key}: ${value}`);
	}
	const newBlock = `---\n${lines.join('\n')}\n---`;
	return newBlock + raw.slice(m[0].length);
};

const applyMigration = async (
	plans: readonly IMigrationPlan[],
	gitRunner: IGitRunner,
): Promise<void> => {
	for (const plan of plans) {
		const raw = await readFile(plan.oldAbsPath, 'utf8');
		const patched = patchFrontmatter(raw, plan);
		await writeFile(plan.oldAbsPath, patched, 'utf8');
		await mkdir(dirname(plan.newAbsPath), { recursive: true });
		const result = await gitRunner([
			'mv',
			plan.oldAbsPath,
			plan.newAbsPath,
		]);
		if (!result.ok) {
			await rename(plan.oldAbsPath, plan.newAbsPath);
		}
	}
};

const printPlan = (plans: readonly IMigrationPlan[]): void => {
	for (const plan of plans) {
		console.log(
			`${plan.oldFilename} -> ${plan.newFolder}/${plan.newFilename}  (status: ${plan.oldStatus} -> ${plan.newStatus})`,
		);
		for (const [key, value] of Object.entries(plan.extraFrontmatter)) {
			console.log(`  + ${key}: ${value}`);
		}
		console.log(`  title: ${plan.title}`);
	}
	console.log(`\n${plans.length} proposal(s) planned.`);
};

// CLI ------------------------------------------------------------------------
if (import.meta.main) {
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
	const proposalsDirAbs = join(repoRoot, 'docs', 'mcp-vertex', 'proposals');
	const plans = await planMigration(proposalsDirAbs);
	const apply = process.argv.includes('--apply');
	printPlan(plans);
	if (!apply) {
		console.log(
			'\nDry-run only — pass --apply to actually move and patch.',
		);
	} else {
		await applyMigration(plans, createGitRunner(repoRoot));
		console.log('\nApplied.');
	}
}

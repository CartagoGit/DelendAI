#!/usr/bin/env bun
/**
 * closed-frozen-guard.script.ts — a00076 S3.
 *
 * CI lint that enforces the `legacy/closed/<kind>/` freeze: any drift
 * since archival is reported and the script exits 1, blocking
 * `bun run validate`. The four drift kinds are documented in the lib
 * (`closed-frozen-guard.lib.ts`); this script is the I/O half:
 *
 *   - walks `docs/mcp-vertex/proposals/legacy/closed/<kind>/*.md`,
 *   - parses frontmatter + slice statuses from each file,
 *   - reads the sidecar `<file>.archive-snapshot.json` if present,
 *   - feeds the four inputs into `detectFrozenDrift`,
 *   - prints one line per drift, exits 1 if any drift was found.
 *
 * Why a sidecar for slice snapshot rather than diffing commit history:
 *   - The reaper runs in the live worktree (a00076 S2). The sidecar
 *     captures slice statuses at that exact moment so the guard does
 *     not depend on git log plumbing (which breaks in shallow clones).
 *   - Sidecar files are tracked in git (`.archive-snapshot.json` is a
 *     sibling of the `.md`), so the snapshot follows the file across
 *     reaper runs, rebases, and branch flips.
 *
 * Empty `legacy/closed/` is the steady state at the start of S3 — the
 * script prints `✓ closed-frozen-guard: 0 drift in legacy/closed/` and
 * exits 0.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import {
	detectFrozenDrift,
	formatDriftLine,
} from './lib/closed-frozen-guard.lib';
import type { IFrozenDrift } from './lib/closed-frozen-guard.lib';
import { repoRoot } from '../lib/monorepo-paths';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../../plugins/proposals/src/lib/proposals/frontmatter-parser';
import { collectSliceStatuses } from '../../../plugins/proposals/src/lib/services/proposal-completeness';
import { KIND_TO_DONE_SUBFOLDER } from '../../../plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant';

interface ICollectedProposal {
	readonly relPath: string;
	readonly id: string;
	readonly status: string | undefined;
	readonly archivedOn: string | undefined;
	readonly mtimeIso: string;
	readonly markdown: string;
	readonly snapshotSlices: ReadonlyArray<
		ReturnType<typeof collectSliceStatuses>[number]
	>;
}

/**
 * Walk `legacy/closed/<kind>/*.md`. Each proposal has 4 inputs to
 * `detectFrozenDrift`. The sidecar `.archive-snapshot.json` is loaded
 * when present; missing sidecar is fine (slice-drift is silently
 * skipped — see `detectFrozenDrift`).
 */
const collectArchivedProposals = (
	proposalsDir: string,
): ReadonlyArray<ICollectedProposal> => {
	const archiveRoot = join(proposalsDir, 'legacy', 'closed');
	if (!existsSync(archiveRoot)) return [];
	const out: ICollectedProposal[] = [];
	for (const sub of Object.values(KIND_TO_DONE_SUBFOLDER)) {
		if (sub === undefined) continue;
		const kindDir = join(archiveRoot, sub);
		if (!existsSync(kindDir)) continue;
		for (const name of readdirSync(kindDir)) {
			if (!name.endsWith('.md')) continue;
			const abs = join(kindDir, name);
			const stat = statSync(abs);
			const markdown = readFileSync(abs, 'utf8');
			const block = extractYamlBlock(markdown);
			const fm = block === null ? {} : parseFrontmatterBlock(block);
			const id =
				typeof fm.id === 'string' ? fm.id : name.replace(/\.md$/, '');
			const status =
				typeof fm.status === 'string' ? fm.status : undefined;
			const archivedOnRaw = fm['archived-on'];
			const archivedOn =
				typeof archivedOnRaw === 'string' ? archivedOnRaw : undefined;
			// Sidecar: `<file>.archive-snapshot.json`
			const sidecarPath = `${abs}.archive-snapshot.json`;
			let snapshotSlices: ICollectedProposal['snapshotSlices'] = [];
			if (existsSync(sidecarPath)) {
				try {
					const raw = readFileSync(sidecarPath, 'utf8');
					const parsed = JSON.parse(raw) as { slices?: unknown };
					if (Array.isArray(parsed.slices)) {
						snapshotSlices = parsed.slices.filter(
							(
								s,
							): s is {
								id: string;
								status: string;
								title?: string;
								files?: string[];
							} =>
								typeof s === 'object' &&
								s !== null &&
								typeof (s as { id?: unknown }).id ===
									'string' &&
								typeof (s as { status?: unknown }).status ===
									'string',
						) as ICollectedProposal['snapshotSlices'];
					}
				} catch {
					// Malformed sidecar is non-fatal — drift detection simply
					// cannot use it. The guard does NOT fail here (an unparseable
					// sidecar would block every reaper run with no useful signal).
				}
			}
			out.push({
				relPath: abs
					.slice(proposalsDir.length)
					.replace(/^[/\\]+/, '')
					.replace(/\\/g, '/'),
				id,
				status,
				archivedOn,
				mtimeIso: stat.mtime.toISOString(),
				markdown,
				snapshotSlices,
			});
		}
	}
	return out;
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	const proposalsDir = resolve(root, 'docs', 'mcp-vertex', 'proposals');
	const collected = collectArchivedProposals(proposalsDir);
	const drifts: IFrozenDrift[] = [];
	for (const proposal of collected) {
		drifts.push(...detectFrozenDrift(proposal));
	}
	if (drifts.length === 0) {
		console.log(`✓ closed-frozen-guard: 0 drift in legacy/closed/`);
		return 0;
	}
	for (const drift of drifts) {
		console.log(formatDriftLine(drift));
	}
	console.log(
		`\n✗ closed-frozen-guard: ${drifts.length} drift${
			drifts.length === 1 ? '' : 's'
		} in legacy/closed/`,
	);
	return 1;
};

process.exit(await main());

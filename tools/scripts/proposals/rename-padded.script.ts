#!/usr/bin/env bun
/**
 * rename-proposals-padded.ts — f00023 s1.
 *
 * Scans every `.md` under `docs/mcp-vertex/proposals/{ready,done,in-progress,paused,
 * blocked,retired}/`, extracts the `id:` from the YAML frontmatter, looks
 * up the file's *first-commit* date (`git log --diff-filter=A --format=%aI
 * -- <path> | tail -1`), sorts within each family by (creationDate ASC,
 * filename ASC as tiebreak), assigns a fresh 5-digit padded sequence
 * (`a00001`, `a00002`, …, `f00001`, …), and prints the
 * `oldId -> newId` map as JSON to stdout.
 *
 * Defaults to **dry-run** (the file is never renamed, no frontmatter is
 * rewritten). Pass `--apply` to perform the renames via `git mv` and
 * rewrite each file's `id:` field in-place.
 *
 * Design choices (see docs/mcp-vertex/proposals/ready/f00023-…md §"Slices"):
 *   - 5-digit padding (not 6, not 7) — `a00001..a99999` per family = 99 999
 *     proposals/family, enough for decades. Approved in the proposal.
 *   - Order within a family is by **creation date** (first commit), not by
 *     current numeric ID. This is the whole point of f00023: the existing
 *     numbers (`a21..a24`, `f00020..f00022`, `c00001..f00032`, `x00006..x00007`) are
 *     holes and not chronological.
 *   - Ties (two files with identical creation-date) fall back to slug
 *     lexicographic order — deterministic.
 *   - No body rewrites. Only `id:` in the frontmatter and the filename
 *     prefix. The slug (everything after the first `-` in the filename)
 *     is preserved verbatim.
 *   - Alias `p` (pre-f00016 legacy prefix) maps onto the same family as
 *     `l` for the purposes of the sequence — they're both "legacy" kind.
 *
 *   bun scripts/rename-proposals-padded.ts            # dry-run (default)
 *   bun scripts/rename-proposals-padded.ts --apply    # git mv + rewrite
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);

interface IProposalFile {
	readonly relPath: string;
	readonly absPath: string;
	readonly oldId: string;
	readonly family: string;
	readonly createdAt: string;
	readonly slug: string;
}

interface IRenumberEntry {
	readonly oldId: string;
	readonly newId: string;
	readonly oldRelPath: string;
	readonly newRelPath: string;
	readonly oldIdInt: number;
	readonly newIdInt: number;
	readonly family: string;
	readonly createdAt: string;
}

interface IRenumberMap {
	readonly generatedAt: string;
	readonly renames: readonly IRenumberEntry[];
	readonly stats: {
		readonly total: number;
		readonly byFamily: Record<string, number>;
	};
}

const FAMILIES_ORDER = [
	'a',
	'c',
	'd',
	'f',
	'i',
	'l',
	'r',
	's',
	't',
	'v',
	'x',
	'p',
] as const;
const PAD = 5;

const isProposalMd = (filename: string): boolean =>
	/^[a-z]\d+-.+\.md$/.test(filename);

const extractId = (raw: string): string | null => {
	const m = raw.match(/^id:\s*([a-z]\d+)/m);
	return m ? (m[1] ?? null) : null;
};

const gitFirstCommitIso = async (absPath: string): Promise<string> => {
	try {
		const { stdout } = await execFileP(
			'git',
			['log', '--diff-filter=A', '--format=%aI', '--', absPath],
			{ cwd: process.cwd(), maxBuffer: 1024 * 1024 },
		);
		const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
		const iso = lines.length > 0 ? (lines[lines.length - 1] ?? '') : '';
		// Untracked files have no commit yet — return a sentinel that sorts
		// AFTER everything else (year 9000). These files are usually the
		// newest, so they deserve the highest sequence numbers in their
		// family, not the lowest. This is the conservative choice: renumber
		// existing tracked proposals first, untracked get the tail.
		return iso || '9000-01-01T00:00:00+00:00';
	} catch {
		return '9000-01-01T00:00:00+00:00';
	}
};

const walkProposals = async (root: string): Promise<IProposalFile[]> => {
	const out: IProposalFile[] = [];
	const proposalsRoot = join(root, 'docs', 'mcp-vertex', 'proposals');

	const visit = async (dirAbs: string): Promise<void> => {
		let entries: Awaited<ReturnType<typeof readdir>>;
		try {
			entries = await readdir(dirAbs, { withFileTypes: true });
		} catch {
			return;
		}
		for (const ent of entries) {
			const abs = join(dirAbs, ent.name);
			if (ent.isDirectory()) {
				// Recurse into sub-folders (e.g. `done/audits/`, `done/feats/`,
				// `done/fixes/`, `done/resumes/`). We do NOT recurse into the
				// `docs/mcp-vertex/proposals/audit*` / `n00001-*.md` session notes etc.
				await visit(abs);
				continue;
			}
			if (!ent.isFile()) continue;
			if (!isProposalMd(ent.name)) continue;
			// Skip session notes / READMEs that happen to match the regex
			// (defensive — they shouldn't, but `n00001-…md` starts with
			// uppercase R, so the regex `/^[a-z]\d+-/` rejects them anyway).
			const raw = await readFile(abs, 'utf8');
			const oldId = extractId(raw);
			if (!oldId) continue;
			const family = oldId[0] ?? '';
			const dash = ent.name.indexOf('-');
			const slug =
				dash >= 0 ? ent.name.slice(dash + 1, -'.md'.length) : '';
			const relPath = relative(process.cwd(), abs);
			const createdAt = await gitFirstCommitIso(abs);
			out.push({ relPath, absPath: abs, oldId, family, createdAt, slug });
		}
	};

	await visit(proposalsRoot);
	if (process.env.VERBOSE)
		console.error(
			`walkProposals: found ${out.length} proposals under ${proposalsRoot}`,
		);
	return out;
};

const buildMap = async (root: string): Promise<IRenumberMap> => {
	const files = await walkProposals(root);
	const byFamily = new Map<string, IProposalFile[]>();
	for (const f of files) {
		const key = f.family === 'p' ? 'l' : f.family;
		const arr = byFamily.get(key) ?? [];
		arr.push(f);
		byFamily.set(key, arr);
	}
	for (const arr of byFamily.values()) {
		arr.sort((a, b) => {
			if (a.createdAt !== b.createdAt)
				return a.createdAt < b.createdAt ? -1 : 1;
			if (a.slug !== b.slug) return a.slug < b.slug ? -1 : 1;
			return a.relPath < b.relPath ? -1 : 1;
		});
	}

	const renames: IRenumberEntry[] = [];
	const stats: Record<string, number> = {};
	for (const family of FAMILIES_ORDER) {
		const arr = byFamily.get(family);
		if (!arr || arr.length === 0) continue;
		stats[family] = arr.length;
		arr.forEach((f, idx) => {
			const newId = `${family}${String(idx + 1).padStart(PAD, '0')}`;
			const newRelPath = join(
				dirname(f.relPath),
				`${newId}-${f.slug}.md`,
			);
			const oldIdInt = parseInt(f.oldId.slice(1), 10);
			renames.push({
				oldId: f.oldId,
				newId,
				oldRelPath: f.relPath,
				newRelPath,
				oldIdInt,
				newIdInt: idx + 1,
				family,
				createdAt: f.createdAt,
			});
		});
	}

	return {
		generatedAt: new Date().toISOString(),
		renames,
		stats: {
			total: renames.length,
			byFamily: stats,
		},
	};
};

const applyRenames = async (map: IRenumberMap): Promise<void> => {
	for (const r of map.renames) {
		if (r.oldRelPath === r.newRelPath && r.oldId === r.newId) {
			continue;
		}
		await execFileP('git', ['mv', r.oldRelPath, r.newRelPath], {
			cwd: process.cwd(),
		});
		const raw = await readFile(r.newRelPath, 'utf8');
		const patched = raw.replace(/^id:\s*[a-z]\d+/m, `id: ${r.newId}`);
		if (patched !== raw) {
			await writeFile(r.newRelPath, patched, 'utf8');
		}
	}
};

if (import.meta.main) {
	// From `scripts/<file>.ts`, the repo root is one `..` up from `dirname(import.meta.url)`.
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	const repoRoot = join(scriptDir, '../../..');
	const apply = process.argv.includes('--apply');
	const map = await buildMap(repoRoot);
	if (apply) {
		await applyRenames(map);
		console.error(
			`Applied ${map.renames.length} renames across ${Object.keys(map.stats.byFamily).length} families. ` +
				`Run bun run lint:proposals and mcp-vertex.proposals.sync_proposals to refresh the index.`,
		);
	} else {
		console.log(JSON.stringify(map, null, 2));
	}
}

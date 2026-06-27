import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
import { setFrontmatterStatus } from './proposal-frontmatter-writer';
import type {
	IAcceptanceCriterion,
	IProposalBudget,
} from './proposal-document';
import type { IContinuityPolicy, ISwarmBudget } from '../swarm/swarm-types';
import {
	isProposalContinuityPolicy,
	isProposalSwarmBudget,
} from './proposal-policy-guards';
import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import {
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
} from '../contracts/constants/proposal-glossary.constant';
import type { IProposalStatus as IGlossaryStatus } from '../contracts/constants/proposal-glossary.constant';
import { lintProposalMarkdown } from './proposal-scaffold-linter';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';

// The legacy 8-status union, PLUS the 2 new-only f00016 statuses
// (`in-progress` hyphenated, `review`) that the legacy union never had —
// additive only, so a proposal already on the new state machine (f00016
// glossary) records its real status instead of falling back to
// `pending` with a spurious "missing or invalid status" warning. The
// other 5 new statuses (`ready`, `done`, `paused`, `blocked`, `retired`)
// already happen to share their spelling with the legacy union.
type IProposalStatus =
	| 'pending'
	| 'in_progress'
	| 'ready'
	| 'blocked'
	| 'done'
	| 'retired'
	| 'paused'
	| 'deferred'
	| 'in-progress'
	| 'review';

interface IProposalFrontmatter {
	type?: string;
	status?: string;
	date?: string;
	track?: string;
	id?: string;
}

interface IProposalExtras {
	budget?: IProposalBudget;
	acceptanceCriteria?: IAcceptanceCriterion[];
	ownership?: string[];
	reservedFiles?: string[];
	agentClosureReportPath?: string;
	swarmBudget?: ISwarmBudget;
	continuityPolicy?: IContinuityPolicy;
	taskQueue?: boolean;
}

interface IProposalEntry {
	id: string;
	file: string;
	track: string;
	type: string;
	status: IProposalStatus;
	date: string;
	extras?: IProposalExtras;
}

export interface IProposalRegistrySyncResult {
	generated_at: string;
	count: number;
	proposals: IProposalEntry[];
	errors: string[];
	changed: boolean;
	indexPath: string;
}

const VALID_STATUSES: ReadonlySet<IProposalStatus> = new Set([
	'pending',
	'in_progress',
	'ready',
	'blocked',
	'done',
	'retired',
	'paused',
	'deferred',
	'in-progress',
	'review',
]);

const isGlossaryStatus = (s: string): s is IGlossaryStatus =>
	s in PROPOSAL_STATUSES;

const isProposalStatus = (s: string | undefined): s is IProposalStatus =>
	s !== undefined && VALID_STATUSES.has(s as IProposalStatus);

const KNOWN_KEYS = ['type', 'status', 'date', 'track', 'id'] as const;
type IKnownKey = (typeof KNOWN_KEYS)[number];
const isKnownKey = (k: string): k is IKnownKey =>
	(KNOWN_KEYS as readonly string[]).includes(k.toLowerCase() as IKnownKey);

const parseFrontmatter = (raw: string): IProposalFrontmatter => {
	const yamlMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const block = yamlMatch ? (yamlMatch[1] ?? '') : '';
	const out: IProposalFrontmatter = {};
	const apply = (rawKey: string, value: string): void => {
		const k = rawKey.toLowerCase() as IKnownKey;
		if (isKnownKey(k)) out[k] = value;
	};
	if (block) {
		for (const line of block.split(/\r?\n/)) {
			const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/);
			if (!m) continue;
			apply(m[1] ?? '', (m[2] ?? '').replace(/^['"]|['"]$/g, '').trim());
		}
		return out;
	}
	for (const line of raw.split(/\r?\n/).slice(0, 20)) {
		const m = line.match(
			/^\*\*([A-Za-z_][A-Za-z0-9_]*)\*\*\s*:\s*(.*?)\s*$/,
		);
		if (!m) continue;
		apply(m[1] ?? '', (m[2] ?? '').replace(/^['"]|['"]$/g, '').trim());
	}
	return out;
};

const buildId = (filename: string): string => filename.replace(/\.md$/, '');

const extractExtras = (
	parsed: Record<string, unknown>,
): IProposalExtras | undefined => {
	const rawBudget = parsed.budget;
	const budget =
		rawBudget !== null &&
		typeof rawBudget === 'object' &&
		!Array.isArray(rawBudget)
			? (rawBudget as IProposalBudget)
			: undefined;
	const rawAC = parsed.acceptanceCriteria;
	const acceptanceCriteria = Array.isArray(rawAC)
		? (rawAC as IAcceptanceCriterion[])
		: undefined;
	const rawOwnership = parsed.ownership;
	const ownership = Array.isArray(rawOwnership)
		? rawOwnership.filter((v): v is string => typeof v === 'string')
		: undefined;
	const rawReserved = parsed.reservedFiles;
	const reservedFiles = Array.isArray(rawReserved)
		? rawReserved.filter((v): v is string => typeof v === 'string')
		: undefined;
	const rawAgentClosureReportPath = parsed.agentClosureReportPath;
	const agentClosureReportPath =
		typeof rawAgentClosureReportPath === 'string'
			? rawAgentClosureReportPath
			: undefined;
	const rawSwarmBudget = parsed.swarmBudget;
	const swarmBudget = isProposalSwarmBudget(rawSwarmBudget)
		? (rawSwarmBudget as ISwarmBudget)
		: undefined;
	const rawContinuityPolicy = parsed.continuityPolicy;
	const continuityPolicy = isProposalContinuityPolicy(rawContinuityPolicy)
		? (rawContinuityPolicy as IContinuityPolicy)
		: undefined;
	const rawTaskQueue = parsed.taskQueue;
	const taskQueue = rawTaskQueue === true;
	if (
		!budget &&
		!acceptanceCriteria &&
		!ownership &&
		!reservedFiles &&
		!agentClosureReportPath &&
		!swarmBudget &&
		!continuityPolicy &&
		!taskQueue
	) {
		return undefined;
	}
	return {
		...(budget ? { budget } : {}),
		...(acceptanceCriteria ? { acceptanceCriteria } : {}),
		...(ownership ? { ownership } : {}),
		...(reservedFiles ? { reservedFiles } : {}),
		...(agentClosureReportPath ? { agentClosureReportPath } : {}),
		...(swarmBudget ? { swarmBudget } : {}),
		...(continuityPolicy ? { continuityPolicy } : {}),
		...(taskQueue ? { taskQueue } : {}),
	};
};

const readProposalFile = async (
	absFilepath: string,
	// x00052 used to read `indexPath` here to build `entry.file` relative
	// to it. The field is now anchored to `proposalsDir` (passed as the
	// third arg) so `indexPath` is no longer needed; rename the
	// parameter to `_indexPath` to mark it intentionally unused
	// without triggering biome's noUnusedFunctionParameters rule.
	_indexPath: string,
	proposalsDir: string,
): Promise<{ entry: IProposalEntry; warning?: string }> => {
	const rawStr = await readFile(absFilepath, 'utf8');
	const fm = parseFrontmatter(rawStr);
	const name = absFilepath.split('/').pop() ?? absFilepath;
	const id = fm.id ?? buildId(name);
	const status: IProposalStatus = isProposalStatus(fm.status)
		? fm.status
		: 'pending';
	const yamlBlock = extractYamlBlock(rawStr);
	const extras = yamlBlock
		? extractExtras(parseFrontmatterBlock(yamlBlock))
		: undefined;
	const entry: IProposalEntry = {
		id,
		// x00052: `file` is `proposalsDir`-relative (was implicitly
		// `dirname(indexPath)`-relative, which used to be the same
		// directory but is no longer now that the index lives under
		// `cacheDir`). Keeping the field anchored to the *content* root
		// (where the proposal files live) means every downstream
		// `join(proposalsDir, entry.file)` and `folderOf(entry.file)`
		// stays correct regardless of where the index itself is stored.
		file: relative(proposalsDir, absFilepath),
		track: fm.track ?? 'unspecified',
		type: fm.type ?? 'unspecified',
		status,
		date: fm.date ?? 'unknown',
		...(extras ? { extras } : {}),
	};
	if (!isProposalStatus(fm.status)) {
		return {
			entry,
			warning: `${name}: missing or invalid 'status' frontmatter key`,
		};
	}
	return { entry };
};

const scanSubtree = async (
	absDir: string,
	indexPath: string,
	proposalsDir: string,
): Promise<{ entries: IProposalEntry[]; warnings: string[] }> => {
	const entries: IProposalEntry[] = [];
	const warnings: string[] = [];
	let dirents: Array<{ isFile(): boolean; name: string }>;
	try {
		dirents = (await readdir(absDir, {
			withFileTypes: true,
		})) as Array<{ isFile(): boolean; name: string }>;
	} catch {
		return { entries, warnings };
	}
	for (const dirent of dirents) {
		if (!dirent.isFile()) continue;
		const name = String(dirent.name);
		if (!name.endsWith('.md') || name === 'README.md') continue;
		if (!/^[a-z]\d+[a-z]*-.+\.md$/iu.test(name)) continue;
		const { entry, warning } = await readProposalFile(
			join(absDir, name),
			indexPath,
			proposalsDir,
		);
		entries.push(entry);
		if (warning) warnings.push(warning);
	}
	return { entries, warnings };
};

const readTaskStatuses = (markdown: string): string[] => {
	const taskHeadingPattern = /^#{2,3}\s+T[0-9A-Z_]+(?::\s*.+)?$/gmu;
	const matches = [...markdown.matchAll(taskHeadingPattern)];
	const statuses: string[] = [];

	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		if (!match || typeof match.index !== 'number') continue;
		const blockStart = match.index + match[0].length;
		const blockEnd = matches[index + 1]?.index ?? markdown.length;
		const block = markdown.slice(blockStart, blockEnd);
		const status = block.match(/^\*\*Status\*\*: (.+)$/mu)?.[1]?.trim();
		if (status) {
			statuses.push(status.replace(/^`|`$/gu, '').trim().toLowerCase());
		}
	}

	return statuses;
};

const reconcileCompletedProposalMarkdown = (markdown: string): string => {
	const currentStatus = parseFrontmatter(markdown).status?.toLowerCase();
	if (currentStatus === 'done') return markdown;

	const taskStatuses = readTaskStatuses(markdown);
	if (
		taskStatuses.length === 0 ||
		!taskStatuses.every((status) => status === 'done')
	) {
		return markdown;
	}

	if (/^status\s*:\s*.+$/mu.test(markdown)) {
		return markdown.replace(/^status\s*:\s*.+$/mu, 'status: done');
	}

	if (/^\*\*Status\*\*: .+$/mu.test(markdown)) {
		return markdown.replace(/^\*\*Status\*\*: .+$/mu, '**Status**: done');
	}

	return markdown;
};

// Exported for f00020 S2 (race-condition regression coverage); not part of the
// plugin's public tool surface — `syncProposalRegistry` is still the only
// entry point invoked by production code paths.
export const reconcileAndArchiveCompletedRootProposals = async (
	proposalsDir: string,
): Promise<void> => {
	let dirents: Array<{ isFile(): boolean; name: string }>;
	try {
		dirents = (await readdir(proposalsDir, {
			withFileTypes: true,
		})) as Array<{ isFile(): boolean; name: string }>;
	} catch {
		return;
	}

	const historicalDir = join(proposalsDir, 'historical');
	for (const dirent of dirents) {
		if (!dirent.isFile()) continue;
		const name = String(dirent.name);
		if (!/^p\d+[a-z]*-.+\.md$/iu.test(name)) continue;

		const sourcePath = join(proposalsDir, name);
		const raw = await readFile(sourcePath, 'utf8');
		const reconciled = reconcileCompletedProposalMarkdown(raw);
		if (
			reconciled === raw ||
			parseFrontmatter(reconciled).status !== 'done'
		) {
			continue;
		}

		await withFileMutex(sourcePath, async () => {
			await writeFileAtomic(sourcePath, reconciled);
			await mkdir(historicalDir, { recursive: true });
			await rename(sourcePath, join(historicalDir, name));
		});
	}
};

// --- f00016 S5: folder reconciler ---------------------------------------------
// Operates ONLY on proposals already on the new 7-status state machine
// (status resolves via the glossary). Legacy files (old 8-status union)
// are invisible to every function below — `isGlossaryStatus` is the de
// facto flag S1 talked about: a legacy status simply never matches, so
// nothing here touches the 14 files until S11/S12 migrate them.

const NEW_SYSTEM_FOLDERS = [...new Set(Object.values(STATUS_TO_FOLDER))];

interface INewSystemFile {
	readonly absPath: string;
	readonly folder: string;
	readonly filename: string;
	readonly id: string;
	readonly status: IGlossaryStatus;
	readonly blockedBy: readonly string[];
}

/** Collects every `.md` under the proposalsDir tree whose frontmatter status is on the new state machine. */
/**
 * A file is only "on the new state machine" if BOTH hold:
 * 1. its filename prefix is one of the 12 live f00016 kind prefixes
 *    (explicitly excludes the retired legacy `p` — `p5-meta.md`,
 *    `l99-…md`, etc. are never reconciled, no matter their status);
 * 2. frontmatter `status` resolves to one of the 7 glossary statuses.
 *
 * Status alone is NOT enough: `ready` is the *default* status
 * `create_proposal` writes for brand-new proposals regardless of kind
 * (`status: ${args.status ?? 'ready'}`), so without the prefix check
 * every freshly created legacy-style proposal (id `p5`, `l100`, …) —
 * which is the common case, that tool predates f00016 and has no notion
 * of kinds — would get silently relocated into `ready/` the moment
 * `syncProposalRegistry` next ran. Caught by `authoring.spec.ts`'s
 * existing "p5-meta.md ends up exactly where it was written" assertion.
 */
const isNewSystemFilename = (filename: string): boolean => {
	const prefix = filename[0] ?? '';
	return prefix !== 'p' && prefix in PROPOSAL_KIND_BY_PREFIX;
};

const scanNewSystemFiles = async (
	proposalsDirAbs: string,
): Promise<INewSystemFile[]> => {
	const out: INewSystemFile[] = [];
	for (const folder of ['', ...NEW_SYSTEM_FOLDERS]) {
		const dirAbs =
			folder === '' ? proposalsDirAbs : join(proposalsDirAbs, folder);
		const dirents = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => [],
		);
		for (const dirent of dirents) {
			if (!dirent.isFile() || !dirent.name.endsWith('.md')) continue;
			if (!isNewSystemFilename(dirent.name)) continue;
			const absPath = join(dirAbs, dirent.name);
			const raw = await readFile(absPath, 'utf8');
			const block = extractYamlBlock(raw);
			if (block === null) continue;
			const fm = parseFrontmatterBlock(block);
			const status = typeof fm.status === 'string' ? fm.status : '';
			if (!isGlossaryStatus(status)) continue;
			const blockedByRaw = fm.blocked_by ?? fm['blocked-by'];
			const blockedBy = Array.isArray(blockedByRaw)
				? blockedByRaw.filter((v): v is string => typeof v === 'string')
				: [];
			out.push({
				absPath,
				folder,
				filename: dirent.name,
				id: typeof fm.id === 'string' ? fm.id : dirent.name,
				status,
				blockedBy,
			});
		}
	}
	return out;
};

const moveFile = async (
	gitRunner: IGitRunner,
	fromAbs: string,
	toAbs: string,
): Promise<void> => {
	await mkdir(dirname(toAbs), { recursive: true });
	const result = await gitRunner(['mv', fromAbs, toAbs]);
	if (!result.ok) await rename(fromAbs, toAbs);
};

const setStatusLine = setFrontmatterStatus;

/**
 * Moves every new-system file whose actual folder disagrees with what
 * its frontmatter `status` implies. Idempotent: a file already in the
 * right place is a no-op (the comparison is structural, not a write).
 */
export const reconcileFolders = async (
	proposalsDirAbs: string,
	gitRunner: IGitRunner,
): Promise<{
	moved: ReadonlyArray<{ id: string; from: string; to: string }>;
}> => {
	const files = await scanNewSystemFiles(proposalsDirAbs);
	const moved: Array<{ id: string; from: string; to: string }> = [];
	for (const file of files) {
		const expectedFolder = STATUS_TO_FOLDER[file.status];
		if (file.folder === expectedFolder) continue;
		const newAbsPath = join(proposalsDirAbs, expectedFolder, file.filename);
		await moveFile(gitRunner, file.absPath, newAbsPath);
		moved.push({
			id: file.id,
			from: file.folder || '(root)',
			to: expectedFolder,
		});
	}
	return { moved };
};

/**
 * Auto-resolves `blocked` → `ready` (f00016 §4.2) when every entry in
 * `blocked_by` is satisfied: a `self:*` token clears once the scaffold
 * linter (S2) passes on the file; a proposal-id token clears once that
 * proposal's own status is `done`. Idempotent: once transitioned, the
 * file is in `ready/` and this function never looks at it again.
 */
export const reconcileBlocked = async (
	proposalsDirAbs: string,
	gitRunner: IGitRunner,
): Promise<{ resolved: ReadonlyArray<{ id: string }> }> => {
	const files = await scanNewSystemFiles(proposalsDirAbs);
	const statusById = new Map(files.map((f) => [f.id, f.status] as const));
	const resolved: Array<{ id: string }> = [];

	for (const file of files) {
		if (file.status !== 'blocked' || file.blockedBy.length === 0) continue;

		const raw = await readFile(file.absPath, 'utf8');
		const stillBlocked = file.blockedBy.some((token) => {
			if (token.startsWith('self:')) {
				const lint = lintProposalMarkdown({
					path: file.absPath,
					markdown: raw,
				});
				return !lint.ok;
			}
			return statusById.get(token) !== 'done';
		});
		if (stillBlocked) continue;

		const newAbsPath = join(
			proposalsDirAbs,
			STATUS_TO_FOLDER.ready,
			file.filename,
		);
		const updated = setStatusLine(raw, 'ready');
		await writeFileAtomic(file.absPath, updated);
		await moveFile(gitRunner, file.absPath, newAbsPath);
		resolved.push({ id: file.id });
	}
	return { resolved };
};

export async function syncProposalRegistry(
	root: string,
	layout: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	> = DEFAULT_PATH_LAYOUT,
	// Host-specific proposal subfolders (relative to proposalsDir), e.g.
	// `paused/demos`. Injected from ctx.options so mcp-vertex's generic
	// proposal model carries no host vocabulary.
	extraFolders: readonly string[] = [],
	// f00016 S5: injectable for tests; defaults to a real `git mv` in `root`.
	gitRunner: IGitRunner = createGitRunner(root),
): Promise<IProposalRegistrySyncResult> {
	const proposalsDir = resolve(root, layout.proposalsDir);
	const indexPath = resolve(root, layout.proposalIndexFile);
	// Cross-process critical section: a concurrent sync regenerating
	// the same index must not lose entries (read FS → write index).
	return withFileMutex(indexPath, async () => {
		await reconcileAndArchiveCompletedRootProposals(proposalsDir);
		// f00016 S5: new-system files only (isGlossaryStatus gates it) — move
		// anything whose folder disagrees with its status, then auto-resolve
		// `blocked` → `ready` where every blocker has cleared. Runs before
		// the scan below so the index reflects the post-reconciliation tree.
		await reconcileFolders(proposalsDir, gitRunner);
		await reconcileBlocked(proposalsDir, gitRunner);
		// Generic proposal-model subtrees only. Host folders (like `paused/demos`)
		// arrive via `extraFolders`.
		// f00016's 7 status folders (S5) overlap with the legacy list (`paused`
		// is in both) — dedupe by absolute path so a folder is never scanned
		// (and its entries never double-counted) twice.
		const subtreeAbsolutes = [
			proposalsDir,
			join(proposalsDir, 'historical'),
			join(proposalsDir, 'revised'),
			join(proposalsDir, 'revised', 'audits'),
			join(proposalsDir, 'revised', 'retired'),
			// Top-level kind sub-folders (legacy f00001 layout: `fixes/`,
			// `audits/`, `feats/` as siblings of the 7 status folders).
			join(proposalsDir, 'audits'),
			join(proposalsDir, 'feats'),
			join(proposalsDir, 'fixes'),
			join(proposalsDir, 'resumes'),
			...NEW_SYSTEM_FOLDERS.map((folder) => join(proposalsDir, folder)),
			// f00001 (done folder mirror): kind sub-folders inside the
			// `done/` status folder (`done/audits/`, `done/feats/`,
			// `done/fixes/`, `done/resumes/`). Same files as the
			// top-level entries above when a project uses the canonical
			// `done/<kind>/` layout; the `new Set(subtreeAbsolutes)`
			// dedup absorbs any overlap.
			join(proposalsDir, 'done', 'audits'),
			join(proposalsDir, 'done', 'feats'),
			join(proposalsDir, 'done', 'fixes'),
			join(proposalsDir, 'done', 'resumes'),
			...extraFolders.map((folder) => join(proposalsDir, folder)),
		];
		const subtrees: ReadonlyArray<{ absolute: string }> = [
			...new Set(subtreeAbsolutes),
		].map((absolute) => ({ absolute }));
		const entries: IProposalEntry[] = [];
		const warnings: string[] = [];
		for (const subtree of subtrees) {
			const result = await scanSubtree(
				subtree.absolute,
				indexPath,
				proposalsDir,
			);
			result.entries.sort((a, b) => a.id.localeCompare(b.id));
			entries.push(...result.entries);
			warnings.push(...result.warnings);
		}
		const index = {
			generated_at: new Date().toISOString(),
			count: entries.length,
			proposals: entries,
			errors: warnings,
		};
		// x00052: the registry index moved under
		// `<cacheDir>/proposals/index.json` (it is a regenerable cache
		// artefact, not a human-edited source file). The JSON is still
		// formatted with 4-space indent to match the pre-x00052 wire
		// format — a host that diffs two regenerations would notice a
		// tab vs space drift otherwise.
		const nextText = `${JSON.stringify(index, null, 4)}\n`;
		let changed = true;
		try {
			const current = await readFile(indexPath, 'utf8');
			changed = current !== nextText;
		} catch {
			// Missing or unreadable index means the generated file will be new.
		}
		await writeFileAtomic(indexPath, nextText);
		return {
			...index,
			changed,
			indexPath,
		};
	});
}

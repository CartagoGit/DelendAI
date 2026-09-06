import { access, mkdir, readdir, rename } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

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
	KIND_TO_DONE_SUBFOLDER,
} from '../contracts/constants/proposal-glossary.constant';
import type {
	IProposalKind,
	IProposalStatus as IGlossaryStatus,
} from '../contracts/constants/proposal-glossary.constant';
import {
	proposalFolderFor,
	type IProposalFolderPolicy,
} from '../contracts/proposal-folder-policy';
import { lintProposalMarkdown } from './proposal-scaffold-linter';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';
import {
	slugFromTitle,
	stripIdPrefixFromTitle,
} from '../shared/string-helpers';

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
	/**
	 * `true` when the proposal lives under `legacy/closed/` — the f00076
	 * archive folder — rather than the active `done/<kind>/` subtree. The
	 * status field still reflects the original workflow status (today always
	 * `done`); `archived` is a *location* marker, not a workflow state, so the
	 * existing DFA stays untouched and downstream consumers that ignore the
	 * flag keep their semantics.
	 */
	archived?: boolean;
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
	const rawStr = (
		await new SafeWorkspaceReader(proposalsDir).readText(
			relative(proposalsDir, absFilepath).split('\\').join('/'),
		)
	).content;
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
	// f00076: a proposal under `legacy/closed/` is archived. We tag the entry
	// with `archived: true` so consumers (the index dashboard, the closed
	// frozen guard lint, `proposal_diagnose`) can recognise it without
	// having to compare paths. `file` keeps its proposalsDir-relative form
	// (e.g. `legacy/closed/feats/f00001-...md`), and `status` is preserved
	// verbatim — the archive is a *location*, not a workflow status.
	const relPath = relative(proposalsDir, absFilepath);
	const isArchived = relPath.startsWith(`legacy${sep}closed${sep}`);
	const entry: IProposalEntry = {
		id,
		// x00052: `file` is `proposalsDir`-relative (was implicitly
		// `dirname(indexPath)`-relative, which used to be the same
		// directory but is no longer now that the index lives under
		// `cacheDir`). Keeping the field anchored to the *content* root
		// (where the proposal files live) means every downstream
		// `join(proposalsDir, entry.file)` and `folderOf(entry.file)`
		// stays correct regardless of where the index itself is stored.
		file: relPath,
		track: fm.track ?? 'unspecified',
		type: fm.type ?? 'unspecified',
		status,
		date: fm.date ?? 'unknown',
		...(extras ? { extras } : {}),
		...(isArchived ? { archived: true } : {}),
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
		// a00084 F20: `[a-z]?`, not `[a-z]*` — a single optional trailing
		// letter matches the one legacy residual-suffix form that actually
		// exists on disk (`f00067a-…`, see `proposalIdSchema`'s
		// READ_ID_PATTERN in proposal-kind.schema.ts). Unbounded trailing
		// letters let a malformed id (e.g. `x1abcd-…`) into the index even
		// though `frontmatter-linter.ts`'s stricter id check would reject
		// it — the two need to agree on what "looks like a proposal id" is.
		if (!/^[a-z]\d+[a-z]?-.+\.md$/iu.test(name)) continue;
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
		const raw = (await new SafeWorkspaceReader(proposalsDir).readText(name))
			.content;
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
	/**
	 * Kind inferred from the filename prefix (f00016 §4.1 — the
	 * filename's first character is the canonical kind prefix).
	 * Optional: a prefix that is not in `PROPOSAL_KIND_BY_PREFIX` yields
	 * `undefined`, and the reconciler stays graceful by falling back to
	 * the status folder (no sub-folder).
	 */
	readonly kind: IProposalKind | undefined;
	readonly title?: string;
}

export interface IProposalFolderDrift {
	readonly id: string;
	readonly path: string;
	readonly folder: string;
	readonly expectedFolder: string;
	readonly status: IGlossaryStatus;
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

const canonicalProposalFilename = (file: INewSystemFile): string | null => {
	const idMatch = file.id.match(/^([a-z])(\d+)$/iu);
	if (idMatch === null) return null;
	const prefix = (idMatch[1] ?? '').toLowerCase();
	const numericId = Number(idMatch[2]);
	if (!Number.isSafeInteger(numericId) || numericId < 1) return null;
	const fallback = `${prefix}${String(numericId).padStart(5, '0')}`;
	// x00050 S2 / sync_proposals filename-builder bug: a title that
	// already starts with `<id>:` (the consumer convention for `fix` /
	// `feat` proposals) used to produce `x00050-x00050-…md` because
	// the slug included the id and the builder prepended the id
	// again. Strip the leading id from the title before slugifying so
	// the on-disk filename carries the id exactly once.
	const title = file.title?.trim();
	const cleanedTitle =
		title && title.length > 0
			? stripIdPrefixFromTitle(title, fallback)
			: '';
	const slug = slugFromTitle(
		cleanedTitle.length > 0
			? cleanedTitle
			: file.filename.replace(/^[a-z]\d+-/iu, '').replace(/\.md$/iu, ''),
		fallback,
	);
	return `${prefix}${String(numericId).padStart(5, '0')}-${slug}.md`;
};

/**
 * Folders to scan for new-system proposal files. Includes the 7 status
 * folders, the proposals root (legacy flat layout), and every
 * `done/<kind>/` sub-folder (f00042). Without the kind sub-folders,
 * `reconcileFolders` would miss closed proposals and could not detect
 * duplicate ids that live only under `done/feats/` (a00069 S3 / F7).
 */
const newSystemScanFolders = (): readonly string[] => {
	const folders = new Set<string>(['', ...NEW_SYSTEM_FOLDERS]);
	for (const sub of Object.values(KIND_TO_DONE_SUBFOLDER)) {
		if (sub !== undefined) {
			folders.add(join('ready', sub));
			folders.add(join('done', sub));
		}
	}
	return [...folders];
};

const scanNewSystemFiles = async (
	proposalsDirAbs: string,
): Promise<INewSystemFile[]> => {
	const out: INewSystemFile[] = [];
	for (const folder of newSystemScanFolders()) {
		const dirAbs =
			folder === '' ? proposalsDirAbs : join(proposalsDirAbs, folder);
		const dirents = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => [],
		);
		for (const dirent of dirents) {
			if (!dirent.isFile() || !dirent.name.endsWith('.md')) continue;
			if (!isNewSystemFilename(dirent.name)) continue;
			const absPath = join(dirAbs, dirent.name);
			const raw = (
				await new SafeWorkspaceReader(proposalsDirAbs).readText(
					relative(proposalsDirAbs, absPath).split('\\').join('/'),
				)
			).content;
			const block = extractYamlBlock(raw);
			if (block === null) continue;
			const fm = parseFrontmatterBlock(block);
			const status = typeof fm.status === 'string' ? fm.status : '';
			if (!isGlossaryStatus(status)) continue;
			const blockedByRaw = fm.blocked_by ?? fm['blocked-by'];
			const blockedBy = Array.isArray(blockedByRaw)
				? blockedByRaw.filter((v): v is string => typeof v === 'string')
				: [];
			const prefix = dirent.name[0] ?? '';
			const kind = PROPOSAL_KIND_BY_PREFIX[prefix];
			const title = typeof fm.title === 'string' ? fm.title : undefined;
			out.push({
				absPath,
				folder,
				filename: dirent.name,
				id: typeof fm.id === 'string' ? fm.id : dirent.name,
				status,
				blockedBy,
				kind,
				...(title !== undefined ? { title } : {}),
			});
		}
	}
	return out;
};

/**
 * a00069 S3 / F7 — report every proposal id that appears in more than
 * one path under `proposalsDirAbs`. Pure detection (no deletes).
 *
 * Not currently wired into a live gate or tool — `lint:proposals`'s
 * actual duplicate-id check is the separate, narrower
 * `detectDuplicateProposalIds` in `tools/scripts/lint/proposals.script.ts`
 * (matches only the canonical `id:` frontmatter pattern, so it never
 * needs the filename-fallback this function uses). Found and fixed
 * live 2026-07-28: this function's filename fallback made every
 * frontmatter-less `.md` (README.md, etc.) collide with every other
 * file of the same name; kept as a pure detection primitive available
 * for a future caller, not something in the request path today.
 */
export const findDuplicateProposalIds = async (
	proposalsDirAbs: string,
): Promise<ReadonlyArray<{ id: string; paths: readonly string[] }>> => {
	// f00154 S2 audit: `scanNewSystemFiles` deliberately filters out
	// legacy `pNNN-*` / `lNNN-*` filenames so the folder reconciler
	// doesn't relocate freshly-created pre-f00016 proposals. But the
	// duplicate-id guard must catch ANY two `.md` files (any prefix,
	// any folder under proposalsDirAbs) that share the same frontmatter
	// `id`. Walk the full tree for THIS scan only — the folder
	// reconciler keeps its narrow scope.
	const files = await scanAllProposalIds(proposalsDirAbs);
	const byId = new Map<string, string[]>();
	for (const file of files) {
		const list = byId.get(file.id) ?? [];
		list.push(relative(proposalsDirAbs, file.absPath));
		byId.set(file.id, list);
	}
	const out: Array<{ id: string; paths: readonly string[] }> = [];
	for (const [id, paths] of byId) {
		if (paths.length < 2) continue;
		out.push({
			id,
			paths: [...paths].sort((a, b) => a.localeCompare(b)),
		});
	}
	out.sort((a, b) => a.id.localeCompare(b.id));
	return out;
};

/**
 * Walk EVERY `.md` under `proposalsDirAbs` and extract its
 * frontmatter `id` (or fall back to the filename when the frontmatter
 * is missing). Used ONLY by `findDuplicateProposalIds` — other
 * reconcilers stay narrow via `scanNewSystemFiles`. Skips dirs the
 * scanner can't read (EACCES / ENOENT) without throwing.
 */
const scanAllProposalIds = async (
	proposalsDirAbs: string,
): Promise<ReadonlyArray<{ id: string; absPath: string }>> => {
	const out: Array<{ id: string; absPath: string }> = [];
	const queue: string[] = [proposalsDirAbs];
	while (queue.length > 0) {
		const dirAbs = queue.shift();
		if (dirAbs === undefined) continue;
		const dirents = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => [],
		);
		for (const dirent of dirents) {
			const childAbs = join(dirAbs, String(dirent.name));
			if (dirent.isDirectory()) {
				// Don't recurse into sibling cache dirs / unrelated
				// sub-trees — keep the scan strictly under the
				// proposalsDir the caller passed.
				if (childAbs.startsWith(`${proposalsDirAbs}/`)) {
					queue.push(childAbs);
				}
				continue;
			}
			if (
				!dirent.isFile() ||
				!dirent.name.endsWith('.md') ||
				dirent.name === 'README.md'
			)
				continue;
			const raw = await new SafeWorkspaceReader(proposalsDirAbs)
				.readText(
					relative(proposalsDirAbs, childAbs).split('\\').join('/'),
				)
				.then((value) => value.content)
				.catch(() => '');
			if (raw.length === 0) continue;
			const block = extractYamlBlock(raw);
			// A `.md` with no frontmatter block at all is not a proposal (an
			// index page, a session summary, etc.) — falling back to the
			// filename as its "id" made every such file collide with every
			// other frontmatter-less file of the same name (5 README.md
			// files across done/, done/audits/, done/resumes/,
			// legacy/closed/, retired/issues/ all reported as duplicate id
			// "README.md", live-reproduced 2026-07-28). Skip it instead of
			// inventing an id for it.
			if (block === null) continue;
			const fm = parseFrontmatterBlock(block);
			const id = typeof fm.id === 'string' ? fm.id : dirent.name;
			out.push({ id, absPath: childAbs });
		}
	}
	return out;
};

export const findProposalFolderDrift = async (
	proposalsDirAbs: string,
	folderPolicy?: IProposalFolderPolicy,
): Promise<readonly IProposalFolderDrift[]> => {
	const files = await scanNewSystemFiles(proposalsDirAbs);
	const drift: IProposalFolderDrift[] = [];
	for (const file of files) {
		const expectedFolder = proposalFolderFor(
			file.status,
			file.kind,
			folderPolicy,
		);
		if (file.folder === expectedFolder) continue;
		drift.push({
			id: file.id,
			path: relative(proposalsDirAbs, file.absPath),
			folder: file.folder || '(root)',
			expectedFolder,
			status: file.status,
		});
	}
	drift.sort((a, b) => a.id.localeCompare(b.id));
	return drift;
};

const moveFile = async (
	gitRunner: IGitRunner,
	fromAbs: string,
	toAbs: string,
): Promise<void> => {
	const targetDir = dirname(toAbs);
	await mkdir(targetDir, { recursive: true });
	const gitkeep = join(targetDir, '.gitkeep');
	if (
		!(await access(gitkeep).then(
			() => true,
			() => false,
		))
	) {
		await writeFileAtomic(gitkeep, '');
	}
	const result = await gitRunner(['mv', fromAbs, toAbs]);
	if (!result.ok) await rename(fromAbs, toAbs);
};

const setStatusLine = setFrontmatterStatus;

/**
 * Moves every new-system file whose actual folder disagrees with what
 * its frontmatter `status` implies. Idempotent: a file already in the
 * right place is a no-op (the comparison is structural, not a write).
 *
 * For terminal `done` statuses, f00042 + f00016 §4.1 require the file
 * to live under `done/<kind-subfolder>/` (`done/feats/`, `done/fixes/`,
 * …). The kind is inferred from the filename prefix, mirroring what
 * `proposal_transition` resolves from the frontmatter at write time —
 * both paths must agree so a freshly closed proposal lands in the same
 * place `reconcileFolders` would move it back to.
 */
export const reconcileFolders = async (
	proposalsDirAbs: string,
	gitRunner: IGitRunner,
	folderPolicy?: IProposalFolderPolicy,
): Promise<{
	moved: ReadonlyArray<{ id: string; from: string; to: string }>;
}> => {
	const files = await scanNewSystemFiles(proposalsDirAbs);
	const moved: Array<{ id: string; from: string; to: string }> = [];
	for (const file of files) {
		const expectedFolder = proposalFolderFor(
			file.status,
			file.kind,
			folderPolicy,
		);
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
 * Renames recognisable new-system proposals to the canonical
 * `<prefix><5 digits>-<kebab-title>.md` shape and places them in the folder
 * implied by their status and kind. Legacy `p...` files are intentionally
 * excluded. Existing targets are reported and never overwritten.
 */
export const reconcileCanonicalProposals = async (
	proposalsDirAbs: string,
	gitRunner: IGitRunner,
	folderPolicy?: IProposalFolderPolicy,
): Promise<{
	moved: ReadonlyArray<{ id: string; from: string; to: string }>;
	errors: readonly string[];
}> => {
	const files = await scanNewSystemFiles(proposalsDirAbs);
	const moved: Array<{ id: string; from: string; to: string }> = [];
	const errors: string[] = [];
	for (const file of files) {
		const canonicalFilename = canonicalProposalFilename(file);
		if (canonicalFilename === null) continue;
		const expectedFolder = proposalFolderFor(
			file.status,
			file.kind,
			folderPolicy,
		);
		const targetAbs = join(
			proposalsDirAbs,
			expectedFolder,
			canonicalFilename,
		);
		if (targetAbs === file.absPath) continue;
		if (
			await access(targetAbs).then(
				() => true,
				() => false,
			)
		) {
			errors.push(
				`canonical proposal collision for ${file.id}: ${relative(proposalsDirAbs, file.absPath)} -> ${relative(proposalsDirAbs, targetAbs)}`,
			);
			continue;
		}
		await moveFile(gitRunner, file.absPath, targetAbs);
		moved.push({
			id: file.id,
			from: relative(proposalsDirAbs, file.absPath),
			to: relative(proposalsDirAbs, targetAbs),
		});
	}
	return { moved, errors };
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
	folderPolicy?: IProposalFolderPolicy,
): Promise<{ resolved: ReadonlyArray<{ id: string }> }> => {
	const files = await scanNewSystemFiles(proposalsDirAbs);
	const statusById = new Map(files.map((f) => [f.id, f.status] as const));
	const resolved: Array<{ id: string }> = [];

	for (const file of files) {
		if (file.status !== 'blocked' || file.blockedBy.length === 0) continue;

		await withFileMutex(file.absPath, async () => {
			const raw = (
				await new SafeWorkspaceReader(proposalsDirAbs).readText(
					relative(proposalsDirAbs, file.absPath)
						.split('\\')
						.join('/'),
				)
			).content;
			const stillBlocked = file.blockedBy.some((token) => {
				if (token.startsWith('self:')) {
					const lint = lintProposalMarkdown({
						path: file.absPath,
						markdown: raw,
					});
					return !lint.ok;
				}
				const dependencyStatus = statusById.get(token);
				return (
					dependencyStatus !== 'review' && dependencyStatus !== 'done'
				);
			});
			if (stillBlocked) return;

			const newAbsPath = join(
				proposalsDirAbs,
				proposalFolderFor('ready', file.kind, folderPolicy),
				file.filename,
			);
			const updated = setStatusLine(raw, 'ready');
			await writeFileAtomic(file.absPath, updated);
			await moveFile(gitRunner, file.absPath, newAbsPath);
			resolved.push({ id: file.id });
		});
	}
	return { resolved };
};

/**
 * Find new-system proposals that declare `proposalId` as a dependency.
 * Their `blocked-by` metadata remains useful after they become ready: it
 * defines the dependent-first review order for the primary proposal.
 */
export const findDependentProposalStatuses = async (
	proposalsDirAbs: string,
	proposalId: string,
): Promise<ReadonlyArray<{ id: string; status: IGlossaryStatus }>> => {
	const files = await scanNewSystemFiles(proposalsDirAbs);
	return files
		.filter((file) => file.blockedBy.includes(proposalId))
		.map((file) => ({ id: file.id, status: file.status }));
};

export async function syncProposalRegistry(
	root: string,
	layout: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	> = DEFAULT_PATH_LAYOUT,
	// Host-specific proposal subfolders (relative to proposalsDir), e.g.
	// `paused/demos`. Injected from ctx.options so delendai's generic
	// proposal model carries no host vocabulary.
	extraFolders: readonly string[] = [],
	// f00016 S5: injectable for tests; defaults to a real `git mv` in `root`.
	gitRunner: IGitRunner = createGitRunner(root),
	folderPolicy?: IProposalFolderPolicy,
): Promise<IProposalRegistrySyncResult> {
	const proposalsDir = resolve(root, layout.proposalsDir);
	const indexPath = resolve(root, layout.proposalIndexFile);
	const containedExtraFolders = extraFolders.map((folder) => {
		const absolute = resolve(proposalsDir, folder);
		const rel = relative(proposalsDir, absolute);
		if (rel === '..' || rel.startsWith(`..${sep}`)) {
			throw new Error(`proposal folder escapes proposalsDir: ${folder}`);
		}
		return absolute;
	});
	// Cross-process critical section: a concurrent sync regenerating
	// the same index must not lose entries (read FS → write index).
	return withFileMutex(indexPath, async () => {
		await reconcileAndArchiveCompletedRootProposals(proposalsDir);
		const canonicalReconciliation = await reconcileCanonicalProposals(
			proposalsDir,
			gitRunner,
			folderPolicy,
		);
		// f00016 S5: new-system files only (isGlossaryStatus gates it) — move
		// anything whose folder disagrees with its status, then auto-resolve
		// `blocked` → `ready` where every blocker has cleared. Runs before
		// the scan below so the index reflects the post-reconciliation tree.
		await reconcileFolders(proposalsDir, gitRunner, folderPolicy);
		await reconcileBlocked(proposalsDir, gitRunner, folderPolicy);
		const unresolvedFolderDrift = await findProposalFolderDrift(
			proposalsDir,
			folderPolicy,
		);
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
			...Object.values(KIND_TO_DONE_SUBFOLDER).map((sub) =>
				join(proposalsDir, 'done', sub),
			),
			...Object.values(KIND_TO_DONE_SUBFOLDER).map((sub) =>
				join(proposalsDir, 'ready', sub),
			),
			...Object.values(KIND_TO_DONE_SUBFOLDER).map((sub) =>
				join(proposalsDir, 'review', sub),
			),
			...Object.values(KIND_TO_DONE_SUBFOLDER).map((sub) =>
				join(proposalsDir, 'in-progress', sub),
			),
			// f00076 S1: archive sub-folders under `legacy/closed/<kind>/`
			// mirror the `done/<kind>/` layout so reaped proposals stay
			// indexed (with `archived: true`) without living in the active
			// `done/` tree. `reconcileFolders` will not touch these because
			// an archived proposal's frontmatter still says `status: done`,
			// and the reconciler never moves *into* `legacy/closed/` — only
			// out of it (the reaper script in S2 handles moves into it).
			...Object.values(KIND_TO_DONE_SUBFOLDER)
				.filter((sub): sub is string => sub !== undefined)
				.map((sub) => join(proposalsDir, 'legacy', 'closed', sub)),
			...containedExtraFolders,
		];
		const subtrees: ReadonlyArray<{ absolute: string }> = [
			...new Set(subtreeAbsolutes),
		].map((absolute) => ({ absolute }));
		const entries: IProposalEntry[] = [];
		const warnings: string[] = [];
		warnings.push(...canonicalReconciliation.errors);
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
		// a00069 S3 / F7 — surface twin files that share an id (e.g. a
		// half-applied transition left both ready/ and done/feats/).
		// Detection only: we still write the index so agents can see both
		// paths, but the error list is non-empty so lint/CI can fail.
		const duplicates = await findDuplicateProposalIds(proposalsDir);
		for (const drift of unresolvedFolderDrift) {
			warnings.push(
				`folder drift: ${drift.id} at ${drift.path} is in ${drift.folder} but status ${drift.status} expects ${drift.expectedFolder}`,
			);
		}
		for (const dup of duplicates) {
			warnings.push(
				`duplicate proposal id "${dup.id}" on disk: ${dup.paths.join(' and ')}`,
			);
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
			const current = (
				await new SafeWorkspaceReader(dirname(indexPath)).readText(
					basename(indexPath),
				)
			).content;
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

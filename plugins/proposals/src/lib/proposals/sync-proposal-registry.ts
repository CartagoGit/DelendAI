import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@cartago-git/mcp-core/public';

import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
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

type IProposalStatus =
	| 'pending'
	| 'in_progress'
	| 'ready'
	| 'blocked'
	| 'done'
	| 'retired'
	| 'paused';

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
]);

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
			/^\*\*([A-Za-z_][A-Za-z0-9_]*)\*\*\s*:\s*(.*?)\s*$/
		);
		if (!m) continue;
		apply(m[1] ?? '', (m[2] ?? '').replace(/^['"]|['"]$/g, '').trim());
	}
	return out;
};

const buildId = (filename: string): string => filename.replace(/\.md$/, '');

const extractExtras = (
	parsed: Record<string, unknown>
): IProposalExtras | undefined => {
	const rawBudget = parsed['budget'];
	const budget =
		rawBudget !== null &&
		typeof rawBudget === 'object' &&
		!Array.isArray(rawBudget)
			? (rawBudget as IProposalBudget)
			: undefined;
	const rawAC = parsed['acceptanceCriteria'];
	const acceptanceCriteria = Array.isArray(rawAC)
		? (rawAC as IAcceptanceCriterion[])
		: undefined;
	const rawOwnership = parsed['ownership'];
	const ownership = Array.isArray(rawOwnership)
		? rawOwnership.filter((v): v is string => typeof v === 'string')
		: undefined;
	const rawReserved = parsed['reservedFiles'];
	const reservedFiles = Array.isArray(rawReserved)
		? rawReserved.filter((v): v is string => typeof v === 'string')
		: undefined;
	const rawAgentClosureReportPath = parsed['agentClosureReportPath'];
	const agentClosureReportPath =
		typeof rawAgentClosureReportPath === 'string'
			? rawAgentClosureReportPath
			: undefined;
	const rawSwarmBudget = parsed['swarmBudget'];
	const swarmBudget = isProposalSwarmBudget(rawSwarmBudget)
		? (rawSwarmBudget as ISwarmBudget)
		: undefined;
	const rawContinuityPolicy = parsed['continuityPolicy'];
	const continuityPolicy = isProposalContinuityPolicy(rawContinuityPolicy)
		? (rawContinuityPolicy as IContinuityPolicy)
		: undefined;
	const rawTaskQueue = parsed['taskQueue'];
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
	indexPath: string
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
		file: relative(dirname(indexPath), absFilepath),
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
	indexPath: string
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
		const { entry, warning } = await readProposalFile(
			join(absDir, name),
			indexPath
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

const reconcileAndArchiveCompletedRootProposals = async (
	proposalsDir: string
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

		await writeFile(sourcePath, reconciled, 'utf8');
		await mkdir(historicalDir, { recursive: true });
		await rename(sourcePath, join(historicalDir, name));
	}
};

export async function syncProposalRegistry(
	root: string,
	layout: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	> = DEFAULT_PATH_LAYOUT,
	// Host-specific proposal subfolders (relative to proposalsDir), e.g.
	// `paused/demos`. Injected from ctx.options so mcp-core's generic
	// proposal model carries no host vocabulary. [M5]
	extraFolders: readonly string[] = []
): Promise<IProposalRegistrySyncResult> {
	const proposalsDir = resolve(root, layout.proposalsDir);
	const indexPath = resolve(root, layout.proposalIndexFile);
	// Cross-process critical section: a concurrent sync regenerating
	// the same index must not lose entries (read FS → write index).
	return withFileMutex(indexPath, async () => {
		await reconcileAndArchiveCompletedRootProposals(proposalsDir);
		// Generic proposal-model subtrees only. Host folders (like `paused/demos`)
		// arrive via `extraFolders`.
		const subtrees: ReadonlyArray<{ absolute: string }> = [
			{ absolute: proposalsDir },
			{ absolute: join(proposalsDir, 'audits') },
			{ absolute: join(proposalsDir, 'fixes') },
			{ absolute: join(proposalsDir, 'historical') },
			{ absolute: join(proposalsDir, 'paused') },
			{ absolute: join(proposalsDir, 'revised') },
			{ absolute: join(proposalsDir, 'revised', 'audits') },
			{ absolute: join(proposalsDir, 'revised', 'retired') },
			...extraFolders.map((folder) => ({
				absolute: join(proposalsDir, folder),
			})),
		];
		const entries: IProposalEntry[] = [];
		const warnings: string[] = [];
		for (const subtree of subtrees) {
			const result = await scanSubtree(subtree.absolute, indexPath);
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
		const nextText = `${JSON.stringify(index, null, '\t')}\n`;
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

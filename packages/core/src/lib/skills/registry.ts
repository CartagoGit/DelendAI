import { readFile, readdir, stat as statFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from '../shared/atomic-write';

const SKILL_FILE = 'SKILL.md';
const CACHE_TTL_MS = 60 * 60 * 1000;

type TSkillSource = 'plugin' | 'core' | 'web';

interface IStatLike {
	readonly isFile: () => boolean;
}

interface ICacheStatLike extends IStatLike {
	readonly mtimeMs: number;
}

interface ISkillCandidate {
	readonly source: TSkillSource;
	readonly sourcePath: string;
}

export interface ILoadSkillDeps {
	readonly workspaceRoot: string;
	readonly fsRead?: (absPath: string) => Promise<string>;
	readonly stat?: (absPath: string) => Promise<IStatLike | null>;
}

export interface ILoadedSkill {
	readonly id: string;
	readonly body: string;
	readonly source: TSkillSource;
	readonly sourcePath: string;
}

export interface ILoadedSkillCached extends ILoadedSkill {
	readonly cachedAt: string;
}

export interface ILoadSkillCachedDeps extends ILoadSkillDeps {
	readonly cacheStat?: (absPath: string) => Promise<ICacheStatLike | null>;
	readonly listDir?: (absPath: string) => Promise<readonly string[]>;
	readonly now?: () => number;
	readonly writeAtomic?: (absPath: string, content: string) => Promise<void>;
}

const defaultFsRead = async (absPath: string): Promise<string> =>
	readFile(absPath, 'utf8');

const defaultStat = async (absPath: string): Promise<ICacheStatLike | null> => {
	try {
		return await statFile(absPath);
	} catch {
		return null;
	}
};

const defaultListDir = async (absPath: string): Promise<readonly string[]> => {
	try {
		const entries = await readdir(absPath, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort((left, right) => left.localeCompare(right));
	} catch {
		return [];
	}
};

const cachePathFor = (workspaceRoot: string, id: string): string =>
	join(workspaceRoot, '.cache', 'delendai', 'skills', `${id}.json`);

const isCacheFresh = (
	cacheStat: ICacheStatLike | null,
	now: number,
): cacheStat is ICacheStatLike =>
	cacheStat?.isFile() === true && now - cacheStat.mtimeMs < CACHE_TTL_MS;

const isSkillSource = (value: unknown): value is TSkillSource =>
	value === 'plugin' || value === 'core' || value === 'web';

const parseCachedSkill = (
	id: string,
	raw: string,
): ILoadedSkillCached | null => {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (
			parsed.id !== id ||
			typeof parsed.body !== 'string' ||
			!isSkillSource(parsed.source) ||
			typeof parsed.sourcePath !== 'string' ||
			typeof parsed.cachedAt !== 'string'
		) {
			return null;
		}
		return {
			id,
			body: parsed.body,
			source: parsed.source,
			sourcePath: parsed.sourcePath,
			cachedAt: parsed.cachedAt,
		};
	} catch {
		return null;
	}
};

const pluginSkillCandidates = async (
	workspaceRoot: string,
	id: string,
	listDirFn: (absPath: string) => Promise<readonly string[]>,
): Promise<readonly ISkillCandidate[]> => {
	const pluginNames = await listDirFn(join(workspaceRoot, 'plugins'));
	return pluginNames.map((pluginName) => ({
		source: 'plugin' as const,
		sourcePath: join(
			workspaceRoot,
			'plugins',
			pluginName,
			'skills',
			id,
			SKILL_FILE,
		),
	}));
};

const skillCandidates = async (
	workspaceRoot: string,
	id: string,
	listDirFn: (absPath: string) => Promise<readonly string[]>,
): Promise<readonly ISkillCandidate[]> => [
	...(await pluginSkillCandidates(workspaceRoot, id, listDirFn)),
	{
		source: 'core' as const,
		sourcePath: join(
			workspaceRoot,
			'packages',
			'core',
			'skills',
			id,
			SKILL_FILE,
		),
	},
	{
		source: 'web' as const,
		sourcePath: join(
			workspaceRoot,
			'apps',
			'web',
			'skills',
			id,
			SKILL_FILE,
		),
	},
];

export const loadSkill = async (
	id: string,
	deps: ILoadSkillDeps,
): Promise<ILoadedSkill | null> => {
	const fsRead = deps.fsRead ?? defaultFsRead;
	const stat = deps.stat ?? defaultStat;
	const candidates = await skillCandidates(
		deps.workspaceRoot,
		id,
		defaultListDir,
	);
	for (const candidate of candidates) {
		const fileStat = await stat(candidate.sourcePath);
		if (fileStat === null || !fileStat.isFile()) continue;
		try {
			const body = await fsRead(candidate.sourcePath);
			return {
				id,
				body,
				source: candidate.source,
				sourcePath: candidate.sourcePath,
			};
		} catch {}
	}
	return null;
};

export const loadSkillCached = async (
	id: string,
	deps: ILoadSkillCachedDeps,
): Promise<ILoadedSkillCached | null> => {
	const now = deps.now ?? Date.now;
	const fsRead = deps.fsRead ?? defaultFsRead;
	const cacheStat = deps.cacheStat ?? defaultStat;
	const writeAtomic = deps.writeAtomic ?? writeFileAtomic;
	const cachePath = cachePathFor(deps.workspaceRoot, id);
	const cacheFileStat = await cacheStat(cachePath);

	if (isCacheFresh(cacheFileStat, now())) {
		const cached = parseCachedSkill(id, await fsRead(cachePath));
		if (cached !== null) return cached;
	}

	const loaded = await loadSkill(id, {
		workspaceRoot: deps.workspaceRoot,
		...(deps.fsRead !== undefined ? { fsRead: deps.fsRead } : {}),
		...(deps.stat !== undefined ? { stat: deps.stat } : {}),
	});
	if (loaded === null) return null;

	const cached: ILoadedSkillCached = {
		...loaded,
		cachedAt: new Date(now()).toISOString(),
	};
	try {
		await writeAtomic(cachePath, JSON.stringify(cached));
	} catch {
		// Best-effort cache write: a read miss should not fail the skill tool.
	}
	return cached;
};

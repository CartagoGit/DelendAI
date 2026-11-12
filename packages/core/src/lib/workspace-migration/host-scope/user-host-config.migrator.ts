/**
 * user-host-config.migrator.ts — a server entry an older delendai left in a
 * host's user-level config, under the retired name, takes the current one.
 *
 * An entry is delendai's own when its server name is the retired one. An
 * entry under another name whose body mentions the retired product is a
 * question: it is left byte for byte and reported. Before a file's first
 * byte changes a timestamped copy of it is written; when that copy cannot be
 * written the file is not edited.
 */
import type { ILegacyResidueIO } from '../../contracts/interfaces/legacy-residue.interface';
import type {
	IResolvedUserConfigFile,
	IUserHostConfigMigrationOptions,
	IUserHostConfigChange,
	IUserHostConfigFailure,
	IUserHostConfigQuestion,
	IUserHostConfigReport,
} from '../../contracts/interfaces/user-host-config.interface';
import { applyJsoncEdits, parseJsonc } from '../../config/jsonc-document';
import type { IJsoncEdit } from '../../config/jsonc-document';
import { isRecord } from '../../shared/is-record';
import {
	rewriteIdentityInString,
	stringHasLegacyIdentity,
} from '../migrators/identity-renames';

/** The maps a JSON host config declares its servers in. */
const SERVER_MAPS: readonly (readonly string[])[] = [
	['mcpServers'],
	['servers'],
	['mcp', 'servers'],
];

interface IFileOutcome {
	readonly next: string | undefined;
	readonly entries: readonly string[];
	readonly questions: readonly string[];
}

const mapAt = (
	root: Record<string, unknown>,
	path: readonly string[],
): Record<string, unknown> | undefined => {
	let node: unknown = root;
	for (const key of path) {
		if (!isRecord(node)) return undefined;
		node = node[key];
	}
	return isRecord(node) ? node : undefined;
};

const migrateJson = (text: string): IFileOutcome => {
	const parsed = parseJsonc(text);
	const first = parsed.errors[0];
	if (first !== undefined) throw new Error(first.message);
	if (!isRecord(parsed.value))
		throw new Error('top-level value is not an object');
	const edits: IJsoncEdit[] = [];
	const entries: string[] = [];
	const questions: string[] = [];
	for (const path of SERVER_MAPS) {
		const servers = mapAt(parsed.value, path);
		if (servers === undefined) continue;
		for (const [name, entry] of Object.entries(servers)) {
			if (stringHasLegacyIdentity(name)) {
				const renamed = rewriteIdentityInString(name);
				edits.push({ path: [...path, name], value: undefined });
				if (!Object.hasOwn(servers, renamed)) {
					edits.push({
						path: [...path, renamed],
						value: JSON.parse(
							rewriteIdentityInString(JSON.stringify(entry)),
						),
					});
				}
				entries.push(name);
			} else if (stringHasLegacyIdentity(JSON.stringify(entry))) {
				questions.push(name);
			}
		}
	}
	return {
		next: edits.length === 0 ? undefined : applyJsoncEdits(text, edits),
		entries,
		questions,
	};
};

const TABLE = /^\s*\[\s*mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_-]+))/u;
const ANY_TABLE = /^\s*\[/u;

/** Each `mcp_servers` table's lines, keyed by its server's name. */
const migrateToml = (text: string): IFileOutcome => {
	const lines = text.split('\n');
	const owner: (string | undefined)[] = [];
	let current: string | undefined;
	for (const line of lines) {
		if (ANY_TABLE.test(line)) {
			const match = TABLE.exec(line);
			current = match === null ? undefined : (match[1] ?? match[2]);
		}
		owner.push(current);
	}
	const legacyBody = new Set<string>();
	lines.forEach((line, index) => {
		const name = owner[index];
		if (name !== undefined && stringHasLegacyIdentity(line))
			legacyBody.add(name);
	});
	const own = [...legacyBody].filter(stringHasLegacyIdentity);
	const questions = [...legacyBody].filter((name) => !own.includes(name));
	if (own.length === 0) return { next: undefined, entries: [], questions };
	const next = lines
		.map((line, index) => {
			const name = owner[index];
			return name !== undefined && own.includes(name)
				? rewriteIdentityInString(line)
				: line;
		})
		.join('\n');
	return { next, entries: own, questions };
};

const stamp = (now: Date): string => now.toISOString().replace(/[:.]/gu, '-');

const backupPath = (dir: string, file: string, now: Date): string =>
	`${dir}/${file.replace(/[\\/:]+/gu, '_')}.${stamp(now)}.bak`;

const migrateFile = async (
	file: IResolvedUserConfigFile,
	options: IUserHostConfigMigrationOptions,
): Promise<{
	change?: IUserHostConfigChange;
	questions: IUserHostConfigQuestion[];
}> => {
	const text = await options.io.readText(file.path);
	if (text === undefined) return { questions: [] };
	const outcome =
		file.format === 'toml' ? migrateToml(text) : migrateJson(text);
	const questions = outcome.questions.map((entry) => ({
		hostId: file.hostId,
		file: file.path,
		entry,
	}));
	if (outcome.next === undefined || outcome.next === text)
		return { questions };
	const backup = backupPath(options.backupDir, file.path, options.now());
	// A copy that cannot be written stops the edit: the throw leaves the file alone.
	await options.io.writeText(backup, text);
	await options.io.writeText(file.path, outcome.next);
	return {
		change: {
			hostId: file.hostId,
			file: file.path,
			backup,
			entries: outcome.entries,
		},
		questions,
	};
};

/** Migrates every resolved user-level file; one unreadable file never stops the rest. */
export const migrateUserHostConfigs = async (
	options: IUserHostConfigMigrationOptions,
): Promise<IUserHostConfigReport> => {
	const changes: IUserHostConfigChange[] = [];
	const questions: IUserHostConfigQuestion[] = [];
	const failures: IUserHostConfigFailure[] = [];
	for (const file of options.resolved.files) {
		try {
			const result = await migrateFile(file, options);
			if (result.change !== undefined) changes.push(result.change);
			questions.push(...result.questions);
		} catch (error) {
			failures.push({
				file: file.path,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return {
		changes,
		questions,
		failures,
		notCovered: options.resolved.notCovered,
	};
};

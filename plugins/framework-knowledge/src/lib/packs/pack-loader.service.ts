/**
 * Knowledge packs: a framework's rules as data the project owns.
 *
 * A pack is `.delendai/knowledge/<framework>.json`. Frameworks are files
 * here, never branches in code, and nothing in this module reaches the
 * network: a rule exists because somebody wrote it down with the source
 * and the date it was read from.
 */
import { SafeWorkspaceReader } from '@delendai/core/runtime';

import { KNOWLEDGE_PACK_DIR } from '../contracts/constants/knowledge-pack.constant';
import type {
	IKnowledgePack,
	IKnowledgePackPattern,
	IKnowledgePackSelection,
} from '../contracts/interfaces/knowledge-pack.interface';
import type { IKnowledgeRecord } from '../contracts/interfaces/knowledge-record.interface';
import { createKnowledgeRecord } from '../knowledge/knowledge-record';
import { versionInRange } from './version-range.helper';

const FRAMEWORK_FILE = /^[a-z][a-z0-9-]*$/u;

/** The pack file of a framework, relative to the workspace root. */
export const packFileOf = (frameworkId: string): string | undefined =>
	FRAMEWORK_FILE.test(frameworkId)
		? `${KNOWLEDGE_PACK_DIR}/${frameworkId}.json`
		: undefined;

const isPattern = (value: unknown): value is IKnowledgePackPattern => {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return ['directory', 'suffix', 'marker'].every(
		(key) => typeof candidate[key] === 'string' && candidate[key] !== '',
	);
};

/** The rules of `pack` that apply to `version`, validated one by one. */
export const selectRules = (
	pack: IKnowledgePack,
	version: string,
	packFile: string,
): IKnowledgePackSelection => {
	const records: IKnowledgeRecord[] = [];
	const patterns: Record<string, IKnowledgePackPattern> = {};
	const rejected: string[] = [];
	for (const rule of pack.rules) {
		if (typeof rule.appliesTo !== 'string') {
			rejected.push(`${String(rule.id)}: appliesTo is not a range`);
			continue;
		}
		if (!versionInRange(version, rule.appliesTo)) continue;
		const created = createKnowledgeRecord({
			id: rule.id,
			frameworkId: pack.framework,
			appliesToVersion: rule.appliesTo,
			topic: rule.topic,
			statement: rule.statement,
			force: rule.force,
			evidence: { source: rule.source, retrievedAt: rule.retrievedAt },
		});
		if (!created.ok) {
			rejected.push(`${String(rule.id)}: ${created.reason}`);
			continue;
		}
		records.push(created.record);
		if (isPattern(rule.pattern)) patterns[rule.id] = rule.pattern;
	}
	return { packFile, records, patterns, rejected };
};

/**
 * Read a framework's pack and select what applies to `version`.
 * `undefined` when the project has no pack for it, or it does not parse.
 */
export const loadPack = async (
	workspaceRootAbs: string,
	frameworkId: string,
	version: string,
): Promise<IKnowledgePackSelection | undefined> => {
	const packFile = packFileOf(frameworkId);
	if (packFile === undefined) return undefined;
	let text: string;
	try {
		text = (
			await new SafeWorkspaceReader(workspaceRootAbs).readText(packFile)
		).content;
	} catch {
		return undefined;
	}
	try {
		const parsed = JSON.parse(text) as IKnowledgePack;
		if (parsed.framework !== frameworkId || !Array.isArray(parsed.rules)) {
			return undefined;
		}
		return selectRules(parsed, version, packFile);
	} catch {
		return undefined;
	}
};

// effect-boundary-authorized: Owns the on-disk knowledge cache under the delendai cache directory; every read and write of it goes through this module.
// knowledge-cache.service.ts — a cache of framework knowledge keyed by the
// resolved framework version.
//
// Summary and evidence live in separate files so the common question
// ("what does this version say about X") reads a few hundred bytes and
// never the evidence. Nothing here touches the network: a hit is a file
// read, so the cache answers offline. A set written for one lockfile
// entry is reported `stale` when the entry changes.

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import z from 'zod';

import { SafeWorkspaceReader } from '@delendai/core/public';

import {
	EVIDENCE_FILE_NAME,
	KNOWLEDGE_CACHE_DIR,
	META_FILE_NAME,
	SUMMARY_FILE_NAME,
} from '../contracts/constants/knowledge-cache.constant';
import type {
	IKnowledgeCacheKey,
	IKnowledgeEvidenceResult,
	IKnowledgeSummaryResult,
	IKnowledgeWriteInput,
} from '../contracts/interfaces/knowledge-cache.interface';
import { FORCE_VALUES } from '../contracts/constants/knowledge-force.constant';

const SummaryFileSchema = z.object({
	entries: z.array(
		z.object({
			id: z.string(),
			topic: z.string(),
			statement: z.string(),
			force: z.enum(FORCE_VALUES as [string, ...string[]]),
			appliesToVersion: z.string(),
		}),
	),
});

const EvidenceFileSchema = z.record(
	z.string(),
	z.object({
		statement: z.string(),
		evidence: z.object({ source: z.string(), retrievedAt: z.string() }),
	}),
);

const MetaFileSchema = z.object({ lockEntry: z.string() });

/** Framework ids and versions become directory names: nothing else is allowed in. */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u;

const isSafeKey = (key: IKnowledgeCacheKey): boolean =>
	SAFE_SEGMENT.test(key.frameworkId) &&
	SAFE_SEGMENT.test(key.version) &&
	!key.version.includes('..');

/** `<cacheRoot>/knowledge/<framework>/<version>`, or `undefined` for an unsafe key. */
export const knowledgeDir = (
	cacheRootAbs: string,
	key: IKnowledgeCacheKey,
): string | undefined =>
	isSafeKey(key)
		? join(cacheRootAbs, KNOWLEDGE_CACHE_DIR, key.frameworkId, key.version)
		: undefined;

/** Parse one JSON file against a schema; `undefined` when absent, `null` when unusable. */
const readJsonFile = async <T>(
	cacheRootAbs: string,
	path: string,
	schema: z.ZodType<T>,
): Promise<T | undefined | null> => {
	let text: string;
	try {
		text = (await new SafeWorkspaceReader(cacheRootAbs).readText(path))
			.content;
	} catch {
		return undefined;
	}
	try {
		const parsed = schema.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
};

/** Write through a temporary name so a reader never sees half a file. */
const writeFileAtomic = async (path: string, text: string): Promise<void> => {
	const tmp = `${path}.${process.pid}.tmp`;
	await writeFile(tmp, text, 'utf8');
	await rename(tmp, path);
};

/**
 * Store one record set. Summary, evidence and the lockfile entry go to
 * separate files; the meta file is written last, so a set is only
 * visible once everything it points at exists.
 */
export const writeKnowledge = async (
	cacheRootAbs: string,
	input: IKnowledgeWriteInput,
): Promise<{ readonly ok: boolean; readonly reason?: string }> => {
	const dir = knowledgeDir(cacheRootAbs, input.key);
	if (dir === undefined) {
		return { ok: false, reason: 'unsafe cache key' };
	}
	await mkdir(dir, { recursive: true });
	const entries = input.records.map((record) => ({
		id: record.id,
		topic: record.topic,
		statement: record.statement,
		force: record.force,
		appliesToVersion: record.appliesToVersion,
	}));
	const evidence = Object.fromEntries(
		input.records.map((record) => [
			record.id,
			{ statement: record.statement, evidence: record.evidence },
		]),
	);
	await writeFileAtomic(
		join(dir, SUMMARY_FILE_NAME),
		JSON.stringify({ entries }),
	);
	await writeFileAtomic(
		join(dir, EVIDENCE_FILE_NAME),
		JSON.stringify(evidence),
	);
	await writeFileAtomic(
		join(dir, META_FILE_NAME),
		JSON.stringify({ lockEntry: input.lockEntry }),
	);
	return { ok: true };
};

/** `true` only when meta exists and names exactly this lockfile entry. */
const metaState = async (
	cacheRootAbs: string,
	dir: string,
	lockEntry: string,
): Promise<'fresh' | 'absent' | 'stale' | 'corrupt'> => {
	const meta = await readJsonFile(
		cacheRootAbs,
		join(dir, META_FILE_NAME),
		MetaFileSchema,
	);
	if (meta === undefined) return 'absent';
	if (meta === null) return 'corrupt';
	return meta.lockEntry === lockEntry ? 'fresh' : 'stale';
};

/** Read the summary, optionally narrowed to one topic. Never opens the evidence file. */
export const readSummary = async (
	cacheRootAbs: string,
	key: IKnowledgeCacheKey,
	lockEntry: string,
	topic?: string,
): Promise<IKnowledgeSummaryResult> => {
	const dir = knowledgeDir(cacheRootAbs, key);
	if (dir === undefined) return { hit: false, reason: 'absent' };
	const state = await metaState(cacheRootAbs, dir, lockEntry);
	if (state !== 'fresh') return { hit: false, reason: state };
	const summary = await readJsonFile(
		cacheRootAbs,
		join(dir, SUMMARY_FILE_NAME),
		SummaryFileSchema,
	);
	if (summary === undefined) return { hit: false, reason: 'absent' };
	if (summary === null) return { hit: false, reason: 'corrupt' };
	const entries = summary.entries
		.filter((entry) => topic === undefined || entry.topic === topic)
		.map((entry) => ({
			...entry,
			force: entry.force as (typeof FORCE_VALUES)[number],
		}));
	return { hit: true, entries };
};

/** Read the evidence behind one rule. */
export const readEvidence = async (
	cacheRootAbs: string,
	key: IKnowledgeCacheKey,
	lockEntry: string,
	ruleId: string,
): Promise<IKnowledgeEvidenceResult> => {
	const dir = knowledgeDir(cacheRootAbs, key);
	if (dir === undefined) return { hit: false, reason: 'absent' };
	const state = await metaState(cacheRootAbs, dir, lockEntry);
	if (state !== 'fresh') return { hit: false, reason: state };
	const evidence = await readJsonFile(
		cacheRootAbs,
		join(dir, EVIDENCE_FILE_NAME),
		EvidenceFileSchema,
	);
	if (evidence === undefined) return { hit: false, reason: 'absent' };
	if (evidence === null) return { hit: false, reason: 'corrupt' };
	const found = Object.hasOwn(evidence, ruleId)
		? evidence[ruleId]
		: undefined;
	if (found === undefined) return { hit: false, reason: 'unknown-rule' };
	return {
		hit: true,
		ruleId,
		statement: found.statement,
		evidence: found.evidence,
	};
};

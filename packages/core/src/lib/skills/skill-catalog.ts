/**
 * skill-catalog.ts — the single source of truth that turns the version-pinned
 * skill manifest (resolved via `skill-paths.ts`) into the COMPACT, actionable
 * catalog a host advertises to any AI, plus an on-demand body loader (f00065
 * S2/slice-B).
 *
 * Token discipline (the whole point of this slice):
 *   - At startup we read each SKILL.md ONCE only to extract its frontmatter
 *     `description` — a single authored line of "what this skill is + when to
 *     use it". We never keep the body in memory or push it to context by
 *     default.
 *   - The compact catalog (id, description, appliesTo, tags, version) is what
 *     the AI sees automatically. It tells the AI the skill EXISTS and WHEN to
 *     reach for it, for a few tokens each.
 *   - The full SKILL.md body is loaded only on demand, through the `skill`
 *     tool (`loadBody`), the same "fetch only what you need" pattern as the
 *     `knowledge` tool. The AI pays for a body only when it is about to use it.
 *
 * SOLID: this module is the one place that knows how to read skills off disk
 * and shape them for discovery. `assemble.ts` (catalog) and the `skill` tool
 * both consume the object this returns; neither re-reads the manifest or
 * re-parses frontmatter.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import type { ISkillBundle } from './load-skills';
import type { ISkillDescriptor } from './sources/types';

/** A compact, actionable catalog row. No body — that is loaded on demand. */
export interface ISkillCatalogEntry {
	readonly id: string;
	readonly version: string;
	readonly minCoreVersion: string;
	/** One authored line: what the skill is + when to use it (from frontmatter). */
	readonly description: string;
	readonly appliesTo: readonly string[];
	readonly tags: readonly string[];
	readonly bodyPath: string;
	/** Portable provenance metadata; absent only when the body could not be read. */
	readonly source?: ISkillDescriptor['source'];
	readonly owner?: string;
	readonly hash?: string;
	readonly estimatedBodyTokens?: number;
}

/** The skill catalog plus an on-demand body loader. */
export interface ISkillCatalog {
	readonly entries: readonly ISkillCatalogEntry[];
	/**
	 * Load the full SKILL.md body for `id`, or `undefined` if no such skill is
	 * advertised. Reads the file lazily — callers invoke this only when the AI
	 * is about to use the skill.
	 */
	readonly loadBody: (id: string) => Promise<string | undefined>;
}

/** Minimal async file reader, injected so this module stays testable. */
export type SkillFileReader = (absPath: string) => Promise<string>;

/**
 * Extract a compact one-line description from a SKILL.md, preferring the
 * frontmatter `description:` (which is authored as "what + when to use"), and
 * falling back to the first prose paragraph, then to `Skill <id>`.
 *
 * Folded YAML (`description: >` / `|` and continuation lines) and single-line
 * forms are both handled; the result is whitespace-collapsed to one line so a
 * single skill costs a predictable handful of tokens in the catalog.
 */
export const extractSkillDescription = (
	skillId: string,
	body: string,
): string => {
	const fm = splitFrontmatter(body);
	if (fm !== undefined) {
		const yaml = fm.yaml;
		const lines = yaml.split('\n');
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i] ?? '';
			const m = /^description:\s*(.*)$/u.exec(line);
			if (!m) continue;
			const inline = (m[1] ?? '').trim();
			if (inline.length > 0 && inline !== '>' && inline !== '|') {
				return collapse(inline.replace(/^['"]|['"]$/gu, ''));
			}
			// Folded/literal block: gather subsequent more-indented lines.
			const block: string[] = [];
			for (let j = i + 1; j < lines.length; j += 1) {
				const next = lines[j] ?? '';
				if (next.trim().length === 0) {
					block.push('');
					continue;
				}
				if (!/^\s/u.test(next)) break;
				block.push(next.trim());
			}
			const folded = collapse(block.join(' '));
			if (folded.length > 0) return folded;
		}
		const prose = firstParagraph(fm.rest);
		if (prose) return prose;
	}
	const prose = firstParagraph(body);
	return prose ?? `Skill ${skillId}`;
};

const splitFrontmatter = (
	body: string,
): { readonly yaml: string; readonly rest: string } | undefined => {
	const opening = '---\n';
	if (!body.startsWith(opening)) return undefined;
	const closingIndex = body.indexOf('\n---', opening.length);
	if (closingIndex === -1) return undefined;
	const afterClosing = closingIndex + '\n---'.length;
	const restStart =
		body[afterClosing] === '\n' ? afterClosing + 1 : afterClosing;
	return {
		yaml: body.slice(opening.length, closingIndex),
		rest: body.slice(restStart),
	};
};

const collapse = (s: string): string => s.replace(/\s+/gu, ' ').trim();

const firstParagraph = (text: string): string | undefined => {
	const para = text
		.replace(/^#+\s.*$/gmu, '')
		.split(/\n\s*\n/u)
		.map((p) => collapse(p))
		.find((p) => p.length > 0);
	return para && para.length > 0 ? para : undefined;
};

/**
 * Build the compact skill catalog from resolved manifest bundles. Reads each
 * SKILL.md ONCE to extract its description; bodies are NOT retained — `loadBody`
 * re-reads on demand so nothing large lingers in memory or context.
 *
 * `workspace` is the absolute workspace root; `bundle.bodyPath` is
 * workspace-relative (owner-relative, e.g. `packages/core/skills/.../SKILL.md`).
 */
export const buildSkillCatalog = async (
	workspace: string,
	bundles: readonly ISkillBundle[],
	readFile: SkillFileReader,
): Promise<ISkillCatalog> => {
	const absFor = (bodyPath: string): string =>
		join(workspace, ...bodyPath.split('/'));

	const entries: ISkillCatalogEntry[] = [];
	for (const bundle of bundles) {
		let description: string;
		let bodyMetadata:
			| Pick<
					ISkillCatalogEntry,
					'source' | 'owner' | 'hash' | 'estimatedBodyTokens'
			  >
			| undefined;
		try {
			const body = await readFile(absFor(bundle.bodyPath));
			description = extractSkillDescription(bundle.id, body);
			const primaryOwner = bundle.appliesTo[0] ?? '@delendai/core';
			const owner =
				primaryOwner === '@delendai/*' ||
				primaryOwner === '@delendai/core'
					? '@delendai/core'
					: primaryOwner;
			const source: ISkillDescriptor['source'] =
				bundle.bodyPath.startsWith('.delendai/')
					? 'workspace'
					: owner === '@delendai/core'
						? 'core'
						: 'plugin';
			bodyMetadata = {
				source,
				owner,
				hash: `sha256:${createHash('sha256').update(body).digest('hex')}`,
				estimatedBodyTokens: Math.ceil(
					Buffer.byteLength(body, 'utf8') / 4,
				),
			};
		} catch {
			// A missing body is not fatal: still advertise the skill so the AI
			// knows it exists, with a minimal description.
			description = `Skill ${bundle.id}`;
		}
		entries.push({
			id: bundle.id,
			version: bundle.version,
			minCoreVersion: bundle.minCoreVersion,
			description,
			appliesTo: [...bundle.appliesTo],
			tags: [...bundle.tags],
			bodyPath: bundle.bodyPath,
			...(bodyMetadata ?? {}),
		});
	}

	const byId = new Map(entries.map((e) => [e.id, e]));
	const loadBody = async (id: string): Promise<string | undefined> => {
		const entry = byId.get(id);
		if (entry === undefined) return undefined;
		try {
			return await readFile(absFor(entry.bodyPath));
		} catch {
			return undefined;
		}
	};

	return { entries, loadBody };
};

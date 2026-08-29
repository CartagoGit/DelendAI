/**
 * check-links.ts — markdown link + anchor integrity, pure over the parsed
 * docs. Flags relative links whose target file/dir does not exist
 * (broken-link), `#anchor` fragments with no matching heading (broken-anchor),
 * and empty `[text]()` targets (empty-link). External (http/mailto/…) links
 * are never fetched. Deterministic; no I/O.
 */
import { posix } from 'node:path';

import type { IFinding } from '@mcp-vertex/core/public';

import type {
	IExtractedLink,
	IParsedTarget,
	ISourceDoc,
} from '../contracts/interfaces/link-check.interface';

/** A `[text](target)` link that is not an image, capturing the target. */
const LINK = /(?<!!)\[[^\]]*\]\(\s*([^)]*)\)/gu;
/** An ATX heading line (`# … ######`). */
const HEADING = /^(#{1,6})\s+(.*)$/u;
/** A fenced-code delimiter (``` or ~~~). */
const FENCE = /^\s*(```|~~~)/u;

const isWhitespace = (character: string | undefined): boolean =>
	character === ' ' ||
	character === '\t' ||
	character === '\n' ||
	character === '\r' ||
	character === '\f' ||
	character === '\v';

const stripClosingHeadingSequence = (raw: string): string => {
	let end = raw.length;
	while (end > 0 && isWhitespace(raw[end - 1])) {
		end -= 1;
	}

	let hashesStart = end;
	while (hashesStart > 0 && raw[hashesStart - 1] === '#') {
		hashesStart -= 1;
	}

	if (hashesStart < end) {
		let whitespaceStart = hashesStart;
		while (whitespaceStart > 0 && isWhitespace(raw[whitespaceStart - 1])) {
			whitespaceStart -= 1;
		}
		if (whitespaceStart < hashesStart) {
			end = whitespaceStart;
		}
	}

	return raw.slice(0, end);
};

const stripOptionalLinkTitle = (raw: string): string => {
	const trimmed = raw.trim();
	for (let index = 0; index < trimmed.length; index += 1) {
		if (isWhitespace(trimmed[index])) {
			return trimmed.slice(0, index);
		}
	}
	return trimmed;
};

/**
 * GitHub-style heading → anchor slug. Pure.
 *
 * Each space becomes **one** hyphen — runs are not collapsed. GitHub's
 * slugger strips punctuation first and then replaces every remaining
 * space individually, so `## OpenAPI / Swagger` loses the slash and
 * keeps the two spaces that surrounded it, landing on `openapi--swagger`
 * with a double hyphen.
 *
 * Collapsing the run with `\s+` produced `openapi-swagger`, and every
 * heading containing `/`, an em dash or `(...)` was then reported as a
 * broken anchor. Measured on a real repository: 12 of 14 findings were
 * this false positive, all of them anchors GitHub resolves fine. A
 * checker that cries wolf gets switched off, which is worse than not
 * having it.
 */
export const slugify = (heading: string): string =>
	heading
		.trim()
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s/g, '-');

/**
 * All heading-anchor slugs in a doc, skipping fenced code blocks. Duplicate
 * headings get GitHub's `-1`, `-2` … suffixes. Pure.
 */
export const headingAnchors = (content: string): Set<string> => {
	const anchors = new Set<string>();
	const counts = new Map<string, number>();
	let inFence = false;
	for (const line of content.split('\n')) {
		if (FENCE.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const match = HEADING.exec(line);
		if (match === null) continue;
		const base = slugify(stripClosingHeadingSequence(match[2] ?? ''));
		if (base === '') continue;
		const seen = counts.get(base) ?? 0;
		counts.set(base, seen + 1);
		anchors.add(seen === 0 ? base : `${base}-${seen}`);
	}
	return anchors;
};

/** Extract non-image markdown links with line numbers, skipping code fences. */
export const extractLinks = (content: string): IExtractedLink[] => {
	const links: IExtractedLink[] = [];
	const lines = content.split('\n');
	let inFence = false;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		if (FENCE.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		LINK.lastIndex = 0;
		let match: RegExpExecArray | null = LINK.exec(line);
		while (match !== null) {
			// Strip an optional link title: `path "title"` → `path`.
			const target = stripOptionalLinkTitle(match[1] ?? '');
			links.push({ target, line: index + 1 });
			match = LINK.exec(line);
		}
	}
	return links;
};

/** Classify a raw link target. Pure. */
export const parseTarget = (raw: string): IParsedTarget => {
	const target = raw.trim();
	if (target === '') return { kind: 'empty', path: '', anchor: undefined };
	if (target.startsWith('#')) {
		return { kind: 'anchor', path: '', anchor: target.slice(1) };
	}
	// A URL scheme (`http:`, `mailto:`, `tel:`…) or protocol-relative `//`.
	if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) {
		return { kind: 'external', path: '', anchor: undefined };
	}
	const hash = target.indexOf('#');
	const path = hash === -1 ? target : target.slice(0, hash);
	const anchor = hash === -1 ? undefined : target.slice(hash + 1);
	return { kind: 'relative', path, anchor };
};

/** Resolve a relative link's path to a repo-relative, normalized path. */
const resolvePath = (fromDoc: string, linkPath: string): string => {
	let decoded = linkPath;
	try {
		decoded = decodeURIComponent(linkPath);
	} catch {
		// leave a malformed %-escape as-is
	}
	const joined = decoded.startsWith('/')
		? decoded.slice(1)
		: posix.join(posix.dirname(fromDoc), decoded);
	const normalized = posix.normalize(joined);
	return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
};

/**
 * Check every link in every doc → findings. `knownPaths` holds every existing
 * repo-relative file and ancestor dir; docs supply anchors for md targets.
 * Pure; deterministic (docs sorted, links in source order).
 */
export const checkLinks = (
	docs: readonly ISourceDoc[],
	knownPaths: ReadonlySet<string>,
): IFinding[] => {
	const ordered = [...docs].sort((a, b) => a.path.localeCompare(b.path));
	const anchorCache = new Map<string, Set<string>>();
	const anchorsOf = (doc: ISourceDoc): Set<string> => {
		const hit = anchorCache.get(doc.path);
		if (hit !== undefined) return hit;
		const computed = headingAnchors(doc.content);
		anchorCache.set(doc.path, computed);
		return computed;
	};
	const byPath = new Map(ordered.map((doc) => [doc.path, doc]));
	const findings: IFinding[] = [];

	for (const doc of ordered) {
		for (const link of extractLinks(doc.content)) {
			const parsed = parseTarget(link.target);
			const at = { file: doc.path, line: link.line };
			if (parsed.kind === 'external') continue;
			if (parsed.kind === 'empty') {
				findings.push({
					ruleId: 'empty-link',
					severity: 'low',
					message: 'link has an empty target',
					location: at,
					fix: 'Add a target, or remove the empty link.',
				});
				continue;
			}
			if (parsed.kind === 'anchor') {
				if (!anchorsOf(doc).has(parsed.anchor ?? '')) {
					findings.push({
						ruleId: 'broken-anchor',
						severity: 'medium',
						message: `no heading in this file matches "#${parsed.anchor}"`,
						location: at,
						fix: 'Fix the fragment to match a heading slug in this file.',
					});
				}
				continue;
			}
			// relative
			const resolved = resolvePath(doc.path, parsed.path);
			if (resolved !== '' && !knownPaths.has(resolved)) {
				findings.push({
					ruleId: 'broken-link',
					severity: 'high',
					message: `link target does not exist: ${parsed.path} → ${resolved}`,
					location: at,
					fix: 'Fix or remove the link; the target path was not found.',
				});
				continue;
			}
			const targetDoc = byPath.get(resolved);
			if (parsed.anchor !== undefined && targetDoc !== undefined) {
				if (!anchorsOf(targetDoc).has(parsed.anchor)) {
					findings.push({
						ruleId: 'broken-anchor',
						severity: 'medium',
						message: `no heading in ${resolved} matches "#${parsed.anchor}"`,
						location: at,
						fix: 'Fix the fragment to match a heading slug in the target file.',
					});
				}
			}
		}
	}
	return findings;
};

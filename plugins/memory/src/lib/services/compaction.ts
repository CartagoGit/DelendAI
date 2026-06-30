/**
 * compaction.ts — the in-session context distiller (f00090 S1).
 *
 * The agent accumulates raw tool output, dead-end exploration, superseded
 * plans and stale dumps in the conversation tail and pays for every one of
 * those tokens on every subsequent turn. This module turns the small set of
 * *load-bearing* working-state items the agent is carrying into one compact,
 * structured Markdown digest, and reports which items were kept vs. discarded
 * plus an estimated token saving — so the agent can drop the raw tail and
 * carry only the digest forward in the SAME chat.
 *
 * Design contract (SOLID + testability):
 *   - **Pure.** `distillContextDigest` is a deterministic function over its
 *     input: no clock, no randomness, no I/O. Same items → same digest. The
 *     persistence (TTL note, redaction, atomic write) lives in the tool layer
 *     and reuses the existing store, so this module owns ONLY the distillation
 *     responsibility (SRP).
 *   - **Closed item vocabulary, open disposition.** `kind` is a small fixed
 *     vocabulary with a sensible default disposition; the agent overrides per
 *     item with `pin` (force-keep) or `drop` (force-discard). Explicit agent
 *     intent always wins.
 *   - **Visible saving.** The digest is paired with a token-accounting summary
 *     (estimated in vs. kept vs. discarded) so the cost reduction is
 *     transparent — the f00086 philosophy applied to the conversation tail.
 */

/** The closed vocabulary of working-state item kinds the distiller knows. */
export type IContextItemKind =
	| 'decision'
	| 'open'
	| 'fact'
	| 'pointer'
	| 'output'
	| 'exploration'
	| 'superseded';

/** One working-state item the agent is currently carrying. */
export interface IContextItem {
	readonly kind: IContextItemKind;
	/** Short headline for the item (the load-bearing one-liner). */
	readonly label: string;
	/** Optional supporting detail; truncated in the digest. */
	readonly detail?: string;
	/**
	 * Optional estimated token cost of carrying this item *raw* in the tail.
	 * When omitted the distiller estimates it from `label`+`detail` length.
	 */
	readonly tokensEstimate?: number;
	/** Force-keep this item regardless of its kind's default disposition. */
	readonly pin?: boolean;
	/** Force-discard this item regardless of its kind's default disposition. */
	readonly drop?: boolean;
}

export interface IDistillOptions {
	/**
	 * Max characters of `detail` rendered per kept item before truncation.
	 * Default 160. Pointers ignore this — they render as a bare ref.
	 */
	readonly detailMaxChars?: number;
}

/** Token accounting so the saving is visible to the agent. */
export interface ITokenAccounting {
	/** Estimated tokens of carrying every input item raw. */
	readonly inputEstimate: number;
	/** Estimated tokens of the produced digest. */
	readonly digestEstimate: number;
	/** Estimated tokens removed from the tail (input − digest, floored at 0). */
	readonly savedEstimate: number;
	/** Count of items kept (distilled into the digest). */
	readonly keptCount: number;
	/** Count of items discarded (dropped from the tail). */
	readonly discardedCount: number;
}

/** One rendered section of the digest, grouped by kind. */
export interface IDigestSection {
	readonly kind: IContextItemKind;
	readonly heading: string;
	readonly bullets: readonly string[];
}

export interface IContextDigest {
	/** Compact Markdown digest body, ready to carry forward. */
	readonly digest: string;
	/** The kept items, in stable order. */
	readonly kept: readonly IContextItem[];
	/** The discarded items, in stable order. */
	readonly discarded: readonly IContextItem[];
	/** The kept items grouped + rendered by kind. */
	readonly sections: readonly IDigestSection[];
	readonly tokenAccounting: ITokenAccounting;
}

/**
 * Default disposition per kind. `keep` items are distilled into the digest;
 * `discard` items are dropped from the tail (the agent stops carrying them).
 * Overridden per item by `pin` / `drop`.
 */
const DEFAULT_DISPOSITION: Readonly<Record<IContextItemKind, 'keep' | 'discard'>> =
	{
		decision: 'keep',
		open: 'keep',
		fact: 'keep',
		pointer: 'keep',
		output: 'discard',
		exploration: 'discard',
		superseded: 'discard',
	};

/**
 * Stable render order for kind sections — high-signal first. Independent of
 * input order so the digest is deterministic regardless of how the agent
 * happened to list its items.
 */
const KIND_ORDER: readonly IContextItemKind[] = [
	'decision',
	'open',
	'fact',
	'pointer',
	'output',
	'exploration',
	'superseded',
];

const SECTION_HEADING: Readonly<Record<IContextItemKind, string>> = {
	decision: 'Decisions',
	open: 'Open',
	fact: 'Facts',
	pointer: 'Pointers',
	output: 'Output',
	exploration: 'Exploration',
	superseded: 'Superseded',
};

const DEFAULT_DETAIL_MAX = 160;

/**
 * Cheap, deterministic token estimate: ~4 chars per token (the common
 * rule-of-thumb for English/code), floored at 1 for any non-empty string.
 * Deliberately provider-agnostic — the goal is a *relative* saving signal,
 * not a billing-accurate count.
 */
export const estimateTokens = (text: string): number => {
	const len = text.length;
	if (len === 0) return 0;
	return Math.max(1, Math.ceil(len / 4));
};

const itemRawTokens = (item: IContextItem): number => {
	if (typeof item.tokensEstimate === 'number' && item.tokensEstimate >= 0) {
		return Math.floor(item.tokensEstimate);
	}
	return estimateTokens(`${item.label}\n${item.detail ?? ''}`);
};

const dispositionOf = (item: IContextItem): 'keep' | 'discard' => {
	if (item.pin === true && item.drop !== true) return 'keep';
	if (item.drop === true) return 'discard';
	return DEFAULT_DISPOSITION[item.kind];
};

/** Collapse internal whitespace/newlines and truncate to `max` chars. */
const compactDetail = (detail: string, max: number): string => {
	const oneLine = detail.replace(/\s+/g, ' ').trim();
	if (oneLine.length <= max) return oneLine;
	return `${oneLine.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

const renderBullet = (item: IContextItem, detailMax: number): string => {
	const label = item.label.replace(/\s+/g, ' ').trim();
	// Pointers are bare refs — the label IS the load-bearing token (a
	// `file:line` or id); detail is noise for them.
	if (item.kind === 'pointer') return `- ${label}`;
	const detail =
		item.detail !== undefined && item.detail.trim() !== ''
			? ` — ${compactDetail(item.detail, detailMax)}`
			: '';
	return `- ${label}${detail}`;
};

/**
 * Distil the carried working-state items into one compact digest.
 *
 * Deterministic: stable partition by disposition, stable grouping by
 * {@link KIND_ORDER}, stable bullet order WITHIN a kind (input order, which
 * the caller controls), no clock, no randomness. Returns the digest body, the
 * kept/discarded partitions, the rendered sections, and the token accounting.
 */
export const distillContextDigest = (
	items: readonly IContextItem[],
	options: IDistillOptions = {},
): IContextDigest => {
	const detailMax = options.detailMaxChars ?? DEFAULT_DETAIL_MAX;

	const kept: IContextItem[] = [];
	const discarded: IContextItem[] = [];
	for (const item of items) {
		(dispositionOf(item) === 'keep' ? kept : discarded).push(item);
	}

	const sections: IDigestSection[] = [];
	for (const kind of KIND_ORDER) {
		const bullets = kept
			.filter((item) => item.kind === kind)
			.map((item) => renderBullet(item, detailMax));
		if (bullets.length === 0) continue;
		sections.push({ kind, heading: SECTION_HEADING[kind], bullets });
	}

	const digest =
		sections.length === 0
			? '# Session digest\n\n_(nothing to keep — tail can be dropped)_'
			: [
					'# Session digest',
					...sections.flatMap((section) => [
						'',
						`## ${section.heading}`,
						...section.bullets,
					]),
				].join('\n');

	const inputEstimate = items.reduce(
		(sum, item) => sum + itemRawTokens(item),
		0,
	);
	const digestEstimate = estimateTokens(digest);
	const tokenAccounting: ITokenAccounting = {
		inputEstimate,
		digestEstimate,
		savedEstimate: Math.max(0, inputEstimate - digestEstimate),
		keptCount: kept.length,
		discardedCount: discarded.length,
	};

	return { digest, kept, discarded, sections, tokenAccounting };
};

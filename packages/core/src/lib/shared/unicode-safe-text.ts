/**
 * Named Unicode tokens for outbound agent prompts (x00207).
 *
 * Pure: no I/O, no process.cwd access, no `*Sync`. Rewrites graphemes that
 * would break UTF-16-naive CLIs / JSON-RPC into ASCII tokens a model
 * can read as meaning (`[emoji:whale U+1F433]`), never as a raw
 * surrogate pair or a hex-only escape.
 */
import type { IUnicodeSafeText } from '../contracts/interfaces/unicode-safe-text.interface';
import { UNICODE_EMOJI_NAMES } from './unicode-emoji-names.generated';

export const UNICODE_TOKEN_LEGEND =
	'[unicode-tokens] Tokens of the form [kind:name U+XXXX] stand for the named character; treat each token as the meaning of that character, not as decoration.';

const ZWJ = 0x200d;
const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const KEYCAP = 0x20e3;
const RI_START = 0x1f1e6;
const RI_END = 0x1f1ff;
const SKIN_START = 0x1f3fb;
const SKIN_END = 0x1f3ff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;
const BMP_MAX = 0xffff;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const DEL = 0x7f;
const C1_START = 0x80;
const C1_END = 0x9f;
const COMBINING_START = 0x0300;
const COMBINING_END = 0x036f;
const COMBINING_MARK_START = 0x20d0;
const COMBINING_MARK_END = 0x20ff;

type Unit =
	| { readonly kind: 'cp'; readonly cp: number }
	| { readonly kind: 'unpaired' };

const isRegionalIndicator = (cp: number): boolean =>
	cp >= RI_START && cp <= RI_END;

const isSkinTone = (cp: number): boolean => cp >= SKIN_START && cp <= SKIN_END;

const isVariationSelector = (cp: number): boolean => cp === VS15 || cp === VS16;

const isCombining = (cp: number): boolean =>
	(cp >= COMBINING_START && cp <= COMBINING_END) ||
	(cp >= COMBINING_MARK_START && cp <= COMBINING_MARK_END) ||
	cp === KEYCAP;

const isExtend = (cp: number): boolean =>
	isVariationSelector(cp) || isSkinTone(cp) || isCombining(cp);

const isAllowedControl = (cp: number): boolean =>
	cp === TAB || cp === LF || cp === CR;

const isC0OrC1 = (cp: number): boolean =>
	cp < 0x20 || cp === DEL || (cp >= C1_START && cp <= C1_END);

const needsRewriteCp = (cp: number): boolean =>
	cp > BMP_MAX || (isC0OrC1(cp) && !isAllowedControl(cp));

const formatHex = (cp: number): string =>
	`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

const walkUnits = (input: string): readonly Unit[] => {
	const out: Unit[] = [];
	for (let i = 0; i < input.length; i += 1) {
		const c = input.charCodeAt(i);
		if (c >= SURROGATE_START && c <= 0xdbff) {
			const next = input.charCodeAt(i + 1);
			if (next >= 0xdc00 && next <= SURROGATE_END) {
				out.push({
					kind: 'cp',
					cp: 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00),
				});
				i += 1;
				continue;
			}
			out.push({ kind: 'unpaired' });
			continue;
		}
		if (c >= 0xdc00 && c <= SURROGATE_END) {
			out.push({ kind: 'unpaired' });
			continue;
		}
		out.push({ kind: 'cp', cp: c });
	}
	return out;
};

const asCp = (unit: Unit | undefined): number | undefined =>
	unit !== undefined && unit.kind === 'cp' ? unit.cp : undefined;

const hexKey = (cps: readonly number[]): string =>
	cps.map((cp) => cp.toString(16).toUpperCase()).join('-');

const tokenForCodePoints = (cps: readonly number[]): string => {
	const hexes = cps.map(formatHex).join(' ');
	const exact = UNICODE_EMOJI_NAMES[hexKey(cps)];
	if (exact !== undefined) return `[emoji:${exact} ${hexes}]`;
	const first = cps[0];
	if (first === undefined)
		return `[unicode:replacement ${formatHex(0xfffd)}]`;
	const rest = cps.slice(1);
	const onlyModifiers = rest.every(isExtend);
	const base = UNICODE_EMOJI_NAMES[hexKey([first])];
	if (base !== undefined && onlyModifiers) {
		return `[emoji:${base} ${hexes}]`;
	}
	return `[unicode:${hexes}]`;
};

const clusterUnits = (units: readonly Unit[]): readonly (readonly Unit[])[] => {
	const clusters: Unit[][] = [];
	let i = 0;
	while (i < units.length) {
		const start = units[i];
		if (start === undefined) break;
		if (start.kind === 'unpaired') {
			clusters.push([start]);
			i += 1;
			continue;
		}
		const cluster: Unit[] = [start];
		i += 1;
		const riCp = asCp(units[i]);
		if (
			isRegionalIndicator(start.cp) &&
			riCp !== undefined &&
			isRegionalIndicator(riCp)
		) {
			const ri = units[i];
			if (ri !== undefined) cluster.push(ri);
			i += 1;
			clusters.push(cluster);
			continue;
		}
		while (true) {
			const extCp = asCp(units[i]);
			if (extCp === undefined || !isExtend(extCp)) break;
			const ext = units[i];
			if (ext !== undefined) cluster.push(ext);
			i += 1;
		}
		while (asCp(units[i]) === ZWJ) {
			const zwj = units[i];
			if (zwj !== undefined) cluster.push(zwj);
			i += 1;
			const next = units[i];
			if (next !== undefined && next.kind === 'cp') {
				cluster.push(next);
				i += 1;
				while (true) {
					const innerCp = asCp(units[i]);
					if (innerCp === undefined || !isExtend(innerCp)) break;
					const ext = units[i];
					if (ext !== undefined) cluster.push(ext);
					i += 1;
				}
			}
		}
		clusters.push(cluster);
	}
	return clusters;
};

const rewriteCluster = (cluster: readonly Unit[]): string | null => {
	if (cluster.some((u) => u.kind === 'unpaired')) {
		return `[unicode:replacement ${formatHex(0xfffd)}]`;
	}
	const cps = cluster.map((u) => (u.kind === 'cp' ? u.cp : 0xfffd));
	if (!cps.some(needsRewriteCp)) return null;
	return tokenForCodePoints(cps);
};

/**
 * Rewrite `input` so an agent subprocess can consume it without a
 * UTF-16/JSON framing break, while still knowing what each grapheme
 * *means*. No-op (and no legend) when nothing needs rewriting.
 */
export const rewriteUnicodeForAgent = (input: string): string => {
	if (input.startsWith(UNICODE_TOKEN_LEGEND)) return input;
	const units = walkUnits(input);
	const clusters = clusterUnits(units);
	let changed = false;
	let body = '';
	for (const cluster of clusters) {
		const rewritten = rewriteCluster(cluster);
		if (rewritten === null) {
			for (const unit of cluster) {
				if (unit.kind === 'cp') {
					body += String.fromCodePoint(unit.cp);
				}
			}
			continue;
		}
		changed = true;
		body += rewritten;
	}
	if (!changed) return input;
	return `${UNICODE_TOKEN_LEGEND}\n${body}`;
};

const TOKEN_RE =
	/\[(?:emoji:[a-z0-9-]+ |unicode:(?:replacement )?)((?:U\+[0-9A-F]{4,6})(?: U\+[0-9A-F]{4,6})*)\]/g;

/**
 * Inverse of {@link rewriteUnicodeForAgent} for hosts that can render
 * UTF-8. Agents that cannot keep the named token and reason about the
 * English name. Unpaired surrogates decode to U+FFFD (well-formed).
 */
export const decodeUnicodeFromAgent = (input: string): string => {
	let text = input;
	if (text.startsWith(UNICODE_TOKEN_LEGEND)) {
		text = text.slice(UNICODE_TOKEN_LEGEND.length);
		if (text.startsWith('\n')) text = text.slice(1);
	}
	return text.replace(TOKEN_RE, (match, hexes: string) => {
		const cps: number[] = [];
		for (const part of hexes.split(' ')) {
			const cp = Number.parseInt(part.slice(2), 16);
			if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return match;
			cps.push(cp);
		}
		if (cps.length === 0) return match;
		return String.fromCodePoint(...cps);
	});
};

/** Structured view used by tests and callers that need `changed`. */
export const inspectUnicodeForAgent = (input: string): IUnicodeSafeText => {
	const rewritten = rewriteUnicodeForAgent(input);
	return {
		original: input,
		rewritten,
		changed: rewritten !== input,
	};
};

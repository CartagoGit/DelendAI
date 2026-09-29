import type {
	IContextAttribution,
	IContextShare,
	ILargestResponse,
} from '../contracts/interfaces/context-attribution.interface';
import { LARGEST_RESPONSES_KEPT } from '../contracts/constants/context-attribution.constant';

/** Tools named in the attribution; the rest are summed as `other tools`. */
const NAMED_TOOLS = 5;

const shareOf = (bytes: number, total: number): number =>
	total === 0 ? 0 : Math.round((bytes / total) * 10_000) / 10_000;

/**
 * Split the session's context bytes by source, largest first. Every byte
 * is counted once: the listing, the five costliest tools by name, and the
 * remainder last as `other tools`, so the parts sum exactly to
 * `totalBytes`.
 */
export const attributeContext = (input: {
	readonly listingBytes: number;
	readonly bytesByTool: ReadonlyMap<string, number>;
	readonly largestResponses: readonly ILargestResponse[];
}): IContextAttribution => {
	const ranked = [...input.bytesByTool.entries()]
		.filter(([, bytes]) => bytes > 0)
		.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
	const toolBytes = ranked.reduce((sum, [, bytes]) => sum + bytes, 0);
	const totalBytes = input.listingBytes + toolBytes;
	const named = ranked.slice(0, NAMED_TOOLS);
	const otherBytes = ranked
		.slice(NAMED_TOOLS)
		.reduce((sum, [, bytes]) => sum + bytes, 0);
	const parts: IContextShare[] = [
		...[
			...(input.listingBytes > 0
				? [{ source: 'tools/list', bytes: input.listingBytes }]
				: []),
			...named.map(([source, bytes]) => ({ source, bytes })),
		].sort((a, b) => b.bytes - a.bytes),
		...(otherBytes > 0
			? [{ source: 'other tools', bytes: otherBytes }]
			: []),
	].map((part) => ({ ...part, share: shareOf(part.bytes, totalBytes) }));
	return {
		totalBytes,
		parts,
		largestResponses: input.largestResponses,
	};
};

/**
 * Keep `kept` sorted by size, largest first, holding at most
 * `LARGEST_RESPONSES_KEPT`. Returns the new list; the input is not changed.
 */
export const keepLargest = (
	kept: readonly ILargestResponse[],
	response: ILargestResponse,
): readonly ILargestResponse[] =>
	[...kept, response]
		.sort((a, b) => b.bytes - a.bytes)
		.slice(0, LARGEST_RESPONSES_KEPT);

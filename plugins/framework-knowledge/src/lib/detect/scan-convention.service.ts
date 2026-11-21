/**
 * Count what the project already does, for the rules that can be counted.
 *
 * A pack rule may carry a pattern: files under a directory, with a name
 * suffix, whose text holds a marker. Counting them turns "the project
 * writes X" into an observation the resolver can weigh, bounded in depth
 * and in files so a large tree costs a fixed amount.
 */
import { SafeWorkspaceReader } from '@delendai/core/runtime';

import {
	PATTERN_SCAN_MAX_DEPTH,
	PATTERN_SCAN_MAX_FILES,
} from '../contracts/constants/knowledge-pack.constant';
import type { IConventionObservation } from '../contracts/interfaces/convention.interface';
import type { IKnowledgePackPattern } from '../contracts/interfaces/knowledge-pack.interface';

const countPattern = async (
	reader: SafeWorkspaceReader,
	pattern: IKnowledgePackPattern,
): Promise<number> => {
	let listing: Awaited<ReturnType<SafeWorkspaceReader['list']>>;
	try {
		listing = await reader.list(pattern.directory, {
			recursive: true,
			maxDepth: PATTERN_SCAN_MAX_DEPTH,
		});
	} catch {
		return 0;
	}
	const files = listing.entries
		.filter(
			(entry) =>
				entry.stats.isFile() &&
				entry.path.relativePath.endsWith(pattern.suffix),
		)
		.slice(0, PATTERN_SCAN_MAX_FILES);
	let count = 0;
	for (const file of files) {
		try {
			const { content } = await reader.readText(file.path.relativePath);
			if (content.includes(pattern.marker)) count += 1;
		} catch {
			// An unreadable file is not an occurrence.
		}
	}
	return count;
};

/** One observation per rule that carries a pattern, with how often it occurs. */
export const scanConvention = async (
	workspaceRootAbs: string,
	patterns: Readonly<Record<string, IKnowledgePackPattern>>,
): Promise<readonly IConventionObservation[]> => {
	const reader = new SafeWorkspaceReader(workspaceRootAbs);
	const observations: IConventionObservation[] = [];
	for (const [ruleId, pattern] of Object.entries(patterns)) {
		observations.push({
			value: ruleId,
			count: await countPattern(reader, pattern),
		});
	}
	return observations;
};

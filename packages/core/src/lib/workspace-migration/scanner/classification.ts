import { LEGACY_IDENTITY_SPELLINGS } from '../../contracts/constants/legacy-identity.constant';
import type {
	IResidualClass,
	IResidualHit,
} from '../../contracts/interfaces/workspace-migration.interface';
import { classifyResidual } from '../classify-residual.service';

// S8 scans the pre-rebrand flag namespace on purpose. A residual hit is
// evidence that some workspace instruction still points at the LEGACY CLI
// surface; the current DelendAI namespace is not what this scanner is meant
// to flag.
export const LEGACY_FLAG_PATTERN = /--mcp-vertex-[a-z0-9-]+/giu;

const HISTORICAL_PROSE =
	/\b(used to|was |were |historically|previously|before the rename|0\.1\.x|legacy)\b/iu;

export interface IClassificationOptions {
	readonly extraHistoricalSegments?: readonly string[];
}

export interface IScannerPattern {
	readonly label: string;
	readonly match: (line: string) => boolean;
}

const LEGACY_SPELLING_MATCH_ORDER = [...LEGACY_IDENTITY_SPELLINGS].sort(
	(a, b) => b.length - a.length,
);

export const LEGACY_SCANNER_PATTERNS: readonly IScannerPattern[] = [
	...LEGACY_IDENTITY_SPELLINGS.map((spelling) => ({
		label: spelling,
		match: (line: string) => line.includes(spelling),
	})),
	{
		// Keep the literal legacy flag spelling in the label so a failing
		// report shows the exact token the scanner matched.
		label: '--mcp-vertex-*',
		match: (line: string) => LEGACY_FLAG_PATTERN.test(line),
	},
] as const;

export const matchedLegacySpellingsInLine = (
	line: string,
): readonly string[] => {
	const hits = new Set<string>();
	let masked = line;
	LEGACY_FLAG_PATTERN.lastIndex = 0;
	const flagMatches = [...line.matchAll(LEGACY_FLAG_PATTERN)];
	if (flagMatches.length > 0) {
		hits.add('--mcp-vertex-*');
		for (const match of flagMatches) {
			const token = match[0];
			if (token === undefined || token.length === 0) continue;
			masked = maskExactOccurrences(masked, token);
		}
	}
	for (const spelling of LEGACY_SPELLING_MATCH_ORDER) {
		if (!masked.includes(spelling)) continue;
		hits.add(spelling);
		masked = maskExactOccurrences(masked, spelling);
	}
	return [...hits];
};

export const lineHasLegacyIdentity = (line: string): boolean => {
	return matchedLegacySpellingsInLine(line).length > 0;
};

export const classifyLegacyIdentityHit = (input: {
	readonly file: string;
	readonly text: string;
	readonly extraHistoricalSegments?: readonly string[];
}): { readonly classification: IResidualClass; readonly reason: string } => {
	const pathVerdict = classifyResidual(
		input.file,
		input.extraHistoricalSegments ?? [],
	);
	if (pathVerdict.classification !== 'live') return pathVerdict;
	if (HISTORICAL_PROSE.test(input.text)) {
		return {
			classification: 'historical',
			reason: 'line reads as a historical statement (`used to`, `previously`, version history, etc.)',
		};
	}
	return {
		classification: 'live',
		reason: 'legacy identity appears in active instructions or source, and the path/text do not prove it is historical, vendored, or generated',
	};
};

export const toResidualHit = (input: {
	readonly file: string;
	readonly line: number;
	readonly text: string;
	readonly spelling: string;
	readonly extraHistoricalSegments?: readonly string[];
}): IResidualHit => {
	const verdict = classifyLegacyIdentityHit({
		file: input.file,
		text: input.text,
		...(input.extraHistoricalSegments === undefined
			? {}
			: { extraHistoricalSegments: input.extraHistoricalSegments }),
	});
	return {
		file: input.file,
		line: input.line,
		spelling: input.spelling,
		text: input.text,
		classification: verdict.classification,
		reason: verdict.reason,
	};
};

const maskExactOccurrences = (line: string, token: string): string =>
	line.split(token).join(' '.repeat(token.length));

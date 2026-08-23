/**
 * Mechanical issue triage — pure keyword classification, no LLM. The
 * result is a stable, testable shape the rest of the plugin consumes
 * to draft a proposal and write the automated comment.
 */
export type TriageCategory = 'bug' | 'feature' | 'docs' | 'question' | 'other';

export type TriageSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ITriageAnalysis {
	readonly category: TriageCategory;
	readonly severity: TriageSeverity;
	readonly keywords: readonly string[];
	readonly summary: string;
}

const CATEGORY_RULES: readonly {
	readonly category: TriageCategory;
	readonly keywords: readonly string[];
}[] = [
	{
		category: 'bug',
		keywords: [
			'bug',
			'error',
			'crash',
			'fail',
			'broken',
			'exception',
			'regression',
			'incorrect',
			'not working',
			'corrupt',
			'data loss',
			'loses',
		],
	},
	{
		category: 'feature',
		keywords: [
			'feature',
			'request',
			'support',
			'add',
			'would like',
			'enhancement',
		],
	},
	{
		category: 'docs',
		keywords: [
			'documentation',
			'docs',
			'readme',
			'typo',
			'example',
			'tutorial',
		],
	},
	{
		category: 'question',
		keywords: [
			'how do i',
			'how to',
			'question',
			'why does',
			'is it possible',
		],
	},
];

const SEVERITY_RULES: readonly {
	readonly severity: TriageSeverity;
	readonly keywords: readonly string[];
}[] = [
	{
		severity: 'critical',
		keywords: [
			'data loss',
			'corrupt',
			'security',
			'credential',
			'secret',
			'crash on boot',
			'cannot start',
			'breaks every',
		],
	},
	{
		severity: 'high',
		keywords: [
			'crash',
			'broken',
			'exception',
			'regression',
			'blocker',
			'always fails',
		],
	},
	{
		severity: 'medium',
		keywords: ['fail', 'error', 'incorrect', 'not working', 'slow'],
	},
];

const matchKeywords = (
	text: string,
	rules: readonly { readonly keywords: readonly string[] }[],
): readonly string[] => {
	const lower = text.toLowerCase();
	const found: string[] = [];
	for (const rule of rules) {
		for (const keyword of rule.keywords) {
			if (lower.includes(keyword)) found.push(keyword);
		}
	}
	return found;
};

const firstMatch = <T extends { readonly keywords: readonly string[] }>(
	text: string,
	rules: readonly T[],
): T | undefined => {
	const lower = text.toLowerCase();
	return rules.find((rule) =>
		rule.keywords.some((keyword) => lower.includes(keyword)),
	);
};

export const analyzeIssue = (title: string, body: string): ITriageAnalysis => {
	const text = `${title}\n${body}`;
	const category = firstMatch(text, CATEGORY_RULES)?.category ?? 'other';
	const severity =
		category === 'bug'
			? (firstMatch(text, SEVERITY_RULES)?.severity ?? 'low')
			: 'low';
	const keywords = matchKeywords(text, [
		...CATEGORY_RULES,
		...SEVERITY_RULES,
	]);
	const summary =
		`Mechanically classified as \`${category}\` (severity \`${severity}\`) ` +
		`from ${keywords.length} matched keyword(s): ${keywords.join(', ') || 'none'}.`;
	return { category, severity, keywords, summary };
};

/** The proposal `kind` each category maps to. */
export const kindForCategory = (
	category: TriageCategory,
): 'fix' | 'feat' | 'docs' | 'chore' => {
	if (category === 'bug') return 'fix';
	if (category === 'feature') return 'feat';
	if (category === 'docs') return 'docs';
	return 'chore';
};

export const titleForIssue = (title: string): string =>
	title.trim() === '' ? 'Untitled issue' : title.trim();

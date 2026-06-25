import type { IToolEffect } from '../contracts/interfaces/tool-registration.interface';

export type CatalogSection = 'tools' | 'skills' | 'proposals';

export interface IToolSummary {
	readonly name: string;
	readonly plugin: string;
	readonly summary?: string;
	readonly tags?: readonly string[];
	readonly effects?: readonly IToolEffect[];
}

export interface ISkillSummary {
	readonly id: string;
	readonly version: string;
	readonly minCoreVersion: string;
	/** Compact "what + when to use" line, derived from the SKILL.md frontmatter. */
	readonly summary: string;
	/** Plugin namespaces this skill applies to (`@mcp-vertex/*` for transversal). */
	readonly appliesTo: readonly string[];
	readonly tags: readonly string[];
	readonly bodyPath: string;
}

export type ProposalStatus =
	| 'ready'
	| 'in-progress'
	| 'review'
	| 'paused'
	| 'done'
	| 'blocked'
	| 'retired'
	| 'unspecified';

export interface IProposalSummary {
	readonly id: string;
	readonly title: string;
	readonly track: string;
	readonly status: ProposalStatus;
	readonly kind:
		| 'feat'
		| 'fix'
		| 'refactor'
		| 'chore'
		| 'docs'
		| 'plan'
		| 'audit'
		| 'unspecified';
	readonly date: string;
}

export interface ICatalogCounts {
	readonly tools: number;
	readonly skills: number;
	readonly proposals: number;
}

export interface ICatalogSnapshot {
	readonly server: {
		readonly name: string;
		readonly version: string;
		readonly namespacePrefix: string;
	};
	readonly generatedAt: string;
	readonly mode: 'compact' | 'full';
	readonly counts: ICatalogCounts;
	readonly proposalStatusCounts: Readonly<Record<ProposalStatus, number>>;
	readonly tools: readonly IToolSummary[];
	readonly skills: readonly ISkillSummary[];
	readonly proposals: readonly IProposalSummary[];
}

export interface ICatalogSources {
	readonly tools: () => readonly IToolSummary[];
	readonly skills: () => readonly ISkillSummary[];
	readonly proposals: () => readonly IProposalSummary[];
}

export interface IBuildCatalogOptions {
	readonly mode: 'compact' | 'full';
	readonly now?: () => Date;
	readonly server: {
		readonly name: string;
		readonly version: string;
		readonly namespacePrefix: string;
	};
}

export const PROPOSAL_STATUS_VALUES: readonly ProposalStatus[] = [
	'ready',
	'in-progress',
	'review',
	'paused',
	'done',
	'blocked',
	'retired',
	'unspecified',
];

export const ACTIONABLE_PROPOSAL_STATUSES: readonly ProposalStatus[] = [
	'ready',
	'in-progress',
	'paused',
];

export const deriveSkillSummary = (
	skillId: string,
	body: string | undefined,
): string => {
	const trimmed = body?.trim();
	if (trimmed === undefined || trimmed.length === 0) {
		return `Skill ${skillId}`;
	}
	const firstParagraph = trimmed
		.split(/\n\s*\n/u)
		.map((part) => part.trim())
		.find((part) => part.length > 0);
	return firstParagraph === undefined ? `Skill ${skillId}` : firstParagraph;
};

export const PROVENANCE_NODE_KINDS = [
	'agent',
	'proposal',
	'slice',
	'tool',
	'test',
	'commit',
	'release',
	'pr',
] as const;

export type ProvenanceNodeKind = (typeof PROVENANCE_NODE_KINDS)[number];

export const PROVENANCE_RELATION_DEFINITIONS = [
	{ from: 'agent', to: 'proposal', relation: 'owns' },
	{ from: 'proposal', to: 'slice', relation: 'contains' },
	{ from: 'slice', to: 'tool', relation: 'uses' },
	{ from: 'slice', to: 'test', relation: 'validated-by' },
	{ from: 'slice', to: 'commit', relation: 'implemented-by' },
	{ from: 'commit', to: 'release', relation: 'included-in' },
	{ from: 'release', to: 'pr', relation: 'tracked-by' },
] as const satisfies readonly {
	readonly from: ProvenanceNodeKind;
	readonly to: ProvenanceNodeKind;
	readonly relation: string;
}[];

export type ProvenanceRelation =
	(typeof PROVENANCE_RELATION_DEFINITIONS)[number]['relation'];

export interface IProvenanceEventInput {
	readonly agent: string;
	readonly proposalId: string;
	readonly sliceId: string;
	readonly toolIds: readonly string[];
	readonly testPaths?: readonly string[];
	readonly commitShas?: readonly string[];
	readonly releaseTags?: readonly string[];
	readonly pullRequests?: readonly (number | string)[];
	readonly userData?: readonly string[];
}

export interface IProvenanceLinkOptions {
	readonly repoUrl?: string;
	readonly proposalPaths?: Readonly<Record<string, string>>;
	readonly toolPaths?: Readonly<Record<string, string>>;
	readonly testPaths?: Readonly<Record<string, string>>;
}

export interface IProvenanceNode {
	readonly id: string;
	readonly kind: ProvenanceNodeKind;
	readonly ref: string;
	readonly label: string;
	readonly href: string | null;
}

export interface IProvenanceEdge {
	readonly from: string;
	readonly to: string;
	readonly relation: ProvenanceRelation;
}

export interface IProvenanceGraph {
	readonly nodes: readonly IProvenanceNode[];
	readonly edges: readonly IProvenanceEdge[];
	readonly redactions: number;
	readonly ignoredUserDataCount: number;
}

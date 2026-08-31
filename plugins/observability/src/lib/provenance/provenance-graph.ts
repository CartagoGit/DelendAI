import { basename } from 'node:path';

import { redactSecrets } from '@mcp-vertex/core/public';

import {
	PROVENANCE_NODE_KINDS,
	PROVENANCE_RELATION_DEFINITIONS,
	type IProvenanceEdge,
	type IProvenanceEventInput,
	type IProvenanceGraph,
	type IProvenanceLinkOptions,
	type IProvenanceNode,
	type ProvenanceNodeKind,
} from './interfaces';

const NODE_KIND_ORDER = new Map(
	PROVENANCE_NODE_KINDS.map((kind, index) => [kind, index]),
);

const canonicalize = (
	kind: ProvenanceNodeKind,
	raw: string,
): { readonly ref: string; readonly redacted: boolean } => {
	const secretSafe = redactSecrets(raw).text.trim();
	switch (kind) {
		case 'agent': {
			const slug = /^[a-z0-9][a-z0-9-]{0,63}$/iu.test(secretSafe)
				? secretSafe.toLowerCase()
				: 'redacted-agent';
			return { ref: slug, redacted: slug !== raw.trim() };
		}
		case 'proposal': {
			const match = /^[a-z]\d{3,5}$/iu.test(secretSafe)
				? secretSafe.toLowerCase()
				: 'redacted-proposal';
			return { ref: match, redacted: match !== raw.trim() };
		}
		case 'slice': {
			const match = /^s\d+$/iu.test(secretSafe)
				? secretSafe.toUpperCase()
				: 'S0';
			return { ref: match, redacted: match !== raw.trim() };
		}
		case 'tool': {
			const id = /^[a-z][a-z0-9_]{0,127}$/u.test(secretSafe)
				? secretSafe
				: 'redacted_tool';
			return { ref: id, redacted: id !== raw.trim() };
		}
		case 'test': {
			const normalized = secretSafe.replace(/\\/g, '/');
			const safe =
				/^[A-Za-z0-9._/-]+$/u.test(normalized) &&
				!normalized.startsWith('/') &&
				!normalized.includes('..')
					? normalized
					: basename(normalized) || 'redacted.spec.ts';
			return { ref: safe, redacted: safe !== raw.trim() };
		}
		case 'commit': {
			const match =
				/([0-9a-f]{7,40})/iu.exec(secretSafe)?.[1] ?? '0000000';
			return { ref: match.toLowerCase(), redacted: match !== raw.trim() };
		}
		case 'release': {
			const safe = /^[A-Za-z0-9._/-]{1,128}$/u.test(secretSafe)
				? secretSafe
				: 'unreleased';
			return { ref: safe, redacted: safe !== raw.trim() };
		}
		case 'pr': {
			const match = /(\d{1,10})/u.exec(secretSafe)?.[1] ?? '0';
			return { ref: match, redacted: match !== raw.trim() };
		}
	}
};

const buildHref = (
	kind: ProvenanceNodeKind,
	ref: string,
	options: IProvenanceLinkOptions,
): string | null => {
	const repoUrl = options.repoUrl?.replace(/\/$/, '');
	switch (kind) {
		case 'agent':
			return null;
		case 'proposal':
			return options.proposalPaths?.[ref] ?? null;
		case 'slice': {
			const proposalPath =
				options.proposalPaths?.[ref] ??
				options.proposalPaths?.[ref.split(':')[0] ?? ''];
			return proposalPath === undefined ? null : `${proposalPath}#slices`;
		}
		case 'tool':
			return options.toolPaths?.[ref] ?? null;
		case 'test':
			return options.testPaths?.[ref] ?? ref;
		case 'commit':
			return repoUrl === undefined ? null : `${repoUrl}/commit/${ref}`;
		case 'release':
			return repoUrl === undefined
				? null
				: `${repoUrl}/releases/tag/${encodeURIComponent(ref)}`;
		case 'pr':
			return repoUrl === undefined ? null : `${repoUrl}/pull/${ref}`;
	}
};

const labelFor = (kind: ProvenanceNodeKind, ref: string): string => {
	switch (kind) {
		case 'test':
			return ref;
		case 'pr':
			return `pr:#${ref}`;
		case 'commit':
			return `commit:${ref.slice(0, 7)}`;
		default:
			return `${kind}:${ref}`;
	}
};

const nodeKey = (kind: ProvenanceNodeKind, ref: string): string =>
	`${kind}:${ref}`;

const sortNodes = (left: IProvenanceNode, right: IProvenanceNode): number => {
	const leftOrder = NODE_KIND_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER;
	const rightOrder =
		NODE_KIND_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER;
	if (leftOrder !== rightOrder) return leftOrder - rightOrder;
	return left.ref.localeCompare(right.ref);
};

const sortEdges = (left: IProvenanceEdge, right: IProvenanceEdge): number => {
	const rel = left.relation.localeCompare(right.relation);
	if (rel !== 0) return rel;
	const from = left.from.localeCompare(right.from);
	if (from !== 0) return from;
	return left.to.localeCompare(right.to);
};

export const buildProvenanceGraph = (
	input: IProvenanceEventInput,
	options: IProvenanceLinkOptions = {},
): IProvenanceGraph => {
	const nodes = new Map<string, IProvenanceNode>();
	const edges = new Map<string, IProvenanceEdge>();
	let redactions = input.userData?.length ?? 0;

	const addNode = (
		kind: ProvenanceNodeKind,
		raw: string,
		linkOptions: IProvenanceLinkOptions = options,
		linkRefOverride?: string,
	): string => {
		const normalized = canonicalize(kind, raw);
		if (normalized.redacted) redactions += 1;
		const key = nodeKey(kind, normalized.ref);
		if (!nodes.has(key)) {
			nodes.set(key, {
				id: key,
				kind,
				ref: normalized.ref,
				label: labelFor(kind, normalized.ref),
				href: buildHref(
					kind,
					linkRefOverride ?? normalized.ref,
					linkOptions,
				),
			});
		}
		return key;
	};

	const addEdge = (
		from: string,
		to: string,
		relation: IProvenanceEdge['relation'],
	): void => {
		const key = `${from}|${relation}|${to}`;
		if (!edges.has(key)) edges.set(key, { from, to, relation });
	};

	const proposalRef = canonicalize('proposal', input.proposalId).ref;
	const agentId = addNode('agent', input.agent);
	const proposalId = addNode('proposal', input.proposalId);
	const sliceId = addNode('slice', input.sliceId, options, proposalRef);
	addEdge(agentId, proposalId, PROVENANCE_RELATION_DEFINITIONS[0].relation);
	addEdge(proposalId, sliceId, PROVENANCE_RELATION_DEFINITIONS[1].relation);

	for (const toolId of input.toolIds) {
		const toolNode = addNode('tool', toolId);
		addEdge(sliceId, toolNode, PROVENANCE_RELATION_DEFINITIONS[2].relation);
	}
	for (const testPath of input.testPaths ?? []) {
		const testNode = addNode('test', testPath);
		addEdge(sliceId, testNode, PROVENANCE_RELATION_DEFINITIONS[3].relation);
	}
	const commitNodes = (input.commitShas ?? []).map((sha) => {
		const commitNode = addNode('commit', sha);
		addEdge(
			sliceId,
			commitNode,
			PROVENANCE_RELATION_DEFINITIONS[4].relation,
		);
		return commitNode;
	});
	const releaseNodes = (input.releaseTags ?? []).map((tag) =>
		addNode('release', tag),
	);
	for (const commitNode of commitNodes) {
		for (const releaseNode of releaseNodes) {
			addEdge(
				commitNode,
				releaseNode,
				PROVENANCE_RELATION_DEFINITIONS[5].relation,
			);
		}
	}
	const prNodes = (input.pullRequests ?? []).map((pr) =>
		addNode('pr', String(pr)),
	);
	for (const releaseNode of releaseNodes) {
		for (const prNode of prNodes) {
			addEdge(
				releaseNode,
				prNode,
				PROVENANCE_RELATION_DEFINITIONS[6].relation,
			);
		}
	}

	return {
		nodes: [...nodes.values()].sort(sortNodes),
		edges: [...edges.values()].sort(sortEdges),
		redactions,
		ignoredUserDataCount: input.userData?.length ?? 0,
	};
};

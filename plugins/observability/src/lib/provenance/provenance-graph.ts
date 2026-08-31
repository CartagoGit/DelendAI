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
const MAX_AGENT_REF_LENGTH = 63;
const MAX_COMMIT_REF_LENGTH = 40;
const MAX_PR_REF_LENGTH = 10;
const REDACTED_COMMIT_REF = '0000000';

const canonicalize = (
	kind: ProvenanceNodeKind,
	raw: string,
): { readonly ref: string; readonly redacted: boolean } => {
	const secretSafe = redactSecrets(raw).text.trim();
	switch (kind) {
		case 'agent': {
			const slug = new RegExp(
				`^[a-z0-9][a-z0-9-]{0,${MAX_AGENT_REF_LENGTH}}$`,
				'iu',
			const MAX_TOOL_REF_LENGTH = 127;
			const MAX_RELEASE_REF_LENGTH = 128;
			).test(secretSafe)
			const REDACTED_PR_REF = '0';

			type CanonicalizeFn = (
				secretSafe: string,
				raw: string,
			) => { readonly ref: string; readonly redacted: boolean };

			const canonicalizeResult = (
				ref: string,
				raw: string,
			): { readonly ref: string; readonly redacted: boolean } => ({
				ref,
				redacted: ref !== raw.trim(),
			});

			const CANONICALIZERS: Readonly<
				Record<ProvenanceNodeKind, CanonicalizeFn>
			> = {
				agent: (secretSafe) => {
					const slug = new RegExp(
						`^[a-z0-9][a-z0-9-]{0,${MAX_AGENT_REF_LENGTH}}$`,
						'iu',
					).test(secretSafe)
						? secretSafe.toLowerCase()
						: 'redacted-agent';
					return { ref: slug, redacted: slug !== secretSafe };
				},
				proposal: (secretSafe) =>
					canonicalizeResult(
						/^[a-z]\d{3,5}$/iu.test(secretSafe)
							? secretSafe.toLowerCase()
							: 'redacted-proposal',
						secretSafe,
					),
				slice: (secretSafe) =>
					canonicalizeResult(
						/^s\d+$/iu.test(secretSafe) ? secretSafe.toUpperCase() : 'S0',
						secretSafe,
					),
				tool: (secretSafe) =>
					canonicalizeResult(
						new RegExp(`^[a-z][a-z0-9_]{0,${MAX_TOOL_REF_LENGTH}}$`, 'u').test(
							secretSafe,
						)
							? secretSafe
							: 'redacted_tool',
						secretSafe,
					),
				test: (secretSafe) => {
					const normalized = secretSafe.replace(/\\/g, '/');
					const safe =
						/^[A-Za-z0-9._/-]+$/u.test(normalized) &&
						!normalized.startsWith('/') &&
						!normalized.includes('..')
							? normalized
							: basename(normalized) || 'redacted.spec.ts';
					return canonicalizeResult(safe, secretSafe);
				},
				commit: (secretSafe) => {
					const match =
						new RegExp(`([0-9a-f]{7,${MAX_COMMIT_REF_LENGTH}})`, 'iu').exec(
							secretSafe,
						)?.[1] ?? REDACTED_COMMIT_REF;
					return canonicalizeResult(match.toLowerCase(), secretSafe);
				},
				release: (secretSafe) =>
					canonicalizeResult(
						new RegExp(`^[A-Za-z0-9._/-]{1,${MAX_RELEASE_REF_LENGTH}}$`, 'u').test(
							secretSafe,
						)
							? secretSafe
							: 'unreleased',
						secretSafe,
					),
				pr: (secretSafe) => {
					const match =
						new RegExp(`(\\d{1,${MAX_PR_REF_LENGTH}})`, 'u').exec(secretSafe)
							?.[1] ?? REDACTED_PR_REF;
					return canonicalizeResult(match, secretSafe);
				},
			};
				? secretSafe.toLowerCase()
				: 'redacted-agent';
			return { ref: slug, redacted: slug !== raw.trim() };
		}
		case 'proposal': {
			const match = /^[a-z]\d{3,5}$/iu.test(secretSafe)
				return CANONICALIZERS[kind](secretSafe, raw);
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

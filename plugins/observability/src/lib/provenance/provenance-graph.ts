import { basename } from 'node:path';

import { redactSecrets } from '@delendai/core/public';

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
const MAX_TOOL_REF_LENGTH = 127;
const MAX_RELEASE_REF_LENGTH = 128;
const REDACTED_COMMIT_REF = '0'.repeat(7);
const REDACTED_PR_REF = '0';

const canonicalizeResult = (
	ref: string,
	original: string,
): { readonly ref: string; readonly redacted: boolean } => ({
	ref,
	redacted: ref !== original.trim(),
});

const canonicalize = (
	kind: ProvenanceNodeKind,
	raw: string,
): { readonly ref: string; readonly redacted: boolean } => {
	const secretSafe = redactSecrets(raw).text.trim();
	const original = raw.trim();
	const canonicalizers: Readonly<
		Record<
			ProvenanceNodeKind,
			() => { readonly ref: string; readonly redacted: boolean }
		>
	> = {
		agent: () =>
			canonicalizeResult(
				new RegExp(
					`^[a-z0-9][a-z0-9-]{0,${MAX_AGENT_REF_LENGTH}}$`,
					'iu',
				).test(secretSafe)
					? secretSafe.toLowerCase()
					: 'redacted-agent',
				original,
			),
		proposal: () =>
			canonicalizeResult(
				/^[a-z]\d{3,5}$/iu.test(secretSafe)
					? secretSafe.toLowerCase()
					: 'redacted-proposal',
				original,
			),
		slice: () =>
			canonicalizeResult(
				/^s\d+$/iu.test(secretSafe) ? secretSafe.toUpperCase() : 'S0',
				original,
			),
		tool: () =>
			canonicalizeResult(
				new RegExp(
					`^[a-z][a-z0-9_]{0,${MAX_TOOL_REF_LENGTH}}$`,
					'u',
				).test(secretSafe)
					? secretSafe
					: 'redacted_tool',
				original,
			),
		test: () => {
			const normalized = secretSafe.replace(/\\/g, '/');
			const ref =
				/^[A-Za-z0-9._/-]+$/u.test(normalized) &&
				!normalized.startsWith('/') &&
				!normalized.includes('..')
					? normalized
					: basename(normalized) || 'redacted.spec.ts';
			return canonicalizeResult(ref, original);
		},
		commit: () => {
			const ref =
				new RegExp(`([0-9a-f]{7,${MAX_COMMIT_REF_LENGTH}})`, 'iu')
					.exec(secretSafe)?.[1]
					?.toLowerCase() ?? REDACTED_COMMIT_REF;
			return canonicalizeResult(ref, original);
		},
		release: () =>
			canonicalizeResult(
				new RegExp(
					`^[A-Za-z0-9._/-]{1,${MAX_RELEASE_REF_LENGTH}}$`,
					'u',
				).test(secretSafe)
					? secretSafe
					: 'unreleased',
				original,
			),
		pr: () => {
			const ref =
				new RegExp(`(\\d{1,${MAX_PR_REF_LENGTH}})`, 'u').exec(
					secretSafe,
				)?.[1] ?? REDACTED_PR_REF;
			return canonicalizeResult(ref, original);
		},
	};
	return canonicalizers[kind]();
};

const buildHref = (
	kind: ProvenanceNodeKind,
	ref: string,
	options: IProvenanceLinkOptions,
): string | null => {
	const repoUrl = options.repoUrl?.replace(/\/$/, '');
	const hrefBuilders: Readonly<
		Record<ProvenanceNodeKind, () => string | null>
	> = {
		agent: () => null,
		proposal: () => options.proposalPaths?.[ref] ?? null,
		slice: () => {
			const proposalPath =
				options.proposalPaths?.[ref] ??
				options.proposalPaths?.[ref.split(':')[0] ?? ''];
			return proposalPath === undefined ? null : `${proposalPath}#slices`;
		},
		tool: () => options.toolPaths?.[ref] ?? null,
		test: () => options.testPaths?.[ref] ?? ref,
		commit: () =>
			repoUrl === undefined ? null : `${repoUrl}/commit/${ref}`,
		release: () =>
			repoUrl === undefined
				? null
				: `${repoUrl}/releases/tag/${encodeURIComponent(ref)}`,
		pr: () => (repoUrl === undefined ? null : `${repoUrl}/pull/${ref}`),
	};
	return hrefBuilders[kind]();
};

const labelFor = (kind: ProvenanceNodeKind, ref: string): string => {
	const labels: Readonly<Record<ProvenanceNodeKind, () => string>> = {
		agent: () => `agent:${ref}`,
		proposal: () => `proposal:${ref}`,
		slice: () => `slice:${ref}`,
		tool: () => `tool:${ref}`,
		test: () => ref,
		commit: () => `commit:${ref.slice(0, 7)}`,
		release: () => `release:${ref}`,
		pr: () => `pr:#${ref}`,
	};
	return labels[kind]();
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

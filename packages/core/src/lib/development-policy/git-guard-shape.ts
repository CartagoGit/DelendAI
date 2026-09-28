/**
 * git-guard-shape.ts — the naming rules for delendai's own namespaces
 * (f00644): a work ref and a publication have the policy's shape, the
 * agent segment is a lower-case model id that names no kind of work, and
 * a commit on these branches is authored as the configured identity.
 *
 * They hold for any process, agent or not: the names in these namespaces
 * are the tools', and a person's branches elsewhere stay free.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	IGitGuardVerdict,
	IGuardedGitOperation,
} from '../contracts/interfaces/git-guard.interface';
import { compileWorkRefParser } from '../startup-reconciler/work-ref-identity';
import {
	insideNamespaces,
	policyNamespaces,
	shortName,
} from './git-guard-namespaces';
import { refuseLiveUnitDeletion } from './git-guard-live-unit';
import { WORK_KINDS } from './profiles.constant';
import { isHostApplicationId, kindsInAgentId } from './work-ref-placeholders';

/**
 * A work ref whose name does not match the policy's own template.
 *
 * Undefined when there is nothing to say: no template declared, or the
 * ref is not in the work namespace, or it parses. The parser is the SAME
 * one the reconciler attributes refs with, so "git accepted it" and "the
 * system can attribute it" cannot drift apart.
 */
export const refuseUnshapedWorkRef = (
	policy: IResolvedDevelopmentPolicy,
	ref: string,
	branch: string,
	/**
	 * Whether the kind segment is required. Only a ref being CREATED must
	 * carry it: a ref written before the shape named its kind is still
	 * somebody's live unit, and it has to stay pushable and publishable
	 * (f00644).
	 */
	requireKind = true,
): IGitGuardVerdict | undefined => {
	const template = policy.branches.workRefTemplate;
	const prefix = shortName(policy.branches.workRefPrefix);
	if (template.length === 0 || prefix.length === 0) return undefined;
	if (!branch.startsWith(prefix)) return undefined;
	const parser = compileWorkRefParser(
		template,
		policy.branches.workRefPrefix,
		{ strict: true, requireKind },
	);
	if (parser === undefined) return undefined;
	const identity = parser.parse(ref);
	if (identity === undefined) {
		return {
			refused: true,
			reason: `\`${branch}\` is in the work namespace but does not match the shape the \`${policy.profile}\` profile declares (\`${template}\`), so nothing can attribute it to a kind of work, a proposal, a slice or a generation.`,
			remedy: `Let the name come from the policy instead of typing it: \`delendai work enter --kind=<${WORK_KINDS.join('|')}> --proposal=<id> --slice=<id>\` (or \`work checkpoint\`) renders it from the same template the reconciler reads.`,
		};
	}
	return refuseKindInAgent(identity.agent, branch);
};

/**
 * An agent id that spells a kind of work. The ref has a place for the
 * kind; an agent id names who works. `github-copilot-review-20260926`
 * matched the shape and still read as nobody anyone could recognise.
 */
const refuseKindInAgent = (
	agent: string,
	branch: string,
): IGitGuardVerdict | undefined => {
	if (agent !== agent.toLowerCase()) {
		return {
			refused: true,
			reason: `\`${branch}\` names its agent \`${agent}\`, which is not written the way delendai writes agent ids (lower case), so the same agent would read as two.`,
			remedy: 'Let the name come from the policy: `delendai work enter` normalises the agent id it puts in the ref.',
		};
	}
	if (isHostApplicationId(agent)) {
		return {
			refused: true,
			reason: `\`${branch}\` names its agent \`${agent}\`, which is the program the agent runs in, not the agent. The agent segment names the model that does the work.`,
			remedy: 'Declare the agent as the model id (DELENDAI_AGENT_ID=<model>, e.g. glm-5 or minimax-m3) and enter the unit again with `delendai work enter --agent=<model> …`.',
		};
	}
	const kinds = kindsInAgentId(agent);
	if (kinds.length === 0) return undefined;
	return {
		refused: true,
		reason: `\`${branch}\` names its agent \`${agent}\`, which spells the kind of work (${kinds.join(', ')}). The agent segment names who works — the model — and the kind has its own segment.`,
		remedy: `Declare the agent as the model id (DELENDAI_AGENT_ID=<model>) and pass the kind: \`delendai work enter --kind=${kinds[0] === 'close' ? 'review' : (kinds[0] ?? 'implement')} …\`.`,
	};
};

/**
 * A publication ref must have the shape of the work it publishes: the
 * work template with the publication prefix in place of the work prefix.
 * `delendai/pr/proposal-f00643` was pushed by a tool that spelled its own
 * name, and nothing that reads refs could place it.
 */
export const refuseUnshapedPublication = (
	policy: IResolvedDevelopmentPolicy,
	branch: string,
): IGitGuardVerdict | undefined => {
	const work = shortName(policy.branches.workRefPrefix);
	const publication = shortName(policy.branches.publicationRefPrefix);
	const template = policy.branches.workRefTemplate;
	if (template.length === 0 || work.length === 0 || publication.length === 0)
		return undefined;
	if (!branch.startsWith(publication)) return undefined;
	// Strict about the separators, not about the kind: a publication
	// mirrors a work ref that may predate the kind segment.
	const parser = compileWorkRefParser(
		template,
		policy.branches.workRefPrefix,
		{ strict: true, requireKind: false },
	);
	const asWork = `refs/heads/${work}${branch.slice(publication.length)}`;
	const identity = parser?.parse(asWork);
	if (parser === undefined) return undefined;
	if (identity === undefined) {
		return {
			refused: true,
			reason: `\`${branch}\` is a publication ref but does not have the shape of the work it publishes (\`${template}\` under \`${publication}\`), so nothing can attribute it to a kind of work, a proposal or an agent.`,
			remedy: 'Publish with `delendai work publish`, which derives the publication ref from the work ref instead of spelling it.',
		};
	}
	return refuseKindInAgent(identity.agent, branch);
};

/**
 * A commit on a delendai branch authored as somebody other than the
 * repository's configured identity. On 2026-09-26 a reviewer authored its
 * commits as `MiniMax-m3-review-20260926 <…@MiniMax-m3.invalid>` — an
 * identity nobody configured, with the task and the date typed into it.
 * Who did the work is the agent segment of the work ref; the author is
 * the identity the project configured.
 */
export const refuseBorrowedAuthor = (
	policy: IResolvedDevelopmentPolicy,
	operation: Extract<IGuardedGitOperation, { kind: 'commit' }>,
): IGitGuardVerdict | undefined => {
	const { branch, author, configuredAuthor } = operation;
	if (branch === undefined || author === undefined) return undefined;
	if (configuredAuthor === undefined || author === configuredAuthor)
		return undefined;
	if (!insideNamespaces(policy, branch)) return undefined;
	return {
		refused: true,
		reason: `this commit on \`${branch}\` is authored as \`${author}\`, but the repository is configured as \`${configuredAuthor}\`. On delendai's branches the author is the configured identity; the agent is named by the work ref.`,
		remedy: 'Commit without overriding the author (no --author, no -c user.name/user.email, no GIT_AUTHOR_* variables); name yourself with DELENDAI_AGENT_ID, which `delendai work enter` puts in the ref.',
	};
};

/**
 * The shape rules alone, for a ref inside the work or publication
 * namespace; `undefined` for anything else, or when it is well shaped.
 */
/**
 * Deleting a work or publication branch whose commits nothing else holds
 * deletes the only copy of that work. On 2026-09-26 five work refs were
 * removed that way; the next boot found the checkpoints gone and blocked
 * every agent on the machine. Judged inside delendai's namespaces for
 * whoever runs git (x00687): the namespaces are the work model's, and a
 * runtime that sets no agent marker must not slip past it.
 */
export const refuseLosingDeletion = (
	policy: IResolvedDevelopmentPolicy,
	branch: string,
	deletedTipKept: boolean | undefined,
): IGitGuardVerdict | undefined =>
	deletedTipKept === false &&
	policyNamespaces(policy).prefixes.some((prefix) =>
		branch.startsWith(prefix),
	)
		? {
				refused: true,
				reason: `deleting \`${branch}\` would lose its commits: no other branch, publication or the integration branch contains them.`,
				remedy: `Publish the work (\`delendai work publish\`) or bring it into the branch that continues it, then delete \`${branch}\`. A person who means to discard it can push with --no-verify.`,
			}
		: undefined;

export const judgeNamespaceShape = (
	policy: IResolvedDevelopmentPolicy,
	operation: IGuardedGitOperation,
): IGitGuardVerdict | undefined => {
	if (!policy.workspace.pinnedCheckout) return undefined;
	if (operation.kind === 'commit')
		return refuseBorrowedAuthor(policy, operation);
	if (operation.kind === 'branch-create') {
		if (!operation.ref.startsWith('refs/heads/')) return undefined;
		const branch = operation.ref.slice('refs/heads/'.length);
		return refuseUnshapedWorkRef(policy, operation.ref, branch);
	}
	if (operation.kind === 'branch-delete')
		return refuseLiveUnitDeletion(policy, operation);
	if (operation.kind === 'push' && operation.deleting) {
		if (!operation.remoteRef.startsWith('refs/heads/')) return undefined;
		return refuseLosingDeletion(
			policy,
			operation.remoteRef.slice('refs/heads/'.length),
			operation.deletedTipKept,
		);
	}
	if (operation.kind === 'push' && !operation.deleting) {
		if (!operation.remoteRef.startsWith('refs/heads/')) return undefined;
		const branch = operation.remoteRef.slice('refs/heads/'.length);
		return (
			refuseUnshapedWorkRef(policy, operation.remoteRef, branch, false) ??
			refuseUnshapedPublication(policy, branch)
		);
	}
	return undefined;
};

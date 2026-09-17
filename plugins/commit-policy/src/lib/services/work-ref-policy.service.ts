import { anchorFromPolicy, resolveWorkRef } from '@delendai/core/public';
import type {
	IWorkRefInput,
	IWorkRefToolOptions,
} from '../contracts/interfaces/work-ref-tool.interface';
import { agentIdOf } from './work-ref-naming.service';

export const validatePolicyAndRef = (
	options: IWorkRefToolOptions,
	input: IWorkRefInput,
): { readonly ref: string } | { readonly reason: string } => {
	const policy = options.policy;
	if (policy === undefined) {
		return {
			reason: 'WORK_REF_POLICY_REQUIRED: no resolved development policy is available',
		};
	}
	if (
		!policy.persistence.usesWipRefs ||
		policy.persistence.strategy !== 'wip-ref'
	) {
		return {
			reason: `WORK_REF_POLICY_UNSUPPORTED: profile ${policy.profile} does not resolve to persistence.strategy=wip-ref`,
		};
	}
	if (!policy.persistence.exactScope) {
		return {
			reason: 'WORK_REF_POLICY_UNSUPPORTED: exact-scope persistence is required',
		};
	}
	const template = policy.branches.workRefTemplate;
	const prefix = policy.branches.workRefPrefix;
	if (template.length === 0 || prefix.length === 0) {
		return {
			reason: 'WORK_REF_POLICY_INVALID: workRefTemplate and workRefPrefix are required',
		};
	}
	const ref = resolveWorkRef(template, {
		agent: agentIdOf(options.agentId),
		proposal: input.proposal,
		slice: input.slice,
		generation: input.generation,
		...(input.topic === undefined ? {} : { topic: input.topic }),
	});
	const shortRef = ref.startsWith('refs/') ? ref.slice('refs/'.length) : ref;
	const normalizedPrefix = prefix.startsWith('refs/')
		? prefix.slice('refs/'.length)
		: prefix;
	const visible = policy.branches.workRefVisibility === 'visible';
	const integrationRef = `refs/heads/${policy.branches.integration}`;
	const releaseRef = `refs/heads/${policy.branches.release}`;
	const publicationPrefix = `refs/heads/${policy.branches.publicationRefPrefix}`;
	if (
		!/^refs\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(ref) ||
		ref.includes('..') ||
		ref.includes('@{') ||
		ref.includes('//') ||
		!shortRef.startsWith(normalizedPrefix) ||
		(visible
			? !ref.startsWith('refs/heads/')
			: ref.startsWith('refs/heads/')) ||
		ref === integrationRef ||
		ref === releaseRef ||
		ref.startsWith(publicationPrefix)
	) {
		return {
			reason: `WORK_REF_INVALID: resolved ref ${JSON.stringify(ref)} is outside the policy work namespace or overlaps a protected branch`,
		};
	}
	if (options.wip === undefined) {
		return {
			reason: 'WORK_REF_ENGINE_UNAVAILABLE: the WIP engine could not bind this repository',
		};
	}
	const expectedAnchor = anchorFromPolicy(policy);
	const boundAnchor = options.wip.context.anchor;
	if (
		boundAnchor.required !== expectedAnchor.required ||
		boundAnchor.branch !== expectedAnchor.branch
	) {
		return {
			reason: 'WORK_REF_ANCHOR_MISMATCH: the bound WIP engine does not match the resolved development policy',
		};
	}
	return { ref };
};

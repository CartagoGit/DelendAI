/**
 * identity-policy.helper.ts — what the project's `development.identity`
 * axis does to a resolved identity (f00758).
 *
 * One pure function, three consumers: the work engine (`agentFor`), the
 * CLI (`resolveAgent`, the boot notice) and commit-policy (work-ref
 * naming). The axis decides two things and nothing else:
 *
 * - `providerBridge: false` — an identity that only the bridge observed
 *   stops counting; declared model ids (`--agent`, `DELENDAI_AGENT_ID`)
 *   are the only way in.
 * - `unrecognizedModel` — what an identity no source named a model
 *   becomes: `'refuse'` (the default, keeping the historical refusal) or
 *   `{ use }`, one project-wide name so refs and commit authors stay
 *   readable when the project does not care WHICH model works.
 *
 * WHY it is a pure helper and not a branch in each consumer: identity is
 * load-bearing (refs, authors, review attribution), and three readers
 * that drift is exactly the x00560 failure this resolver exists to end.
 */
import type {
	IPolicyIdentity,
	IUnrecognizedModelPolicy,
} from '../contracts/interfaces/policy-identity.interface';
import {
	normalizeWorkAgentId,
	WORK_AGENT_UNKNOWN,
} from './resolve-work-agent.service';
import type { IWorkAgentIdentity } from './resolve-work-agent.interface';

/** Identities that name the model itself — never renamed, never refused. */
const declaresModel = (identity: IWorkAgentIdentity): boolean =>
	identity.source === 'model' || identity.source === 'environment';

/**
 * The rename an `unrecognizedModel: { use }` asks for, normalised the way
 * every agent id is; `undefined` when it names nothing (validate refuses
 * that shape at startup, so here it only degrades to the refusal).
 */
const renamedTo = (
	policy: IUnrecognizedModelPolicy | undefined,
): string | undefined => {
	if (policy === undefined || typeof policy !== 'object') return undefined;
	const id = normalizeWorkAgentId(policy.use);
	return id.length > 0 ? id : undefined;
};

/**
 * `identity`, as this project's axis counts it. Absent axis means the
 * chain PR #1037 landed: model → environment → provider → client, and
 * nothing renamed.
 */
export const applyIdentityPolicy = (
	identity: IWorkAgentIdentity,
	axis: IPolicyIdentity | undefined,
): IWorkAgentIdentity => {
	// No axis declared: the chain PR #1037 landed, untouched — a client
	// name keeps its `client-` marker here; only a project that RULES on
	// identity changes what any source counts as.
	if (axis === undefined) return identity;
	if (declaresModel(identity)) return identity;
	const recognized =
		identity.source === 'provider' && axis?.providerBridge !== false;
	if (recognized) return identity;
	// Not a declared model, and not a permitted observation: the project
	// either renames every such actor to one name of its own, or keeps
	// the refusal — naming the axis in the remedy is the callers' job.
	const renamed = renamedTo(axis?.unrecognizedModel);
	return renamed === undefined
		? { id: WORK_AGENT_UNKNOWN, source: 'none' }
		: { id: renamed, source: 'policy' };
};

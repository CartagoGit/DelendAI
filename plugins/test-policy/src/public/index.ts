/**
 * Public barrel for `@mcp-vertex/test-policy` — the policy vocabulary
 * and resolver, for hosts/tests that want to reason about the policy
 * without registering the plugin.
 */
export {
	isTestPolicyMode,
	POLICY_GUIDANCE,
	resolveTestPolicy,
	TEST_POLICY_MODES,
	type IResolvedTestPolicy,
	type IResolveTestPolicyInput,
	type ITestPolicyMode,
	type ITestPolicySource,
} from '../lib/policy';
export {
	clearPolicyOverride,
	readPolicyOverride,
	writePolicyOverride,
	type IPolicyOverride,
} from '../lib/policy-store';

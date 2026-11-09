/**
 * hermetic-agent-identity-setup.ts — no spec reads the environment of the
 * shell that runs it.
 *
 * The agent that runs a suite is not the agent a spec is about: a spec
 * that expects "no agent declared" resolved the reviewer's own id, and
 * three work specs resolved the runner's `DELENDAI_SESSION_ID` instead of
 * the session they entered, while CI, which sets none, stayed green.
 * Every delendai variable but the runner's own, every agent marker and
 * both session variables are cleared before each spec file; the hermetic
 * setups after this one set their own values, and a spec that tests
 * identity sets the variables it needs.
 */
import { clearAmbientEnvironment } from '../../../packages/test-kit/src/lib/hermetic-environment.helper';
import {
	AGENT_ENVIRONMENT_MARKERS,
	AGENT_HOST_MARKER_PREFIXES,
	DELENDAI_SESSION_VARIABLE,
	UNIT_SESSION_VARIABLE,
} from '../../../packages/core/src/lib/contracts/constants/agent-environment.constant';

clearAmbientEnvironment({
	names: [
		...AGENT_ENVIRONMENT_MARKERS,
		DELENDAI_SESSION_VARIABLE,
		UNIT_SESSION_VARIABLE,
	],
	prefixes: AGENT_HOST_MARKER_PREFIXES,
});

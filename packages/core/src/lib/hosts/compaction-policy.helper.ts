/**
 * compaction-policy.helper.ts — one compaction policy, rendered per host.
 *
 * A host with a native setting gets it: the threshold in its own variable
 * and its lifecycle hooks running the handover command. Any other host gets
 * a directive the MCP server sends, telling the session to compact now. The
 * hosts' names and variables are declared with the hosts, never here.
 */
import type {
	IAgentHost,
	ICompactionPolicy,
	ICompactionRendering,
} from '../contracts/interfaces/agent-host.interface';

const MIN_PERCENT = 1;
const MAX_PERCENT = 99;

const assertPolicy = (policy: ICompactionPolicy): void => {
	if (
		!Number.isInteger(policy.thresholdPercent) ||
		policy.thresholdPercent < MIN_PERCENT ||
		policy.thresholdPercent > MAX_PERCENT
	) {
		throw new RangeError(
			`compaction thresholdPercent must be an integer from ${MIN_PERCENT} to ${MAX_PERCENT}`,
		);
	}
	if (policy.handoverCommand.trim().length === 0) {
		throw new RangeError('compaction handoverCommand is required');
	}
};

/** The directive a host without a native setting is sent when its context is large. */
export const compactNowDirective = (policy: ICompactionPolicy): string =>
	`Context is past ${policy.thresholdPercent}% of the window: persist the handover (${policy.handoverCommand} persist), compact now, then re-read its index (${policy.handoverCommand} index).`;

/** `policy` in the form `host` takes it. */
export const renderCompactionFor = (
	host: IAgentHost,
	policy: ICompactionPolicy,
): ICompactionRendering => {
	assertPolicy(policy);
	const native = host.compaction;
	if (native?.thresholdEnv === undefined && native?.hooks === undefined) {
		return {
			kind: 'directive',
			hostId: host.id,
			directive: compactNowDirective(policy),
		};
	}
	const hooks = [
		...(native.hooks?.beforeCompaction === undefined
			? []
			: [
					{
						event: native.hooks.beforeCompaction,
						command: `${policy.handoverCommand} persist`,
					},
				]),
		...(native.hooks?.sessionStart === undefined
			? []
			: [
					{
						event: native.hooks.sessionStart,
						command: `${policy.handoverCommand} index`,
					},
				]),
	];
	return {
		kind: 'native',
		hostId: host.id,
		env:
			native.thresholdEnv === undefined
				? {}
				: { [native.thresholdEnv]: String(policy.thresholdPercent) },
		hooks,
	};
};

import type { IResolverTerminalReason } from '../../dispatch/capability-resolver.error';

/**
 * What a caller should do next, per terminal reason. A `Record` keyed by
 * the union, so adding a reason without a handled branch is a type error
 * here instead of a message nobody wrote. The resolver's own `nextAction`
 * wins when it supplies one.
 */
export const RESOLVER_DEFAULT_NEXT_ACTION: Readonly<
	Record<IResolverTerminalReason, string>
> = {
	catalog_missing:
		'Call tool_search to inspect the loaded domains and actions.',
	ambiguous_capability:
		'Repeat the request with the qualified name of one of the listed candidates.',
	policy_denied:
		'Call plugin_activate to re-authorize it, or tool_search to inspect the current surface.',
	host_read_only:
		'Retry the capability invocation once the host reports ready.',
	activation_failed:
		'Retry once; if it fails again, call plugin_activate for the plugin and inspect its status.',
	argument_validation_failed:
		'Supply either `qualifiedName` or both `domain` and `action`, and arguments that match the tool schema.',
	execution_failed:
		'Read the detail, fix the arguments or the environment it names, and retry.',
};

/** Every terminal reason, in the order the union lists them. */
export const RESOLVER_TERMINAL_REASONS = Object.keys(
	RESOLVER_DEFAULT_NEXT_ACTION,
) as readonly IResolverTerminalReason[];

/** The exact key an operator edits in `mcp-vertex.config.json`. */
export const ERROR_REPORTING_ENABLE_CONFIG =
	'plugins.error-reporting.options.enabled' as const;

/**
 * The privacy contract, stated in the notice itself rather than behind
 * a link: it is the claim the operator is being asked to accept. It is
 * enforced by `privacy-validator.helper.ts`, not merely promised here —
 * a report naming any absolute path, URL, email, branch, token or code
 * fragment is refused before dispatch.
 */
export const ERROR_REPORTING_PRIVACY_SENTENCE =
	'Only mcp-vertex-internal errors are sent (error type, mcp-vertex stack frames, versions) — never your code, file contents, paths, branch names, environment or project data.';

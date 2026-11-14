/** The permissions the integrator's App needs, as GitHub names them in an App manifest. */
export const APP_WRITE_PERMISSIONS = [
	'contents',
	'pull_requests',
	'issues',
	'actions',
	'workflows',
] as const;

export const APP_READ_PERMISSIONS = ['checks'] as const;

/** GitHub's manifest form: the integrator needs no webhook and no event. */
export const APP_MANIFEST_BASE = {
	public: false,
	hook_attributes: { url: 'https://example.invalid/unused', active: false },
	default_events: [],
} as const;

/**
 * ci-environment.constant.ts — how a CI provider names itself.
 */

/**
 * The variables each CI provider sets in the jobs it runs and in nothing
 * else. A project on another forge adds its runner's here, or names its
 * own in `DELENDAI_CI_VARIABLES` (comma-separated).
 */
export const CI_PROVIDER_VARIABLES: readonly string[] = [
	'GITHUB_ACTIONS',
	'GITLAB_CI',
	'BUILDKITE',
	'CIRCLECI',
	'TF_BUILD',
	'JENKINS_URL',
	'TEAMCITY_VERSION',
	'DRONE',
	'WOODPECKER_CI',
	'FORGEJO_ACTIONS',
	'GITEA_ACTIONS',
];

/** Extra provider variables a project declares, without a code change. */
export const CI_VARIABLES_OVERRIDE = 'DELENDAI_CI_VARIABLES';

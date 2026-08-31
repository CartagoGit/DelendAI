export const RELEASE_TYPES = ['patch', 'minor', 'major'] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

/** Bump a plain X.Y.Z version without importing release tooling into runtime. */
export const nextVersion = (current: string, kind: ReleaseType): string => {
	const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(current.trim());
	if (match === null)
		throw new Error(`not a plain X.Y.Z version: "${current}"`);
	let major = Number(match[1]);
	let minor = Number(match[2]);
	let patch = Number(match[3]);
	switch (kind) {
		case 'major':
			major += 1;
			minor = 0;
			patch = 0;
			break;
		case 'minor':
			minor += 1;
			patch = 0;
			break;
		case 'patch':
			patch += 1;
			break;
	}
	return `${major}.${minor}.${patch}`;
};
export const RELEASE_STATES = ['draft', 'cut', 'aborted', 'promoted'] as const;
export type ReleaseState = (typeof RELEASE_STATES)[number];

export interface IReleaseCandidateMetadata {
	readonly sourceDevelopSha: string;
	readonly baseMainSha: string;
	readonly fromVersion: string;
	readonly targetVersion: string;
	readonly type: ReleaseType;
	readonly slug: string;
	readonly branch: string;
	readonly actor: string;
	readonly timestamp: string;
	readonly includedProposals: readonly string[];
	readonly state: ReleaseState;
}

const SHA = /^[0-9a-f]{7,64}$/i;
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isReleaseType = (value: string): value is ReleaseType =>
	(RELEASE_TYPES as readonly string[]).includes(value);

export const assertReleaseType = (value: string): ReleaseType => {
	if (!isReleaseType(value))
		throw new Error(
			`release type must be patch, minor, or major: "${value}"`,
		);
	return value;
};

export const slugifyRelease = (value: string): string => {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (!LOWER_KEBAB.test(slug))
		throw new Error(`release slug must be lower-kebab-case: "${value}"`);
	return slug;
};

export const assertReleaseSlug = (value: string): string => {
	if (!LOWER_KEBAB.test(value))
		throw new Error(`release slug must be lower-kebab-case: "${value}"`);
	return value;
};

export const releaseBranch = (type: ReleaseType, slug: string): string =>
	`release/${assertReleaseType(type)}/${assertReleaseSlug(slug)}`;

export const assertReleaseMetadata = (
	metadata: IReleaseCandidateMetadata,
): IReleaseCandidateMetadata => {
	if (!SHA.test(metadata.sourceDevelopSha) || !SHA.test(metadata.baseMainSha))
		throw new Error('release metadata requires valid source and base SHAs');
	if (!VERSION.test(metadata.fromVersion))
		throw new Error('release metadata requires a plain fromVersion');
	if (
		!isReleaseType(metadata.type) ||
		metadata.branch !== releaseBranch(metadata.type, metadata.slug)
	)
		throw new Error('release metadata branch does not match type and slug');
	if (
		metadata.targetVersion !==
		nextVersion(metadata.fromVersion, metadata.type)
	)
		throw new Error(
			'release metadata targetVersion does not match release type',
		);
	if (!VERSION.test(metadata.targetVersion))
		throw new Error('release metadata requires plain X.Y.Z versions');
	if (!LOWER_KEBAB.test(metadata.slug))
		throw new Error('release metadata requires a lower-kebab slug');
	if (metadata.actor.trim() === '')
		throw new Error('release metadata requires an actor');
	if (Number.isNaN(Date.parse(metadata.timestamp)))
		throw new Error('release metadata requires a valid timestamp');
	if (!RELEASE_STATES.includes(metadata.state))
		throw new Error('release metadata requires a valid state');
	if (
		metadata.includedProposals.some(
			(proposal) =>
				typeof proposal !== 'string' || proposal.trim() === '',
		)
	)
		throw new Error('release metadata proposals must be non-empty strings');
	return metadata;
};

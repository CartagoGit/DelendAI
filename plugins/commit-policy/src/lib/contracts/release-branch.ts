import { releaseBranch, type ReleaseType } from '@mcp-vertex/core/public';

/** Release branches are candidates only; protected branches remain immutable. */
export const isReleaseBranch = (branch: string): boolean =>
	/^release\/(patch|minor|major)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branch);

export const buildReleaseBranch = (type: ReleaseType, slug: string): string =>
	releaseBranch(type, slug);

import { access } from 'node:fs/promises';
import { join } from 'node:path';

import {
	DEFAULT_PACKAGE_MANAGER_RULES,
	matchPackageManager,
} from '../../bootstrap/package-manager-rules';
import type { IFileReader } from '../../bootstrap/analyze-project';
import type { PackageManagerId } from '../../bootstrap/package-runners';

export type { PackageManagerId };

export const LOCKFILES_BY_PACKAGE_MANAGER: Readonly<
	Record<PackageManagerId, readonly string[]>
> = {
	bun: ['bun.lock', 'bun.lockb'],
	pnpm: ['pnpm-lock.yaml'],
	yarn: ['yarn.lock'],
	npm: ['package-lock.json'],
	unknown: [],
};

export interface IPackageManagerProbe {
	readonly exists: (relativePath: string) => Promise<boolean>;
}

const createFileSystemProbe = (
	workspaceRoot: string,
): IPackageManagerProbe => ({
	exists: async (relativePath) =>
		access(join(workspaceRoot, relativePath)).then(
			() => true,
			() => false,
		),
});

export const detectPackageManager = async (
	workspaceRoot: string,
	probe: IPackageManagerProbe = createFileSystemProbe(workspaceRoot),
): Promise<PackageManagerId> =>
	matchPackageManager(
		{
			exists: probe.exists,
			readFile: async () => undefined,
			listDir: async () => [],
		} satisfies IFileReader,
		DEFAULT_PACKAGE_MANAGER_RULES,
	);

export const lockfilesForPackageManager = (
	packageManager: PackageManagerId,
): readonly string[] => LOCKFILES_BY_PACKAGE_MANAGER[packageManager];

export const primaryLockfileForPackageManager = (
	packageManager: PackageManagerId,
): string | undefined => lockfilesForPackageManager(packageManager)[0];

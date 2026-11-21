/**
 * unit-shared-dependencies.service.ts — a unit uses the shared checkout's
 * dependencies instead of installing its own.
 *
 * Seven worktrees each ran `bun install` and took 4 GB of disk and its
 * writes. When the unit's lockfile is the shared checkout's, the modules
 * are the same files: each `node_modules` of the unit is a real folder
 * whose entries link to the shared ones, except the links between
 * workspace packages, which are copied as relative links so they resolve
 * to the unit's own sources. A unit whose lockfile differs, or a shared
 * checkout with no modules, gets nothing here and installs as before.
 */
import {
	mkdir,
	readdir,
	readFile,
	readlink,
	rm,
	stat,
	symlink,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
	UNIT_INSTALL_BY_LOCKFILE,
	UNIT_LINK_MAX_DEPTH,
	UNIT_LINK_SHARED_HIDDEN,
	UNIT_LINK_SKIPPED_FOLDERS,
} from '../contracts/constants/unit-dependencies.constant';
import { sharedCheckout } from '../shared/shared-checkout';
import type { IUnitDependencies } from '../contracts/interfaces/unit-dependencies.interface';

const isDirectory = (path: string): Promise<boolean> =>
	stat(path).then(
		(info) => info.isDirectory(),
		() => false,
	);

const read = (path: string): Promise<Buffer | undefined> =>
	readFile(path).then(
		(bytes) => bytes,
		() => undefined,
	);

/** Every folder under `root` that holds a `node_modules`, the root included. */
const moduleFolders = async (
	root: string,
	folder = '',
	depth = 0,
): Promise<readonly string[]> => {
	const here = join(root, folder);
	const found = (await isDirectory(join(here, 'node_modules')))
		? [folder]
		: [];
	if (depth >= UNIT_LINK_MAX_DEPTH) return found;
	const entries = await readdir(here, { withFileTypes: true }).catch(
		() => [],
	);
	const nested = await Promise.all(
		entries
			.filter(
				(entry) =>
					entry.isDirectory() &&
					!UNIT_LINK_SKIPPED_FOLDERS.has(entry.name),
			)
			.map((entry) =>
				moduleFolders(root, join(folder, entry.name), depth + 1),
			),
	);
	return [...found, ...nested.flat()];
};

/** True when a link in the shared tree joins workspace packages, not the store. */
const joinsWorkspace = (
	sharedRoot: string,
	linkFolder: string,
	target: string,
): boolean => {
	if (isAbsolute(target)) return false;
	const resolved = resolve(linkFolder, target);
	const inside = relative(sharedRoot, resolved);
	return (
		!inside.startsWith('..') && !inside.split(sep).includes('node_modules')
	);
};

const mirror = async (
	sharedRoot: string,
	shared: string,
	unit: string,
): Promise<void> => {
	await mkdir(unit, { recursive: true });
	const entries = await readdir(shared, { withFileTypes: true });
	for (const entry of entries) {
		if (
			entry.name.startsWith('.') &&
			!UNIT_LINK_SHARED_HIDDEN.has(entry.name)
		)
			continue;
		const from = join(shared, entry.name);
		const to = join(unit, entry.name);
		if (entry.isSymbolicLink()) {
			const target = await readlink(from);
			await symlink(
				joinsWorkspace(sharedRoot, shared, target) ? target : from,
				to,
			);
		} else if (entry.name.startsWith('@') && entry.isDirectory())
			await mirror(sharedRoot, from, to);
		else await symlink(from, to);
	}
};

/**
 * Link the unit's modules to the shared checkout's, or return undefined
 * when they are not the same dependencies (different lockfile, no shared
 * modules, the unit is the shared checkout) and the unit must install.
 */
export const linkSharedDependencies = async (
	path: string,
	/** Where the dependencies come from; the clone's shared checkout unless named. */
	shared: string | undefined = sharedCheckout(path),
): Promise<IUnitDependencies | undefined> => {
	if (shared === undefined || resolve(shared) === resolve(path))
		return undefined;
	for (const { lockfile } of UNIT_INSTALL_BY_LOCKFILE) {
		const own = await read(join(path, lockfile));
		if (own === undefined) continue;
		const theirs = await read(join(shared, lockfile));
		if (theirs === undefined || !own.equals(theirs)) return undefined;
		const made: string[] = [];
		try {
			const folders = await moduleFolders(shared);
			if (!folders.includes('')) return undefined;
			for (const folder of folders) {
				if (folder !== '' && !(await isDirectory(join(path, folder))))
					continue;
				const modules = join(path, folder, 'node_modules');
				made.push(modules);
				await mirror(
					shared,
					join(shared, folder, 'node_modules'),
					modules,
				);
			}
			return { status: 'linked', from: shared };
		} catch {
			// Leave nothing half-linked: the install that follows starts clean.
			await Promise.all(
				made.map((folder) =>
					rm(folder, { recursive: true, force: true }),
				),
			);
			return undefined;
		}
	}
	return undefined;
};

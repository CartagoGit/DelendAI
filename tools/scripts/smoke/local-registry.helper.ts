/**
 * Packs every publishable package from its staged build and serves the
 * tarballs from a throwaway npm registry, so a consumer project installs
 * `@delendai/cli` the way a user will: from a registry, resolving the
 * transitive `@delendai/*` ranges itself. npm's `file:` overrides would
 * install what the test names instead of what the CLI's manifest asks for,
 * and hide exactly the gap this proves. Only the `@delendai` scope points
 * here; every other dependency still comes from the real registry.
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import {
	packRewrittenTarball,
	stageBuildForPublish,
	type IWorkspaceDepsPlan,
} from '../publish/workspace-deps.ts';
import { PUBLISH_ORDER } from '../release/release-plan';

export interface IPackedPackage {
	readonly name: string;
	readonly version: string;
	readonly tarball: string;
	/** The manifest as packed, workspace ranges already rewritten. */
	readonly manifest: Readonly<Record<string, unknown>>;
}

interface IManifest {
	readonly name?: string;
	readonly version?: string;
	readonly private?: boolean;
	readonly files?: unknown;
}

const readManifest = (root: string, dir: string): IManifest =>
	JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));

/** Stages and packs the release order's publishable packages into `outDir`. */
export const packPublishablePackages = async (
	root: string,
	scratch: string,
	outDir: string,
): Promise<readonly IPackedPackage[]> => {
	const dirs = PUBLISH_ORDER.filter((dir) => {
		if (!existsSync(join(root, dir, 'package.json'))) return false;
		const pkg = readManifest(root, dir);
		return (
			typeof pkg.name === 'string' &&
			pkg.private !== true &&
			Array.isArray(pkg.files)
		);
	});
	const plan: IWorkspaceDepsPlan = {
		packageVersions: new Map(
			dirs.map((dir) => {
				const pkg = readManifest(root, dir);
				return [pkg.name as string, pkg.version as string] as const;
			}),
		),
	};
	await mkdir(outDir, { recursive: true });
	const packed: IPackedPackage[] = [];
	for (const dir of dirs) {
		const pkg = readManifest(root, dir);
		const group = dir.startsWith('packages/') ? 'packages' : 'plugins';
		const buildDir = join(
			root,
			'build',
			group,
			dir.slice(dir.indexOf('/') + 1),
			pkg.version as string,
		);
		const stageDir = join(scratch, 'staging', dir);
		await stageBuildForPublish(join(root, dir), buildDir, stageDir);
		const tarball = await packRewrittenTarball(stageDir, plan, { outDir });
		const read = spawnSync(
			'tar',
			['-xzOf', tarball, 'package/package.json'],
			{
				encoding: 'utf8',
			},
		);
		if (read.status !== 0) {
			throw new Error(
				`cannot read the manifest of ${tarball}: ${read.stderr}`,
			);
		}
		packed.push({
			name: pkg.name as string,
			version: pkg.version as string,
			tarball,
			manifest: JSON.parse(read.stdout),
		});
	}
	return packed;
};

export interface ILocalRegistry {
	readonly url: string;
	readonly stop: () => void;
}

const baseName = (path: string): string =>
	path.slice(path.lastIndexOf('/') + 1);

/** Serves packuments and tarballs of `packages`; any other path answers 404. */
export const serveLocalRegistry = async (
	packages: readonly IPackedPackage[],
): Promise<ILocalRegistry> => {
	const byName = new Map(packages.map((entry) => [entry.name, entry]));
	const bytes = new Map<string, Buffer>();
	for (const entry of packages) {
		bytes.set(baseName(entry.tarball), await readFile(entry.tarball));
	}
	const server = createServer((request, response) => {
		const send = (
			status: number,
			body: Buffer | string,
			type: string,
		): void => {
			response.writeHead(status, { 'content-type': type });
			response.end(body);
		};
		const origin = `http://${request.headers.host}`;
		const path = decodeURIComponent(
			(request.url ?? '/').split('?')[0] ?? '/',
		);
		if (path.startsWith('/-/tarballs/')) {
			const body = bytes.get(baseName(path));
			if (body === undefined) return send(404, 'not found', 'text/plain');
			return send(200, body, 'application/octet-stream');
		}
		const entry = byName.get(path.slice(1));
		const body =
			entry === undefined
				? undefined
				: bytes.get(baseName(entry.tarball));
		if (entry === undefined || body === undefined) {
			return send(404, 'not found', 'text/plain');
		}
		send(
			200,
			JSON.stringify({
				name: entry.name,
				'dist-tags': { latest: entry.version },
				versions: {
					[entry.version]: {
						...entry.manifest,
						dist: {
							tarball: `${origin}/-/tarballs/${baseName(entry.tarball)}`,
							integrity: `sha512-${createHash('sha512').update(body).digest('base64')}`,
							shasum: createHash('sha1')
								.update(body)
								.digest('hex'),
						},
					},
				},
			}),
			'application/json',
		);
	});
	await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}/`,
		stop: () => void server.close(),
	};
};

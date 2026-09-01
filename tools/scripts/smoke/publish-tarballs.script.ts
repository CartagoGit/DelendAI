#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import {
	packRewrittenTarball,
	type IWorkspaceDepsPlan,
} from '../publish/workspace-deps.ts';
import { PUBLISH_ORDER } from '../release/release-plan';

const ROOT = resolve(import.meta.dir, '../../..');
const CANDIDATE_DIR = join(ROOT, 'packages/cli');
const SKIP_EXIT_CODE = 2;
const HELP_TOKEN = 'Usage:';

interface IPackageJson {
	readonly name?: string;
	readonly version?: string;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly bin?: string | Readonly<Record<string, string>>;
}

class CommandFailure extends Error {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;

	constructor(
		command: string,
		args: readonly string[],
		code: number | null,
		stdout: string,
		stderr: string,
	) {
		super(
			`${command} ${args.join(' ')} failed (${code ?? 'signal'}):\n${stderr || stdout}`,
		);
		this.name = 'CommandFailure';
		this.code = code;
		this.stdout = stdout;
		this.stderr = stderr;
	}
}

const readJson = async <T>(path: string): Promise<T> =>
	JSON.parse(await readFile(path, 'utf8')) as T;

const run = async (
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<{ readonly stdout: string; readonly stderr: string }> =>
	new Promise((resolveRun, rejectRun) => {
		const child = spawn(command, [...args], {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.on('error', (error) => {
			rejectRun(
				new CommandFailure(
					command,
					args,
					null,
					stdout,
					stderr || error.message,
				),
			);
		});
		child.on('close', (code) => {
			if (code === 0) {
				resolveRun({ stdout, stderr });
				return;
			}
			rejectRun(new CommandFailure(command, args, code, stdout, stderr));
		});
	});

const hasWorkspaceDependency = (pkg: IPackageJson): boolean =>
	Object.values(pkg.dependencies ?? {}).some((range) =>
		range.startsWith('workspace:'),
	);

const selectBinName = (
	bin: IPackageJson['bin'],
	packageName: string,
): string => {
	if (typeof bin === 'string') {
		return packageName.startsWith('@')
			? packageName.slice(packageName.indexOf('/') + 1)
			: packageName;
	}
	if (bin === undefined) {
		throw new Error(`${packageName} does not declare a bin entry`);
	}
	if ('mcpv' in bin) return 'mcpv';
	const first = Object.keys(bin)[0];
	if (first === undefined) {
		throw new Error(`${packageName} declares an empty bin map`);
	}
	return first;
};

/**
 * Every intra-repo `workspace:` dep must resolve to the DEPENDED-ON
 * package's own version, read from that package's own `package.json` — not
 * the root manifest's version, which carries no guarantee of matching any
 * individual package.
 */
const collectWorkspacePackageVersions = async (): Promise<
	ReadonlyMap<string, string>
> => {
	const entries = await Promise.all(
		PUBLISH_ORDER.map(async (dir) => {
			const pkg = await readJson<IPackageJson>(
				join(ROOT, dir, 'package.json'),
			);
			if (typeof pkg.name !== 'string') {
				throw new Error(`${dir} is missing a package name`);
			}
			if (typeof pkg.version !== 'string') {
				throw new Error(`${dir} is missing a package version`);
			}
			return [pkg.name, pkg.version] as const;
		}),
	);
	return new Map(entries);
};

const isRegistryUnavailable = (error: CommandFailure): boolean => {
	const output = `${error.stderr}\n${error.stdout}`;
	return /EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network request|registry/i.test(
		output,
	);
};

const main = async (): Promise<void> => {
	const candidatePkg = await readJson<IPackageJson>(
		join(CANDIDATE_DIR, 'package.json'),
	);
	if (typeof candidatePkg.name !== 'string') {
		throw new Error('packages/cli/package.json is missing its name');
	}
	if (!hasWorkspaceDependency(candidatePkg)) {
		throw new Error(
			`${candidatePkg.name} no longer depends on workspace:* packages; smoke candidate drifted`,
		);
	}

	const plan: IWorkspaceDepsPlan = {
		packageVersions: await collectWorkspacePackageVersions(),
	};
	const binName = selectBinName(candidatePkg.bin, candidatePkg.name);
	const scratch = await mkdtemp(join(tmpdir(), 'mcp-vertex-publish-smoke-'));

	try {
		await writeFile(
			join(scratch, 'package.json'),
			`${JSON.stringify({ name: 'publish-tarballs-smoke', private: true }, null, '\t')}\n`,
			'utf8',
		);

		const tarballPath = await packRewrittenTarball(CANDIDATE_DIR, plan, {
			outDir: scratch,
		});
		const tarballArg = `./${basename(tarballPath)}`;

		try {
			await run(
				'npm',
				['install', '--no-audit', '--no-fund', tarballArg],
				scratch,
			);
		} catch (error) {
			if (
				error instanceof CommandFailure &&
				isRegistryUnavailable(error)
			) {
				process.stderr.write(
					'smoke requires npm registry access; rerun with --offline after a local tarball\n',
				);
				process.exit(SKIP_EXIT_CODE);
			}
			throw error;
		}

		const installedPackageJsonPath = join(
			scratch,
			'node_modules',
			candidatePkg.name,
			'package.json',
		);
		const installedPackageJson = await readFile(
			installedPackageJsonPath,
			'utf8',
		);
		if (installedPackageJson.includes('workspace:*')) {
			throw new Error(
				`installed manifest still contains workspace:* at ${installedPackageJsonPath}`,
			);
		}

		const help = await run(
			join(scratch, 'node_modules', '.bin', binName),
			['--help'],
			scratch,
		);
		if (!help.stdout.includes(HELP_TOKEN)) {
			throw new Error(
				`${binName} --help did not include ${JSON.stringify(HELP_TOKEN)}`,
			);
		}

		process.stdout.write(
			`✓ publish tarballs smoke: installed ${candidatePkg.name} from ${tarballArg}, verified no workspace:* remained, and ${binName} --help booted.\n`,
		);
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
};

await main().catch((error: unknown) => {
	process.stderr.write(
		`✖ publish tarballs smoke failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
	);
	process.exitCode = 1;
});

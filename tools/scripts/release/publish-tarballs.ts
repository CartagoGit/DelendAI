import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface IPublishTarballsInput {
	readonly pkgDir: string;
	readonly tarballPaths: readonly string[];
	readonly tool: 'npm' | 'bun';
	readonly registry: string | undefined;
}

export interface IPublishTarballResult {
	readonly tool: 'npm' | 'bun';
	readonly tarballPath: string;
	readonly ok: boolean;
	readonly stderr?: string;
}

const createMissingTarballsError = (): Error & {
	readonly code: 'missing-tarballs';
} => {
	const error = new Error(
		'npm publish requires verified tarballs; refusing to publish directly from the source directory.',
	) as Error & { readonly code: 'missing-tarballs' };
	Object.defineProperty(error, 'code', {
		value: 'missing-tarballs',
		enumerable: true,
		configurable: true,
	});
	return error;
};

export function assertTarballsProvided(
	input: IPublishTarballsInput,
): asserts input is IPublishTarballsInput & {
	readonly tarballPaths: readonly string[];
} {
	if (input.tool === 'npm' && input.tarballPaths.length === 0) {
		throw createMissingTarballsError();
	}
}

const runSpawn = async (
	cmd: string,
	args: readonly string[],
	cwd: string,
): Promise<{ readonly ok: boolean; readonly stderr?: string }> =>
	new Promise((resolveSpawn) => {
		const child = spawn(cmd, [...args], {
			cwd,
			stdio: ['ignore', 'ignore', 'pipe'],
		});
		let stderr = '';
		child.stderr?.setEncoding('utf8');
		child.stderr?.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.on('error', (error) => {
			const message = stderr.trim() || error.message;
			resolveSpawn({
				ok: false,
				...(message.length > 0 ? { stderr: message } : {}),
			});
		});
		child.on('close', (code) => {
			const message = stderr.trim();
			resolveSpawn({
				ok: code === 0,
				...(message.length > 0 ? { stderr: message } : {}),
			});
		});
	});

const registryArgs = (registry: string | undefined): readonly string[] =>
	registry === undefined ? [] : [`--registry=${registry}`];

const publishWithNpm = async (
	input: IPublishTarballsInput,
	tarballPath: string,
): Promise<IPublishTarballResult> => {
	const publish = await runSpawn(
		'npm',
		['publish', tarballPath, ...registryArgs(input.registry)],
		input.pkgDir,
	);
	return {
		tool: 'npm',
		tarballPath,
		ok: publish.ok,
		...(publish.stderr !== undefined ? { stderr: publish.stderr } : {}),
	};
};

const publishWithBun = async (
	input: IPublishTarballsInput,
	tarballPath: string,
): Promise<IPublishTarballResult> => {
	const extractDir = await mkdtemp(join(tmpdir(), 'delendai-bun-publish-'));
	try {
		const extract = await runSpawn(
			'tar',
			['-xf', tarballPath, '-C', extractDir],
			input.pkgDir,
		);
		if (!extract.ok) {
			return {
				tool: 'bun',
				tarballPath,
				ok: false,
				...(extract.stderr !== undefined
					? { stderr: extract.stderr }
					: {}),
			};
		}
		const publish = await runSpawn(
			'bun',
			['publish', ...registryArgs(input.registry)],
			join(extractDir, 'package'),
		);
		return {
			tool: 'bun',
			tarballPath,
			ok: publish.ok,
			...(publish.stderr !== undefined ? { stderr: publish.stderr } : {}),
		};
	} finally {
		await rm(extractDir, { recursive: true, force: true });
	}
};

/**
 * Publishes each tarball using the configured tool. For 'npm' it uses
 * `npm publish <tarball> --registry=<registry>`. For 'bun' it extracts
 * the tarball in a temp dir and runs `bun publish --registry=<registry>`.
 *
 * Returns one result per tarball. Bails fast on the first failure.
 */
export const publishTarballs = async (
	input: IPublishTarballsInput,
): Promise<readonly IPublishTarballResult[]> => {
	assertTarballsProvided(input);
	const results: IPublishTarballResult[] = [];
	for (const tarballPath of input.tarballPaths) {
		const result =
			input.tool === 'npm'
				? await publishWithNpm(input, tarballPath)
				: await publishWithBun(input, tarballPath);
		results.push(result);
		if (!result.ok) {
			break;
		}
	}
	return results;
};

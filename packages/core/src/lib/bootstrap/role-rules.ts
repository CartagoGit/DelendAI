import type { IProjectRoleFinding, IProjectRole } from '@mcp-vertex/contracts';

import type { IProjectShapeContext } from './project-shape';

export interface IProjectRoleRule {
	readonly id: IProjectRole;
	readonly priority: number;
	readonly matches: (
		ctx: IProjectShapeContext,
	) => Promise<readonly string[]> | readonly string[];
}

const dependencyNames = (
	deps: Readonly<Record<string, string>>,
	names: readonly string[],
): readonly string[] => {
	const present = new Set(
		Object.keys(deps).map((name) => name.toLowerCase()),
	);
	return names.filter((name) => present.has(name.toLowerCase()));
};

const pythonText = async (ctx: IProjectShapeContext): Promise<string> => {
	const paths = ['pyproject.toml', 'requirements.txt', 'setup.py'];
	const chunks: string[] = [];
	for (const path of paths) {
		const text = await ctx.reader.readFile(path);
		if (text !== undefined) chunks.push(text.toLowerCase());
	}
	return chunks.join('\n');
};

const pythonDependencies = async (
	ctx: IProjectShapeContext,
	names: readonly string[],
): Promise<readonly string[]> => {
	const text = await pythonText(ctx);
	return names.filter((name) => text.includes(name.toLowerCase()));
};

const findGoCommand = async (
	ctx: IProjectShapeContext,
): Promise<string | undefined> => {
	if (!(await ctx.reader.exists('go.mod'))) return undefined;
	if (await ctx.reader.exists('cmd/main.go')) return 'cmd/main.go';
	for (const child of await ctx.reader.listDir('cmd')) {
		const candidate = `cmd/${child}/main.go`;
		if (await ctx.reader.exists(candidate)) return candidate;
	}
	return undefined;
};

const packageEvidence = (
	ctx: IProjectShapeContext,
	field: 'bin' | 'main' | 'module' | 'exports',
): readonly string[] =>
	ctx.packageJson?.[field] === undefined ? [] : [`package.json#${field}`];

const hasDependency = (
	ctx: IProjectShapeContext,
	names: readonly string[],
): readonly string[] =>
	dependencyNames(ctx.dependencies, names).map(
		(name) => `package.json#dependencies.${name}`,
	);

const role = (
	id: IProjectRole,
	priority: number,
	matches: IProjectRoleRule['matches'],
): IProjectRoleRule => ({ id, priority, matches });

/**
 * Role rules intentionally match all applicable roles. They are not a
 * first-match classifier: role membership is orthogonal and therefore
 * plural. Specialized Python stacks must win over the old library fallback.
 */
export const DEFAULT_PROJECT_ROLE_RULES: readonly IProjectRoleRule[] = [
	role('backend-api', 100, async (ctx) => {
		const evidence = [
			...hasDependency(ctx, [
				'@nestjs/core',
				'fastify',
				'express',
				'koa',
				'hono',
			]),
		];
		for (const name of await pythonDependencies(ctx, [
			'django',
			'fastapi',
			'flask',
		])) {
			evidence.push(`python-dependency:${name}`);
		}
		return evidence;
	}),
	role('web-client', 90, (ctx) =>
		hasDependency(ctx, [
			'astro',
			'next',
			'react',
			'vue',
			'@angular/core',
			'@sveltejs/kit',
			'react-dom',
		]),
	),
	role('cli', 80, async (ctx) => {
		const evidence = [
			...packageEvidence(ctx, 'bin'),
			...hasDependency(ctx, [
				'commander',
				'yargs',
				'oclif',
				'@oclif/core',
			]),
		];
		for (const name of await pythonDependencies(ctx, ['typer', 'click'])) {
			evidence.push(`python-dependency:${name}`);
		}
		const goCommand = await findGoCommand(ctx);
		if (goCommand !== undefined) evidence.push(goCommand);
		if (
			(await ctx.reader.exists('Cargo.toml')) &&
			(await ctx.reader.exists('src/main.rs'))
		) {
			evidence.push('src/main.rs');
		}
		return evidence;
	}),
	role('game', 70, (ctx) =>
		hasDependency(ctx, [
			'phaser',
			'pixi.js',
			'babylonjs',
			'@babylonjs/core',
		]),
	),
	role('data-pipeline', 60, async (ctx) => {
		const evidence: string[] = [];
		for (const name of await pythonDependencies(ctx, [
			'celery',
			'pandas',
			'polars',
		])) {
			evidence.push(`python-dependency:${name}`);
		}
		evidence.push(...hasDependency(ctx, ['bullmq', 'airflow']));
		return evidence;
	}),
	role('mcp-server', 50, (ctx) =>
		hasDependency(ctx, [
			'@modelcontextprotocol/sdk',
			'@modelcontextprotocol/server',
		]),
	),
	role('library', 10, async (ctx) => {
		const evidence = [
			...packageEvidence(ctx, 'exports'),
			...packageEvidence(ctx, 'module'),
			...packageEvidence(ctx, 'main'),
		];
		if (evidence.length > 0) return evidence;
		if (
			(await ctx.reader.exists('Cargo.toml')) &&
			!(await ctx.reader.exists('src/main.rs'))
		) {
			return ['Cargo.toml'];
		}
		return [];
	}),
];

/** Match every role and retain the evidence behind each match. */
export const matchProjectRoles = async (
	ctx: IProjectShapeContext,
	rules: readonly IProjectRoleRule[] = DEFAULT_PROJECT_ROLE_RULES,
): Promise<readonly IProjectRoleFinding[]> => {
	const matches: Array<{ finding: IProjectRoleFinding; priority: number }> =
		[];
	for (const rule of rules) {
		const signals = [...(await rule.matches(ctx))];
		if (signals.length === 0) continue;
		matches.push({
			priority: rule.priority,
			finding: {
				role: rule.id,
				signals: signals.map((evidence) => ({
					source: 'role-rules',
					value: rule.id,
					evidence,
					confidence: 'strong' as const,
				})),
			},
		});
	}
	return matches
		.sort(
			(a, b) =>
				b.priority - a.priority ||
				a.finding.role.localeCompare(b.finding.role),
		)
		.map(({ finding }) => finding);
};

/** Backwards-friendly alias matching the other bootstrap rule modules. */
export const matchRoles = matchProjectRoles;

/** Short alias for callers that do not need the project-specific prefix. */
export const detectProjectRoles = matchProjectRoles;

/** Compatibility alias matching the default-name convention of old rules. */
export const DEFAULT_ROLE_RULES = DEFAULT_PROJECT_ROLE_RULES;

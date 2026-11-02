/**
 * generated-merge-driver.script.spec.ts — a derived file never stops a
 * merge, an authored line inside one still does, and the three lists that
 * describe "generated" (the driver's rules, `.gitattributes`, the
 * post-merge refresh) cannot drift from `gen:all`'s own.
 */
import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { GENERATED_REFRESH_PATHS } from '../../../packages/cli/src/contracts/constants/generated-refresh.constant';
import { STEPS } from '../gen-all.script';

import {
	GENERATED_MERGE_RULES,
	mergeGenerated,
	resolveGenerated,
	ruleFor,
} from './generated-merge-driver.script';

/** The repository this spec is checked into, from its own location. */
const repoRootForSpec = (): string => join(__dirname, '..', '..', '..');

const roots: string[] = [];
const workspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'merge-driver-'));
	roots.push(root);
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const trackedFiles = (pathspecs: readonly string[]): readonly string[] =>
	execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
		cwd: repoRootForSpec(),
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter((path) => path.length > 0);

const rule = (path: string) => {
	const found = ruleFor(path);
	if (found === undefined) throw new Error(`no rule for ${path}`);
	return found;
};

describe('the table of derived files', () => {
	it('names the generating steps of the catalog and of the inventory', () => {
		expect(
			ruleFor('docs/delendai/agent-catalog.generated.json')?.steps,
		).toEqual(['agent-catalog', 'host-hints']);
		expect(
			ruleFor('docs/delendai/CORE-PUBLIC-API-INVENTORY.md')?.steps,
		).toEqual(['core-public-inventory']);
	});

	it('no longer claims the bootstrap, which is written by hand', () => {
		expect(ruleFor('docs/delendai/AGENT-BOOTSTRAP.md')).toBeUndefined();
	});

	it('matches a path given with a leading directory, as git passes it', () => {
		expect(
			ruleFor('/abs/repo/docs/delendai/CORE-PUBLIC-API-INVENTORY.md'),
		).toBeDefined();
	});

	it('anchors the root README and leaves the others to their authors', () => {
		expect(ruleFor('README.md')?.block).toBeDefined();
		expect(ruleFor('packages/cli/README.md')).toBeUndefined();
	});

	it('claims nothing it cannot generate', () => {
		expect(ruleFor('packages/core/src/index.ts')).toBeUndefined();
	});

	it('says, for every entry, why the file is derived', () => {
		for (const each of GENERATED_MERGE_RULES) {
			expect(each.because.length).toBeGreaterThan(20);
			expect(each.paths.length).toBeGreaterThan(0);
		}
	});
});

describe('mergeGenerated', () => {
	const whole = rule('docs/delendai/CORE-PUBLIC-API-INVENTORY.md');
	const table = rule('docs/delendai/README.md');
	const block = (rows: string): string =>
		`<!-- BEGIN GENERATED: docs-index -->\n${rows}<!-- END GENERATED: docs-index -->`;
	const page = (prose: string, rows: string): string =>
		`# Guides\n\n${prose}\n\n${block(rows)}\n\nfooter\n`;

	it('merges rows two candidates added in different places', () => {
		const base = 'a\nb\nc\nd\ne\nf\ng\nh\n';
		const resolved = mergeGenerated({
			rule: whole,
			base,
			ours: 'A\nb\nc\nd\ne\nf\ng\nh\n',
			theirs: 'a\nb\nc\nd\ne\nf\ng\nH\n',
		});
		expect(resolved).toEqual({
			outcome: 'merged-textually',
			content: 'A\nb\nc\nd\ne\nf\ng\nH\n',
		});
	});

	it('keeps ours, with no conflict, when both changed the same line', () => {
		const resolved = mergeGenerated({
			rule: whole,
			base: 'Total exports: 1\n',
			ours: 'Total exports: 2\n',
			theirs: 'Total exports: 3\n',
		});
		expect(resolved).toEqual({
			outcome: 'kept-ours-for-regeneration',
			content: 'Total exports: 2\n',
		});
	});

	it('merges the authored text around a generated region and keeps ours inside it', () => {
		const resolved = mergeGenerated({
			rule: table,
			base: page('intro', '| a |\n'),
			ours: page('intro', '| a |\n| ours |\n'),
			theirs: page('intro, and theirs wrote more', '| a |\n| theirs |\n'),
		});
		expect(resolved.outcome).toBe('kept-ours-for-regeneration');
		expect(resolved.content).toBe(
			page('intro, and theirs wrote more', '| a |\n| ours |\n'),
		);
	});

	it('leaves a conflict in authored text for a person', () => {
		const resolved = mergeGenerated({
			rule: table,
			base: page('intro', '| a |\n'),
			ours: page('mine', '| a |\n'),
			theirs: page('theirs', '| a |\n'),
		});
		expect(resolved).toEqual({ outcome: 'authored-conflict' });
	});

	it('leaves it for a person when a side has lost its markers', () => {
		const resolved = mergeGenerated({
			rule: table,
			base: page('intro', '| a |\n'),
			ours: page('intro', '| a |\n'),
			theirs: '# Guides\n\nno table any more\n',
		});
		expect(resolved).toEqual({ outcome: 'authored-conflict' });
	});
});

describe('resolveGenerated', () => {
	const files = (base: string, ours: string, theirs: string) => {
		const root = workspace();
		const paths = {
			base: join(root, 'base'),
			ours: join(root, 'ours'),
			theirs: join(root, 'theirs'),
		};
		writeFileSync(paths.base, base);
		writeFileSync(paths.ours, ours);
		writeFileSync(paths.theirs, theirs);
		return paths;
	};

	it('writes the resolution into OURS, where git reads it', () => {
		const paths = files('x: 1\n', 'x: 2\n', 'x: 3\n');
		const code = resolveGenerated({
			...paths,
			path: 'docs/delendai/TOKEN-BUDGETS.md',
		});
		expect(code).toBe(0);
		expect(readFileSync(paths.ours, 'utf8')).toBe('x: 2\n');
	});

	it('leaves the conflict alone for a file it does not generate', () => {
		const paths = files('x\n', 'y\n', 'z\n');
		expect(
			resolveGenerated({ ...paths, path: 'packages/core/src/index.ts' }),
		).toBe(1);
		expect(readFileSync(paths.ours, 'utf8')).toBe('y\n');
	});

	it('fails rather than pretend, when git cannot merge', () => {
		const paths = files('x\n', 'y\n', 'z\n');
		expect(
			resolveGenerated({
				...paths,
				path: 'docs/delendai/TOKEN-BUDGETS.md',
				merge: () => {
					throw new Error('merge-file exploded');
				},
			}),
		).toBe(1);
	});
});

describe('the lists that describe "generated" cannot diverge', () => {
	const routed = readFileSync(
		join(repoRootForSpec(), '.gitattributes'),
		'utf8',
	)
		.split('\n')
		.filter((line) => line.includes('merge=delendai-generated'))
		.map((line) => line.trim().split(/\s+/u)[0] ?? '')
		.filter((each) => each.length > 0);

	/** `.gitattributes` spells a directory `dir/**`, any depth `**\/x`. */
	const normalise = (pattern: string): string =>
		pattern.replace(/\/\*\*$/u, '/').replace(/^\*\*\//u, '');

	it('routes every path the driver knows how to merge', () => {
		const declared = new Set(routed.map(normalise));
		for (const each of GENERATED_MERGE_RULES) {
			for (const path of each.paths) {
				expect(`${path} routed`).toBe(
					`${declared.has(path) ? path : `${path} NOT in .gitattributes`} routed`,
				);
			}
		}
	});

	it('knows how to merge every path it routes', () => {
		const probes = routed.map(normalise).map((pattern) => {
			if (pattern.endsWith('/')) return `${pattern}anything.md`;
			if (pattern.startsWith('/')) return pattern.slice(1);
			return pattern;
		});
		for (const probe of probes) {
			expect(
				`${probe}: ${ruleFor(probe) === undefined ? 'NO RULE' : 'has a rule'}`,
			).toBe(`${probe}: has a rule`);
		}
	});

	it('routes the output of every gen:all step, and only real steps', () => {
		// A generator added to `gen:all` without a route is a generator
		// whose output conflicts on every pair of candidates again.
		const covered = new Set(
			GENERATED_MERGE_RULES.flatMap((each) => each.steps),
		);
		const known = new Set(STEPS.map((step) => step.name));
		for (const step of known) {
			expect(
				`${step}: ${covered.has(step) ? 'routed' : 'NOT ROUTED'}`,
			).toBe(`${step}: routed`);
		}
		for (const step of covered) {
			expect(
				`${step}: ${known.has(step) ? 'a step' : 'NOT A STEP'}`,
			).toBe(`${step}: a step`);
		}
	});

	it('refreshes after a merge exactly the files it routes', () => {
		const refreshed = new Set(trackedFiles(GENERATED_REFRESH_PATHS));
		const routedFiles = trackedFiles(['.']).filter(
			(path) => ruleFor(path) !== undefined,
		);
		const missing = routedFiles.filter((path) => !refreshed.has(path));
		const unrouted = [...refreshed].filter(
			(path) => ruleFor(path) === undefined,
		);
		expect({ missing, unrouted }).toEqual({ missing: [], unrouted: [] });
	});

	it('matches a per-workspace file wherever it lives', () => {
		expect(ruleFor('packages/cli/AGENT.md')?.steps).toEqual(['agent-md']);
		expect(ruleFor('plugins/git/AGENT.md')?.steps).toEqual(['agent-md']);
		expect(
			ruleFor('plugins/git/src/generated/tool-outputs.ts')?.steps,
		).toEqual(['tool-types']);
	});

	it('matches everything under a generated directory', () => {
		expect(
			ruleFor('docs/delendai/plugins/auto-generated/browser.md')?.steps,
		).toEqual(['plugin-manifests']);
	});
});

describe('two branches that each add a guide', () => {
	it('merge in a real repository without stopping', () => {
		const root = workspace();
		const git = (...args: string[]): string =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
		git('init', '-q', '-b', 'main');
		git('config', 'user.email', 'a@example.com');
		git('config', 'user.name', 'A');
		git('config', 'commit.gpgsign', 'false');
		mkdirSync(join(root, 'docs/delendai'), { recursive: true });
		const index = (rows: string): string =>
			`# Guides\n\nhand-written\n\n<!-- BEGIN GENERATED: docs-index -->\n${rows}<!-- END GENERATED: docs-index -->\n`;
		writeFileSync(
			join(root, 'docs/delendai/README.md'),
			index('| base |\n'),
		);
		writeFileSync(
			join(root, '.gitattributes'),
			'docs/delendai/README.md merge=delendai-generated\n',
		);
		git('add', '-A');
		git('commit', '-q', '-m', 'base');
		const addGuide = (branch: string): void => {
			git('checkout', '-q', '-b', branch, 'main');
			writeFileSync(
				join(root, 'docs/delendai/README.md'),
				index(`| base |\n| ${branch} |\n`),
			);
			git('add', '-A');
			git('commit', '-q', '-m', branch);
		};
		addGuide('left');
		addGuide('right');
		const driver = join(__dirname, 'generated-merge-driver.script.ts');
		const merged = execFileSync(
			'git',
			[
				'-c',
				`merge.delendai-generated.driver=bun ${driver} %O %A %B docs/delendai/README.md`,
				'merge',
				'--no-edit',
				'left',
			],
			{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
		);
		expect(merged).toContain('Merge made');
		expect(git('status', '--porcelain')).toBe('');
		expect(
			readFileSync(join(root, 'docs/delendai/README.md'), 'utf8'),
		).toContain('hand-written');
	});
});

import { pathToFileURL } from 'node:url';

const projectRoot = pathToFileURL(`${process.cwd()}/`);
const { commitWithGuard } = await import(
	new URL(
		'plugins/commit-policy/src/lib/services/commit-driver.ts',
		projectRoot,
	).href
);

const staged = new Set<string>();
let adds = 0;
let releaseAdds: (() => void) | undefined;
const bothAdds = new Promise<void>((resolve) => {
	releaseAdds = resolve;
});

const run = async (args: readonly string[]) => {
	if (args[0] === 'rev-parse' && args[1] === 'HEAD')
		return { ok: true, output: 'base-head\n' };
	if (args[0] === 'reset' && args[1] === 'HEAD') {
		staged.clear();
		return { ok: true, output: '' };
	}
	if (args[0] === 'add') {
		for (const path of args.slice(args.indexOf('--') + 1)) staged.add(path);
		adds += 1;
		if (adds === 2) releaseAdds?.();
		await bothAdds;
		return { ok: true, output: '' };
	}
	if (args[0] === 'diff' && args[1] === '--cached')
		return { ok: true, output: [...staged].join('\n') };
	if (args[0] === 'commit') {
		if (staged.size === 0)
			return { ok: false, output: '', reason: 'nothing to commit' };
		return { ok: true, output: 'committed' };
	}
	if (args[0] === 'rev-parse' && args[1] === '--short')
		return { ok: true, output: 'abcdef0\n' };
	return {
		ok: false,
		output: '',
		reason: `unexpected command: ${args.join(' ')}`,
	};
};

const common = {
	run,
	message: 'feat: isolated review fixture',
	authorFlag: 'Audit <audit@example.test>',
	enforceSubset: true,
	branch: 'work',
	// Mirrors register(): sharedDriver omits workspaceRoot. With it
	// undefined, commitWithGuard uses the shared-index adapter.
} as const;

const [first, second] = await Promise.all([
	commitWithGuard({ ...common, allowList: ['agent-a.txt'] }),
	commitWithGuard({ ...common, allowList: ['agent-b.txt'] }),
]);

console.log(
	JSON.stringify(
		{
			workspaceRootPassedByRegister: false,
			bothCommitsCommitted: first.committed && second.committed,
			first: { committed: first.committed, refusal: first.refusal },
			second: { committed: second.committed, refusal: second.refusal },
			sharedIndexAfter: [...staged],
		},
		null,
		2,
	),
);

import { describe, expect, it } from 'vitest';

import {
	GUARD_BLOCK_BEGIN,
	GUARD_BLOCK_END,
	GUARD_CREATED_FILE,
} from '@delendai/core/lib/contracts/constants/guard-hooks.constant';
import {
	planGuardHook,
	removeGuardBlock,
	renderGuardBlock,
} from '@delendai/core/lib/guard-hooks/guard-hook-block.helper';

/**
 * A PORTABLE invocation: a bare command name for PATH to resolve and a
 * path relative to the repository root.
 *
 * It used to be `{ runner: '/usr/bin/bun', entry: "/opt/it's/cli.ts" }`,
 * and the block wrote both verbatim into `.husky/*` — files the project
 * tracks in git. On the machine that reported it that meant
 * `/home/<their-name>/.bun/bin/bun`, committed and pushed to colleagues
 * for whom it is simply false.
 */
const invocation = { runner: 'bun', entry: "packages/it's/cli.ts" };

describe('renderGuardBlock', () => {
	it('calls the guard for the hook, and lets git proceed when delendai is gone', () => {
		const block = renderGuardBlock('pre-commit', invocation);
		expect(block.startsWith(GUARD_BLOCK_BEGIN)).toBe(true);
		expect(block.endsWith(GUARD_BLOCK_END)).toBe(true);
		expect(block).toContain('guard pre-commit "$@" || exit 1');
		expect(block).toContain(
			'was not found (DELENDAI_GUARD_CMD, node_modules/.bin/delendai, or delendai on PATH); the development policy is not enforced',
		);
		// A single quote in a path cannot break out of the shell word.
		expect(block).toContain("packages/it'\\''s/cli.ts");
	});

	it('writes nothing that is true only on the machine that installed it', () => {
		// The whole point. These files are tracked, so every absolute path
		// in them is wrong for everybody else — and a home directory is a
		// username published to whoever can read the repository.
		for (const hook of [
			'pre-commit',
			'pre-push',
			'reference-transaction',
			'post-checkout',
			'post-merge',
		] as const) {
			const block = renderGuardBlock(hook, invocation);
			expect(block).not.toContain('/home/');
			expect(block).not.toContain('/Users/');
			expect(block).not.toMatch(/(?:^|[\s'"])\/(?:usr|opt|bin)\//u);
			// Everything it does reach for is resolved where it runs.
			expect(block).toContain('git rev-parse --show-toplevel');
			expect(block).toContain('node_modules/.bin/delendai');
			expect(block).toContain('command -v delendai');
		}
	});

	it('reads the machine-specific answer from git config, which is never tracked', () => {
		// Absolute paths are real and somebody has to hold them. They go
		// where git deliberately never takes them from a repository.
		const block = renderGuardBlock('pre-commit', invocation);
		expect(block).toContain('git config --get delendai.guard.runner');
		expect(block).toContain('git config --get delendai.guard.entry');
	});

	it('buffers stdin and feeds it back for hooks that read it', () => {
		const block = renderGuardBlock('pre-push', invocation);
		expect(block).toContain('cat > "$delendai_guard_stdin"');
		expect(block).toContain('< "$delendai_guard_stdin"');
		expect(block).toContain('exec 0< "$delendai_guard_stdin"');
	});

	it('starts the CLI for reference-transaction only when a local branch is created', () => {
		const block = renderGuardBlock('reference-transaction', invocation);
		expect(block).toContain('[ "$1" = prepared ]');
		expect(block).toContain("grep -q '^00* [^ ]* refs/heads/'");
	});
});

describe('planGuardHook', () => {
	it('creates a marked shell hook when there is none, stable on reinstall', () => {
		const edit = planGuardHook('pre-commit', undefined, invocation);
		expect(edit.action).toBe('create');
		if (edit.action !== 'create') throw new Error('unreachable');
		expect(edit.content.startsWith(`#!/bin/sh\n${GUARD_BLOCK_BEGIN}`)).toBe(
			true,
		);
		expect(edit.content.endsWith(`${GUARD_CREATED_FILE}\n`)).toBe(true);
		expect(
			planGuardHook('pre-commit', edit.content, invocation).action,
		).toBe('unchanged');
	});

	it('adds the block first in an existing shell hook, and removes it exactly', () => {
		const existing = '#!/usr/bin/env bash\nset -e\necho "project hook"\n';
		const edit = planGuardHook('pre-commit', existing, invocation);
		expect(edit.action).toBe('update');
		if (edit.action !== 'update') throw new Error('unreachable');
		expect(
			edit.content.startsWith(
				`#!/usr/bin/env bash\n${GUARD_BLOCK_BEGIN}`,
			),
		).toBe(true);
		expect(edit.content.endsWith('set -e\necho "project hook"\n')).toBe(
			true,
		);
		expect(removeGuardBlock(edit.content)).toBe(existing);
		expect(
			planGuardHook('pre-commit', edit.content, invocation).action,
		).toBe('unchanged');
	});

	it('refreshes a block written for another invocation', () => {
		const installed = planGuardHook('pre-push', '#!/bin/sh\n', invocation);
		if (installed.action !== 'update') throw new Error('unreachable');
		const moved = planGuardHook('pre-push', installed.content, {
			runner: 'node',
			entry: '/new/cli.js',
		});
		expect(moved.action).toBe('update');
		if (moved.action !== 'update') throw new Error('unreachable');
		expect(moved.content).toContain('/new/cli.js');
		expect(moved.content).not.toContain('/usr/bin/bun');
		expect(moved.content.split(GUARD_BLOCK_BEGIN)).toHaveLength(2);
	});

	it('never rewrites a hook that is not a shell script', () => {
		const edit = planGuardHook(
			'pre-push',
			'#!/usr/bin/env node\nconsole.log(1)\n',
			invocation,
		);
		expect(edit.action).toBe('unsupported');
		if (edit.action !== 'unsupported') throw new Error('unreachable');
		expect(edit.reason).toContain('not a shell script');
		expect(edit.reason).toContain('guard pre-push');
	});

	it('leaves content without a complete block untouched', () => {
		expect(removeGuardBlock('#!/bin/sh\necho hi\n')).toBe(
			'#!/bin/sh\necho hi\n',
		);
		const broken = `#!/bin/sh\n${GUARD_BLOCK_BEGIN}\necho half\n`;
		expect(removeGuardBlock(broken)).toBe(broken);
	});
});

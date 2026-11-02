import { describe, expect, it } from 'vitest';

import {
	createInMemoryCriticalSection,
	integrationSectionKey,
} from '@delendai/core/lib/integration-engine/critical-section';

const gate = () => {
	let open!: () => void;
	const opened = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { opened, open };
};

describe('integration critical section', () => {
	it('never runs two bodies under one key at the same time', async () => {
		const section = createInMemoryCriticalSection();
		const first = gate();
		const order: string[] = [];
		const a = section.run('k', async () => {
			order.push('a:start');
			await first.opened;
			order.push('a:end');
		});
		const b = section.run('k', async () => {
			order.push('b:start');
		});
		await Promise.resolve();
		expect(order).toEqual(['a:start']);
		first.open();
		await Promise.all([a, b]);
		expect(order).toEqual(['a:start', 'a:end', 'b:start']);
	});

	it('lets different keys advance independently', async () => {
		const section = createInMemoryCriticalSection();
		const blocked = gate();
		const slow = section.run('one', () => blocked.opened);
		await expect(section.run('two', async () => 'done')).resolves.toBe(
			'done',
		);
		blocked.open();
		await slow;
	});

	it('does not wedge the key after a body rejects', async () => {
		const section = createInMemoryCriticalSection();
		await expect(
			section.run('k', async () => {
				throw new Error('merge refused');
			}),
		).rejects.toThrow('merge refused');
		await expect(section.run('k', async () => 'next')).resolves.toBe(
			'next',
		);
	});

	it('returns what the body returns', async () => {
		const section = createInMemoryCriticalSection();
		await expect(section.run('k', async () => 42)).resolves.toBe(42);
	});

	it('keys the section by repository and integration branch', () => {
		expect(integrationSectionKey('github:acme/widgets', 'develop')).toBe(
			'github:acme/widgets#develop',
		);
		expect(integrationSectionKey('github:acme/widgets', 'main')).not.toBe(
			integrationSectionKey('github:acme/widgets', 'develop'),
		);
	});
});

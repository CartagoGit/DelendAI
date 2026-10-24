import { watch, type FSWatcher } from 'node:fs';

export interface IStoreWatcher {
	dispose(): void;
	isActive(): boolean;
}

export const createStoreWatcher = (input: {
	readonly dir: string;
	readonly fileName: string;
	readonly onChange: () => void;
	readonly watchFactory?: typeof watch;
}): IStoreWatcher => {
	let watcher: FSWatcher | null = null;
	try {
		watcher = (input.watchFactory ?? watch)(
			input.dir,
			{ persistent: false },
			(_eventType, fileName) => {
				if (
					fileName !== null &&
					fileName !== undefined &&
					String(fileName) !== input.fileName
				) {
					return;
				}
				input.onChange();
			},
		);
		watcher.unref?.();
	} catch {
		watcher = null;
	}
	return {
		dispose(): void {
			watcher?.close();
			watcher = null;
		},
		isActive(): boolean {
			return watcher !== null;
		},
	};
};

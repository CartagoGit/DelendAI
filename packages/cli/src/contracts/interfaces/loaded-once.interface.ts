/** A lazily loaded value: `preload()` starts the one load, `get()` awaits it. */
export interface ILoadedOnce<T> {
	readonly preload: () => void;
	readonly get: () => Promise<T>;
}

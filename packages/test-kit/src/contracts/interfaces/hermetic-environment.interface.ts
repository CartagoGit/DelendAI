/** What `clearAmbientEnvironment` removes besides every delendai variable. */
export interface IAmbientEnvironmentMarkers {
	/** Variables removed by exact name (agent markers, session ids). */
	readonly names: readonly string[];
	/** Variables removed by prefix (agent host families). */
	readonly prefixes: readonly string[];
}

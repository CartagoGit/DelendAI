/**
 * A close marker is the mandatory trailing token of an agent's last
 * visible message (in the host project: 8 coloured emoji markers). mcp-vertex
 * knows the mechanics (validation, reason requirement, max length);
 * the host supplies the literal markers.
 */
export interface ICloseMarker {
	/** Stable machine id, e.g. `done`, `cap`, `blocked`. */
	readonly kind: string;
	/** The literal marker text, e.g. `🟩 [HECHO]`. */
	readonly marker: string;
	/** Whether the marker must carry a ` — <reason>` suffix. */
	readonly requiresReason: boolean;
}

export interface ICloseMarkerSet {
	readonly markers: readonly ICloseMarker[];
	/** Max length of the full closing line (marker + reason). */
	readonly maxLineLength: number;
}

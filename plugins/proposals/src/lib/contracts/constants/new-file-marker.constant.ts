/**
 * A path a slice creates is written `new:<path>`. Everything downstream of
 * the declaration reads the path itself: once delivered, it is checked like
 * any other.
 */
export const NEW_FILE_MARKER = 'new:';

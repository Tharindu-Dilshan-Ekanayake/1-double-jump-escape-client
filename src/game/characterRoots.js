/**
 * Every character's root object (at its feet, turning with it), for things
 * drawn over players such as Boxity chat bubbles. Keyed by the player's
 * session id; our own character is LOCAL.
 */
export const LOCAL = 'local'
export const characterRoots = new Map()

/** Bubble heights over the feet: above the name tag for others, above the head for us. */
export const BUBBLE_HEIGHT = { local: 6.7, remote: 9.5 }

/**
 * Camera orbit state, shared with the controller so W always means "away from
 * the camera". yaw 0 puts the camera on the player's +Z side.
 *
 * `shake` (0..1) jitters the camera and dies away by itself; set it to the
 * max of its current value and the new kick (big landings, deaths, the Hydra).
 */
export const cameraRig = { yaw: 0, pitch: 0.32, distance: 18, shake: 0 }

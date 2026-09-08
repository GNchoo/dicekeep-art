// Only these two multiplayer rule sets are supported. Missing mode is legacy clear.
export const MATCH_MODES = Object.freeze(['clear', 'extreme']);
export const MAX_WAVE = 1_000_000;
export const matchMode = value => value === undefined ? 'clear' : MATCH_MODES.includes(value) ? value : null;
export const roomMode = state => matchMode(state?.mode) || 'clear';
export const waveLimit = state => roomMode(state) === 'extreme' ? MAX_WAVE : state.game.timing.clearWave;

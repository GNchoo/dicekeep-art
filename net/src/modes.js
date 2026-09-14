// Missing mode retains the legacy clear room. Duel/co-op use Dicekeep trial rules.
export const MATCH_MODES = Object.freeze(['clear', 'extreme', 'duel', 'coop']);
export const MAX_WAVE = 1_000_000;
export const matchMode = value => value === undefined ? 'clear' : MATCH_MODES.includes(value) ? value : null;
export const roomMode = state => matchMode(state?.mode) || 'clear';
export const battleMode = mode => mode === 'duel' || mode === 'coop';
export const roomCapacity = mode => battleMode(mode) ? 2 : 4;
export const deckMode = mode => mode === 'extreme' || battleMode(mode);
export const waveLimit = state => deckMode(roomMode(state)) ? MAX_WAVE : state.game.timing.clearWave;

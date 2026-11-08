// [module] Is motion switched off? True for the system setting "reduce motion" and for the setting Animations = None (settings.js; S.animations 'all' | 'standard' | 'none').
import { S } from './state.js';
const query = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export const motionOff = () => !!(query && query.matches) || S.animations === 'none';
export const motionQuery = query;

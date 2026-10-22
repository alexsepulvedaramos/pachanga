// The app's own rules for a result entered by a player. Bundled with the domain code into domain.js
// (npm run build:functions) so the Edge Function applies exactly what the app would.

export { reportResult } from '../../../src/app/domain/tournament';

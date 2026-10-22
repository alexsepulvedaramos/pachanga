// The app's own rules for what a player does from their phone (starting their match, entering its
// result). Bundled with the domain code into domain.js (npm run build:functions) so the Edge
// Function applies exactly what the app would.

export { playerStartMatch, reportResult } from '../../../src/app/domain/tournament';

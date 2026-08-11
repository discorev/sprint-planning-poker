// Temporary compatibility fallback for rolling deployments where an older server
// omits cards from a successful registration response. The server-provided deck
// must replace this value once all deployed servers advertise their accepted cards.
export const LEGACY_REGISTRATION_CARD_FALLBACK: readonly string[] = [
  '?',
  '1',
  '2',
  '3',
  '5',
  '8',
  '13',
  '21',
];

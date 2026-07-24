/**
 * License states — all possible states a license can be in.
 *
 * The state machine transitions are:
 *   FREE → TRIAL → MONTHLY/ANNUAL/LIFETIME
 *   MONTHLY/ANNUAL → EXPIRED → GRACE_PERIOD → FREE
 *   any → INVALID / REVOKED → FREE
 */
export type LicenseState =
  | 'free'
  | 'trial'
  | 'monthly'
  | 'annual'
  | 'lifetime'
  | 'expired'
  | 'invalid'
  | 'revoked'
  | 'grace_period';

export const ALL_LICENSE_STATES: readonly LicenseState[] = [
  'free',
  'trial',
  'monthly',
  'annual',
  'lifetime',
  'expired',
  'invalid',
  'revoked',
  'grace_period',
] as const;

/**
 * Human-readable labels for each state.
 */
export const LICENSE_STATE_LABELS: Record<LicenseState, string> = {
  free: 'Free',
  trial: 'Trial',
  monthly: 'Monthly Subscription',
  annual: 'Annual Subscription',
  lifetime: 'Lifetime License',
  expired: 'Expired',
  invalid: 'Invalid',
  revoked: 'Revoked',
  grace_period: 'Grace Period',
};

/**
 * Whether a given state represents an active (paid) license.
 */
export function isActiveState(state: LicenseState): boolean {
  return state === 'monthly' || state === 'annual' || state === 'lifetime' || state === 'trial';
}

/**
 * Whether a given state is in a grace period (still functional but expiring).
 */
export function isGraceState(state: LicenseState): boolean {
  return state === 'grace_period';
}

/**
 * Whether a given state allows full application functionality.
 * Includes active states and grace period.
 */
export function isFunctionalState(state: LicenseState): boolean {
  return isActiveState(state) || isGraceState(state);
}

/**
 * Whether a given state represents an error or problem.
 */
export function isErrorState(state: LicenseState): boolean {
  return state === 'expired' || state === 'invalid' || state === 'revoked';
}

/**
 * Map a license state to an edition for feature-flag purposes.
 *
 * Active paid states (monthly, annual, lifetime, grace_period) default
 * to 'professional'. The LicenseModel.edition field may override this
 * to 'ultimate' when the license grants ultimate access.
 */
export function stateToEdition(state: LicenseState): 'free' | 'professional' | 'ultimate' | 'trial' {
  switch (state) {
    case 'free':
      return 'free';
    case 'trial':
      return 'trial';
    case 'monthly':
    case 'annual':
    case 'lifetime':
    case 'grace_period':
      return 'professional';
    case 'expired':
    case 'invalid':
    case 'revoked':
      return 'free';
    default:
      return 'free';
  }
}

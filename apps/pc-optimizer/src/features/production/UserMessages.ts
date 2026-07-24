/**
 * User-Friendly Error Messages (Part 11) — Production Readiness Framework.
 *
 * Internal errors should not expose technical details to users.
 * This service maps internal error categories and module failures to
 * clear, non-technical user-facing messages.
 *
 * Detailed technical information remains available only in logs and
 * diagnostics via the ErrorHandler and Logger.
 */

import type { ErrorCategory, AppError } from './ErrorHandler';

// ── User-Facing Message Templates ───────────────────────────────────

const USER_MESSAGES: Record<ErrorCategory, string> = {
  warning: 'A minor issue was detected, but the operation completed successfully.',
  recoverable: 'The operation could not be completed. Please try again.',
  critical: 'Optimization could not be completed. Please try again.',
  user_action_required: 'This feature requires your attention. Please check your settings.',
  internal_error: 'This module encountered an unexpected issue. Please try again later.',
};

// ── Module-Specific Messages ────────────────────────────────────────

const MODULE_MESSAGES: Record<string, string> = {
  junk: 'Junk cleaning could not be completed. Please try again.',
  registry: 'Registry cleaning could not be completed. Please try again.',
  startup: 'Startup optimization could not be completed. Please try again.',
  privacy: 'Privacy cleaning could not be completed. Please try again.',
  duplicate: 'Duplicate file scanning could not be completed. Please try again.',
  disk: 'Disk analysis could not be completed. Please try again.',
  performance: 'Performance optimization could not be completed. Please try again.',
  system: 'System information could not be retrieved. Please try again.',
  security: 'Security scan could not be completed. Please try again.',
};

// ── Special-Case Messages ───────────────────────────────────────────

const SPECIAL_MESSAGES: Record<string, string> = {
  'license-validation': 'License validation is temporarily unavailable. Your license will be verified automatically.',
  'license-activation': 'License activation could not be completed. Please check your license key and try again.',
  'backend-connection': 'The optimization service is temporarily unavailable. Please try again in a moment.',
  'file-access': 'A required file could not be accessed. Please ensure the application has the necessary permissions.',
  'module-init': 'A component could not be initialized. The application will continue with limited functionality.',
  'background-task': 'A background operation was interrupted. It will resume automatically.',
};

// ── User Message Service ────────────────────────────────────────────

class UserMessageServiceImpl {
  /**
   * Get a user-friendly message for an error.
   * Never exposes technical details like stack traces or internal error messages.
   */
  getMessage(error: AppError): string {
    // Check for special-case messages first
    const specialKey = this.findSpecialKey(error.action);
    if (specialKey && SPECIAL_MESSAGES[specialKey]) {
      return SPECIAL_MESSAGES[specialKey]!;
    }

    // Check for module-specific messages
    if (error.moduleId && MODULE_MESSAGES[error.moduleId]) {
      return MODULE_MESSAGES[error.moduleId]!;
    }

    // Fall back to category-based message
    return USER_MESSAGES[error.category] ?? USER_MESSAGES.internal_error;
  }

  /**
   * Get a user-friendly message by category.
   */
  getByCategory(category: ErrorCategory): string {
    return USER_MESSAGES[category] ?? USER_MESSAGES.internal_error;
  }

  /**
   * Get a user-friendly message for a module failure.
   */
  getByModule(moduleId: string): string {
    return MODULE_MESSAGES[moduleId] ?? USER_MESSAGES.internal_error;
  }

  /**
   * Get a user-friendly message for a special case.
   */
  getSpecial(key: string): string | undefined {
    return SPECIAL_MESSAGES[key];
  }

  /**
   * Get all user-facing messages (for documentation/diagnostics).
   */
  getAllMessages(): { categories: Record<ErrorCategory, string>; modules: Record<string, string>; special: Record<string, string> } {
    return {
      categories: { ...USER_MESSAGES },
      modules: { ...MODULE_MESSAGES },
      special: { ...SPECIAL_MESSAGES },
    };
  }

  private findSpecialKey(action: string): string | null {
    for (const key of Object.keys(SPECIAL_MESSAGES)) {
      if (action.includes(key)) return key;
    }
    return null;
  }
}

export const userMessageService = new UserMessageServiceImpl();

/**
 * Auth feature — public exports.
 */
export { LoginDialog } from './LoginDialog';
export { AuthBootstrap } from './AuthBootstrap';
export { useAuthStore, useAuth, type AuthPhase, type AuthState } from './authStore';
export { authService, type AuthResultError, type AuthErrorCode, type CustomerProfile } from './authService';
export { apiClient, type ApiError, type NetworkError as NetworkErrorType, type AuthError as AuthErrorType } from './apiClient';
export { tokenStorage, type StoredSession } from './tokenStorage';

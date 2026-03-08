import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

/**
 * Route guard that protects admin routes using backend RBAC resolution.
 *
 * Checks if the user is authenticated and has the `system_admin` AppRole
 * (resolved from the backend RBAC system, not raw JWT roles).
 *
 * If not authenticated, redirects to /auth/login.
 * If authenticated but lacks system_admin AppRole, redirects to home page.
 *
 * @returns True if user is authenticated and has system_admin AppRole, false otherwise
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const userService = inject(UserService);
  const router = inject(Router);

  // Check if user is authenticated
  if (!authService.isAuthenticated()) {
    // If not authenticated, try to refresh token if expired
    const token = authService.getAccessToken();
    if (token && authService.isTokenExpired()) {
      try {
        await authService.refreshAccessToken();
        userService.refreshUser();
      } catch (error) {
        // Refresh failed, redirect to login
        router.navigate(['/auth/login'], {
          queryParams: { returnUrl: state.url }
        });
        return false;
      }
    } else {
      // No token or refresh failed, redirect to login
      router.navigate(['/auth/login'], {
        queryParams: { returnUrl: state.url }
      });
      return false;
    }
  }

  // Ensure permissions are resolved from backend RBAC before checking
  await userService.ensurePermissionsLoaded();

  // Check for system_admin AppRole (resolved from backend RBAC, not raw JWT roles)
  if (!userService.isAdmin()) {
    console.warn('User lacks system_admin AppRole:', userService.getUser()?.roles);
    router.navigate(['/']);
    return false;
  }

  return true;
};

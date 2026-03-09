import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AuthService } from './auth.service';
import { UserService } from './user.service';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('adminGuard', () => {
  let authService: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    getAccessToken: ReturnType<typeof vi.fn>;
    isTokenExpired: ReturnType<typeof vi.fn>;
    refreshAccessToken: ReturnType<typeof vi.fn>;
  };
  let userService: {
    isAdmin: ReturnType<typeof vi.fn>;
    ensurePermissionsLoaded: ReturnType<typeof vi.fn>;
    refreshUser: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let route: ActivatedRouteSnapshot;
  let state: RouterStateSnapshot;

  beforeEach(() => {
    TestBed.resetTestingModule();
    authService = {
      isAuthenticated: vi.fn(),
      getAccessToken: vi.fn(),
      isTokenExpired: vi.fn(),
      refreshAccessToken: vi.fn(),
    };

    userService = {
      isAdmin: vi.fn(),
      ensurePermissionsLoaded: vi.fn().mockResolvedValue(undefined),
      refreshUser: vi.fn(),
      getUser: vi.fn().mockReturnValue({ roles: [] }),
    };

    router = {
      navigate: vi.fn(),
    };

    route = {} as ActivatedRouteSnapshot;
    state = { url: '/admin/dashboard' } as RouterStateSnapshot;

    // Suppress console.warn from the guard
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: Router, useValue: router },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  /**
   * Validates: Requirements 13.6
   * Authenticated user with system_admin AppRole returns true
   */
  it('should return true when user is authenticated and has system_admin AppRole', async () => {
    authService.isAuthenticated.mockReturnValue(true);
    userService.isAdmin.mockReturnValue(true);

    const result = await TestBed.runInInjectionContext(() => adminGuard(route, state));

    expect(result).toBe(true);
    expect(userService.ensurePermissionsLoaded).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  /**
   * Validates: Requirements 13.7
   * Authenticated user without system_admin AppRole redirects to /
   */
  it('should redirect to / when user is authenticated but lacks system_admin AppRole', async () => {
    authService.isAuthenticated.mockReturnValue(true);
    userService.isAdmin.mockReturnValue(false);

    const result = await TestBed.runInInjectionContext(() => adminGuard(route, state));

    expect(result).toBe(false);
    expect(userService.ensurePermissionsLoaded).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  /**
   * Validates: Requirements 13.8
   * Unauthenticated user with no token redirects to /auth/login
   */
  it('should redirect to /auth/login when user is not authenticated and has no token', async () => {
    authService.isAuthenticated.mockReturnValue(false);
    authService.getAccessToken.mockReturnValue(null);

    const result = await TestBed.runInInjectionContext(() => adminGuard(route, state));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { returnUrl: '/admin/dashboard' },
    });
  });

  /**
   * Validates: Requirements 13.8
   * Unauthenticated user with expired token and failed refresh redirects to /auth/login
   */
  it('should redirect to /auth/login when token is expired and refresh fails', async () => {
    authService.isAuthenticated.mockReturnValue(false);
    authService.getAccessToken.mockReturnValue('expired-token');
    authService.isTokenExpired.mockReturnValue(true);
    authService.refreshAccessToken.mockRejectedValue(new Error('refresh failed'));

    const result = await TestBed.runInInjectionContext(() => adminGuard(route, state));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { returnUrl: '/admin/dashboard' },
    });
  });

  /**
   * Validates: Requirements 13.6
   * Expired token + successful refresh + system_admin AppRole returns true
   */
  it('should return true when token refresh succeeds and user has system_admin AppRole', async () => {
    authService.isAuthenticated.mockReturnValue(false);
    authService.getAccessToken.mockReturnValue('expired-token');
    authService.isTokenExpired.mockReturnValue(true);
    authService.refreshAccessToken.mockResolvedValue({});
    userService.isAdmin.mockReturnValue(true);

    const result = await TestBed.runInInjectionContext(() => adminGuard(route, state));

    expect(result).toBe(true);
    expect(authService.refreshAccessToken).toHaveBeenCalled();
    expect(userService.refreshUser).toHaveBeenCalled();
    expect(userService.ensurePermissionsLoaded).toHaveBeenCalled();
  });

  /**
   * Validates: Requirements 13.7
   * Expired token + successful refresh + no system_admin AppRole redirects to /
   */
  it('should redirect to / when token refresh succeeds but user lacks system_admin AppRole', async () => {
    authService.isAuthenticated.mockReturnValue(false);
    authService.getAccessToken.mockReturnValue('expired-token');
    authService.isTokenExpired.mockReturnValue(true);
    authService.refreshAccessToken.mockResolvedValue({});
    userService.isAdmin.mockReturnValue(false);

    const result = await TestBed.runInInjectionContext(() => adminGuard(route, state));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});

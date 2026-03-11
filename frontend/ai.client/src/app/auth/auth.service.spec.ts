import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService, TokenRefreshResponse, LoginResponse } from './auth.service';
import { ConfigService } from '../services/config.service';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let configService: Partial<ConfigService>;

  // Mock localStorage
  let store: Record<string, string> = {};
  const localStorageMock = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };

  // Mock sessionStorage
  let sessionStore: Record<string, string> = {};
  const sessionStorageMock = {
    getItem: vi.fn((key: string) => sessionStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { sessionStore[key] = value; }),
    removeItem: vi.fn((key: string) => { delete sessionStore[key]; }),
    clear: vi.fn(() => { sessionStore = {}; }),
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    store = {};
    sessionStore = {};

    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('sessionStorage', sessionStorageMock);

    // Prevent actual redirects
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });

    // Stub window.dispatchEvent to avoid side effects
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    configService = {
      appApiUrl: signal('http://localhost:8000'),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: ConfigService, useValue: configService },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    httpMock.match(() => true);
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirements 12.2
   * storeTokens stores access_token, refresh_token, and computed expiry to localStorage
   */
  describe('storeTokens', () => {
    it('should store access_token, refresh_token, and expiry in localStorage', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      service.storeTokens({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('access_token', 'test-access-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refresh_token', 'test-refresh-token');
      const expectedExpiry = (now + 3600 * 1000).toString();
      expect(localStorageMock.setItem).toHaveBeenCalledWith('token_expiry', expectedExpiry);
    });

    it('should not store refresh_token if not provided', () => {
      localStorageMock.setItem.mockClear();

      service.storeTokens({
        access_token: 'test-access-token',
        expires_in: 3600,
      });

      const refreshCalls = localStorageMock.setItem.mock.calls.filter(
        (call: string[]) => call[0] === 'refresh_token'
      );
      expect(refreshCalls).toHaveLength(0);
    });
  });

  /**
   * Validates: Requirements 12.3
   * getAccessToken returns stored token
   */
  describe('getAccessToken', () => {
    it('should return the stored access token', () => {
      store['access_token'] = 'my-token';
      expect(service.getAccessToken()).toBe('my-token');
    });

    it('should return null when no token is stored', () => {
      expect(service.getAccessToken()).toBeNull();
    });
  });

  /**
   * Validates: Requirements 12.4, 12.5, 12.6
   * isTokenExpired behavior for valid, within-buffer, and missing expiry
   */
  describe('isTokenExpired', () => {
    it('should return false when token expiry is in the future beyond the buffer', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      // Expiry is 2 minutes from now, buffer is default 60s
      store['token_expiry'] = (now + 120_000).toString();

      expect(service.isTokenExpired()).toBe(false);
    });

    it('should return true when token expiry is within the buffer window', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      // Expiry is 30 seconds from now, buffer is default 60s
      store['token_expiry'] = (now + 30_000).toString();

      expect(service.isTokenExpired()).toBe(true);
    });

    it('should return true when no expiry is stored', () => {
      expect(service.isTokenExpired()).toBe(true);
    });

    it('should return true when token is already expired', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      store['token_expiry'] = (now - 10_000).toString();

      expect(service.isTokenExpired()).toBe(true);
    });
  });

  /**
   * Validates: Requirements 12.7, 12.8
   * isAuthenticated true/false based on token presence and expiry
   */
  describe('isAuthenticated', () => {
    it('should return true when a valid non-expired token exists', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      store['access_token'] = 'valid-token';
      store['token_expiry'] = (now + 120_000).toString();

      expect(service.isAuthenticated()).toBe(true);
    });

    it('should return false when no token exists', () => {
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should return false when token is expired', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      store['access_token'] = 'expired-token';
      store['token_expiry'] = (now - 10_000).toString();

      expect(service.isAuthenticated()).toBe(false);
    });
  });

  /**
   * Validates: Requirements 12.9
   * clearTokens removes all keys and resets provider signal
   */
  describe('clearTokens', () => {
    it('should remove access_token, refresh_token, token_expiry, and provider_id from localStorage', () => {
      store['access_token'] = 'tok';
      store['refresh_token'] = 'ref';
      store['token_expiry'] = '123';
      store['auth_provider_id'] = 'provider1';

      service.clearTokens();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refresh_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token_expiry');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_provider_id');
    });

    it('should set currentProviderId signal to null', () => {
      store['auth_provider_id'] = 'provider1';
      // Re-trigger provider update
      service.storeTokens({ access_token: 'x', expires_in: 3600 });

      service.clearTokens();

      expect(service.currentProviderId()).toBeNull();
    });
  });

  /**
   * Validates: Requirements 12.10
   * login stores state in sessionStorage and provider_id in localStorage
   */
  describe('login', () => {
    it('should store state in sessionStorage and provider_id in localStorage before redirecting', async () => {
      const loginPromise = service.login('my-provider');

      const req = httpMock.expectOne(
        (r) => r.url.includes('/auth/login') && r.method === 'GET'
      );
      req.flush({
        authorization_url: 'https://idp.example.com/authorize?state=abc',
        state: 'state-token-123',
      } as LoginResponse);

      await loginPromise;

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith('auth_state', 'state-token-123');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_provider_id', 'my-provider');
      expect(window.location.href).toBe('https://idp.example.com/authorize?state=abc');
    });

    it('should clear state on login error', async () => {
      const loginPromise = service.login('bad-provider');

      const req = httpMock.expectOne(
        (r) => r.url.includes('/auth/login') && r.method === 'GET'
      );
      req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });

      await expect(loginPromise).rejects.toThrow();
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('auth_state');
    });
  });

  /**
   * Validates: Requirements 12.11, 12.12, 12.13
   * ensureAuthenticated resolves/refreshes/throws
   */
  describe('ensureAuthenticated', () => {
    it('should resolve without error when token is valid', async () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      store['access_token'] = 'valid-token';
      store['token_expiry'] = (now + 120_000).toString();

      await expect(service.ensureAuthenticated()).resolves.toBeUndefined();
    });

    it('should refresh an expired token and resolve on success', async () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      store['access_token'] = 'expired-token';
      store['refresh_token'] = 'my-refresh-token';
      // Token expired 10s ago
      store['token_expiry'] = (now - 10_000).toString();

      const ensurePromise = service.ensureAuthenticated();

      // The service will call refreshAccessToken which makes an HTTP POST
      const req = httpMock.expectOne(
        (r) => r.url.includes('/auth/refresh') && r.method === 'POST'
      );

      const refreshResponse: TokenRefreshResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid',
      };
      req.flush(refreshResponse);

      // After refresh, storeTokens is called which updates localStorage
      // We need the new token to appear valid
      // The mock setItem updates our store, so isAuthenticated should now return true
      await expect(ensurePromise).resolves.toBeUndefined();
    });

    it('should throw when no token exists', async () => {
      // No token in store at all
      await expect(service.ensureAuthenticated()).rejects.toThrow(/not authenticated/i);
    });

    it('should throw when refresh fails', async () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      store['access_token'] = 'expired-token';
      store['refresh_token'] = 'bad-refresh';
      store['token_expiry'] = (now - 10_000).toString();

      const ensurePromise = service.ensureAuthenticated();

      const req = httpMock.expectOne(
        (r) => r.url.includes('/auth/refresh') && r.method === 'POST'
      );
      req.flush('Refresh failed', { status: 401, statusText: 'Unauthorized' });

      await expect(ensurePromise).rejects.toThrow(/not authenticated/i);
    });
  });

  /**
   * Validates: logout method
   */
  describe('logout', () => {
    it('should clear tokens and redirect to logout URL', async () => {
      store['access_token'] = 'token';
      store['refresh_token'] = 'refresh';
      store['auth_provider_id'] = 'provider1';

      const logoutPromise = service.logout();

      const req = httpMock.expectOne(
        (r) => r.url.includes('/auth/logout') && r.method === 'GET'
      );
      req.flush({ logout_url: 'https://idp.example.com/logout' });

      await logoutPromise;

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refresh_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token_expiry');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_provider_id');
      expect(window.location.href).toBe('https://idp.example.com/logout');
    });

    it('should handle logout error gracefully', async () => {
      const logoutPromise = service.logout();

      const req = httpMock.expectOne(
        (r) => r.url.includes('/auth/logout') && r.method === 'GET'
      );
      req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });

      // Logout should not throw - it handles errors gracefully
      await logoutPromise;
    });
  });

  describe('getRefreshToken', () => {
    it('should return stored refresh token', () => {
      store['refresh_token'] = 'my-refresh';
      expect(service.getRefreshToken()).toBe('my-refresh');
    });
    it('should return null when no refresh token', () => {
      expect(service.getRefreshToken()).toBeNull();
    });
  });

  describe('getProviderId', () => {
    it('should return provider ID after storeTokens with provider', () => {
      store['auth_provider_id'] = 'provider-1';
      // Re-create service to pick up the stored provider
      service.storeTokens({ access_token: 'x', expires_in: 3600 });
      // Provider ID is set via localStorage, not storeTokens
      expect(service.getProviderId()).toBe('provider-1');
    });
    it('should return null when no provider ID', () => {
      expect(service.getProviderId()).toBeNull();
    });
  });

  describe('getAuthorizationHeader', () => {
    it('should return Bearer header when token exists', () => {
      store['access_token'] = 'my-token';
      expect(service.getAuthorizationHeader()).toBe('Bearer my-token');
    });
    it('should return null when no token', () => {
      expect(service.getAuthorizationHeader()).toBeNull();
    });
  });

  describe('storeTokens event dispatching', () => {
    it('should dispatch token-stored event', () => {
      service.storeTokens({ access_token: 'tok', expires_in: 3600 });
      expect(window.dispatchEvent).toHaveBeenCalled();
    });
  });

  describe('clearTokens event dispatching', () => {
    it('should dispatch token-cleared event', () => {
      service.clearTokens();
      expect(window.dispatchEvent).toHaveBeenCalled();
    });
  });

  /**
   * Validates: Issue #24 fix
   * refreshAccessToken only clears tokens on 401, not transient errors
   */
  describe('refreshAccessToken selective token clearing', () => {
    beforeEach(() => {
      store['access_token'] = 'expired-token';
      store['refresh_token'] = 'my-refresh-token';
      store['auth_provider_id'] = 'entra-id';
      localStorageMock.removeItem.mockClear();
    });

    it('should clear tokens when refresh fails with 401', async () => {
      const refreshPromise = service.refreshAccessToken();

      const req = httpMock.expectOne(
        (r) => r.url.includes('/auth/refresh') && r.method === 'POST'
      );
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      await expect(refreshPromise).rejects.toThrow();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refresh_token');
    });

    it('should NOT clear tokens when refresh fails with a non-401 error', async () => {
      const refreshPromise = service.refreshAccessToken();

      const req = httpMock.expectOne(
        (r) => r.url.includes('/auth/refresh') && r.method === 'POST'
      );
      req.flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

      await expect(refreshPromise).rejects.toThrow();
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith('refresh_token');
    });
  });
});

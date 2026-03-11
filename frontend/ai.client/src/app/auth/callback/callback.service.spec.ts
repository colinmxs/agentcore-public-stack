import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CallbackService, TokenExchangeResponse } from './callback.service';
import { AuthService } from '../auth.service';
import { UserService } from '../user.service';
import { SessionService } from '../../session/services/session/session.service';
import { ConfigService } from '../../services/config.service';

describe('CallbackService', () => {
  let service: CallbackService;
  let httpMock: HttpTestingController;
  let mockAuthService: any;
  let mockUserService: any;
  let mockSessionService: any;
  let mockConfigService: any;

  beforeEach(() => {
    TestBed.resetTestingModule();
    mockAuthService = {
      getStoredState: vi.fn(),
      clearStoredState: vi.fn(),
      storeTokens: vi.fn()
    };

    mockUserService = {
      refreshUser: vi.fn(),
      ensurePermissionsLoaded: vi.fn().mockResolvedValue(undefined)
    };

    mockSessionService = {
      enableSessionsLoading: vi.fn()
    };

    mockConfigService = {
      appApiUrl: vi.fn(() => 'http://localhost:8000')
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        CallbackService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: UserService, useValue: mockUserService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: ConfigService, useValue: mockConfigService }
      ]
    });

    service = TestBed.inject(CallbackService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    httpMock.match(() => true);
    vi.clearAllMocks();
  });

  describe('exchangeCodeForTokens', () => {
    const mockResponse: TokenExchangeResponse = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600
    };

    it('should exchange code for tokens successfully', async () => {
      const code = 'test-code';
      const state = 'test-state';
      
      mockAuthService.getStoredState.mockReturnValue(state);

      const promise = service.exchangeCodeForTokens(code, state);

      const req = httpMock.expectOne('http://localhost:8000/auth/token');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ code, state });

      req.flush(mockResponse);

      const result = await promise;

      expect(result).toEqual(mockResponse);
      expect(mockAuthService.storeTokens).toHaveBeenCalledWith(mockResponse);
      expect(mockUserService.refreshUser).toHaveBeenCalled();
      expect(mockSessionService.enableSessionsLoading).toHaveBeenCalled();
      expect(mockAuthService.clearStoredState).toHaveBeenCalled();
    });

    it('should throw error when state mismatch', async () => {
      const code = 'test-code';
      const state = 'test-state';
      
      mockAuthService.getStoredState.mockReturnValue('different-state');

      await expect(service.exchangeCodeForTokens(code, state))
        .rejects.toThrow('State token mismatch. Security validation failed. Please try logging in again.');

      expect(mockAuthService.clearStoredState).toHaveBeenCalled();
      httpMock.expectNone('http://localhost:8000/auth/token');
    });

    it('should throw error when missing state', async () => {
      const code = 'test-code';
      const state = 'test-state';
      
      mockAuthService.getStoredState.mockReturnValue(null);

      await expect(service.exchangeCodeForTokens(code, state))
        .rejects.toThrow('No state token found. Please initiate login again.');

      httpMock.expectNone('http://localhost:8000/auth/token');
    });

    it('should handle HTTP error', async () => {
      const code = 'test-code';
      const state = 'test-state';
      
      mockAuthService.getStoredState.mockReturnValue(state);

      const promise = service.exchangeCodeForTokens(code, state);

      const req = httpMock.expectOne('http://localhost:8000/auth/token');
      req.error(new ProgressEvent('Network error'));

      await expect(promise).rejects.toThrow();
      expect(mockAuthService.clearStoredState).toHaveBeenCalled();
    });
  });
});
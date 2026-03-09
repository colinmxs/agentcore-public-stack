import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { UserService } from './user.service';
import { AuthService } from './auth.service';

describe('UserService', () => {
  let service: UserService;
  let mockAuthService: { getAccessToken: ReturnType<typeof vi.fn> };

  // Create base64url-encoded JWT token
  const createJWT = (payload: any) => {
    const header = { alg: 'none' };
    const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `${headerB64}.${payloadB64}.sig`;
  };

  const testPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    roles: ['Admin'],
    picture: 'https://example.com/pic.jpg'
  };

  const testJWT = createJWT(testPayload);

  beforeEach(() => {
    TestBed.resetTestingModule();
    mockAuthService = {
      getAccessToken: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        UserService,
        { provide: AuthService, useValue: mockAuthService }
      ]
    });

    service = TestBed.inject(UserService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  describe('getUser', () => {
    it('should return null when no token', () => {
      mockAuthService.getAccessToken.mockReturnValue(null);
      service.refreshUser();
      
      expect(service.getUser()).toBeNull();
    });

    it('should return User when token exists', () => {
      mockAuthService.getAccessToken.mockReturnValue(testJWT);
      service.refreshUser();
      
      const user = service.getUser();
      expect(user).toEqual({
        email: 'test@example.com',
        user_id: 'user-123',
        firstName: 'Test',
        lastName: 'User',
        fullName: 'Test User',
        roles: ['Admin'],
        picture: 'https://example.com/pic.jpg'
      });
    });
  });

  describe('hasRole', () => {
    it('should return false when no user', () => {
      mockAuthService.getAccessToken.mockReturnValue(null);
      service.refreshUser();
      
      expect(service.hasRole('Admin')).toBe(false);
    });

    it('should return true when user has role', () => {
      mockAuthService.getAccessToken.mockReturnValue(testJWT);
      service.refreshUser();
      
      expect(service.hasRole('Admin')).toBe(true);
    });

    it('should return false when user does not have role', () => {
      mockAuthService.getAccessToken.mockReturnValue(testJWT);
      service.refreshUser();
      
      expect(service.hasRole('User')).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('should return false when no user', () => {
      mockAuthService.getAccessToken.mockReturnValue(null);
      service.refreshUser();
      
      expect(service.hasAnyRole(['Admin', 'User'])).toBe(false);
    });

    it('should return true when user has any role', () => {
      mockAuthService.getAccessToken.mockReturnValue(testJWT);
      service.refreshUser();
      
      expect(service.hasAnyRole(['Admin', 'User'])).toBe(true);
    });

    it('should return false when user has no matching roles', () => {
      mockAuthService.getAccessToken.mockReturnValue(testJWT);
      service.refreshUser();
      
      expect(service.hasAnyRole(['User', 'Guest'])).toBe(false);
    });
  });

  describe('refreshUser', () => {
    it('should update user when token is available', () => {
      mockAuthService.getAccessToken.mockReturnValue(testJWT);
      
      service.refreshUser();
      
      expect(service.getUser()).not.toBeNull();
      expect(service.getUser()?.email).toBe('test@example.com');
    });

    it('should set user to null when no token', () => {
      mockAuthService.getAccessToken.mockReturnValue(null);
      
      service.refreshUser();
      
      expect(service.getUser()).toBeNull();
    });
  });
});
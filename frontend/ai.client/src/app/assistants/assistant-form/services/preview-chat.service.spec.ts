import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PreviewChatService } from './preview-chat.service';
import { AuthService } from '../../../auth/auth.service';
import { AuthApiService } from '../../../auth/auth-api.service';
import { of } from 'rxjs';

// Mock fetchEventSource
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}));

describe('PreviewChatService', () => {
  let service: PreviewChatService;
  let authService: any;
  let authApiService: any;

  beforeEach(() => {
    TestBed.resetTestingModule();
    
    const authServiceMock = {
      isTokenExpired: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue('mock-token'),
      refreshAccessToken: vi.fn(),
    };

    const authApiServiceMock = {
      getRuntimeEndpoint: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        PreviewChatService,
        { provide: AuthService, useValue: authServiceMock },
        { provide: AuthApiService, useValue: authApiServiceMock },
      ],
    });

    service = TestBed.inject(PreviewChatService);
    authService = TestBed.inject(AuthService);
    authApiService = TestBed.inject(AuthApiService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial state', () => {
    expect(service.messages()).toEqual([]);
    expect(service.isLoading()).toBe(false);
    expect(service.hasMessages()).toBe(false);
    expect(service.sessionId()).toMatch(/^preview-/);
  });

  it('should send message', async () => {
    const mockEndpoint = { runtime_endpoint_url: 'http://test.com' };
    authApiService.getRuntimeEndpoint.mockReturnValue(of(mockEndpoint));

    const { fetchEventSource } = await import('@microsoft/fetch-event-source');
    (fetchEventSource as any).mockResolvedValue(undefined);

    await service.sendMessage('Hello', 'assistant-1', 'Test instructions');

    expect(service.messages()).toHaveLength(2);
    expect(service.messages()[0].role).toBe('user');
    expect(service.messages()[1].role).toBe('assistant');
  });

  it('should handle empty message', async () => {
    await service.sendMessage('', 'assistant-1');

    expect(service.messages()).toHaveLength(0);
    expect(service.isLoading()).toBe(false);
  });

  it('should cancel request', () => {
    service.cancelRequest();

    expect(service.isLoading()).toBe(false);
    expect(service.streamingMessageId()).toBeNull();
  });

  it('should clear messages', () => {
    // Add a message first
    service['messagesSignal'].set([{
      id: 'test',
      role: 'user',
      content: [{ type: 'text', text: 'test' }],
      created_at: new Date().toISOString(),
    }]);

    service.clearMessages();

    expect(service.messages()).toEqual([]);
    expect(service.error()).toBeNull();
  });

  it('should reset with new session ID', () => {
    const oldSessionId = service.sessionId();
    
    service.reset();

    expect(service.messages()).toEqual([]);
    expect(service.sessionId()).not.toBe(oldSessionId);
    expect(service.sessionId()).toMatch(/^preview-/);
  });

  it('should handle auth token refresh', async () => {
    authService.isTokenExpired.mockReturnValue(true);
    authService.refreshAccessToken.mockResolvedValue(undefined);
    
    const mockEndpoint = { runtime_endpoint_url: 'http://test.com' };
    authApiService.getRuntimeEndpoint.mockReturnValue(of(mockEndpoint));

    const { fetchEventSource } = await import('@microsoft/fetch-event-source');
    (fetchEventSource as any).mockResolvedValue(undefined);

    await service.sendMessage('Hello', 'assistant-1');

    expect(authService.refreshAccessToken).toHaveBeenCalled();
  });
});
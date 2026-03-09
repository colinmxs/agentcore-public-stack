import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ChatHttpService } from './chat-http.service';
import { ConfigService } from '../../../services/config.service';
import { AuthService } from '../../../auth/auth.service';
import { AuthApiService } from '../../../auth/auth-api.service';
import { SessionService } from '../session/session.service';
import { StreamParserService } from './stream-parser.service';
import { ChatStateService } from './chat-state.service';
import { MessageMapService } from '../session/message-map.service';
import { ErrorService } from '../../../services/error/error.service';

describe('ChatHttpService', () => {
  let service: ChatHttpService;
  let httpMock: HttpTestingController;
  let authService: any;
  let authApiService: any;
  let chatStateService: any;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ChatHttpService,
        { provide: ConfigService, useValue: { appApiUrl: signal('http://localhost:8000') } },
        { provide: AuthService, useValue: { getAccessToken: vi.fn().mockReturnValue('tok'), isTokenExpired: vi.fn().mockReturnValue(false), refreshAccessToken: vi.fn(), ensureAuthenticated: vi.fn().mockResolvedValue(undefined), isAuthenticated: vi.fn().mockReturnValue(true), getProviderId: vi.fn().mockReturnValue('p1') } },
        { provide: AuthApiService, useValue: { getRuntimeEndpoint: vi.fn() } },
        { provide: SessionService, useValue: { currentSession: signal({ sessionId: 's1' }), updateSessionTitleInCache: vi.fn() } },
        { provide: StreamParserService, useValue: {} },
        { provide: ChatStateService, useValue: { isStreaming: signal(false), streamingSessionId: signal(null), abortCurrentRequest: vi.fn(), setChatLoading: vi.fn(), resetState: vi.fn(), getAbortController: vi.fn().mockReturnValue(new AbortController()) } },
        { provide: MessageMapService, useValue: {} },
        { provide: ErrorService, useValue: { handleHttpError: vi.fn() } },
      ],
    });
    service = TestBed.inject(ChatHttpService);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
    authApiService = TestBed.inject(AuthApiService);
    chatStateService = TestBed.inject(ChatStateService);
  });

  afterEach(() => {
    httpMock.match(() => true);
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate title', async () => {
    const promise = service.generateTitle('s1', 'Hello');
    const req = httpMock.expectOne(r => r.url.includes('/chat/generate-title'));
    expect(req.request.method).toBe('POST');
    req.flush({ title: 'Generated Title', session_id: 's1' });
    const result = await promise;
    expect(result.title).toBe('Generated Title');
  });

  it('should cancel chat request', () => {
    service.cancelChatRequest();
    expect(chatStateService.abortCurrentRequest).toHaveBeenCalled();
    expect(chatStateService.setChatLoading).toHaveBeenCalledWith(false);
    expect(chatStateService.resetState).toHaveBeenCalled();
  });

  it('should get bearer token for streaming response with valid token', async () => {
    authService.isTokenExpired.mockReturnValue(false);
    const token = await service.getBearerTokenForStreamingResponse();
    expect(token).toBe('tok');
    expect(authService.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('should get bearer token for streaming response with expired token', async () => {
    authService.isTokenExpired.mockReturnValue(true);
    authService.refreshAccessToken.mockResolvedValue(undefined);
    authService.getAccessToken.mockReturnValueOnce('tok').mockReturnValueOnce('new-tok');
    const token = await service.getBearerTokenForStreamingResponse();
    expect(token).toBe('new-tok');
    expect(authService.refreshAccessToken).toHaveBeenCalled();
  });

  it('should throw error when no token available', async () => {
    authService.getAccessToken.mockReturnValue(null);
    await expect(service.getBearerTokenForStreamingResponse()).rejects.toThrow();
  });

  it('should throw error when token refresh fails', async () => {
    authService.isTokenExpired.mockReturnValue(true);
    authService.refreshAccessToken.mockRejectedValue(new Error('Refresh failed'));
    await expect(service.getBearerTokenForStreamingResponse()).rejects.toThrow();
  });

  it('should get runtime endpoint URL successfully', async () => {
    authApiService.getRuntimeEndpoint.mockReturnValue(of({ runtime_endpoint_url: 'http://runtime.test/invocations', provider_id: 'p1' }));
    const url = await (service as any).getRuntimeEndpointUrl();
    expect(url).toBe('http://runtime.test/invocations');
  });

  it('should handle 404 error from runtime endpoint', async () => {
    authApiService.getRuntimeEndpoint.mockReturnValue(throwError(() => ({ status: 404 })));
    await expect((service as any).getRuntimeEndpointUrl()).rejects.toThrow();
  });

  it('should handle 401 error from runtime endpoint', async () => {
    authApiService.getRuntimeEndpoint.mockReturnValue(throwError(() => ({ status: 401 })));
    await expect((service as any).getRuntimeEndpointUrl()).rejects.toThrow();
  });

  it('should handle generic error from runtime endpoint', async () => {
    authApiService.getRuntimeEndpoint.mockReturnValue(throwError(() => new Error('Network error')));
    await expect((service as any).getRuntimeEndpointUrl()).rejects.toThrow();
  });

  it('should handle missing URL in runtime endpoint response', async () => {
    authApiService.getRuntimeEndpoint.mockReturnValue(of({ provider_id: 'p1' }));
    await expect((service as any).getRuntimeEndpointUrl()).rejects.toThrow('Invalid runtime endpoint response');
  });

  it('should log warning on provider ID mismatch but still return URL', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    authApiService.getRuntimeEndpoint.mockReturnValue(of({ runtime_endpoint_url: 'http://runtime.test/invocations', provider_id: 'p2' }));
    const url = await (service as any).getRuntimeEndpointUrl();
    expect(url).toBe('http://runtime.test/invocations');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

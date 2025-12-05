import { inject, Injectable, signal, WritableSignal, resource } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';
import { SessionMetadata } from '../models/session-metadata.model';

/**
 * Query parameters for listing sessions.
 */
export interface ListSessionsParams {
  /** Maximum number of sessions to return (optional, no limit if not specified) */
  limit?: number;
}

/**
 * Response model for a content block within a message.
 * 
 * Represents a single content block which can contain text, images, tool use, or tool results.
 * Matches the ContentBlockResponse model from the Python API.
 */
export interface ContentBlockResponse {
  /** Text content of the block */
  text?: string | null;
  /** Image content (if applicable) */
  image?: Record<string, unknown> | null;
  /** Tool use information (if applicable) */
  tool_use?: Record<string, unknown> | null;
  /** Tool execution result (if applicable) */
  tool_result?: Record<string, unknown> | null;
}

/**
 * Response model for a single message.
 * 
 * Represents a message stored in DynamoDB with all its content and metadata.
 * Matches the MessageResponse model from the Python API.
 */
export interface MessageResponse {
  /** Unique identifier for the message (UUID) */
  message_id: string;
  /** ID of the session this message belongs to (UUID) */
  session_id: string;
  /** Sequence number of the message within the session */
  sequence_number: number;
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** List of content blocks in the message */
  content: ContentBlockResponse[];
  /** ISO timestamp when the message was created */
  created_at: string;
  /** Optional metadata associated with the message */
  metadata: Record<string, unknown> | null;
}

/**
 * Response model for listing messages with pagination support.
 * 
 * Matches the MessagesListResponse model from the Python API.
 */
export interface MessagesListResponse {
  /** List of messages in the session */
  messages: MessageResponse[];
  /** Pagination token for retrieving the next page of results */
  next_token: string | null;
}

/**
 * Query parameters for getting messages for a session.
 */
export interface GetMessagesParams {
  /** Maximum number of messages to return (optional, no limit if not specified, max: 1000) */
  limit?: number;
  /** Pagination token for retrieving the next page of results */
  next_token?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  /**
   * Signal representing the current active session.
   * Initialized with default values to indicate no session is currently selected.
   */
  currentSession: WritableSignal<SessionMetadata> = signal<SessionMetadata>({
    sessionId: '',
    userId: '',
    title: '',
    status: 'active',
    createdAt: '',
    lastMessageAt: '',
    messageCount: 0
  });

  /**
   * Signal for pagination parameters used by the sessions resource.
   * Update this signal to trigger a refetch with new parameters.
   * Angular's resource API automatically tracks signals read within the loader,
   * so reading this signal inside the loader makes it reactive.
   */
  private sessionsParams = signal<ListSessionsParams>({});

  /**
   * Reactive resource for fetching sessions.
   * 
   * This resource automatically refetches when `sessionsParams` signal changes
   * because Angular's resource API tracks signals read within the loader function.
   * Provides reactive signals for data, loading state, and errors.
   * 
   * The resource ensures the user is authenticated before making the HTTP request.
   * If the token is expired, it will attempt to refresh it automatically.
   * 
   * Benefits of Angular's resource API:
   * - Automatic refetch when tracked signals change
   * - Built-in request cancellation if loader is called again before completion
   * - Seamless integration with Angular's reactivity system
   * 
   * @example
   * ```typescript
   * // Access data (may be undefined initially)
   * const sessions = sessionService.sessionsResource.value();
   * 
   * // Check loading state
   * const isLoading = sessionService.sessionsResource.isPending();
   * 
   * // Handle errors
   * const error = sessionService.sessionsResource.error();
   * 
   * // Update pagination to trigger refetch
   * sessionService.updateSessionsParams({ limit: 50 });
   * 
   * // Manually refetch
   * sessionService.sessionsResource.refetch();
   * ```
   */
  readonly sessionsResource = resource({
    loader: async () => {
      // Ensure user is authenticated before making the request
      await this.authService.ensureAuthenticated();

      // Reading this signal inside the loader makes the resource reactive to its changes
      // Angular's resource API automatically tracks signal dependencies
      const params = this.sessionsParams();
      return this.getSessions(params);
    }
  });

  /**
   * Updates the pagination parameters for the sessions resource.
   * This will automatically trigger a refetch of the resource.
   * 
   * @param params - New pagination parameters
   */
  updateSessionsParams(params: Partial<ListSessionsParams>): void {
    this.sessionsParams.update(current => ({ ...current, ...params }));
  }

  /**
   * Resets pagination parameters to default values and triggers a refetch.
   */
  resetSessionsParams(): void {
    this.sessionsParams.set({});
  }

  /**
   * Fetches a list of sessions from the Python API.
   * 
   * @param params - Optional query parameters
   * @returns Promise resolving to an array of SessionMetadata objects
   * @throws Error if the API request fails
   * 
   * @example
   * ```typescript
   * // Get all sessions
   * const response = await sessionService.getSessions();
   * 
   * // Get limited number of sessions
   * const response = await sessionService.getSessions({ limit: 20 });
   * ```
   */
  async getSessions(params?: ListSessionsParams): Promise<SessionMetadata[]> {
    let httpParams = new HttpParams();
    
    if (params?.limit !== undefined) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }

    try {
      const response = await firstValueFrom(
        this.http.get<SessionMetadata[]>(
          `${environment.appApiUrl}/sessions`,
          { params: httpParams }
        )
      );

      return response;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Fetches messages for a specific session from the Python API.
   * 
   * @param sessionId - UUID of the session
   * @param params - Optional query parameters for pagination
   * @returns Promise resolving to MessagesListResponse with messages and pagination token
   * @throws Error if the API request fails
   * 
   * @example
   * ```typescript
   * // Get first page of messages
   * const response = await sessionService.getMessages(
   *   '8e70ae89-93af-4db7-ba60-f13ea201f4cd',
   *   { limit: 20 }
   * );
   * 
   * // Get next page
   * const nextPage = await sessionService.getMessages(
   *   '8e70ae89-93af-4db7-ba60-f13ea201f4cd',
   *   { limit: 20, next_token: response.next_token }
   * );
   * ```
   */
  async getMessages(sessionId: string, params?: GetMessagesParams): Promise<MessagesListResponse> {
    let httpParams = new HttpParams();
    
    if (params?.limit !== undefined) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }
    
    if (params?.next_token) {
      httpParams = httpParams.set('next_token', params.next_token);
    }

    try {
      const response = await firstValueFrom(
        this.http.get<MessagesListResponse>(
          `${environment.appApiUrl}/sessions/${sessionId}/messages`,
          { params: httpParams }
        )
      );

      return response;
    } catch (error) {
      throw error;
    }
  }
}


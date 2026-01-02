import { Component, inject, effect, Signal, signal, computed, OnDestroy, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { MessageListComponent } from './components/message-list/message-list.component';
import { ChatRequestService } from './services/chat/chat-request.service';
import { MessageMapService } from './services/session/message-map.service';
import { Message } from './services/models/message.model';
import { ChatInputComponent } from './components/chat-input/chat-input.component';
import { SessionService } from './services/session/session.service';
import { ChatStateService } from './services/chat/chat-state.service';
import { AnimatedTextComponent } from '../components/animated-text';
import { Topnav } from '../components/topnav/topnav';
import { SidenavService } from '../services/sidenav/sidenav.service';
import { HeaderService } from '../services/header/header.service';
import { ParagraphSkeletonComponent } from '../components/paragraph-skeleton';
import { ModelService } from './services/model/model.service';
import { ModelSettings } from '../components/model-settings/model-settings';
import { UserService } from '../auth/user.service';
import { FileUploadService } from '../services/file-upload';

@Component({
  selector: 'app-session-page',
  imports: [ChatInputComponent, MessageListComponent, AnimatedTextComponent, Topnav, ParagraphSkeletonComponent, ModelSettings],
  templateUrl: './session.page.html',
  styleUrl: './session.page.css',
})
export class ConversationPage implements OnDestroy {
  private route = inject(ActivatedRoute);
  private sessionService = inject(SessionService);
  private chatRequestService = inject(ChatRequestService);
  private messageMapService = inject(MessageMapService);
  private chatStateService = inject(ChatStateService);
  protected sidenavService = inject(SidenavService);
  private headerService = inject(HeaderService);
  private modelService = inject(ModelService);
  private userService = inject(UserService);
  private fileUploadService = inject(FileUploadService);

  sessionId = signal<string | null>(null);
  isSettingsOpen = signal(false);

  /**
   * Staged session ID for file uploads before the first message is sent.
   * This allows users to attach files before typing their first message.
   * The staged session ID is used for file uploads and then consumed when
   * the first message is submitted.
   */
  private stagedSessionId = signal<string | null>(null);

  /**
   * Effective session ID to pass to chat-input for file uploads.
   * Returns the route sessionId if navigating to an existing session,
   * or creates/returns a staged session ID for new conversations.
   */
  readonly effectiveSessionId = computed(() => {
    return this.sessionId() ?? this.stagedSessionId();
  });

  // Writable signal that holds the current messages signal reference
  private messagesSignal = signal<Signal<Message[]>>(signal([]));

  // Computed that unwraps the current messages signal
  readonly messages = computed(() => this.messagesSignal()());

  // Get user's first name from the user service
  private firstName = computed(() => {
    const user = this.userService.currentUser();
    return user?.firstName || null;
  });

  // Greeting message templates (use {name} as placeholder for first name)
  private greetingTemplates = [
    'How can I help you today, {name}?',
    'What would you like to know, {name}?',
    'Ready to assist you, {name}!',
    'What can I do for you, {name}?',
    "Let's get started, {name}!",
  ];

  // Fallback greetings when user name is not available
  private fallbackGreetings = [
    'How can I help you today?',
    'What would you like to know?',
    'Ready to assist you!',
    'What can I do for you?',
    "Let's get started!",
  ];

  // Store the selected template index for consistency
  private selectedGreetingIndex = Math.floor(Math.random() * this.greetingTemplates.length);

  // Computed greeting message that reacts to user changes
  greetingMessage = computed(() => {
    const name = this.firstName();
    if (name) {
      return this.greetingTemplates[this.selectedGreetingIndex].replace('{name}', name);
    }
    return this.fallbackGreetings[this.selectedGreetingIndex];
  });

  private routeSubscription?: Subscription;
  readonly sessionConversation = this.sessionService.currentSession;
  readonly isChatLoading = this.chatStateService.isChatLoading;
  readonly isLoadingSession = this.messageMapService.isLoadingSession;

  // Get reference to MessageListComponent
  private messageListComponent = viewChild(MessageListComponent);

  // Computed signal to check if session has messages
  readonly hasMessages = computed(() => this.messages().length > 0);

  // Show skeleton when loading a session that matches current route and has no messages yet
  readonly showSkeleton = computed(() => {
    const loadingSessionId = this.isLoadingSession();
    const currentSessionId = this.sessionId();
    return loadingSessionId !== null && loadingSessionId === currentSessionId && !this.hasMessages();
  });

  constructor() {
    // Control header visibility based on whether there are messages
    effect(() => {
      if (this.hasMessages()) {
        this.headerService.showHeaderContent();
      } else {
        this.headerService.hideHeaderContent();
      }
    });

    // Apply model from session preferences when session metadata loads
    effect(() => {
      const session = this.sessionConversation();
      if (session?.preferences?.lastModel) {
        this.modelService.setSelectedModelById(session.preferences.lastModel);
      }
    });

    // Subscribe to route parameter changes
    this.routeSubscription = this.route.paramMap.subscribe(async params => {
      const id = params.get('sessionId');
      this.sessionId.set(id);
      if (id) {
        // Update the messages signal reference (this triggers reactivity)
        this.messagesSignal.set(this.messageMapService.getMessagesForSession(id));

        // Set loading state immediately before async call to show skeleton
        this.messageMapService.setLoadingSession(id);

        // Trigger fetching session metadata to populate currentSession
        this.sessionService.setSessionMetadataId(id);

        // Load messages from API for deep linking support
        try {
          await this.messageMapService.loadMessagesForSession(id);
        } catch (error) {
          console.error('Failed to load messages for session:', id, error);
        }
      } else {
        // No session selected, clear the session metadata
        this.sessionService.setSessionMetadataId(null);
      }
    });
  }

  ngOnDestroy() {
    this.routeSubscription?.unsubscribe();
  }

  onMessageSubmitted(message: { content: string, timestamp: Date, fileUploadIds?: string[] }) {
    // Use the effective session ID (route sessionId or staged sessionId)
    const sessionIdToUse = this.effectiveSessionId();

    // Submit the chat request with file upload IDs if present
    this.chatRequestService.submitChatRequest(
      message.content,
      sessionIdToUse,
      message.fileUploadIds
    ).catch((error) => {
      console.error('Error sending chat request:', error);
    });

    // Clear the staged session ID after submission (it's now a real session)
    if (this.stagedSessionId()) {
      this.stagedSessionId.set(null);
    }

    // Wait for DOM to update (user message to be added) then scroll to it
    setTimeout(() => {
      this.messageListComponent()?.scrollToLastUserMessage();
    }, 100);
  }

  /**
   * Called when user selects a file to attach.
   * Creates a staged session if one doesn't exist yet.
   */
  onFileAttached(file: File) {
    // If no session exists (not navigated to /s/:id and no staged session),
    // create a staged session for file uploads
    if (!this.sessionId() && !this.stagedSessionId()) {
      const newSessionId = uuidv4();
      this.stagedSessionId.set(newSessionId);

      // Add the session to cache so sidenav can show it
      const user = this.userService.currentUser();
      const userId = user?.empl_id || 'anonymous';
      this.sessionService.addSessionToCache(newSessionId, userId);
    }
  }

  toggleSettings() {
    this.isSettingsOpen.update(open => !open);
  }

  closeSettings() {
    this.isSettingsOpen.set(false);
  }
}

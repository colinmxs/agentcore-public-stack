import { Component, inject, effect, Signal, signal, computed, OnDestroy, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
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

@Component({
  selector: 'app-session-page',
  imports: [ChatInputComponent, MessageListComponent, AnimatedTextComponent, Topnav, ParagraphSkeletonComponent],
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

  sessionId = signal<string | null>(null);

  // Writable signal that holds the current messages signal reference
  private messagesSignal = signal<Signal<Message[]>>(signal([]));

  // Computed that unwraps the current messages signal
  readonly messages = computed(() => this.messagesSignal()());

  // Greeting messages to randomly display
  private greetingMessages = [
    'How can I help you today?',
    'What would you like to know?',
    'Ready to assist you!',
    'What can I do for you?',
    'Let\'s get started!',
  ];

  // Select a random greeting message on component initialization
  greetingMessage = signal(this.getRandomGreeting());

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

  onMessageSubmitted(message: { content: string, timestamp: Date }) {
    this.chatRequestService.submitChatRequest(message.content, this.sessionId()).catch((error) => {
      console.error('Error sending chat request:', error);
    });

    // Wait for DOM to update (user message to be added) then scroll to it
    setTimeout(() => {
      this.messageListComponent()?.scrollToLastUserMessage();
    }, 100);
  }

  onFileAttached(file: File) {
    console.log('File attached:', file);
    // Handle file attachment logic here
  }

  private getRandomGreeting(): string {
    const randomIndex = Math.floor(Math.random() * this.greetingMessages.length);
    return this.greetingMessages[randomIndex];
  }
}

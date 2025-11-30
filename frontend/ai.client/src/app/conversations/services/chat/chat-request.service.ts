import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { ChatStateService } from './chat-state.service';
import { ChatHttpService } from './chat-http.service';
// import { ConversationService, Conversation } from '../conversation/conversation.service';
// import { createMessage, createTextContent } from '../models';
// import { MessageMapService } from '../conversation/message-map.service';

export interface ContentFile {
  fileName: string;
  fileSize: number;
  contentType: string;
  s3Key: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatRequestService {
  // private conversationService = inject(ConversationService);
  private chatHttpService = inject(ChatHttpService);
  private chatStateService = inject(ChatStateService);
  // private messageMapService = inject(MessageMapService);
  private router = inject(Router);
  // TODO: Inject proper logging service
  
  async submitChatRequest(userInput: string): Promise<void> {
    // Ensure conversation exists and get its ID
    const conversationId = this.ensureConversationExists();
    
    // Update URL to reflect current conversation
    this.navigateToConversation(conversationId);

    // Create and add user message
    // this.messageMapService.addUserMessage(conversationId, userInput);
    
    // Start streaming for this conversation
    // this.messageMapService.startStreaming(conversationId);
    
    // Build and send request
    const requestObject = this.buildChatRequestObject(userInput, conversationId);

    try {
      await this.chatHttpService.sendChatRequest(requestObject);
    } catch (error) {
      // TODO: Replace with proper logging service
      // logger.error('Chat request failed', { error, conversationId });
      this.chatStateService.setChatLoading(false);
      // this.messageMapService.endStreaming();
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Ensures a conversation exists, creating one if necessary
   * @returns The conversation ID
   */
  private ensureConversationExists(): string {
    // const currentConversation = this.conversationService.currentConversation();
    const id = uuidv4();
    
    // if (!currentConversation.conversation_id) {
    //   const newConversation: Conversation = {
    //     ...currentConversation,
    //     conversation_id: id,
    //   };
    //   this.conversationService.currentConversation.set(newConversation);
    //   return id;
    // }
    
    // return currentConversation.conversation_id;
    return '';
  }

  /**
   * Navigates to the conversation route
   * @param conversationId The conversation ID to navigate to
   */
  private navigateToConversation(conversationId: string): void {
    // Using replaceUrl to avoid polluting browser history
    this.router.navigate(['c', conversationId], { replaceUrl: true });
  }

  private createUserMessage(text: string) {
    // const contentBlock = createTextContent(text);
    // return createMessage('user', [contentBlock]);
  }

  private buildChatRequestObject(message: string, conversation_id: string) {
    return {
      message,
      conversation_id
    };
  }
}
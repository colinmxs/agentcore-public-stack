import { Component, ChangeDetectionStrategy, input, output, signal, HostListener } from '@angular/core';
import { Assistant } from '../models/assistant.model';

@Component({
  selector: 'app-assistant-list',
  templateUrl: './assistant-list.component.html',
  styleUrl: './assistant-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantListComponent {
  assistants = input.required<Assistant[]>();
  readonlyMode = input<boolean>(false);
  assistantSelected = output<Assistant>();
  shareRequested = output<Assistant>();
  makePublicRequested = output<Assistant>();
  makePrivateRequested = output<Assistant>();
  deleteRequested = output<Assistant>();

  // Track which menu is open (by assistant ID)
  openMenuId = signal<string | null>(null);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    // Close menu if clicking outside
    if (this.openMenuId() !== null) {
      const target = event.target as HTMLElement;
      if (!target.closest('.context-menu-container')) {
        this.openMenuId.set(null);
      }
    }
  }

  onAssistantClick(assistant: Assistant): void {
    this.assistantSelected.emit(assistant);
  }

  onMenuToggle(assistantId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuId.set(this.openMenuId() === assistantId ? null : assistantId);
  }

  onMenuAction(assistant: Assistant, action: 'share' | 'make-public' | 'make-private' | 'delete', event: Event): void {
    event.stopPropagation();
    this.openMenuId.set(null);

    switch (action) {
      case 'share':
        this.shareRequested.emit(assistant);
        break;
      case 'make-public':
        console.log('Making assistant public:', assistant.assistantId);
        this.makePublicRequested.emit(assistant);
        break;
      case 'make-private':
        this.makePrivateRequested.emit(assistant);
        break;
      case 'delete':
        this.deleteRequested.emit(assistant);
        break;
    }
  }

  isMenuOpen(assistantId: string): boolean {
    return this.openMenuId() === assistantId;
  }

  getStatusBadgeClasses(status: Assistant['status']): string {
    const baseClasses = 'inline-flex items-center rounded-sm px-2.5 py-1 text-xs/5 font-medium';
    
    switch (status) {
      case 'COMPLETE':
        return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`;
      case 'DRAFT':
        return `${baseClasses} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`;
      case 'ARCHIVED':
        return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`;
    }
  }

  getVisibilityBadgeClasses(visibility: Assistant['visibility']): string {
    const baseClasses = 'inline-flex items-center rounded-sm px-2.5 py-1 text-xs/5 font-medium';
    
    switch (visibility) {
      case 'PUBLIC':
        return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300`;
      case 'SHARED':
        return `${baseClasses} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300`;
      case 'PRIVATE':
        return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`;
    }
  }
}

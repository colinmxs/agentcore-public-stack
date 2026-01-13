import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroXMark, heroShare, heroLink } from '@ng-icons/heroicons/outline';
import { Assistant } from '../models/assistant.model';

/**
 * Data passed to the share assistant dialog.
 */
export interface ShareAssistantDialogData {
  assistant: Assistant;
}

/**
 * Result returned from the share assistant dialog.
 */
export type ShareAssistantDialogResult = {
  action: 'shared' | 'cancelled';
  sharedUserIds?: string[];
} | undefined;

/**
 * A dialog for sharing an assistant with specific users or getting a shareable URL.
 * 
 * For PRIVATE/SHARED assistants: Shows interface to add users to share list (dummy for now)
 * For PUBLIC assistants: Shows a shareable URL
 */
@Component({
  selector: 'app-share-assistant-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [provideIcons({ heroXMark, heroShare, heroLink })],
  host: {
    'class': 'block',
    '(keydown.escape)': 'onCancel()'
  },
  template: `
    <!-- Backdrop -->
    <div
      class="dialog-backdrop fixed inset-0 bg-gray-500/75 dark:bg-gray-900/80"
      aria-hidden="true"
      (click)="onCancel()"
    ></div>

    <!-- Dialog Panel -->
    <div class="fixed inset-0 z-10 flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
      <div
        class="dialog-panel relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl sm:my-8 sm:w-full sm:max-w-lg sm:p-6 dark:bg-gray-800 dark:outline dark:-outline-offset-1 dark:outline-white/10"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'dialog-title'"
        [attr.aria-describedby]="'dialog-description'"
      >
        <!-- Close button (top-right) -->
        <div class="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
          <button
            type="button"
            (click)="onCancel()"
            class="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-600 dark:bg-gray-800 dark:hover:text-gray-300 dark:focus:outline-white"
            aria-label="Close dialog"
          >
            <span class="sr-only">Close</span>
            <ng-icon name="heroXMark" class="size-6" aria-hidden="true" />
          </button>
        </div>

        <!-- Header with Icon -->
        <div class="sm:flex sm:items-start">
          <div class="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 sm:mx-0 sm:size-10 dark:bg-indigo-500/10">
            <ng-icon name="heroShare" class="size-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
            <h3
              id="dialog-title"
              class="text-base/7 font-semibold text-gray-900 dark:text-white"
            >
              Share Assistant
            </h3>
            <div class="mt-2">
              <p
                id="dialog-description"
                class="text-sm/6 text-gray-500 dark:text-gray-400"
              >
                {{ data.assistant.name }}
              </p>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="mt-4">
          @if (isPublic()) {
            <!-- Public Assistant: Show shareable URL -->
            <div class="space-y-3">
              <p class="text-sm/6 text-gray-600 dark:text-gray-400">
                This assistant is public and discoverable by everyone. Share this URL to let others start a conversation with it:
              </p>
              <div class="flex gap-2">
                <input
                  type="text"
                  [value]="shareableUrl()"
                  readonly
                  class="flex-1 rounded-sm border border-gray-300 bg-gray-50 px-3 py-2 text-sm/6 text-gray-900 focus:border-blue-500 focus:outline-hidden focus:ring-3 focus:ring-blue-500/50 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-400"
                  id="share-url"
                />
                <button
                  type="button"
                  (click)="copyUrl()"
                  class="inline-flex items-center gap-2 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm/6 font-medium text-gray-700 hover:bg-gray-50 focus:outline-hidden focus:ring-3 focus:ring-blue-500/50 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                >
                  <ng-icon name="heroLink" class="size-4" aria-hidden="true" />
                  <span>{{ copied() ? 'Copied!' : 'Copy' }}</span>
                </button>
              </div>
            </div>
          } @else {
            <!-- Private/Shared Assistant: Show user selection (dummy for now) -->
            <div class="space-y-3">
              <p class="text-sm/6 text-gray-600 dark:text-gray-400">
                Share this assistant with specific users or groups. They will be able to use this assistant, but it won't be discoverable by others.
              </p>
              <div class="rounded-sm border border-gray-300 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700">
                <p class="text-sm/6 text-gray-500 dark:text-gray-400 italic">
                  User selection interface will be implemented here. This is a placeholder.
                </p>
              </div>
            </div>
          }
        </div>

        <!-- Actions -->
        <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
          @if (!isPublic()) {
            <button
              type="button"
              (click)="onShare()"
              class="inline-flex w-full justify-center rounded-sm bg-indigo-600 px-3 py-2 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 sm:ml-3 sm:w-auto dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400"
            >
              Share
            </button>
          }
          <button
            type="button"
            (click)="onCancel()"
            class="mt-3 inline-flex w-full justify-center rounded-sm bg-white px-3 py-2 text-sm/6 font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 sm:mt-0 sm:w-auto dark:bg-white/10 dark:text-white dark:shadow-none dark:ring-white/5 dark:hover:bg-white/20"
          >
            {{ isPublic() ? 'Close' : 'Cancel' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    @import "tailwindcss";

    @custom-variant dark (&:where(.dark, .dark *));

    /* Backdrop fade-in animation */
    .dialog-backdrop {
      animation: backdrop-fade-in 200ms ease-out;
    }

    @keyframes backdrop-fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    /* Dialog panel fade-in-up animation */
    .dialog-panel {
      animation: dialog-fade-in-up 200ms ease-out;
    }

    @keyframes dialog-fade-in-up {
      from {
        opacity: 0;
        transform: translateY(1rem) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `
})
export class ShareAssistantDialogComponent {
  protected readonly dialogRef = inject<DialogRef<ShareAssistantDialogResult>>(DialogRef);
  protected readonly data = inject<ShareAssistantDialogData>(DIALOG_DATA);

  protected readonly copied = signal<boolean>(false);

  protected readonly isPublic = signal<boolean>(this.data.assistant.visibility === 'PUBLIC');
  
  protected readonly shareableUrl = computed<string>(() => {
    // Generate shareable URL - this will be the URL to start a conversation with the assistant
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/chat?assistant=${this.data.assistant.assistantId}`;
  });

  protected copyUrl(): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    const url = this.shareableUrl();
    navigator.clipboard.writeText(url).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(err => {
      console.error('Failed to copy URL:', err);
    });
  }

  protected onShare(): void {
    // Dummy implementation - will be replaced when sharing API is ready
    this.dialogRef.close({
      action: 'shared',
      sharedUserIds: [] // Placeholder
    });
  }

  protected onCancel(): void {
    this.dialogRef.close(undefined);
  }
}

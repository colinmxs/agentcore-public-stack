import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroDocument,
  heroDocumentText,
  heroTableCells,
  heroPhoto,
} from '@ng-icons/heroicons/outline';
import { formatBytes } from '../../../../../services/file-upload';
import { FileAttachmentData } from '../../../../services/models/message.model';

/**
 * Check if MIME type is an image
 */
function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * File type to icon mapping
 */
const FILE_TYPE_ICONS: Record<string, string> = {
  'application/pdf': 'heroDocument',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'heroDocumentText',
  'text/plain': 'heroDocumentText',
  'text/html': 'heroDocumentText',
  'text/csv': 'heroTableCells',
  'application/vnd.ms-excel': 'heroTableCells',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'heroTableCells',
  'text/markdown': 'heroDocumentText',
  'image/png': 'heroPhoto',
  'image/jpeg': 'heroPhoto',
  'image/gif': 'heroPhoto',
  'image/webp': 'heroPhoto',
};

/**
 * Compact file attachment badge for displaying in user messages.
 *
 * This is a read-only display component (no remove/retry actions)
 * used for showing files that were attached to historical messages.
 *
 * @example
 * ```html
 * <app-file-attachment-badge
 *   [attachment]="fileAttachment"
 * />
 * ```
 */
@Component({
  selector: 'app-file-attachment-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [
    provideIcons({
      heroDocument,
      heroDocumentText,
      heroTableCells,
      heroPhoto,
    })
  ],
  template: `
    <div
      class="inline-flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-1 text-xs text-white/80"
    >
      <ng-icon [name]="iconName()" class="size-3.5" aria-hidden="true" />
      <span class="max-w-32 truncate">{{ attachment().filename }}</span>
      <span class="text-white/60">({{ formattedSize() }})</span>
    </div>
  `,
})
export class FileAttachmentBadgeComponent {
  /** File attachment data */
  readonly attachment = input.required<FileAttachmentData>();

  protected readonly formattedSize = computed(() =>
    formatBytes(this.attachment().sizeBytes)
  );

  protected readonly isImage = computed(() =>
    isImageMimeType(this.attachment().mimeType)
  );

  protected readonly iconName = computed(() => {
    const mime = this.attachment().mimeType;
    return FILE_TYPE_ICONS[mime] ?? 'heroDocument';
  });
}

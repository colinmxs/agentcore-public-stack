import {
  Component,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroKey,
  heroPlus,
  heroTrash,
  heroClipboard,
  heroArrowTopRightOnSquare,
  heroEyeSlash,
} from '@ng-icons/heroicons/outline';

interface MockApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsed: string | null;
}

@Component({
  selector: 'app-api-keys-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon],
  providers: [
    provideIcons({
      heroKey,
      heroPlus,
      heroTrash,
      heroClipboard,
      heroArrowTopRightOnSquare,
      heroEyeSlash,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <!-- Section header -->
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-lg/7 font-semibold text-gray-900 dark:text-white">API Keys</h2>
          <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
            Manage API keys for programmatic access to models.
          </p>
        </div>
        <a
          routerLink="/api-keys"
          class="inline-flex items-center gap-1.5 text-sm/6 font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Full management
          <ng-icon name="heroArrowTopRightOnSquare" class="size-4" />
        </a>
      </div>

      <!-- Create new key -->
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-4 text-sm/6 font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-200"
      >
        <ng-icon name="heroPlus" class="size-5" />
        Create new API key
      </button>

      <!-- Existing keys -->
      <div class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-gray-900">
        @for (key of apiKeys; track key.id) {
          <div class="flex items-center justify-between gap-4 p-5">
            <div class="flex items-center gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-50 dark:bg-amber-900/20">
                <ng-icon name="heroKey" class="size-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p class="text-sm/6 font-medium text-gray-900 dark:text-white">{{ key.name }}</p>
                <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <code class="rounded-xs bg-gray-100 px-1.5 py-0.5 font-mono dark:bg-white/10">{{ key.prefix }}...
                  </code>
                  <span>Created {{ key.createdAt }}</span>
                  @if (key.lastUsed) {
                    <span>Last used {{ key.lastUsed }}</span>
                  } @else {
                    <span class="text-amber-600 dark:text-amber-400">Never used</span>
                  }
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-sm p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
                aria-label="Copy API key"
              >
                <ng-icon name="heroClipboard" class="size-4" />
              </button>
              <button
                type="button"
                class="rounded-sm p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                aria-label="Delete API key"
              >
                <ng-icon name="heroTrash" class="size-4" />
              </button>
            </div>
          </div>
        }
      </div>

      <!-- Security note -->
      <div class="rounded-md bg-amber-50 p-4 dark:bg-amber-900/10">
        <div class="flex items-start gap-3">
          <ng-icon name="heroEyeSlash" class="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p class="text-sm/6 text-amber-700 dark:text-amber-300">
            API keys grant full access to your account. Never share them publicly or commit them to source control.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class ApiKeysSettingsPage {
  readonly apiKeys: MockApiKey[] = [
    {
      id: '1',
      name: 'Production App',
      prefix: 'sk-proj-8x2f',
      createdAt: 'Mar 1, 2026',
      lastUsed: '2 hours ago',
    },
    {
      id: '2',
      name: 'Development',
      prefix: 'sk-dev-q9m1',
      createdAt: 'Feb 20, 2026',
      lastUsed: 'Yesterday',
    },
    {
      id: '3',
      name: 'CI/CD Pipeline',
      prefix: 'sk-ci-p4k7',
      createdAt: 'Jan 10, 2026',
      lastUsed: null,
    },
  ];
}

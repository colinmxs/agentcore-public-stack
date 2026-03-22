import {
  Component,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroCloud,
  heroCodeBracket,
  heroAcademicCap,
  heroCheck,
  heroArrowTopRightOnSquare,
  heroExclamationTriangle,
} from '@ng-icons/heroicons/outline';

interface MockConnection {
  name: string;
  icon: string;
  iconBg: string;
  status: 'connected' | 'needs_reauth' | 'disconnected';
  description: string;
  connectedSince?: string;
}

@Component({
  selector: 'app-connections-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon],
  providers: [
    provideIcons({
      heroCloud,
      heroCodeBracket,
      heroAcademicCap,
      heroCheck,
      heroArrowTopRightOnSquare,
      heroExclamationTriangle,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <!-- Section header -->
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-lg/7 font-semibold text-gray-900 dark:text-white">Connections</h2>
          <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
            Manage your connected apps and services.
          </p>
        </div>
        <a
          routerLink="/settings/connections"
          class="inline-flex items-center gap-1.5 text-sm/6 font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Manage all
          <ng-icon name="heroArrowTopRightOnSquare" class="size-4" />
        </a>
      </div>

      <!-- Connection cards -->
      <div class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-gray-900">
        @for (conn of connections; track conn.name) {
          <div class="flex items-center justify-between gap-4 p-5">
            <div class="flex items-center gap-4">
              <div [class]="conn.iconBg" class="flex size-10 shrink-0 items-center justify-center rounded-md">
                <ng-icon [name]="conn.icon" class="size-5" />
              </div>
              <div>
                <p class="text-sm/6 font-medium text-gray-900 dark:text-white">{{ conn.name }}</p>
                <p class="text-sm/6 text-gray-500 dark:text-gray-400">{{ conn.description }}</p>
              </div>
            </div>

            <div class="flex items-center gap-3">
              @switch (conn.status) {
                @case ('connected') {
                  <span class="inline-flex items-center gap-1 rounded-xs bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                    <ng-icon name="heroCheck" class="size-3" />
                    Connected
                  </span>
                  <button
                    type="button"
                    class="text-sm/6 font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Disconnect
                  </button>
                }
                @case ('needs_reauth') {
                  <span class="inline-flex items-center gap-1 rounded-xs bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <ng-icon name="heroExclamationTriangle" class="size-3" />
                    Reconnect
                  </span>
                  <button
                    type="button"
                    class="rounded-sm bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
                  >
                    Reconnect
                  </button>
                }
                @case ('disconnected') {
                  <button
                    type="button"
                    class="rounded-sm bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20"
                  >
                    Connect
                  </button>
                }
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class ConnectionsSettingsPage {
  readonly connections: MockConnection[] = [
    {
      name: 'Google Workspace',
      icon: 'heroCloud',
      iconBg: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
      status: 'connected',
      description: 'Calendar, Drive, Gmail access',
      connectedSince: 'Jan 15, 2026',
    },
    {
      name: 'GitHub',
      icon: 'heroCodeBracket',
      iconBg: 'bg-gray-800 text-white dark:bg-gray-700',
      status: 'connected',
      description: 'Repository access for code tools',
      connectedSince: 'Feb 3, 2026',
    },
    {
      name: 'Canvas LMS',
      icon: 'heroAcademicCap',
      iconBg: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
      status: 'needs_reauth',
      description: 'Course and assignment data',
    },
    {
      name: 'Microsoft 365',
      icon: 'heroCloud',
      iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      status: 'disconnected',
      description: 'OneDrive, Teams, Outlook access',
    },
  ];
}

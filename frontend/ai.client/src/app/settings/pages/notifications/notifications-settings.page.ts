import {
  Component,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroBell,
  heroEnvelope,
  heroDevicePhoneMobile,
  heroChatBubbleLeftEllipsis,
} from '@ng-icons/heroicons/outline';

interface NotificationGroup {
  title: string;
  description: string;
  settings: NotificationSetting[];
}

interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  email: boolean;
  push: boolean;
}

@Component({
  selector: 'app-notifications-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [
    provideIcons({
      heroBell,
      heroEnvelope,
      heroDevicePhoneMobile,
      heroChatBubbleLeftEllipsis,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <!-- Section header -->
      <div>
        <h2 class="text-lg/7 font-semibold text-gray-900 dark:text-white">Notifications</h2>
        <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
          Choose what notifications you receive and how.
        </p>
      </div>

      <!-- Global toggle -->
      <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-gray-900">
        <div class="flex items-center gap-3">
          <div class="flex size-10 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20">
            <ng-icon name="heroBell" class="size-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p class="text-sm/6 font-medium text-gray-900 dark:text-white">Enable notifications</p>
            <p class="text-sm/6 text-gray-500 dark:text-gray-400">Master toggle for all notification channels.</p>
          </div>
        </div>

        <div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-blue-600 transition-colors duration-200 ease-in-out has-checked:bg-blue-600 has-focus-visible:outline-2 dark:bg-white/5 dark:inset-ring-white/10 dark:outline-blue-500 dark:has-checked:bg-blue-500">
          <span class="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5"></span>
          <input
            id="notifications-master"
            type="checkbox"
            checked
            aria-label="Enable notifications"
            class="absolute inset-0 size-full cursor-pointer appearance-none focus:outline-hidden"
          />
        </div>
      </div>

      <!-- Notification groups -->
      @for (group of notificationGroups; track group.title) {
        <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
          <div class="border-b border-gray-200 p-6 dark:border-white/10">
            <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">{{ group.title }}</h3>
            <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">{{ group.description }}</p>
          </div>

          <!-- Column headers -->
          <div class="grid grid-cols-12 items-center gap-4 border-b border-gray-100 px-6 py-3 dark:border-white/5">
            <div class="col-span-8"></div>
            <div class="col-span-2 flex items-center justify-center gap-1">
              <ng-icon name="heroEnvelope" class="size-4 text-gray-400" />
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400">Email</span>
            </div>
            <div class="col-span-2 flex items-center justify-center gap-1">
              <ng-icon name="heroDevicePhoneMobile" class="size-4 text-gray-400" />
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400">Push</span>
            </div>
          </div>

          <div class="divide-y divide-gray-100 dark:divide-white/5">
            @for (setting of group.settings; track setting.id) {
              <div class="grid grid-cols-12 items-center gap-4 px-6 py-4">
                <div class="col-span-8">
                  <p class="text-sm/6 font-medium text-gray-900 dark:text-white">{{ setting.label }}</p>
                  <p class="text-sm/6 text-gray-500 dark:text-gray-400">{{ setting.description }}</p>
                </div>
                <div class="col-span-2 flex justify-center">
                  <input
                    type="checkbox"
                    [checked]="setting.email"
                    [attr.aria-label]="setting.label + ' email notification'"
                    class="size-4 cursor-pointer rounded-xs border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                  />
                </div>
                <div class="col-span-2 flex justify-center">
                  <input
                    type="checkbox"
                    [checked]="setting.push"
                    [attr.aria-label]="setting.label + ' push notification'"
                    class="size-4 cursor-pointer rounded-xs border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                  />
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Save button -->
      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-sm bg-blue-600 px-4 py-2 text-sm/6 font-semibold text-white shadow-xs transition-colors hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400"
        >
          Save preferences
        </button>
      </div>
    </div>
  `,
})
export class NotificationsSettingsPage {
  readonly notificationGroups: NotificationGroup[] = [
    {
      title: 'Usage & Billing',
      description: 'Alerts related to your usage quotas and costs.',
      settings: [
        {
          id: 'quota-warning',
          label: 'Quota approaching limit',
          description: 'When you reach 80% of your usage quota.',
          email: true,
          push: true,
        },
        {
          id: 'quota-exceeded',
          label: 'Quota exceeded',
          description: 'When your usage exceeds the allocated quota.',
          email: true,
          push: true,
        },
        {
          id: 'cost-summary',
          label: 'Weekly cost summary',
          description: 'A weekly digest of your token usage and costs.',
          email: true,
          push: false,
        },
      ],
    },
    {
      title: 'System',
      description: 'Updates about service status and features.',
      settings: [
        {
          id: 'new-models',
          label: 'New models available',
          description: 'When new AI models are added to the platform.',
          email: true,
          push: false,
        },
        {
          id: 'maintenance',
          label: 'Scheduled maintenance',
          description: 'Advance notice of planned downtime.',
          email: true,
          push: true,
        },
        {
          id: 'feature-updates',
          label: 'Feature updates',
          description: 'Product announcements and new feature releases.',
          email: false,
          push: false,
        },
      ],
    },
  ];
}

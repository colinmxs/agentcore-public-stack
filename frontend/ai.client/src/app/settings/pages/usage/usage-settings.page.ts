import {
  Component,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroChartBar,
  heroArrowTopRightOnSquare,
  heroSparkles,
  heroCpuChip,
  heroChatBubbleLeftRight,
  heroArrowTrendingUp,
} from '@ng-icons/heroicons/outline';

@Component({
  selector: 'app-usage-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon],
  providers: [
    provideIcons({
      heroChartBar,
      heroArrowTopRightOnSquare,
      heroSparkles,
      heroCpuChip,
      heroChatBubbleLeftRight,
      heroArrowTrendingUp,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <!-- Section header -->
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-lg/7 font-semibold text-gray-900 dark:text-white">Usage</h2>
          <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
            Overview of your usage this billing period.
          </p>
        </div>
        <a
          routerLink="/costs"
          class="inline-flex items-center gap-1.5 text-sm/6 font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Full dashboard
          <ng-icon name="heroArrowTopRightOnSquare" class="size-4" />
        </a>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        @for (stat of stats; track stat.label) {
          <div class="rounded-lg border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-900">
            <div class="flex items-center gap-2">
              <div [class]="stat.iconBg" class="flex size-8 items-center justify-center rounded-md">
                <ng-icon [name]="stat.icon" class="size-4" />
              </div>
              <span class="text-sm/6 text-gray-500 dark:text-gray-400">{{ stat.label }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
              {{ stat.value }}
            </p>
            <div class="mt-1 flex items-center gap-1">
              <ng-icon name="heroArrowTrendingUp" class="size-3.5 text-green-500" />
              <span class="text-xs text-green-600 dark:text-green-400">{{ stat.change }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">vs last period</span>
            </div>
          </div>
        }
      </div>

      <!-- Quota usage -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
        <div class="p-6">
          <div class="flex items-center justify-between">
            <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">Quota usage</h3>
            <span class="rounded-xs bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              Standard Tier
            </span>
          </div>

          <div class="mt-6 space-y-5">
            @for (quota of quotas; track quota.label) {
              <div>
                <div class="flex items-center justify-between text-sm">
                  <span class="font-medium text-gray-700 dark:text-gray-300">{{ quota.label }}</span>
                  <span class="text-gray-500 dark:text-gray-400">{{ quota.used }} / {{ quota.limit }}</span>
                </div>
                <div class="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    [class]="quota.percentage > 80 ? 'bg-amber-500' : 'bg-blue-600 dark:bg-blue-500'"
                    class="h-full rounded-full transition-all"
                    [style.width.%]="quota.percentage"
                  ></div>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Top models -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
        <div class="border-b border-gray-200 p-6 dark:border-white/10">
          <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">Top models by usage</h3>
        </div>

        <div class="divide-y divide-gray-100 dark:divide-white/5">
          @for (model of topModels; track model.name) {
            <div class="flex items-center justify-between px-6 py-4">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-gray-100 dark:bg-white/10">
                  <ng-icon name="heroCpuChip" class="size-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p class="text-sm/6 font-medium text-gray-900 dark:text-white">{{ model.name }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ model.requests }} requests</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-sm/6 font-medium text-gray-900 dark:text-white">{{ model.tokens }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">tokens</p>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class UsageSettingsPage {
  readonly stats = [
    {
      label: 'Total tokens',
      value: '1.2M',
      change: '+12%',
      icon: 'heroSparkles',
      iconBg: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    },
    {
      label: 'Conversations',
      value: '847',
      change: '+8%',
      icon: 'heroChatBubbleLeftRight',
      iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    },
    {
      label: 'Est. cost',
      value: '$24.50',
      change: '+5%',
      icon: 'heroChartBar',
      iconBg: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    },
  ];

  readonly quotas = [
    { label: 'Daily tokens', used: '82K', limit: '500K', percentage: 16 },
    { label: 'Monthly tokens', used: '1.2M', limit: '5M', percentage: 24 },
    { label: 'Daily requests', used: '45', limit: '200', percentage: 22 },
  ];

  readonly topModels = [
    { name: 'Claude 4.5 Sonnet', requests: '523', tokens: '856K' },
    { name: 'Claude 4.6 Opus', requests: '189', tokens: '245K' },
    { name: 'Amazon Nova Pro', requests: '87', tokens: '72K' },
    { name: 'Claude 4.5 Haiku', requests: '48', tokens: '28K' },
  ];
}

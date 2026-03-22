import {
  Component,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroShieldCheck,
  heroTrash,
  heroArrowDownTray,
  heroClock,
  heroExclamationTriangle,
} from '@ng-icons/heroicons/outline';

@Component({
  selector: 'app-privacy-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [
    provideIcons({
      heroShieldCheck,
      heroTrash,
      heroArrowDownTray,
      heroClock,
      heroExclamationTriangle,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <!-- Section header -->
      <div>
        <h2 class="text-lg/7 font-semibold text-gray-900 dark:text-white">Privacy & Data</h2>
        <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
          Control how your data is stored and used.
        </p>
      </div>

      <!-- Conversation history retention -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
        <div class="p-6">
          <div class="flex items-start gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-900/20">
              <ng-icon name="heroClock" class="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div class="flex-1">
              <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">Conversation history retention</h3>
              <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
                How long conversation history is kept before automatic deletion.
              </p>

              <fieldset class="mt-4" aria-label="History retention period">
                <div class="flex flex-wrap gap-2">
                  @for (option of retentionOptions; track option.value) {
                    <label
                      [class]="retention() === option.value
                        ? 'ring-2 ring-blue-600 bg-blue-50 text-blue-700 dark:ring-blue-500 dark:bg-blue-950/30 dark:text-blue-300'
                        : 'ring-1 ring-gray-200 bg-white text-gray-700 dark:ring-white/10 dark:bg-white/5 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10'"
                      class="cursor-pointer rounded-md px-3 py-1.5 text-sm/6 font-medium transition-all"
                    >
                      <input
                        type="radio"
                        name="retention"
                        [value]="option.value"
                        [checked]="retention() === option.value"
                        (change)="retention.set(option.value)"
                        class="sr-only"
                      />
                      {{ option.label }}
                    </label>
                  }
                </div>
              </fieldset>
            </div>
          </div>
        </div>
      </div>

      <!-- Memory opt-in -->
      <div class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-gray-900">
        <div class="flex items-center justify-between gap-4 p-6">
          <div class="flex items-start gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-purple-50 dark:bg-purple-900/20">
              <ng-icon name="heroShieldCheck" class="size-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <label for="memory-enabled" class="text-sm/6 font-medium text-gray-900 dark:text-white">
                Agent memory
              </label>
              <p class="text-sm/6 text-gray-500 dark:text-gray-400">
                Allow the AI to remember context from previous conversations for more personalized responses.
              </p>
            </div>
          </div>
          <div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-blue-600 transition-colors duration-200 ease-in-out has-checked:bg-blue-600 has-focus-visible:outline-2 dark:bg-white/5 dark:inset-ring-white/10 dark:outline-blue-500 dark:has-checked:bg-blue-500">
            <span class="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5"></span>
            <input
              id="memory-enabled"
              type="checkbox"
              checked
              aria-label="Enable agent memory"
              class="absolute inset-0 size-full cursor-pointer appearance-none focus:outline-hidden"
            />
          </div>
        </div>

        <div class="flex items-center justify-between gap-4 p-6">
          <div class="flex items-start gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-green-50 dark:bg-green-900/20">
              <ng-icon name="heroShieldCheck" class="size-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <label for="training-opt-out" class="text-sm/6 font-medium text-gray-900 dark:text-white">
                Opt out of model training
              </label>
              <p class="text-sm/6 text-gray-500 dark:text-gray-400">
                Prevent your conversations from being used to improve AI models.
              </p>
            </div>
          </div>
          <div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-blue-600 transition-colors duration-200 ease-in-out has-checked:bg-blue-600 has-focus-visible:outline-2 dark:bg-white/5 dark:inset-ring-white/10 dark:outline-blue-500 dark:has-checked:bg-blue-500">
            <span class="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5"></span>
            <input
              id="training-opt-out"
              type="checkbox"
              aria-label="Opt out of model training"
              class="absolute inset-0 size-full cursor-pointer appearance-none focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      <!-- Data actions -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
        <div class="p-6">
          <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">Data management</h3>
          <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">Export or delete your data.</p>

          <div class="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-sm bg-white px-4 py-2 text-sm/6 font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20"
            >
              <ng-icon name="heroArrowDownTray" class="size-4" />
              Export all data
            </button>

            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-sm bg-white px-4 py-2 text-sm/6 font-semibold text-red-600 shadow-xs ring-1 ring-gray-300 transition-colors hover:bg-red-50 dark:bg-white/5 dark:text-red-400 dark:ring-white/10 dark:hover:bg-red-900/10"
            >
              <ng-icon name="heroTrash" class="size-4" />
              Delete all conversations
            </button>
          </div>
        </div>
      </div>

      <!-- Warning -->
      <div class="rounded-md bg-red-50 p-4 dark:bg-red-900/10">
        <div class="flex items-start gap-3">
          <ng-icon name="heroExclamationTriangle" class="size-5 shrink-0 text-red-600 dark:text-red-400" />
          <p class="text-sm/6 text-red-700 dark:text-red-300">
            Deleting conversations is permanent and cannot be undone. Consider exporting your data first.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class PrivacySettingsPage {
  readonly retention = signal('90d');

  readonly retentionOptions = [
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: '1y', label: '1 year' },
    { value: 'forever', label: 'Forever' },
  ];
}

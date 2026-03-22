import {
  Component,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroSparkles,
  heroCodeBracket,
  heroChatBubbleLeftRight,
} from '@ng-icons/heroicons/outline';

@Component({
  selector: 'app-chat-preferences-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [
    provideIcons({ heroSparkles, heroCodeBracket, heroChatBubbleLeftRight }),
  ],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <!-- Section header -->
      <div>
        <h2 class="text-lg/7 font-semibold text-gray-900 dark:text-white">Chat Preferences</h2>
        <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
          Configure how you interact with AI models.
        </p>
      </div>

      <!-- Default model -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
        <div class="p-6">
          <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">Default model</h3>
          <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
            Choose which model is selected by default when starting a new conversation.
          </p>

          <div class="mt-4">
            <select
              class="block w-full rounded-sm border-0 bg-white py-1.5 pl-3 pr-10 text-sm/6 text-gray-900 shadow-xs ring-1 ring-gray-300 focus:ring-2 focus:ring-blue-600 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-blue-500"
              aria-label="Default model"
            >
              <option>Claude 4.5 Sonnet (Recommended)</option>
              <option>Claude 4.6 Opus</option>
              <option>Claude 4.5 Haiku</option>
              <option>Amazon Nova Pro</option>
              <option>Llama 3.3 70B</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Toggleable preferences -->
      <div class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-gray-900">
        @for (pref of preferences; track pref.id) {
          <div class="flex items-center justify-between gap-4 p-6">
            <div class="flex items-start gap-3">
              <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-white/10">
                <ng-icon [name]="pref.icon" class="size-4 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <label [for]="pref.id" class="text-sm/6 font-medium text-gray-900 dark:text-white">
                  {{ pref.label }}
                </label>
                <p class="text-sm/6 text-gray-500 dark:text-gray-400">{{ pref.description }}</p>
              </div>
            </div>

            <!-- Toggle -->
            <div class="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-blue-600 transition-colors duration-200 ease-in-out has-checked:bg-blue-600 has-focus-visible:outline-2 dark:bg-white/5 dark:inset-ring-white/10 dark:outline-blue-500 dark:has-checked:bg-blue-500">
              <span class="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5"></span>
              <input
                [id]="pref.id"
                type="checkbox"
                [checked]="pref.default"
                [attr.aria-label]="pref.label"
                class="absolute inset-0 size-full cursor-pointer appearance-none focus:outline-hidden"
              />
            </div>
          </div>
        }
      </div>

      <!-- Code block theme -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
        <div class="p-6">
          <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">Code block theme</h3>
          <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
            Choose the syntax highlighting theme for code blocks in chat.
          </p>

          <fieldset class="mt-4" aria-label="Code block theme">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              @for (codeTheme of codeThemes; track codeTheme.value) {
                <label
                  [class]="selectedCodeTheme() === codeTheme.value
                    ? 'ring-2 ring-blue-600 dark:ring-blue-500'
                    : 'ring-1 ring-gray-200 dark:ring-white/10 hover:ring-gray-300 dark:hover:ring-white/20'"
                  class="flex cursor-pointer flex-col items-center gap-2 rounded-lg p-3 transition-all"
                >
                  <input
                    type="radio"
                    name="code-theme"
                    [value]="codeTheme.value"
                    [checked]="selectedCodeTheme() === codeTheme.value"
                    (change)="selectedCodeTheme.set(codeTheme.value)"
                    class="sr-only"
                  />
                  <!-- Mini code preview -->
                  <div [class]="codeTheme.bgClass" class="flex h-12 w-full flex-col gap-1 rounded-xs p-2">
                    <div [class]="codeTheme.line1Class" class="h-1.5 w-3/4 rounded-xs"></div>
                    <div [class]="codeTheme.line2Class" class="h-1.5 w-1/2 rounded-xs"></div>
                    <div [class]="codeTheme.line3Class" class="h-1.5 w-2/3 rounded-xs"></div>
                  </div>
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{ codeTheme.label }}</span>
                </label>
              }
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  `,
})
export class ChatPreferencesSettingsPage {
  readonly selectedCodeTheme = signal('github-dark');

  readonly preferences = [
    {
      id: 'streaming',
      label: 'Stream responses',
      description: 'Display model responses as they are generated, word by word.',
      icon: 'heroChatBubbleLeftRight',
      default: true,
    },
    {
      id: 'auto-scroll',
      label: 'Auto-scroll to bottom',
      description: 'Automatically scroll to the latest message during streaming.',
      icon: 'heroChatBubbleLeftRight',
      default: true,
    },
    {
      id: 'show-token-count',
      label: 'Show token count',
      description: 'Display the number of tokens used in each message.',
      icon: 'heroSparkles',
      default: false,
    },
    {
      id: 'code-wrap',
      label: 'Wrap long code lines',
      description: 'Wrap code that exceeds the container width instead of scrolling.',
      icon: 'heroCodeBracket',
      default: false,
    },
  ];

  readonly codeThemes = [
    {
      value: 'github-dark',
      label: 'GitHub Dark',
      bgClass: 'bg-gray-900',
      line1Class: 'bg-sky-400/60',
      line2Class: 'bg-green-400/60',
      line3Class: 'bg-purple-400/60',
    },
    {
      value: 'github-light',
      label: 'GitHub Light',
      bgClass: 'bg-gray-50 border border-gray-200',
      line1Class: 'bg-blue-600/40',
      line2Class: 'bg-green-600/40',
      line3Class: 'bg-purple-600/40',
    },
    {
      value: 'monokai',
      label: 'Monokai',
      bgClass: 'bg-[#272822]',
      line1Class: 'bg-pink-400/60',
      line2Class: 'bg-yellow-300/60',
      line3Class: 'bg-cyan-400/60',
    },
    {
      value: 'dracula',
      label: 'Dracula',
      bgClass: 'bg-[#282a36]',
      line1Class: 'bg-pink-400/60',
      line2Class: 'bg-green-400/60',
      line3Class: 'bg-orange-400/60',
    },
  ];
}

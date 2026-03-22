import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroSun,
  heroMoon,
  heroComputerDesktop,
  heroCheck,
} from '@ng-icons/heroicons/outline';
import { ThemeService, ThemePreference } from '../../../components/topnav/components/theme-toggle/theme.service';

@Component({
  selector: 'app-appearance-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [
    provideIcons({ heroSun, heroMoon, heroComputerDesktop, heroCheck }),
  ],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <!-- Section header -->
      <div>
        <h2 class="text-lg/7 font-semibold text-gray-900 dark:text-white">Appearance</h2>
        <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
          Customize how the application looks and feels.
        </p>
      </div>

      <!-- Theme selection -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
        <div class="p-6">
          <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">Theme</h3>
          <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">Choose your preferred color scheme.</p>

          <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            @for (option of themeOptions; track option.value) {
              <button
                type="button"
                (click)="setTheme(option.value)"
                [class]="themeService.preference() === option.value
                  ? 'ring-2 ring-blue-600 dark:ring-blue-500'
                  : 'ring-1 ring-gray-200 dark:ring-white/10 hover:ring-gray-300 dark:hover:ring-white/20'"
                class="relative flex flex-col items-center gap-3 rounded-lg p-4 transition-all"
              >
                <!-- Preview swatch -->
                <div [class]="option.previewClasses" class="flex h-20 w-full items-end justify-center overflow-hidden rounded-md p-2">
                  <div class="flex w-full gap-1.5">
                    <div [class]="option.sidebarClasses" class="h-10 w-6 rounded-xs"></div>
                    <div class="flex flex-1 flex-col gap-1">
                      <div [class]="option.lineClasses" class="h-2 w-3/4 rounded-xs"></div>
                      <div [class]="option.lineClasses" class="h-2 w-1/2 rounded-xs"></div>
                      <div [class]="option.lineClasses" class="h-2 w-2/3 rounded-xs"></div>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <ng-icon [name]="option.icon" class="size-4 text-gray-500 dark:text-gray-400" />
                  <span class="text-sm/6 font-medium text-gray-900 dark:text-white">{{ option.label }}</span>
                </div>

                @if (themeService.preference() === option.value) {
                  <div class="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-blue-600 dark:bg-blue-500">
                    <ng-icon name="heroCheck" class="size-3 text-white" />
                  </div>
                }
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Interface density -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
        <div class="p-6">
          <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">Interface density</h3>
          <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">Adjust the spacing and size of UI elements.</p>

          <fieldset class="mt-4" aria-label="Interface density">
            <div class="flex gap-3">
              @for (option of densityOptions; track option.value) {
                <label
                  [class]="density() === option.value
                    ? 'ring-2 ring-blue-600 bg-blue-50 dark:ring-blue-500 dark:bg-blue-950/30'
                    : 'ring-1 ring-gray-200 bg-white dark:ring-white/10 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10'"
                  class="flex cursor-pointer items-center gap-2 rounded-md px-4 py-2.5 transition-all"
                >
                  <input
                    type="radio"
                    name="density"
                    [value]="option.value"
                    [checked]="density() === option.value"
                    (change)="density.set(option.value)"
                    class="sr-only"
                  />
                  <span class="text-sm/6 font-medium text-gray-900 dark:text-white">{{ option.label }}</span>
                </label>
              }
            </div>
          </fieldset>
        </div>
      </div>

      <!-- Font size -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
        <div class="p-6">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm/6 font-medium text-gray-900 dark:text-white">Chat font size</h3>
              <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">Adjust the text size in chat messages.</p>
            </div>
            <span class="text-sm font-mono text-gray-500 dark:text-gray-400">{{ fontSize() }}px</span>
          </div>

          <div class="mt-4 flex items-center gap-4">
            <span class="text-xs text-gray-500 dark:text-gray-400">A</span>
            <input
              type="range"
              min="12"
              max="20"
              step="1"
              [value]="fontSize()"
              (input)="fontSize.set(+asInput($event).value)"
              class="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600 dark:bg-gray-700 dark:accent-blue-500"
              aria-label="Chat font size"
            />
            <span class="text-lg text-gray-500 dark:text-gray-400">A</span>
          </div>

          <!-- Preview -->
          <div class="mt-4 rounded-md bg-gray-50 p-4 dark:bg-white/5">
            <p class="text-gray-600 dark:text-gray-300" [style.font-size.px]="fontSize()">
              This is a preview of how chat messages will appear at {{ fontSize() }}px.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AppearanceSettingsPage {
  readonly themeService = inject(ThemeService);

  readonly density = signal<'compact' | 'comfortable' | 'spacious'>('comfortable');
  readonly fontSize = signal(14);

  readonly themeOptions = [
    {
      value: 'light' as ThemePreference,
      label: 'Light',
      icon: 'heroSun',
      previewClasses: 'bg-white border border-gray-200',
      sidebarClasses: 'bg-gray-100',
      lineClasses: 'bg-gray-200',
    },
    {
      value: 'dark' as ThemePreference,
      label: 'Dark',
      icon: 'heroMoon',
      previewClasses: 'bg-gray-900 border border-gray-700',
      sidebarClasses: 'bg-gray-800',
      lineClasses: 'bg-gray-700',
    },
    {
      value: 'system' as ThemePreference,
      label: 'System',
      icon: 'heroComputerDesktop',
      previewClasses: 'bg-gradient-to-r from-white to-gray-900 border border-gray-300',
      sidebarClasses: 'bg-gradient-to-b from-gray-100 to-gray-800',
      lineClasses: 'bg-gradient-to-r from-gray-200 to-gray-700',
    },
  ];

  readonly densityOptions = [
    { value: 'compact' as const, label: 'Compact' },
    { value: 'comfortable' as const, label: 'Comfortable' },
    { value: 'spacious' as const, label: 'Spacious' },
  ];

  setTheme(value: ThemePreference): void {
    this.themeService.setPreference(value);
  }

  asInput(event: Event): HTMLInputElement {
    return event.target as HTMLInputElement;
  }
}

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroCamera,
  heroEnvelope,
  heroBriefcase,
  heroMapPin,
  heroGlobeAlt,
} from '@ng-icons/heroicons/outline';
import { UserService } from '../../../auth/user.service';

@Component({
  selector: 'app-profile-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [
    provideIcons({ heroCamera, heroEnvelope, heroBriefcase, heroMapPin, heroGlobeAlt }),
  ],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <!-- Section header -->
      <div>
        <h2 class="text-lg/7 font-semibold text-gray-900 dark:text-white">Profile</h2>
        <p class="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
          Your personal information. Some fields are managed by your identity provider.
        </p>
      </div>

      <div class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-gray-900">
        <!-- Avatar section -->
        <div class="flex items-center gap-6 p-6">
          <div class="relative">
            @if (userService.currentUser()?.picture; as picture) {
              <img
                [src]="picture"
                alt="Profile photo"
                class="size-20 rounded-full object-cover ring-2 ring-gray-200 dark:ring-white/10"
              />
            } @else {
              <div class="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-bold text-white ring-2 ring-gray-200 dark:ring-white/10">
                {{ getInitials() }}
              </div>
            }
            <button
              type="button"
              class="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-gray-500 shadow-xs transition-colors hover:bg-gray-200 dark:border-gray-900 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
              aria-label="Change profile photo"
            >
              <ng-icon name="heroCamera" class="size-4" />
            </button>
          </div>
          <div>
            <h3 class="text-base/7 font-semibold text-gray-900 dark:text-white">
              {{ userService.currentUser()?.fullName ?? 'Unknown User' }}
            </h3>
            <p class="text-sm/6 text-gray-500 dark:text-gray-400">
              {{ userService.currentUser()?.email ?? '' }}
            </p>
            <span class="mt-1 inline-flex items-center rounded-xs bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              Managed by Entra ID
            </span>
          </div>
        </div>

        <!-- Display name -->
        <div class="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3 sm:items-center">
          <label for="display-name" class="text-sm/6 font-medium text-gray-900 dark:text-white">
            Display name
          </label>
          <div class="sm:col-span-2">
            <input
              id="display-name"
              type="text"
              [value]="displayName()"
              (input)="displayName.set(asInput($event).value)"
              class="block w-full rounded-sm border-0 bg-white px-3 py-1.5 text-sm/6 text-gray-900 shadow-xs ring-1 ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-blue-500"
              placeholder="How you appear to others"
            />
          </div>
        </div>

        <!-- Title / Role -->
        <div class="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3 sm:items-center">
          <label for="job-title" class="text-sm/6 font-medium text-gray-900 dark:text-white">
            Title
          </label>
          <div class="sm:col-span-2">
            <div class="relative">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <ng-icon name="heroBriefcase" class="size-4 text-gray-400" />
              </div>
              <input
                id="job-title"
                type="text"
                [value]="jobTitle()"
                (input)="jobTitle.set(asInput($event).value)"
                class="block w-full rounded-sm border-0 bg-white py-1.5 pl-9 pr-3 text-sm/6 text-gray-900 shadow-xs ring-1 ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-blue-500"
                placeholder="e.g. Software Engineer"
              />
            </div>
          </div>
        </div>

        <!-- Location -->
        <div class="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3 sm:items-center">
          <label for="location" class="text-sm/6 font-medium text-gray-900 dark:text-white">
            Location
          </label>
          <div class="sm:col-span-2">
            <div class="relative">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <ng-icon name="heroMapPin" class="size-4 text-gray-400" />
              </div>
              <input
                id="location"
                type="text"
                [value]="location()"
                (input)="location.set(asInput($event).value)"
                class="block w-full rounded-sm border-0 bg-white py-1.5 pl-9 pr-3 text-sm/6 text-gray-900 shadow-xs ring-1 ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-blue-500"
                placeholder="e.g. Boise, ID"
              />
            </div>
          </div>
        </div>

        <!-- Timezone -->
        <div class="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3 sm:items-center">
          <label for="timezone" class="text-sm/6 font-medium text-gray-900 dark:text-white">
            Timezone
          </label>
          <div class="sm:col-span-2">
            <div class="relative">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <ng-icon name="heroGlobeAlt" class="size-4 text-gray-400" />
              </div>
              <select
                id="timezone"
                class="block w-full rounded-sm border-0 bg-white py-1.5 pl-9 pr-3 text-sm/6 text-gray-900 shadow-xs ring-1 ring-gray-300 focus:ring-2 focus:ring-blue-600 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-blue-500"
              >
                <option>America/Boise (MST)</option>
                <option>America/Los_Angeles (PST)</option>
                <option>America/Denver (MST)</option>
                <option>America/Chicago (CST)</option>
                <option>America/New_York (EST)</option>
                <option>UTC</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Save button -->
      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-sm bg-blue-600 px-4 py-2 text-sm/6 font-semibold text-white shadow-xs transition-colors hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400"
        >
          Save changes
        </button>
      </div>
    </div>
  `,
})
export class ProfileSettingsPage {
  readonly userService = inject(UserService);

  readonly displayName = signal(this.userService.currentUser()?.fullName ?? '');
  readonly jobTitle = signal('');
  readonly location = signal('');

  getInitials(): string {
    const user = this.userService.currentUser();
    if (!user) return '?';
    return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
  }

  asInput(event: Event): HTMLInputElement {
    return event.target as HTMLInputElement;
  }
}

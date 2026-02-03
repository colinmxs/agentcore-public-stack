import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Configuration Error Component
 * 
 * Displays a full-page error when application configuration is invalid.
 * This is shown when runtime validation detects missing or invalid configuration.
 */
@Component({
  selector: 'app-config-error',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900">
      <div class="w-full max-w-2xl">
        <!-- Error Card -->
        <div class="rounded-sm bg-white shadow-sm ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10">
          <!-- Header -->
          <div class="border-b border-gray-200 bg-red-50 px-6 py-4 dark:border-gray-700 dark:bg-red-900/20">
            <div class="flex items-center gap-3">
              <!-- Error Icon -->
              <div class="shrink-0">
                <svg 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  stroke-width="1.5" 
                  class="size-8 text-red-600 dark:text-red-400"
                  aria-hidden="true"
                >
                  <path 
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" 
                    stroke-linecap="round" 
                    stroke-linejoin="round" 
                  />
                </svg>
              </div>
              
              <!-- Title -->
              <div>
                <h1 class="text-xl/7 font-semibold text-gray-900 dark:text-white">
                  Configuration Error
                </h1>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  The application cannot start due to invalid configuration
                </p>
              </div>
            </div>
          </div>
          
          <!-- Error Details -->
          <div class="px-6 py-6">
            <div class="space-y-6">
              <!-- Error List -->
              <div>
                <h2 class="text-sm font-medium text-gray-900 dark:text-white">
                  Configuration Issues:
                </h2>
                <ul class="mt-3 space-y-2">
                  @for (error of errors(); track $index) {
                    <li class="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span class="text-red-600 dark:text-red-400" aria-hidden="true">•</span>
                      <span>{{ error }}</span>
                    </li>
                  }
                </ul>
              </div>
              
              <!-- Common Causes -->
              <div class="rounded-sm bg-gray-50 p-4 dark:bg-gray-900/50">
                <h3 class="text-sm font-medium text-gray-900 dark:text-white">
                  Common Causes:
                </h3>
                <ul class="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li class="flex gap-2">
                    <span aria-hidden="true">1.</span>
                    <span>Build-time environment variable injection did not work correctly</span>
                  </li>
                  <li class="flex gap-2">
                    <span aria-hidden="true">2.</span>
                    <span>Running a production build with localhost URLs</span>
                  </li>
                  <li class="flex gap-2">
                    <span aria-hidden="true">3.</span>
                    <span>Required environment variables were not set during build</span>
                  </li>
                </ul>
              </div>
              
              <!-- Solution for Production -->
              <div class="rounded-sm border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20">
                <h3 class="text-sm font-medium text-primary-900 dark:text-primary-100">
                  For Production Deployments:
                </h3>
                <p class="mt-2 text-sm text-primary-800 dark:text-primary-200">
                  Ensure these environment variables are set during the build process:
                </p>
                <ul class="mt-3 space-y-1 font-mono text-xs text-primary-700 dark:text-primary-300">
                  <li class="flex gap-2">
                    <span class="text-primary-600 dark:text-primary-400" aria-hidden="true">•</span>
                    <span><strong>APP_API_URL</strong> - Your production App API URL</span>
                  </li>
                  <li class="flex gap-2">
                    <span class="text-primary-600 dark:text-primary-400" aria-hidden="true">•</span>
                    <span><strong>INFERENCE_API_URL</strong> - Your production Inference API URL</span>
                  </li>
                  <li class="flex gap-2">
                    <span class="text-primary-600 dark:text-primary-400" aria-hidden="true">•</span>
                    <span><strong>PRODUCTION</strong> - Set to "true" for production builds</span>
                  </li>
                  <li class="flex gap-2">
                    <span class="text-primary-600 dark:text-primary-400" aria-hidden="true">•</span>
                    <span><strong>ENABLE_AUTHENTICATION</strong> - Set to "true" or "false"</span>
                  </li>
                </ul>
              </div>
              
              <!-- Solution for Local Development -->
              <div class="rounded-sm border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <h3 class="text-sm font-medium text-gray-900 dark:text-white">
                  For Local Development:
                </h3>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  No configuration is needed. The app uses localhost URLs by default.
                  Run <code class="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-700">npm start</code> to start the development server.
                </p>
              </div>
              
              <!-- Documentation Link -->
              <div class="flex items-center gap-2 text-sm">
                <svg 
                  viewBox="0 0 20 20" 
                  fill="currentColor" 
                  class="size-5 text-gray-400"
                  aria-hidden="true"
                >
                  <path 
                    fill-rule="evenodd" 
                    d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" 
                    clip-rule="evenodd" 
                  />
                </svg>
                <span class="text-gray-600 dark:text-gray-400">
                  See documentation for more details on configuration
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Footer Note -->
        <p class="mt-4 text-center text-xs text-gray-500 dark:text-gray-500">
          This error is shown because runtime configuration validation detected issues.
          The application cannot start until these are resolved.
        </p>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: contents;
    }
  `]
})
export class ConfigErrorComponent {
  /** Array of error messages to display */
  errors = input.required<string[]>();
}

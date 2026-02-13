import { Component, signal, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth.service';
import { SidenavService } from '../../services/sidenav/sidenav.service';
import { ConfigService } from '../../services/config.service';

interface AuthProviderPublicInfo {
  provider_id: string;
  display_name: string;
  logo_url?: string;
  button_color?: string;
}

interface AuthProviderPublicListResponse {
  providers: AuthProviderPublicInfo[];
}

@Component({
  selector: 'app-login',
  imports: [CommonModule],
  styleUrl: './login.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div class="w-full max-w-md px-4 -mt-20">
        <!-- Logo -->
        <div class="mb-8 flex justify-center">
          <img
            src="/img/logo-light.png"
            alt="Logo"
            class="size-16 dark:hidden">
          <img
            src="/img/logo-dark.png"
            alt="Logo"
            class="hidden size-16 dark:block">
        </div>

        <!-- Sign In Card -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8">
          <div class="flex flex-col items-center gap-6">
            <div class="flex flex-col items-center gap-2">
              <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                Sign In
              </h1>
              <p class="text-base/7 text-gray-600 dark:text-gray-400 text-center">
                @if (providers().length > 1) {
                  Choose an authentication provider to continue
                } @else {
                  Sign in to continue
                }
              </p>
            </div>

            @if (errorMessage()) {
              <div class="w-full p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div class="flex items-start gap-3">
                  <svg class="size-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="text-sm text-red-800 dark:text-red-300">
                    {{ errorMessage() }}
                  </p>
                </div>
              </div>
            }

            <!-- Loading state while fetching providers -->
            @if (providersLoading()) {
              <div class="w-full flex justify-center py-4">
                <div class="size-6 border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
              </div>
            }

            <!-- Dynamic provider buttons -->
            @if (!providersLoading()) {
              <div class="w-full flex flex-col gap-3">
                @for (provider of providers(); track provider.provider_id) {
                  <button
                    type="button"
                    (click)="handleProviderLogin(provider)"
                    [disabled]="isLoading()"
                    class="w-full px-4 py-3 text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-60"
                    [style.background-color]="provider.button_color || '#2563eb'"
                    [style.--hover-bg]="provider.button_color ? adjustBrightness(provider.button_color, -15) : '#1d4ed8'"
                  >
                    @if (isLoading() && activeProviderId() === provider.provider_id) {
                      <div class="size-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Connecting...</span>
                    } @else {
                      @if (provider.logo_url) {
                        <img [src]="provider.logo_url" [alt]="provider.display_name" class="size-5 object-contain" />
                      } @else {
                        <svg class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      }
                      <span>Sign in with {{ provider.display_name }}</span>
                    }
                  </button>
                }

                <!-- Fallback: legacy button when no dynamic providers configured -->
                @if (providers().length === 0) {
                  <button
                    type="button"
                    (click)="handleLegacyLogin()"
                    [disabled]="isLoading()"
                    class="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    @if (isLoading()) {
                      <div class="size-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Connecting...</span>
                    } @else {
                      <svg class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Sign in with Microsoft</span>
                    }
                  </button>
                }
              </div>
            }

            <p class="text-xs text-gray-500 dark:text-gray-400 text-center">
              You will be redirected to your identity provider to complete authentication
            </p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class LoginPage implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private sidenavService = inject(SidenavService);
  private config = inject(ConfigService);
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  providers = signal<AuthProviderPublicInfo[]>([]);
  providersLoading = signal(true);
  activeProviderId = signal<string | null>(null);

  ngOnInit(): void {
    this.sidenavService.hide();
    this.loadProviders();
  }

  ngOnDestroy(): void {
    this.sidenavService.show();
  }

  private async loadProviders(): Promise<void> {
    try {
      const url = `${this.config.appApiUrl()}/auth/providers`;
      const response = await firstValueFrom(
        this.http.get<AuthProviderPublicListResponse>(url)
      );

      const providerList = response?.providers ?? [];
      this.providers.set(providerList);

      // Auto-login if exactly one provider (skip selection screen)
      if (providerList.length === 1) {
        this.storeReturnUrl();
        await this.authService.login(providerList[0].provider_id);
      }
    } catch (error) {
      // If providers endpoint fails, show legacy button as fallback
      this.providers.set([]);
    } finally {
      this.providersLoading.set(false);
    }
  }

  async handleProviderLogin(provider: AuthProviderPublicInfo): Promise<void> {
    this.isLoading.set(true);
    this.activeProviderId.set(provider.provider_id);
    this.errorMessage.set(null);

    try {
      this.storeReturnUrl();
      await this.authService.login(provider.provider_id);
    } catch (error) {
      this.isLoading.set(false);
      this.activeProviderId.set(null);
      const errorMsg = error instanceof Error ? error.message : 'An error occurred during login';
      this.errorMessage.set(errorMsg);
    }
  }

  async handleLegacyLogin(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      this.storeReturnUrl();
      await this.authService.login();
    } catch (error) {
      this.isLoading.set(false);
      const errorMsg = error instanceof Error ? error.message : 'An error occurred during login';
      this.errorMessage.set(errorMsg);
    }
  }

  /**
   * Darken or lighten a hex color for hover states.
   */
  adjustBrightness(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  }

  private storeReturnUrl(): void {
    const returnUrl = this.route.snapshot.queryParams['returnUrl'];

    let finalDestination: string | undefined;
    if (returnUrl) {
      finalDestination = returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`;
    } else {
      const referrer = document.referrer;
      if (referrer) {
        try {
          const referrerUrl = new URL(referrer);
          if (referrerUrl.origin === window.location.origin) {
            const referrerPath = referrerUrl.pathname + referrerUrl.search;
            if (referrerPath !== '/auth/login' && referrerPath !== '/auth/callback') {
              finalDestination = referrerPath;
            }
          }
        } catch (e) {
          // Invalid referrer URL, ignore
        }
      }
    }

    if (finalDestination) {
      sessionStorage.setItem('auth_return_url', finalDestination);
    }
  }
}

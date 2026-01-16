import { Component, signal, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../auth.service';
import { SidenavService } from '../../services/sidenav/sidenav.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPage implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private sidenavService = inject(SidenavService);
  private route = inject(ActivatedRoute);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.sidenavService.hide();
  }

  ngOnDestroy(): void {
    this.sidenavService.show();
  }

  async handleLogin(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      // Get returnUrl from query params (set by auth guard)
      // The auth guard passes state.url which should include query params
      const returnUrl = this.route.snapshot.queryParams['returnUrl'];
      
      // Build the final destination URL (not the OIDC redirect_uri)
      // The OIDC redirect_uri is the callback URL, not the final destination
      let finalDestination: string | undefined;
      if (returnUrl) {
        // returnUrl from auth guard should include the full path with query params
        // Ensure it starts with / for proper navigation
        finalDestination = returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`;
      } else {
        // If no returnUrl (direct navigation to login page), check if we came from a referrer
        // This handles cases where user directly visits /auth/login but we want to preserve where they came from
        const referrer = document.referrer;
        if (referrer) {
          try {
            const referrerUrl = new URL(referrer);
            // Only use referrer if it's from the same origin
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

      // Store the final destination separately (not as OIDC redirect_uri)
      // The OIDC redirect_uri must be the callback URL (absolute URI)
      // We'll use finalDestination in the callback page for the final redirect
      if (finalDestination) {
        sessionStorage.setItem('auth_return_url', finalDestination);
      }

      // Call login without passing redirect_uri - backend will use configured callback URL
      await this.authService.login();
      // Note: The login method will redirect the browser, so this code may not execute
    } catch (error) {
      this.isLoading.set(false);
      const errorMsg = error instanceof Error ? error.message : 'An error occurred during login';
      this.errorMessage.set(errorMsg);
    }
  }
}


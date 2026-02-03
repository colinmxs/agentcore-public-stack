import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth/auth.interceptor';
import { errorInterceptor } from './auth/error.interceptor';
import { provideMarkdown } from 'ngx-markdown';
import { ConfigValidatorService } from './services/config-validator.service';

/**
 * Configuration validation initializer
 * Runs before the app starts to validate environment configuration
 */
function validateConfiguration(configValidator: ConfigValidatorService) {
  return () => {
    configValidator.validateConfig();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor]),
    ),
    provideMarkdown(),
    provideRouter(routes, withComponentInputBinding()),
    {
      provide: APP_INITIALIZER,
      useFactory: validateConfiguration,
      deps: [ConfigValidatorService],
      multi: true
    }
  ]
};

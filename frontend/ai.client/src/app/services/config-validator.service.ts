import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Configuration Validation Service
 * 
 * Validates runtime configuration to catch build-time injection errors early.
 * Ensures required configuration values are present and valid before the app starts.
 */
@Injectable({
  providedIn: 'root'
})
export class ConfigValidatorService {
  
  /** Signal containing validation errors (empty if valid) */
  readonly validationErrors = signal<string[]>([]);
  
  /**
   * Validates the application configuration
   * @returns Validation result with errors if any
   */
  validateConfig(): ConfigValidationResult {
    const errors: string[] = [];
    
    // Validate required fields are present
    if (!environment.appApiUrl) {
      errors.push('appApiUrl is required but not configured');
    }
    
    if (!environment.inferenceApiUrl) {
      errors.push('inferenceApiUrl is required but not configured');
    }
    
    // Validate URLs are valid
    if (environment.appApiUrl) {
      try {
        new URL(environment.appApiUrl);
      } catch (e) {
        errors.push(`appApiUrl is not a valid URL: "${environment.appApiUrl}"`);
      }
    }
    
    if (environment.inferenceApiUrl) {
      try {
        new URL(environment.inferenceApiUrl);
      } catch (e) {
        errors.push(`inferenceApiUrl is not a valid URL: "${environment.inferenceApiUrl}"`);
      }
    }
    
    // In production mode, validate URLs are not localhost
    if (environment.production) {
      if (environment.appApiUrl && this.isLocalhostUrl(environment.appApiUrl)) {
        errors.push(
          'appApiUrl cannot be localhost in production mode. ' +
          'Set APP_API_URL environment variable to your production API URL.'
        );
      }
      
      if (environment.inferenceApiUrl && this.isLocalhostUrl(environment.inferenceApiUrl)) {
        errors.push(
          'inferenceApiUrl cannot be localhost in production mode. ' +
          'Set INFERENCE_API_URL environment variable to your production API URL.'
        );
      }
    }
    
    // Store errors in signal for component access
    this.validationErrors.set(errors);
    
    // Log errors to console for debugging
    if (errors.length > 0) {
      console.error(this.formatErrorMessage(errors));
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Checks if a URL is a localhost URL
   */
  private isLocalhostUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      return hostname === 'localhost' || 
             hostname === '127.0.0.1' || 
             hostname === '::1' ||
             hostname.endsWith('.localhost');
    } catch {
      return false;
    }
  }
  
  /**
   * Formats error messages for console logging
   */
  private formatErrorMessage(errors: string[]): string {
    const lines = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '❌ CONFIGURATION ERROR',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'The application configuration is invalid:',
      '',
      ...errors.map(error => `  • ${error}`),
      '',
      'This usually means:',
      '  1. Build-time environment variable injection did not work correctly',
      '  2. You are running a production build with localhost URLs',
      '  3. Required environment variables were not set during build',
      '',
      'For production deployments, ensure these environment variables are set:',
      '  • APP_API_URL - Your production App API URL',
      '  • INFERENCE_API_URL - Your production Inference API URL',
      '  • PRODUCTION - Set to "true" for production builds',
      '  • ENABLE_AUTHENTICATION - Set to "true" or "false"',
      '',
      'For local development, no configuration is needed.',
      'The app uses localhost URLs by default.',
      '',
      'See documentation for more details on configuration.',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      ''
    ];
    
    return lines.join('\n');
  }
}

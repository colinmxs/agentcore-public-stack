import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Runtime Configuration Interface
 * 
 * Defines the structure of the runtime configuration loaded from config.json.
 * This configuration is fetched at application startup and provides environment-specific
 * values without requiring environment-specific builds.
 */
export interface RuntimeConfig {
  /** App API backend URL (from ALB) */
  appApiUrl: string;
  
  /** AgentCore Runtime endpoint URL */
  inferenceApiUrl: string;
  
  /** Whether to enforce authentication */
  enableAuthentication: boolean;
  
  /** Environment identifier (dev/staging/production/local) */
  environment: string;
}

/**
 * Configuration Service
 * 
 * Manages runtime configuration for the application. This service:
 * - Fetches configuration from /config.json at startup
 * - Validates configuration before storing
 * - Falls back to environment.ts for local development
 * - Provides reactive access to configuration via signals
 * 
 * The service is initialized via APP_INITIALIZER before the app bootstraps,
 * ensuring configuration is available to all services and components.
 * 
 * @example
 * ```typescript
 * // Inject the service
 * private readonly config = inject(ConfigService);
 * 
 * // Access configuration values
 * const apiUrl = this.config.appApiUrl();
 * const isProduction = this.config.environment() === 'production';
 * 
 * // Use in computed signals
 * readonly baseUrl = computed(() => this.config.appApiUrl());
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private readonly http = inject(HttpClient);
  
  // Signal to store configuration
  private readonly config = signal<RuntimeConfig | null>(null);
  
  // Loading state tracking
  private readonly isLoaded = signal(false);
  private readonly loadError = signal<string | null>(null);
  
  /**
   * Computed signal for App API URL
   * Returns empty string if config not loaded
   */
  readonly appApiUrl = computed(() => this.config()?.appApiUrl ?? '');
  
  /**
   * Computed signal for Inference API URL
   * Returns empty string if config not loaded
   */
  readonly inferenceApiUrl = computed(() => this.config()?.inferenceApiUrl ?? '');
  
  /**
   * Computed signal for authentication flag
   * Returns true by default (secure default)
   */
  readonly enableAuthentication = computed(() => this.config()?.enableAuthentication ?? true);
  
  /**
   * Computed signal for environment identifier
   * Returns 'development' if config not loaded
   */
  readonly environment = computed(() => this.config()?.environment ?? 'development');
  
  /**
   * Read-only signal indicating if configuration has been loaded
   */
  readonly loaded = this.isLoaded.asReadonly();
  
  /**
   * Read-only signal containing any load error message
   */
  readonly error = this.loadError.asReadonly();
  
  /**
   * Load configuration from /config.json
   * 
   * This method is called by APP_INITIALIZER before app bootstrap.
   * It attempts to fetch runtime configuration from /config.json and falls back
   * to environment.ts values if the fetch fails.
   * 
   * The method:
   * 1. Attempts HTTP GET to /config.json
   * 2. Validates the configuration structure
   * 3. Stores valid configuration in signal
   * 4. Falls back to environment.ts on any error
   * 5. Sets loaded state to true
   * 
   * @returns Promise that resolves when configuration is loaded
   */
  async loadConfig(): Promise<void> {
    try {
      // Attempt to fetch runtime config
      const config = await firstValueFrom(
        this.http.get<RuntimeConfig>('/config.json')
      );
      
      // Validate configuration structure
      this.validateConfig(config);
      
      // Store validated configuration
      this.config.set(config);
      this.isLoaded.set(true);
      this.loadError.set(null);
      
      console.log('✅ Runtime configuration loaded:', config.environment);
      console.log('   App API URL:', config.appApiUrl);
      console.log('   Inference API URL:', config.inferenceApiUrl);
      console.log('   Authentication:', config.enableAuthentication ? 'enabled' : 'disabled');
      
    } catch (error) {
      // Log warning but don't fail - use fallback
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('⚠️ Failed to load runtime config, using fallback:', errorMessage);
      
      // Fallback to environment.ts for local development
      const fallbackConfig: RuntimeConfig = {
        appApiUrl: environment.appApiUrl || 'http://localhost:8000',
        inferenceApiUrl: environment.inferenceApiUrl || 'http://localhost:8001',
        enableAuthentication: environment.enableAuthentication ?? true,
        environment: environment.production ? 'production' : 'development',
      };
      
      console.log('📋 Using fallback configuration from environment.ts');
      console.log('   App API URL:', fallbackConfig.appApiUrl);
      console.log('   Inference API URL:', fallbackConfig.inferenceApiUrl);
      console.log('   Authentication:', fallbackConfig.enableAuthentication ? 'enabled' : 'disabled');
      
      this.config.set(fallbackConfig);
      this.isLoaded.set(true);
      this.loadError.set(errorMessage);
    }
  }
  
  /**
   * Validate configuration has required fields and correct types
   * 
   * @param config - Configuration object to validate
   * @throws Error if configuration is invalid
   */
  private validateConfig(config: any): asserts config is RuntimeConfig {
    const errors: string[] = [];
    
    // Validate appApiUrl
    if (!config.appApiUrl || typeof config.appApiUrl !== 'string') {
      errors.push('appApiUrl is required and must be a string');
    } else {
      try {
        new URL(config.appApiUrl);
      } catch {
        errors.push(`appApiUrl is not a valid URL: "${config.appApiUrl}"`);
      }
    }
    
    // Validate inferenceApiUrl
    if (!config.inferenceApiUrl || typeof config.inferenceApiUrl !== 'string') {
      errors.push('inferenceApiUrl is required and must be a string');
    } else {
      try {
        new URL(config.inferenceApiUrl);
      } catch {
        errors.push(`inferenceApiUrl is not a valid URL: "${config.inferenceApiUrl}"`);
      }
    }
    
    // Validate enableAuthentication
    if (typeof config.enableAuthentication !== 'boolean') {
      errors.push('enableAuthentication is required and must be a boolean');
    }
    
    // Validate environment
    if (!config.environment || typeof config.environment !== 'string') {
      errors.push('environment is required and must be a string');
    }
    
    // Throw error if validation failed
    if (errors.length > 0) {
      throw new Error(`Invalid configuration:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }
  }
  
  /**
   * Get a configuration value by key
   * 
   * Type-safe accessor for configuration values. Throws an error if
   * configuration is not loaded or the key doesn't exist.
   * 
   * @param key - Configuration key to retrieve
   * @returns Configuration value
   * @throws Error if configuration not loaded or key not found
   * 
   * @example
   * ```typescript
   * const apiUrl = configService.get('appApiUrl');
   * const authEnabled = configService.get('enableAuthentication');
   * ```
   */
  get<K extends keyof RuntimeConfig>(key: K): RuntimeConfig[K] {
    const currentConfig = this.config();
    
    if (!currentConfig) {
      throw new Error('Configuration not loaded. Ensure APP_INITIALIZER has completed.');
    }
    
    const value = currentConfig[key];
    
    if (value === undefined) {
      throw new Error(`Configuration key '${key}' not found`);
    }
    
    return value;
  }
  
  /**
   * Get the full configuration object
   * 
   * @returns Current configuration or null if not loaded
   */
  getConfig(): RuntimeConfig | null {
    return this.config();
  }
  
  /**
   * Check if configuration is loaded and valid
   * 
   * @returns True if configuration is loaded
   */
  isConfigLoaded(): boolean {
    return this.isLoaded() && this.config() !== null;
  }
}

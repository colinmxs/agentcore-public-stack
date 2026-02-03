import { TestBed } from '@angular/core/testing';
import { ConfigValidatorService } from './config-validator.service';
import { environment } from '../../environments/environment';

describe('ConfigValidatorService', () => {
  let service: ConfigValidatorService;
  let originalEnvironment: typeof environment;

  beforeEach(() => {
    // Save original environment
    originalEnvironment = { ...environment };
    
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfigValidatorService);
  });

  afterEach(() => {
    // Restore original environment
    Object.assign(environment, originalEnvironment);
  });

  describe('validateConfig', () => {
    it('should pass validation with valid localhost URLs in development mode', () => {
      Object.assign(environment, {
        production: false,
        appApiUrl: 'http://localhost:8000',
        inferenceApiUrl: 'http://localhost:8001',
        enableAuthentication: true
      });

      const result = service.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(service.validationErrors()).toEqual([]);
    });

    it('should fail validation when appApiUrl is missing', () => {
      Object.assign(environment, {
        production: false,
        appApiUrl: '',
        inferenceApiUrl: 'http://localhost:8001',
        enableAuthentication: true
      });

      const result = service.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('appApiUrl is required but not configured');
    });

    it('should fail validation when inferenceApiUrl is missing', () => {
      Object.assign(environment, {
        production: false,
        appApiUrl: 'http://localhost:8000',
        inferenceApiUrl: '',
        enableAuthentication: true
      });

      const result = service.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('inferenceApiUrl is required but not configured');
    });

    it('should fail validation with invalid URL format', () => {
      Object.assign(environment, {
        production: false,
        appApiUrl: 'not-a-valid-url',
        inferenceApiUrl: 'http://localhost:8001',
        enableAuthentication: true
      });

      const result = service.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('not a valid URL');
    });

    it('should fail validation with localhost URLs in production mode', () => {
      Object.assign(environment, {
        production: true,
        appApiUrl: 'http://localhost:8000',
        inferenceApiUrl: 'http://localhost:8001',
        enableAuthentication: true
      });

      const result = service.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'appApiUrl cannot be localhost in production mode. ' +
        'Set APP_API_URL environment variable to your production API URL.'
      );
      expect(result.errors).toContain(
        'inferenceApiUrl cannot be localhost in production mode. ' +
        'Set INFERENCE_API_URL environment variable to your production API URL.'
      );
    });

    it('should pass validation with production URLs in production mode', () => {
      Object.assign(environment, {
        production: true,
        appApiUrl: 'https://api.example.com',
        inferenceApiUrl: 'https://inference.example.com',
        enableAuthentication: true
      });

      const result = service.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect 127.0.0.1 as localhost', () => {
      Object.assign(environment, {
        production: true,
        appApiUrl: 'http://127.0.0.1:8000',
        inferenceApiUrl: 'http://localhost:8001',
        enableAuthentication: true
      });

      const result = service.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    it('should detect ::1 (IPv6 localhost) as localhost', () => {
      Object.assign(environment, {
        production: true,
        appApiUrl: 'http://[::1]:8000',
        inferenceApiUrl: 'http://localhost:8001',
        enableAuthentication: true
      });

      const result = service.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    it('should update validationErrors signal', () => {
      Object.assign(environment, {
        production: false,
        appApiUrl: '',
        inferenceApiUrl: '',
        enableAuthentication: true
      });

      service.validateConfig();

      expect(service.validationErrors().length).toBe(2);
      expect(service.validationErrors()).toContain('appApiUrl is required but not configured');
      expect(service.validationErrors()).toContain('inferenceApiUrl is required but not configured');
    });

    it('should accumulate multiple errors', () => {
      Object.assign(environment, {
        production: true,
        appApiUrl: 'http://localhost:8000',
        inferenceApiUrl: 'not-a-url',
        enableAuthentication: true
      });

      const result = service.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});

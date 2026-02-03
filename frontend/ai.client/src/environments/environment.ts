/**
 * Environment Configuration
 * 
 * This file contains localhost defaults for local development.
 * For production deployments, values are injected at build time via environment variables.
 * 
 * Local Development (no configuration needed):
 * - appApiUrl: http://localhost:8000
 * - inferenceApiUrl: http://localhost:8001
 * - production: false
 * - enableAuthentication: true
 * 
 * Production Deployment (values injected by build script):
 * - Set APP_API_URL environment variable
 * - Set INFERENCE_API_URL environment variable
 * - Set PRODUCTION environment variable
 * - Set ENABLE_AUTHENTICATION environment variable
 */
export const environment = {
    production: false,
    appApiUrl: 'http://localhost:8000',
    inferenceApiUrl: 'http://localhost:8001',
    enableAuthentication: true
};

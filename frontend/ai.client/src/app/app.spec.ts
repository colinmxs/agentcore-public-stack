import { describe, it, expect, vi } from 'vitest';

describe('App', () => {
  it('should export App component class', async () => {
    const { App } = await import('./app');
    expect(App).toBeDefined();
  });

  it('should have newChat as a method', async () => {
    const { App } = await import('./app');
    expect(App.prototype.newChat).toBeDefined();
  });
});

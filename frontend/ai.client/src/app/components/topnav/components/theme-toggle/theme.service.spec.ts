import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ThemeService] });
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have theme signal', () => {
    expect(typeof service.theme()).toBe('string');
    expect(['light', 'dark']).toContain(service.theme());
  });

  it('should have preference signal', () => {
    expect(typeof service.preference()).toBe('string');
    expect(['light', 'dark', 'system']).toContain(service.preference());
  });

  it('should set dark preference', () => {
    service.setPreference('dark');
    expect(service.preference()).toBe('dark');
  });

  it('should set light preference', () => {
    service.setPreference('light');
    expect(service.preference()).toBe('light');
  });

  it('should set system preference', () => {
    service.setPreference('system');
    expect(service.preference()).toBe('system');
  });

  it('should cycle through preferences', () => {
    service.setPreference('dark');
    expect(service.preference()).toBe('dark');
    service.setPreference('light');
    expect(service.preference()).toBe('light');
    service.setPreference('system');
    expect(service.preference()).toBe('system');
  });
});

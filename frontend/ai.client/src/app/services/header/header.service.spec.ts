import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HeaderService } from './header.service';

describe('HeaderService', () => {
  let service: HeaderService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [HeaderService]
    });
    service = TestBed.inject(HeaderService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with showContent as true', () => {
    expect(service.showContent()).toBe(true);
  });

  describe('showHeaderContent', () => {
    it('should set showContent to true', () => {
      service.hideHeaderContent();
      expect(service.showContent()).toBe(false);
      
      service.showHeaderContent();
      expect(service.showContent()).toBe(true);
    });

    it('should keep showContent true when already true', () => {
      expect(service.showContent()).toBe(true);
      
      service.showHeaderContent();
      expect(service.showContent()).toBe(true);
    });
  });

  describe('hideHeaderContent', () => {
    it('should set showContent to false', () => {
      expect(service.showContent()).toBe(true);
      
      service.hideHeaderContent();
      expect(service.showContent()).toBe(false);
    });

    it('should keep showContent false when already false', () => {
      service.hideHeaderContent();
      expect(service.showContent()).toBe(false);
      
      service.hideHeaderContent();
      expect(service.showContent()).toBe(false);
    });
  });

  describe('toggle behavior', () => {
    it('should toggle between show and hide states', () => {
      expect(service.showContent()).toBe(true);
      
      service.hideHeaderContent();
      expect(service.showContent()).toBe(false);
      
      service.showHeaderContent();
      expect(service.showContent()).toBe(true);
      
      service.hideHeaderContent();
      expect(service.showContent()).toBe(false);
    });
  });
});
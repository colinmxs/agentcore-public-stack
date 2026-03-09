import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChatStateService } from './chat-state.service';

describe('ChatStateService', () => {
  let service: ChatStateService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChatStateService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('setChatLoading', () => {
    it('should set loading state to true', () => {
      service.setChatLoading(true);
      expect(service.isChatLoading()).toBe(true);
    });

    it('should set loading state to false', () => {
      service.setChatLoading(false);
      expect(service.isChatLoading()).toBe(false);
    });
  });

  describe('setStopReason', () => {
    it('should set stop reason', () => {
      service.setStopReason('max_tokens');
      expect(service.currentStopReason()).toBe('max_tokens');
    });

    it('should clear stop reason with null', () => {
      service.setStopReason('stop');
      service.setStopReason(null);
      expect(service.currentStopReason()).toBeNull();
    });
  });

  describe('resetState', () => {
    it('should reset all state to initial values', () => {
      service.setChatLoading(true);
      service.setStopReason('stop');
      
      service.resetState();
      
      expect(service.isChatLoading()).toBe(false);
      expect(service.currentStopReason()).toBeNull();
    });
  });

  describe('getAbortController', () => {
    it('should return current abort controller', () => {
      const controller = service.getAbortController();
      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
    });
  });

  describe('createNewAbortController', () => {
    it('should create and return new abort controller', () => {
      const oldController = service.getAbortController();
      const newController = service.createNewAbortController();
      
      expect(newController).toBeInstanceOf(AbortController);
      expect(newController).not.toBe(oldController);
      expect(service.getAbortController()).toBe(newController);
    });
  });

  describe('abortCurrentRequest', () => {
    it('should abort current controller and create new one', () => {
      const oldController = service.getAbortController();
      
      service.abortCurrentRequest();
      
      expect(oldController.signal.aborted).toBe(true);
      
      const newController = service.getAbortController();
      expect(newController).not.toBe(oldController);
      expect(newController.signal.aborted).toBe(false);
    });
  });
});
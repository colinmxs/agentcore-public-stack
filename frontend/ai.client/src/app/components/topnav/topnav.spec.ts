import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { SessionService } from '../../session/services/session/session.service';
import { SidenavService } from '../../services/sidenav/sidenav.service';

describe('Topnav', () => {
  let mockRouter: any;
  let mockSessionService: any;
  let mockSidenavService: any;

  beforeEach(() => {
    TestBed.resetTestingModule();
    mockRouter = { navigate: vi.fn() };
    mockSessionService = {
      currentSession: signal({ sessionId: 'test-session', title: 'Test Session' }),
    };
    mockSidenavService = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: SessionService, useValue: mockSessionService },
        { provide: SidenavService, useValue: mockSidenavService },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function createComponent() {
    const { Topnav } = await import('./topnav');
    return TestBed.runInInjectionContext(() => new Topnav());
  }

  it('should expose currentSession from SessionService', async () => {
    const component = await createComponent();
    expect(component.currentSession()).toEqual({ sessionId: 'test-session', title: 'Test Session' });
  });

  it('should navigate to home when newChat is called', async () => {
    const component = await createComponent();
    component.newChat();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['']);
  });

  it('should open sidenav when openSidenav is called', async () => {
    const component = await createComponent();
    component.openSidenav();
    expect(mockSidenavService.open).toHaveBeenCalled();
  });
});

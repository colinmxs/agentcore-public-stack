import { Component, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { SessionList } from './components/session-list/session-list';
import { SessionService } from '../../session/services/session/session.service';

@Component({
  selector: 'app-sidenav',
  imports: [SessionList],
  templateUrl: './sidenav.html',
  styleUrl: './sidenav.css',
})
export class Sidenav {
  private router = inject(Router);
  private sessionService = inject(SessionService);

  // Access to current session signals - available for use in template or component logic
  readonly currentSession = this.sessionService.currentSession;
  readonly hasCurrentSession = this.sessionService.hasCurrentSession;

  // Example: Computed signal for display purposes
  readonly currentSessionTitle = computed(() => {
    const session = this.currentSession();
    return session.title || 'Untitled Session';
  });

  newSession() {
    this.router.navigate(['']);
  }
}

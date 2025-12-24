import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../session/services/session/session.service';

@Component({
  selector: 'app-topnav',
  imports: [],
  templateUrl: './topnav.html',
  styleUrl: './topnav.css',
})
export class Topnav {
  private router = inject(Router);
  protected sessionService = inject(SessionService);
  readonly currentSession = this.sessionService.currentSession;

  newChat() {
    this.router.navigate(['']);
  }
}

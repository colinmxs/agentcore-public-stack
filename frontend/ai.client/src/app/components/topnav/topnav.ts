import { Component, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { UserService } from '../../auth/user.service';
import { SessionService } from '../../session/services/session/session.service';
import { CommonModule } from '@angular/common';
import { UserDropdownComponent } from './components/user-dropdown.component';

@Component({
  selector: 'app-topnav',
  imports: [ThemeToggleComponent, CommonModule, UserDropdownComponent],
  templateUrl: './topnav.html',
  styleUrl: './topnav.css',
})
export class Topnav {
  private router = inject(Router);
  protected userService = inject(UserService);
  protected sessionService = inject(SessionService);
  readonly currentSession = this.sessionService.currentSession;

  // Check if user has admin roles
  protected isAdmin = computed(() => {
    const requiredRoles = ['Admin', 'SuperAdmin', 'DotNetDevelopers'];
    return this.userService.hasAnyRole(requiredRoles);
  });

  newChat() {
    this.router.navigate(['']);
  }
}

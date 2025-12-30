import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroXMark, heroCheck } from '@ng-icons/heroicons/outline';
import { AdminToolService } from '../services/admin-tool.service';
import { AdminTool, ToolRoleAssignment } from '../models/admin-tool.model';
import { AppRolesService } from '../../roles/services/app-roles.service';
import { AppRole } from '../../roles/models/app-role.model';

@Component({
  selector: 'app-tool-role-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [provideIcons({ heroXMark, heroCheck })],
  template: `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-sm shadow-lg w-full max-w-lg max-h-[80vh] overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <div>
            <h2 class="text-lg font-semibold">Manage Role Access</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ tool().displayName }}</p>
          </div>
          <button
            (click)="closed.emit()"
            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-sm"
          >
            <ng-icon name="heroXMark" class="size-5" />
          </button>
        </div>

        <!-- Content -->
        <div class="p-6 overflow-y-auto max-h-96">
          @if (loading()) {
            <div class="flex items-center justify-center py-8">
              <div class="animate-spin rounded-full size-8 border-4 border-gray-300 dark:border-gray-600 border-t-blue-600"></div>
            </div>
          } @else {
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select which AppRoles should have access to this tool.
            </p>

            @if (tool().isPublic) {
              <div class="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-sm">
                <p class="text-sm text-green-800 dark:text-green-200">
                  This tool is marked as public and is available to all authenticated users.
                </p>
              </div>
            }

            <div class="space-y-2">
              @for (role of allRoles(); track role.roleId) {
                <label
                  class="flex items-center gap-3 p-3 border rounded-sm hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  [class.border-blue-500]="selectedRoleIds().has(role.roleId)"
                  [class.dark:border-blue-400]="selectedRoleIds().has(role.roleId)"
                >
                  <input
                    type="checkbox"
                    [checked]="selectedRoleIds().has(role.roleId)"
                    (change)="toggleRole(role.roleId)"
                    class="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium">{{ role.displayName }}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400 truncate">{{ role.roleId }}</div>
                  </div>
                  @if (currentAssignments().has(role.roleId)) {
                    <span class="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {{ getGrantType(role.roleId) }}
                    </span>
                  }
                </label>
              }
            </div>

            @if (allRoles().length === 0) {
              <p class="text-center text-gray-500 dark:text-gray-400 py-8">
                No roles available. Create roles first.
              </p>
            }
          }
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
          <p class="text-sm text-amber-600 dark:text-amber-400">
            Changes take effect within 5-10 minutes.
          </p>
          <div class="flex gap-2">
            <button
              (click)="closed.emit()"
              class="px-4 py-2 border border-gray-300 rounded-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              (click)="save()"
              [disabled]="saving() || loading()"
              class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-sm hover:bg-blue-700 disabled:opacity-50"
            >
              <ng-icon name="heroCheck" class="size-4" />
              {{ saving() ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ToolRoleDialogComponent implements OnInit {
  tool = input.required<AdminTool>();
  closed = output<void>();
  saved = output<string[]>();

  private adminToolService = inject(AdminToolService);
  private appRolesService = inject(AppRolesService);

  loading = signal(true);
  saving = signal(false);
  allRoles = signal<AppRole[]>([]);
  currentAssignments = signal<Map<string, ToolRoleAssignment>>(new Map());
  selectedRoleIds = signal<Set<string>>(new Set());

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      // Load all roles and current assignments in parallel
      const [rolesResponse, assignments] = await Promise.all([
        this.appRolesService.fetchRoles(),
        this.adminToolService.getToolRoles(this.tool().toolId),
      ]);

      // Filter out system_admin role from the list
      this.allRoles.set(
        rolesResponse.roles.filter(r => r.roleId !== 'system_admin')
      );

      const assignmentMap = new Map<string, ToolRoleAssignment>();
      for (const a of assignments) {
        assignmentMap.set(a.roleId, a);
      }
      this.currentAssignments.set(assignmentMap);

      // Initialize selected with direct grants only
      const directGrants = assignments
        .filter(a => a.grantType === 'direct')
        .map(a => a.roleId);
      this.selectedRoleIds.set(new Set(directGrants));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.loading.set(false);
    }
  }

  toggleRole(roleId: string): void {
    this.selectedRoleIds.update(set => {
      const newSet = new Set(set);
      if (newSet.has(roleId)) {
        newSet.delete(roleId);
      } else {
        newSet.add(roleId);
      }
      return newSet;
    });
  }

  getGrantType(roleId: string): string {
    const assignment = this.currentAssignments().get(roleId);
    if (!assignment) return '';
    if (assignment.grantType === 'inherited') {
      return `inherited from ${assignment.inheritedFrom}`;
    }
    return 'direct';
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const roleIds = Array.from(this.selectedRoleIds());
      this.saved.emit(roleIds);
    } finally {
      this.saving.set(false);
    }
  }
}

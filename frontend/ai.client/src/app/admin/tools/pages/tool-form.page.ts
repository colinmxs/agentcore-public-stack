import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroArrowLeft,
  heroCheck,
} from '@ng-icons/heroicons/outline';
import { AdminToolService } from '../services/admin-tool.service';
import {
  AdminTool,
  ToolFormData,
  TOOL_CATEGORIES,
  TOOL_PROTOCOLS,
  TOOL_STATUSES,
} from '../models/admin-tool.model';

@Component({
  selector: 'app-tool-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, NgIcon],
  providers: [provideIcons({ heroArrowLeft, heroCheck })],
  host: {
    class: 'block p-6',
  },
  template: `
    <div class="max-w-2xl">
      <!-- Header -->
      <div class="mb-6">
        <a
          routerLink="/admin/tools"
          class="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ng-icon name="heroArrowLeft" class="size-4" />
          Back to Tools
        </a>
        <h1 class="text-2xl/9 font-bold">
          {{ isEditMode() ? 'Edit Tool' : 'Create Tool' }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ isEditMode() ? 'Update tool metadata and settings.' : 'Add a new tool to the catalog.' }}
        </p>
      </div>

      <!-- Loading State -->
      @if (loading()) {
        <div class="flex items-center justify-center h-64">
          <div class="animate-spin rounded-full size-12 border-4 border-gray-300 dark:border-gray-600 border-t-blue-600"></div>
        </div>
      } @else {
        <!-- Form -->
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-6">
          <!-- Tool ID (only for create) -->
          @if (!isEditMode()) {
            <div>
              <label for="toolId" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tool ID
              </label>
              <input
                id="toolId"
                type="text"
                formControlName="toolId"
                class="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600"
                placeholder="e.g., my_custom_tool"
              />
              @if (form.get('toolId')?.invalid && form.get('toolId')?.touched) {
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                  Tool ID must be 3-50 characters, lowercase letters, numbers, and underscores only.
                </p>
              }
            </div>
          }

          <!-- Display Name -->
          <div>
            <label for="displayName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              formControlName="displayName"
              class="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600"
              placeholder="e.g., My Custom Tool"
            />
            @if (form.get('displayName')?.invalid && form.get('displayName')?.touched) {
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                Display name is required (1-100 characters).
              </p>
            }
          </div>

          <!-- Description -->
          <div>
            <label for="description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              id="description"
              formControlName="description"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600"
              placeholder="Describe what this tool does..."
            ></textarea>
            @if (form.get('description')?.invalid && form.get('description')?.touched) {
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                Description is required (max 500 characters).
              </p>
            }
          </div>

          <!-- Category and Protocol Row -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="category" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <select
                id="category"
                formControlName="category"
                class="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600"
              >
                @for (cat of categories; track cat.value) {
                  <option [value]="cat.value">{{ cat.label }}</option>
                }
              </select>
            </div>

            <div>
              <label for="protocol" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Protocol
              </label>
              <select
                id="protocol"
                formControlName="protocol"
                class="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600"
              >
                @for (proto of protocols; track proto.value) {
                  <option [value]="proto.value">{{ proto.label }}</option>
                }
              </select>
            </div>
          </div>

          <!-- Status and Icon Row -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="status" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                id="status"
                formControlName="status"
                class="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600"
              >
                @for (stat of statuses; track stat.value) {
                  <option [value]="stat.value">{{ stat.label }}</option>
                }
              </select>
            </div>

            <div>
              <label for="icon" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Icon
              </label>
              <input
                id="icon"
                type="text"
                formControlName="icon"
                class="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600"
                placeholder="e.g., heroCodeBracket"
              />
            </div>
          </div>

          <!-- Checkboxes -->
          <div class="space-y-3">
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                formControlName="isPublic"
                class="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Public Tool
              </span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                (Available to all authenticated users)
              </span>
            </label>

            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                formControlName="enabledByDefault"
                class="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enabled by Default
              </span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                (Tool is enabled when user first accesses it)
              </span>
            </label>

            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                formControlName="requiresApiKey"
                class="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Requires API Key
              </span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                (Tool requires external API key)
              </span>
            </label>
          </div>

          <!-- Error Message -->
          @if (error()) {
            <div class="p-4 bg-red-50 border border-red-200 rounded-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
              {{ error() }}
            </div>
          }

          <!-- Actions -->
          <div class="flex items-center justify-end gap-3 pt-4">
            <a
              routerLink="/admin/tools"
              class="px-4 py-2 border border-gray-300 rounded-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Cancel
            </a>
            <button
              type="submit"
              [disabled]="form.invalid || saving()"
              class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ng-icon name="heroCheck" class="size-5" />
              {{ saving() ? 'Saving...' : (isEditMode() ? 'Update Tool' : 'Create Tool') }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class ToolFormPage implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private adminToolService = inject(AdminToolService);

  readonly categories = TOOL_CATEGORIES;
  readonly protocols = TOOL_PROTOCOLS;
  readonly statuses = TOOL_STATUSES;

  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  toolId = signal<string | null>(null);

  readonly isEditMode = computed(() => !!this.toolId());

  form: FormGroup = this.fb.group({
    toolId: ['', [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]{2,49}$/)]],
    displayName: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    category: ['utility'],
    protocol: ['local'],
    status: ['active'],
    icon: [''],
    isPublic: [false],
    enabledByDefault: [false],
    requiresApiKey: [false],
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('toolId');
    if (id) {
      this.toolId.set(id);
      await this.loadTool(id);
    }
  }

  async loadTool(toolId: string): Promise<void> {
    this.loading.set(true);
    try {
      const tool = await this.adminToolService.fetchTool(toolId);
      this.form.patchValue({
        toolId: tool.toolId,
        displayName: tool.displayName,
        description: tool.description,
        category: tool.category,
        protocol: tool.protocol,
        status: tool.status,
        icon: tool.icon || '',
        isPublic: tool.isPublic,
        enabledByDefault: tool.enabledByDefault,
        requiresApiKey: tool.requiresApiKey,
      });
      // Disable toolId in edit mode
      this.form.get('toolId')?.disable();
    } catch (err: unknown) {
      console.error('Error loading tool:', err);
      this.error.set('Failed to load tool.');
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.saving.set(true);
    this.error.set(null);

    try {
      const formValue = this.form.getRawValue();

      if (this.isEditMode()) {
        // Update existing tool
        await this.adminToolService.updateTool(this.toolId()!, {
          displayName: formValue.displayName,
          description: formValue.description,
          category: formValue.category,
          protocol: formValue.protocol,
          status: formValue.status,
          icon: formValue.icon || undefined,
          isPublic: formValue.isPublic,
          enabledByDefault: formValue.enabledByDefault,
          requiresApiKey: formValue.requiresApiKey,
        });
      } else {
        // Create new tool
        await this.adminToolService.createTool({
          toolId: formValue.toolId,
          displayName: formValue.displayName,
          description: formValue.description,
          category: formValue.category,
          protocol: formValue.protocol,
          status: formValue.status,
          icon: formValue.icon || undefined,
          isPublic: formValue.isPublic,
          enabledByDefault: formValue.enabledByDefault,
          requiresApiKey: formValue.requiresApiKey,
        });
      }

      await this.router.navigate(['/admin/tools']);
    } catch (err: unknown) {
      console.error('Error saving tool:', err);
      const message = err instanceof Error ? err.message : 'Failed to save tool.';
      this.error.set(message);
    } finally {
      this.saving.set(false);
    }
  }
}

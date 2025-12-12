import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { GeminiModelsService } from './services/gemini-models.service';
import { LoadingComponent } from '../../components/loading.component';
import { GeminiModelSummary } from './models/gemini-model.model';
import { ManagedModelsService } from '../manage-models/services/managed-models.service';

@Component({
  selector: 'app-gemini-models-page',
  imports: [FormsModule, LoadingComponent, DecimalPipe],
  templateUrl: './gemini-models.page.html',
  styleUrl: './gemini-models.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeminiModelsPage {
  private geminiModelsService = inject(GeminiModelsService);
  private managedModelsService = inject(ManagedModelsService);
  private router = inject(Router);

  // Filter signals
  maxResultsFilter = signal<number | undefined>(undefined);

  // Access the models resource from the service
  readonly modelsResource = this.geminiModelsService.modelsResource;

  // Computed signal for models data
  readonly models = computed(() => this.modelsResource.value()?.models ?? []);
  readonly totalCount = computed(() => this.modelsResource.value()?.totalCount ?? 0);
  readonly isLoading = computed(() => this.modelsResource.isLoading());
  readonly error = computed(() => {
    const err = this.modelsResource.error();
    return err ? String(err) : null;
  });

  /**
   * Apply the current filter values to the resource.
   * This triggers a refetch with the new parameters.
   */
  applyFilters(): void {
    this.geminiModelsService.updateModelsParams({
      maxResults: this.maxResultsFilter() || undefined,
    });

    // Explicitly reload the resource after updating params
    this.modelsResource.reload();
  }

  /**
   * Reset all filters and refetch data.
   */
  resetFilters(): void {
    this.maxResultsFilter.set(undefined);
    this.geminiModelsService.resetModelsParams();
  }

  /**
   * Check if any filters are currently applied.
   */
  readonly hasActiveFilters = computed(() => {
    return !!(this.maxResultsFilter());
  });

  /**
   * Check if a model has already been added to the managed models list
   */
  isModelAdded(modelName: string): boolean {
    return this.managedModelsService.isModelAdded(modelName);
  }

  /**
   * Check if a model supports streaming based on its generation methods
   */
  supportsStreaming(model: GeminiModelSummary): boolean {
    return model.supportedGenerationMethods.some(method => method.toLowerCase().includes('stream'));
  }

  /**
   * Navigate to add model form with prepopulated data from a Gemini model
   */
  addModelFromGemini(model: GeminiModelSummary): void {
    // Determine input/output modalities based on supported generation methods
    const hasGenerateContent = model.supportedGenerationMethods.some(
      method => method.toLowerCase().includes('generatecontent')
    );
    const inputModalities = hasGenerateContent ? ['TEXT'] : [];
    const outputModalities = hasGenerateContent ? ['TEXT'] : [];

    this.router.navigate(['/admin/manage-models/new'], {
      queryParams: {
        modelId: model.name,
        modelName: model.displayName,
        provider: 'gemini',
        providerName: 'Google',
        inputModalities: inputModalities.join(','),
        outputModalities: outputModalities.join(','),
        responseStreamingSupported: this.supportsStreaming(model),
        customizationsSupported: '',
        inferenceTypesSupported: 'ON_DEMAND',
        modelLifecycle: 'ACTIVE',
      }
    });
  }
}

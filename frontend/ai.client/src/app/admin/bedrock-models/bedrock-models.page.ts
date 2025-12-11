import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BedrockModelsService } from './services/bedrock-models.service';
import { LoadingComponent } from '../../components/loading.component';

@Component({
  selector: 'app-bedrock-models-page',
  imports: [FormsModule, LoadingComponent],
  templateUrl: './bedrock-models.page.html',
  styleUrl: './bedrock-models.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BedrockModelsPage {
  private bedrockModelsService = inject(BedrockModelsService);

  // Filter signals
  providerFilter = signal<string>('');
  outputModalityFilter = signal<string>('');
  inferenceTypeFilter = signal<string>('');
  customizationTypeFilter = signal<string>('');
  maxResultsFilter = signal<number | undefined>(undefined);

  // Access the models resource from the service
  readonly modelsResource = this.bedrockModelsService.modelsResource;

  // Computed signal for models data
  readonly models = computed(() => this.modelsResource.value()?.models ?? []);
  readonly totalCount = computed(() => this.modelsResource.value()?.totalCount ?? 0);
  readonly isLoading = computed(() => this.modelsResource.isLoading());
  readonly error = computed(() => {
    const err = this.modelsResource.error();
    return err ? String(err) : null;
  });

  // Available filter options (populated from data)
  readonly availableProviders = computed(() => {
    const models = this.models();
    const providers = new Set(models.map(m => m.providerName));
    return Array.from(providers).sort();
  });

  readonly availableOutputModalities = computed(() => {
    const models = this.models();
    const modalities = new Set(models.flatMap(m => m.outputModalities));
    return Array.from(modalities).sort();
  });

  readonly availableInferenceTypes = computed(() => {
    const models = this.models();
    const types = new Set(models.flatMap(m => m.inferenceTypesSupported));
    return Array.from(types).sort();
  });

  readonly availableCustomizationTypes = computed(() => {
    const models = this.models();
    const types = new Set(models.flatMap(m => m.customizationsSupported));
    return Array.from(types).sort();
  });

  /**
   * Apply the current filter values to the resource.
   * This triggers a refetch with the new parameters.
   */
  applyFilters(): void {
    this.bedrockModelsService.updateModelsParams({
      byProvider: this.providerFilter() || undefined,
      byOutputModality: this.outputModalityFilter() || undefined,
      byInferenceType: this.inferenceTypeFilter() || undefined,
      byCustomizationType: this.customizationTypeFilter() || undefined,
      maxResults: this.maxResultsFilter() || undefined,
    });

    // Explicitly reload the resource after updating params
    this.modelsResource.reload();
  }

  /**
   * Reset all filters and refetch data.
   */
  resetFilters(): void {
    this.providerFilter.set('');
    this.outputModalityFilter.set('');
    this.inferenceTypeFilter.set('');
    this.customizationTypeFilter.set('');
    this.maxResultsFilter.set(undefined);
    this.bedrockModelsService.resetModelsParams();
  }

  /**
   * Check if any filters are currently applied.
   */
  readonly hasActiveFilters = computed(() => {
    return !!(
      this.providerFilter() ||
      this.outputModalityFilter() ||
      this.inferenceTypeFilter() ||
      this.customizationTypeFilter() ||
      this.maxResultsFilter()
    );
  });
}

import { Injectable, signal, computed } from '@angular/core';

/**
 * Interface representing a quota warning from the SSE stream
 */
export interface QuotaWarning {
  type: 'quota_warning';
  warningLevel: string;  // e.g., "80%", "90%"
  currentUsage: number;
  quotaLimit: number;
  percentageUsed: number;
  remaining: number;
  message: string;
}

/**
 * Service for managing quota warning state
 *
 * Handles quota warnings received from the SSE stream and exposes
 * reactive signals for UI components to display warnings.
 */
@Injectable({
  providedIn: 'root'
})
export class QuotaWarningService {
  /** The current active quota warning, null if no warning */
  private activeWarningSignal = signal<QuotaWarning | null>(null);

  /** Timestamp when the warning was received */
  private warningTimestampSignal = signal<Date | null>(null);

  /** Whether the user has dismissed the current warning */
  private isDismissedSignal = signal<boolean>(false);

  // =========================================================================
  // Public Readonly Signals
  // =========================================================================

  /** The active quota warning */
  readonly activeWarning = this.activeWarningSignal.asReadonly();

  /** Whether there's a visible warning to show */
  readonly hasVisibleWarning = computed(() => {
    return this.activeWarningSignal() !== null && !this.isDismissedSignal();
  });

  /** Warning severity level for styling */
  readonly severity = computed<'warning' | 'critical' | null>(() => {
    const warning = this.activeWarningSignal();
    if (!warning) return null;

    // 90% or higher is critical, otherwise warning
    return warning.percentageUsed >= 90 ? 'critical' : 'warning';
  });

  /** Formatted usage display (e.g., "$8.00 / $10.00") */
  readonly formattedUsage = computed(() => {
    const warning = this.activeWarningSignal();
    if (!warning) return '';

    const current = warning.currentUsage.toFixed(2);
    const limit = warning.quotaLimit.toFixed(2);
    return `$${current} / $${limit}`;
  });

  /** Formatted remaining amount */
  readonly formattedRemaining = computed(() => {
    const warning = this.activeWarningSignal();
    if (!warning) return '';

    return `$${warning.remaining.toFixed(2)}`;
  });

  // =========================================================================
  // Public Methods
  // =========================================================================

  /**
   * Set a new quota warning from the SSE stream
   *
   * @param warning - The quota warning event data
   */
  setWarning(warning: QuotaWarning): void {
    // Only update if this is a new/different warning
    const current = this.activeWarningSignal();
    if (current?.warningLevel !== warning.warningLevel ||
        current?.currentUsage !== warning.currentUsage) {
      this.activeWarningSignal.set(warning);
      this.warningTimestampSignal.set(new Date());
      this.isDismissedSignal.set(false);
    }
  }

  /**
   * Dismiss the current warning
   * The warning will reappear on the next request if still over threshold
   */
  dismissWarning(): void {
    this.isDismissedSignal.set(true);
  }

  /**
   * Clear all warning state (e.g., on logout)
   */
  clearWarning(): void {
    this.activeWarningSignal.set(null);
    this.warningTimestampSignal.set(null);
    this.isDismissedSignal.set(false);
  }

  /**
   * Reset dismissed state to show warning again on next occurrence
   */
  resetDismissed(): void {
    this.isDismissedSignal.set(false);
  }
}

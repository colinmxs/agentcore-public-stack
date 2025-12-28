import { Injectable, inject, signal, computed } from '@angular/core';
import { AdminCostHttpService } from './admin-cost-http.service';
import {
  AdminCostDashboard,
  TopUserCost,
  SystemCostSummary,
  CostTrend,
  ModelUsageSummary,
  DashboardRequestOptions,
  TopUsersRequestOptions,
  TrendsRequestOptions,
} from '../models';

/**
 * State management service for admin cost dashboard using signals.
 * Provides reactive state for dashboard data, loading states, and errors.
 */
@Injectable({
  providedIn: 'root',
})
export class AdminCostStateService {
  private http = inject(AdminCostHttpService);

  // ========== State Signals ==========

  dashboard = signal<AdminCostDashboard | null>(null);
  topUsers = signal<TopUserCost[]>([]);
  systemSummary = signal<SystemCostSummary | null>(null);
  trends = signal<CostTrend[]>([]);
  modelUsage = signal<ModelUsageSummary[]>([]);

  selectedPeriod = signal<string>(this.getCurrentPeriod());

  loading = signal(false);
  loadingTopUsers = signal(false);
  loadingTrends = signal(false);

  error = signal<string | null>(null);

  // ========== Computed Signals ==========

  totalCost = computed(() => this.systemSummary()?.totalCost ?? 0);
  totalRequests = computed(() => this.systemSummary()?.totalRequests ?? 0);
  activeUsers = computed(() => this.systemSummary()?.activeUsers ?? 0);
  cacheSavings = computed(() => this.systemSummary()?.totalCacheSavings ?? 0);

  topUsersCount = computed(() => this.topUsers().length);

  hasData = computed(() => this.dashboard() !== null);
  hasTrends = computed(() => this.trends().length > 0);

  // ========== Dashboard Methods ==========

  async loadDashboard(options: DashboardRequestOptions = {}): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const period = options.period ?? this.selectedPeriod();
      const dashboard = await this.http
        .getDashboard({
          ...options,
          period,
        })
        .toPromise();

      if (dashboard) {
        this.dashboard.set(dashboard);
        this.systemSummary.set(dashboard.currentPeriod);
        this.topUsers.set(dashboard.topUsers);
        this.modelUsage.set(dashboard.modelUsage);

        if (dashboard.dailyTrends) {
          this.trends.set(dashboard.dailyTrends);
        }
      }
    } catch (error: any) {
      this.error.set(error.message || 'Failed to load dashboard');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async loadTopUsers(options: TopUsersRequestOptions = {}): Promise<void> {
    this.loadingTopUsers.set(true);
    this.error.set(null);

    try {
      const period = options.period ?? this.selectedPeriod();
      const users = await this.http
        .getTopUsers({ ...options, period })
        .toPromise();

      this.topUsers.set(users || []);
    } catch (error: any) {
      this.error.set(error.message || 'Failed to load top users');
      throw error;
    } finally {
      this.loadingTopUsers.set(false);
    }
  }

  async loadSystemSummary(period?: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const targetPeriod = period ?? this.selectedPeriod();
      const summary = await this.http
        .getSystemSummary(targetPeriod, 'monthly')
        .toPromise();

      if (summary) {
        this.systemSummary.set(summary);
      }
    } catch (error: any) {
      this.error.set(error.message || 'Failed to load system summary');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async loadTrends(options: TrendsRequestOptions): Promise<void> {
    this.loadingTrends.set(true);
    this.error.set(null);

    try {
      const trends = await this.http.getTrends(options).toPromise();
      this.trends.set(trends || []);
    } catch (error: any) {
      this.error.set(error.message || 'Failed to load trends');
      throw error;
    } finally {
      this.loadingTrends.set(false);
    }
  }

  async exportData(format: 'csv' | 'json' = 'csv'): Promise<void> {
    try {
      const blob = await this.http
        .exportData(this.selectedPeriod(), format)
        .toPromise();

      if (blob) {
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cost_report_${this.selectedPeriod()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error: any) {
      this.error.set(error.message || 'Failed to export data');
      throw error;
    }
  }

  // ========== Period Selection ==========

  setPeriod(period: string): void {
    this.selectedPeriod.set(period);
  }

  // ========== Utility Methods ==========

  clearError(): void {
    this.error.set(null);
  }

  reset(): void {
    this.dashboard.set(null);
    this.topUsers.set([]);
    this.systemSummary.set(null);
    this.trends.set([]);
    this.modelUsage.set([]);
    this.selectedPeriod.set(this.getCurrentPeriod());
    this.error.set(null);
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}

import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QuotaStateService } from './quota-state.service';
import { QuotaHttpService } from './quota-http.service';
import { of } from 'rxjs';

describe('QuotaStateService', () => {
  let service: QuotaStateService;
  let httpService: any;

  beforeEach(() => {
    TestBed.resetTestingModule();
    
    const httpServiceMock = {
      getTiers: vi.fn(),
      getTier: vi.fn(),
      createTier: vi.fn(),
      updateTier: vi.fn(),
      deleteTier: vi.fn(),
      getAssignments: vi.fn(),
      createAssignment: vi.fn(),
      updateAssignment: vi.fn(),
      deleteAssignment: vi.fn(),
      getOverrides: vi.fn(),
      createOverride: vi.fn(),
      updateOverride: vi.fn(),
      deleteOverride: vi.fn(),
      getEvents: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        QuotaStateService,
        { provide: QuotaHttpService, useValue: httpServiceMock },
      ],
    });

    service = TestBed.inject(QuotaStateService);
    httpService = TestBed.inject(QuotaHttpService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load tiers', async () => {
    const mockTiers = [{ tierId: '1', name: 'Basic' }];
    httpService.getTiers.mockReturnValue(of(mockTiers));

    await service.loadTiers();

    expect(service.tiers()).toEqual(mockTiers);
    expect(service.loadingTiers()).toBe(false);
  });

  it('should create tier', async () => {
    const mockTier = { tierId: '1', name: 'Basic' };
    httpService.createTier.mockReturnValue(of(mockTier));

    const result = await service.createTier({ name: 'Basic' } as any);

    expect(result).toEqual(mockTier);
    expect(service.tiers()).toContain(mockTier);
  });

  it('should update tier', async () => {
    const mockTier = { tierId: '1', name: 'Updated' };
    service.tiers.set([{ tierId: '1', name: 'Basic' } as any]);
    httpService.updateTier.mockReturnValue(of(mockTier));

    const result = await service.updateTier('1', { name: 'Updated' } as any);

    expect(result).toEqual(mockTier);
    expect(service.tiers()[0]).toEqual(mockTier);
  });

  it('should delete tier', async () => {
    service.tiers.set([{ tierId: '1', name: 'Basic' } as any]);
    httpService.deleteTier.mockReturnValue(of(null));

    await service.deleteTier('1');

    expect(service.tiers()).toEqual([]);
  });

  it('should load assignments', async () => {
    const mockAssignments = [{ assignmentId: '1', tierId: '1' }];
    httpService.getAssignments.mockReturnValue(of(mockAssignments));

    await service.loadAssignments();

    expect(service.assignments()).toEqual(mockAssignments);
    expect(service.loadingAssignments()).toBe(false);
  });

  it('should load overrides', async () => {
    const mockOverrides = [{ overrideId: '1', userId: '1' }];
    httpService.getOverrides.mockReturnValue(of(mockOverrides));

    await service.loadOverrides();

    expect(service.overrides()).toEqual(mockOverrides);
    expect(service.loadingOverrides()).toBe(false);
  });

  it('should load events', async () => {
    const mockEvents = [{ eventId: '1', eventType: 'quota_exceeded' }];
    httpService.getEvents.mockReturnValue(of(mockEvents));

    await service.loadEvents({});

    expect(service.events()).toEqual(mockEvents);
    expect(service.loadingEvents()).toBe(false);
  });

  it('should reset state', () => {
    service.reset();

    expect(service.tiers()).toEqual([]);
    expect(service.assignments()).toEqual([]);
    expect(service.overrides()).toEqual([]);
    expect(service.error()).toBeNull();
  });
});
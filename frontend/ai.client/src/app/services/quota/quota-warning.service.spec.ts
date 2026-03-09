import { TestBed } from '@angular/core/testing';
import { QuotaWarningService, QuotaWarning, QuotaExceeded } from './quota-warning.service';

describe('QuotaWarningService', () => {
  let service: QuotaWarningService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuotaWarningService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('setWarning', () => {
    it('should set warning and update signals', () => {
      const warning: QuotaWarning = {
        type: 'quota_warning',
        warningLevel: '80%',
        currentUsage: 8,
        quotaLimit: 10,
        percentageUsed: 80,
        remaining: 2,
        message: 'Warning message'
      };

      service.setWarning(warning);

      expect(service.activeWarning()).toEqual(warning);
      expect(service.hasVisibleWarning()).toBe(true);
    });

    it('should not update if same warning level and usage', () => {
      const warning: QuotaWarning = {
        type: 'quota_warning',
        warningLevel: '80%',
        currentUsage: 8,
        quotaLimit: 10,
        percentageUsed: 80,
        remaining: 2,
        message: 'Warning message'
      };

      service.setWarning(warning);
      const firstWarning = service.activeWarning();
      
      service.setWarning(warning);
      
      expect(service.activeWarning()).toBe(firstWarning);
    });

    it('should update if different warning level', () => {
      const warning1: QuotaWarning = {
        type: 'quota_warning',
        warningLevel: '80%',
        currentUsage: 8,
        quotaLimit: 10,
        percentageUsed: 80,
        remaining: 2,
        message: 'Warning message'
      };

      const warning2: QuotaWarning = {
        ...warning1,
        warningLevel: '90%',
        percentageUsed: 90
      };

      service.setWarning(warning1);
      service.setWarning(warning2);

      expect(service.activeWarning()).toEqual(warning2);
    });
  });

  describe('dismissWarning', () => {
    it('should hide visible warning', () => {
      const warning: QuotaWarning = {
        type: 'quota_warning',
        warningLevel: '80%',
        currentUsage: 8,
        quotaLimit: 10,
        percentageUsed: 80,
        remaining: 2,
        message: 'Warning message'
      };

      service.setWarning(warning);
      expect(service.hasVisibleWarning()).toBe(true);

      service.dismissWarning();
      expect(service.hasVisibleWarning()).toBe(false);
    });
  });

  describe('clearWarning', () => {
    it('should clear all warning state', () => {
      const warning: QuotaWarning = {
        type: 'quota_warning',
        warningLevel: '80%',
        currentUsage: 8,
        quotaLimit: 10,
        percentageUsed: 80,
        remaining: 2,
        message: 'Warning message'
      };

      service.setWarning(warning);
      service.clearWarning();

      expect(service.activeWarning()).toBeNull();
      expect(service.hasVisibleWarning()).toBe(false);
    });
  });

  describe('setQuotaExceeded', () => {
    it('should set quota exceeded and clear active warning', () => {
      const warning: QuotaWarning = {
        type: 'quota_warning',
        warningLevel: '80%',
        currentUsage: 8,
        quotaLimit: 10,
        percentageUsed: 80,
        remaining: 2,
        message: 'Warning message'
      };

      const exceeded: QuotaExceeded = {
        type: 'quota_exceeded',
        currentUsage: 12,
        quotaLimit: 10,
        percentageUsed: 120,
        periodType: 'monthly',
        resetInfo: 'Resets on 1st',
        message: 'Quota exceeded'
      };

      service.setWarning(warning);
      service.setQuotaExceeded(exceeded);

      expect(service.quotaExceeded()).toEqual(exceeded);
      expect(service.activeWarning()).toBeNull();
      expect(service.isQuotaExceeded()).toBe(true);
    });
  });

  describe('clearQuotaExceeded', () => {
    it('should clear quota exceeded state', () => {
      const exceeded: QuotaExceeded = {
        type: 'quota_exceeded',
        currentUsage: 12,
        quotaLimit: 10,
        percentageUsed: 120,
        periodType: 'monthly',
        resetInfo: 'Resets on 1st',
        message: 'Quota exceeded'
      };

      service.setQuotaExceeded(exceeded);
      service.clearQuotaExceeded();

      expect(service.quotaExceeded()).toBeNull();
      expect(service.isQuotaExceeded()).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should clear all state', () => {
      const warning: QuotaWarning = {
        type: 'quota_warning',
        warningLevel: '80%',
        currentUsage: 8,
        quotaLimit: 10,
        percentageUsed: 80,
        remaining: 2,
        message: 'Warning message'
      };

      const exceeded: QuotaExceeded = {
        type: 'quota_exceeded',
        currentUsage: 12,
        quotaLimit: 10,
        percentageUsed: 120,
        periodType: 'monthly',
        resetInfo: 'Resets on 1st',
        message: 'Quota exceeded'
      };

      service.setWarning(warning);
      service.setQuotaExceeded(exceeded);
      service.clearAll();

      expect(service.activeWarning()).toBeNull();
      expect(service.quotaExceeded()).toBeNull();
    });
  });

  describe('resetDismissed', () => {
    it('should reset dismissed state', () => {
      const warning: QuotaWarning = {
        type: 'quota_warning',
        warningLevel: '80%',
        currentUsage: 8,
        quotaLimit: 10,
        percentageUsed: 80,
        remaining: 2,
        message: 'Warning message'
      };

      service.setWarning(warning);
      service.dismissWarning();
      expect(service.hasVisibleWarning()).toBe(false);

      service.resetDismissed();
      expect(service.hasVisibleWarning()).toBe(true);
    });
  });

  describe('computed signals', () => {
    describe('severity', () => {
      it('should return "exceeded" for quota exceeded', () => {
        const exceeded: QuotaExceeded = {
          type: 'quota_exceeded',
          currentUsage: 12,
          quotaLimit: 10,
          percentageUsed: 120,
          periodType: 'monthly',
          resetInfo: 'Resets on 1st',
          message: 'Quota exceeded'
        };

        service.setQuotaExceeded(exceeded);
        expect(service.severity()).toBe('exceeded');
      });

      it('should return "critical" for 90%+ usage', () => {
        const warning: QuotaWarning = {
          type: 'quota_warning',
          warningLevel: '90%',
          currentUsage: 9,
          quotaLimit: 10,
          percentageUsed: 90,
          remaining: 1,
          message: 'Warning message'
        };

        service.setWarning(warning);
        expect(service.severity()).toBe('critical');
      });

      it('should return "warning" for <90% usage', () => {
        const warning: QuotaWarning = {
          type: 'quota_warning',
          warningLevel: '80%',
          currentUsage: 8,
          quotaLimit: 10,
          percentageUsed: 80,
          remaining: 2,
          message: 'Warning message'
        };

        service.setWarning(warning);
        expect(service.severity()).toBe('warning');
      });

      it('should return null when no warning', () => {
        expect(service.severity()).toBeNull();
      });
    });

    describe('formattedUsage', () => {
      it('should format quota exceeded usage', () => {
        const exceeded: QuotaExceeded = {
          type: 'quota_exceeded',
          currentUsage: 12.50,
          quotaLimit: 10.00,
          percentageUsed: 125,
          periodType: 'monthly',
          resetInfo: 'Resets on 1st',
          message: 'Quota exceeded'
        };

        service.setQuotaExceeded(exceeded);
        expect(service.formattedUsage()).toBe('$12.50 / $10.00');
      });

      it('should format warning usage', () => {
        const warning: QuotaWarning = {
          type: 'quota_warning',
          warningLevel: '80%',
          currentUsage: 8.75,
          quotaLimit: 10.00,
          percentageUsed: 87.5,
          remaining: 1.25,
          message: 'Warning message'
        };

        service.setWarning(warning);
        expect(service.formattedUsage()).toBe('$8.75 / $10.00');
      });

      it('should return empty string when no warning', () => {
        expect(service.formattedUsage()).toBe('');
      });
    });

    describe('formattedRemaining', () => {
      it('should format remaining amount', () => {
        const warning: QuotaWarning = {
          type: 'quota_warning',
          warningLevel: '80%',
          currentUsage: 8,
          quotaLimit: 10,
          percentageUsed: 80,
          remaining: 2.50,
          message: 'Warning message'
        };

        service.setWarning(warning);
        expect(service.formattedRemaining()).toBe('$2.50');
      });

      it('should return empty string when no warning', () => {
        expect(service.formattedRemaining()).toBe('');
      });
    });

    describe('resetInfo', () => {
      it('should return reset info for quota exceeded', () => {
        const exceeded: QuotaExceeded = {
          type: 'quota_exceeded',
          currentUsage: 12,
          quotaLimit: 10,
          percentageUsed: 120,
          periodType: 'monthly',
          resetInfo: 'Resets on January 1st',
          message: 'Quota exceeded'
        };

        service.setQuotaExceeded(exceeded);
        expect(service.resetInfo()).toBe('Resets on January 1st');
      });

      it('should return empty string when no quota exceeded', () => {
        expect(service.resetInfo()).toBe('');
      });
    });
  });
});
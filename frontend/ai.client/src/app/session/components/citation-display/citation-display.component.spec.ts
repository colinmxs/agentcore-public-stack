import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CitationDisplayComponent } from './citation-display.component';
import { Citation } from '../../services/models/message.model';

describe('CitationDisplayComponent', () => {
  let component: CitationDisplayComponent;
  let fixture: ComponentFixture<CitationDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CitationDisplayComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(CitationDisplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept citations input', () => {
    const mockCitations: Citation[] = [
      {
        documentId: 'doc-1',
        fileName: 'test.pdf',
        text: 'Test citation text',
        s3Url: 'https://s3.example.com/test.pdf'
      }
    ];

    fixture.componentRef.setInput('citations', mockCitations);
    fixture.detectChanges();

    expect(component.citations()).toEqual(mockCitations);
  });

  it('should handle empty citations array', () => {
    fixture.componentRef.setInput('citations', []);
    fixture.detectChanges();

    expect(component.citations()).toEqual([]);
  });

  describe('Badge Display Logic', () => {
    it('should initialize isExpanded signal to false', () => {
      expect(component.isExpanded()).toBe(false);
    });

    it('should allow setting isExpanded signal', () => {
      component.isExpanded.set(true);
      expect(component.isExpanded()).toBe(true);

      component.isExpanded.set(false);
      expect(component.isExpanded()).toBe(false);
    });

    it('should return correct citation count for empty array', () => {
      fixture.componentRef.setInput('citations', []);
      fixture.detectChanges();

      expect(component.citationCount).toBe(0);
    });

    it('should return correct citation count for single citation', () => {
      const mockCitations: Citation[] = [
        {
          documentId: 'doc-1',
          fileName: 'test.pdf',
          text: 'Test citation text'
        }
      ];

      fixture.componentRef.setInput('citations', mockCitations);
      fixture.detectChanges();

      expect(component.citationCount).toBe(1);
    });

    it('should return correct citation count for multiple citations', () => {
      const mockCitations: Citation[] = [
        {
          documentId: 'doc-1',
          fileName: 'test1.pdf',
          text: 'Test citation 1'
        },
        {
          documentId: 'doc-2',
          fileName: 'test2.pdf',
          text: 'Test citation 2'
        },
        {
          documentId: 'doc-3',
          fileName: 'test3.pdf',
          text: 'Test citation 3'
        }
      ];

      fixture.componentRef.setInput('citations', mockCitations);
      fixture.detectChanges();

      expect(component.citationCount).toBe(3);
    });

    it('should use documentId as trackBy identifier', () => {
      const citation: Citation = {
        documentId: 'doc-123',
        fileName: 'test.pdf',
        text: 'Test citation text'
      };

      const result = component.trackByCitation(0, citation);

      expect(result).toBe('doc-123');
    });

    it('should return different identifiers for different citations', () => {
      const citation1: Citation = {
        documentId: 'doc-1',
        fileName: 'test1.pdf',
        text: 'Test citation 1'
      };

      const citation2: Citation = {
        documentId: 'doc-2',
        fileName: 'test2.pdf',
        text: 'Test citation 2'
      };

      const result1 = component.trackByCitation(0, citation1);
      const result2 = component.trackByCitation(1, citation2);

      expect(result1).toBe('doc-1');
      expect(result2).toBe('doc-2');
      expect(result1).not.toBe(result2);
    });
  });

  describe('Hover Interaction Logic', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should expand on mouse enter', () => {
      expect(component.isExpanded()).toBe(false);

      component.onMouseEnter();

      expect(component.isExpanded()).toBe(true);
    });

    it('should collapse after 300ms delay on mouse leave', () => {
      component.isExpanded.set(true);
      expect(component.isExpanded()).toBe(true);

      component.onMouseLeave();

      // Should still be expanded immediately after mouse leave
      expect(component.isExpanded()).toBe(true);

      // Advance time by 300ms
      vi.advanceTimersByTime(300);

      // Should now be collapsed
      expect(component.isExpanded()).toBe(false);
    });

    it('should clear collapse timeout on mouse enter', () => {
      component.isExpanded.set(true);

      // Start collapse sequence
      component.onMouseLeave();

      // Mouse enters again before timeout completes
      vi.advanceTimersByTime(150); // Only 150ms passed
      component.onMouseEnter();

      // Advance past the original 300ms
      vi.advanceTimersByTime(200); // Total 350ms

      // Should still be expanded because timeout was cleared
      expect(component.isExpanded()).toBe(true);
    });

    it('should handle multiple mouse enter/leave cycles', () => {
      // First cycle
      component.onMouseEnter();
      expect(component.isExpanded()).toBe(true);

      component.onMouseLeave();
      vi.advanceTimersByTime(300);
      expect(component.isExpanded()).toBe(false);

      // Second cycle
      component.onMouseEnter();
      expect(component.isExpanded()).toBe(true);

      component.onMouseLeave();
      vi.advanceTimersByTime(300);
      expect(component.isExpanded()).toBe(false);
    });

    it('should not collapse if mouse re-enters before timeout', () => {
      component.onMouseEnter();
      expect(component.isExpanded()).toBe(true);

      // Leave and re-enter quickly
      component.onMouseLeave();
      vi.advanceTimersByTime(100);
      component.onMouseEnter();

      // Advance past original timeout
      vi.advanceTimersByTime(250);

      // Should still be expanded
      expect(component.isExpanded()).toBe(true);
    });

    it('should handle mouse enter when already expanded', () => {
      component.isExpanded.set(true);

      component.onMouseEnter();

      expect(component.isExpanded()).toBe(true);
    });

    it('should handle mouse leave when already collapsed', () => {
      expect(component.isExpanded()).toBe(false);

      component.onMouseLeave();
      vi.advanceTimersByTime(300);

      expect(component.isExpanded()).toBe(false);
    });
  });

  describe('Keyboard Navigation', () => {
    it('should collapse on Escape key press when expanded', () => {
      component.isExpanded.set(true);
      expect(component.isExpanded()).toBe(true);

      component.onEscapeKey();

      expect(component.isExpanded()).toBe(false);
    });

    it('should not change state on Escape key when already collapsed', () => {
      expect(component.isExpanded()).toBe(false);

      component.onEscapeKey();

      expect(component.isExpanded()).toBe(false);
    });

    it('should clear collapse timeout on Escape key', () => {
      vi.useFakeTimers();

      component.isExpanded.set(true);
      component.onMouseLeave(); // Start collapse timeout

      // Press Escape before timeout completes
      vi.advanceTimersByTime(100);
      component.onEscapeKey();

      expect(component.isExpanded()).toBe(false);

      // Advance past original timeout
      vi.advanceTimersByTime(250);

      // Should remain collapsed (timeout was cleared)
      expect(component.isExpanded()).toBe(false);

      vi.restoreAllMocks();
    });

    it('should toggle expansion on Enter key press', () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      expect(component.isExpanded()).toBe(false);

      component.onBadgeKeydown(event);

      expect(component.isExpanded()).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();

      component.onBadgeKeydown(event);

      expect(component.isExpanded()).toBe(false);
    });

    it('should toggle expansion on Space key press', () => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      expect(component.isExpanded()).toBe(false);

      component.onBadgeKeydown(event);

      expect(component.isExpanded()).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not toggle on other key presses', () => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      expect(component.isExpanded()).toBe(false);

      component.onBadgeKeydown(event);

      expect(component.isExpanded()).toBe(false);
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should clear collapse timeout on badge keydown', () => {
      vi.useFakeTimers();

      component.isExpanded.set(true);
      component.onMouseLeave(); // Start collapse timeout

      // Press Enter before timeout completes
      vi.advanceTimersByTime(100);
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      component.onBadgeKeydown(event);

      // Should toggle to collapsed
      expect(component.isExpanded()).toBe(false);

      // Advance past original timeout
      vi.advanceTimersByTime(250);

      // Should remain collapsed (timeout was cleared)
      expect(component.isExpanded()).toBe(false);

      vi.restoreAllMocks();
    });
  });

  describe('Text Truncation', () => {
    it('should return text unchanged when length is less than maxLength', () => {
      const shortText = 'This is a short text';
      const result = component.truncateText(shortText, 200);

      expect(result).toBe(shortText);
    });

    it('should return text unchanged when length equals maxLength', () => {
      const text = 'a'.repeat(200);
      const result = component.truncateText(text, 200);

      expect(result).toBe(text);
    });

    it('should truncate text and append "..." when length exceeds maxLength', () => {
      const longText = 'a'.repeat(250);
      const result = component.truncateText(longText, 200);

      expect(result).toBe('a'.repeat(200) + '...');
      expect(result.length).toBe(203); // 200 + 3 for "..."
    });

    it('should use default maxLength of 200 when not specified', () => {
      const longText = 'a'.repeat(250);
      const result = component.truncateText(longText);

      expect(result).toBe('a'.repeat(200) + '...');
      expect(result.length).toBe(203);
    });

    it('should handle empty string', () => {
      const result = component.truncateText('', 200);

      expect(result).toBe('');
    });

    it('should handle text with exactly 201 characters', () => {
      const text = 'a'.repeat(201);
      const result = component.truncateText(text, 200);

      expect(result).toBe('a'.repeat(200) + '...');
      expect(result.length).toBe(203);
    });

    it('should handle custom maxLength values', () => {
      const text = 'This is a test text that is longer than 10 characters';
      const result = component.truncateText(text, 10);

      expect(result).toBe('This is a ...');
      expect(result.length).toBe(13); // 10 + 3 for "..."
    });

    it('should preserve text content up to maxLength', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const result = component.truncateText(text, 19);

      expect(result).toBe('The quick brown fox...');
      expect(result.startsWith('The quick brown fox')).toBe(true);
    });

    it('should handle text with special characters', () => {
      const text = 'Special chars: @#$%^&*()[]{}|\\/<>?~`+=- ' + 'a'.repeat(180);
      const result = component.truncateText(text, 200);

      expect(result.length).toBe(203);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle text with unicode characters', () => {
      const text = '🎉🎊🎈' + 'a'.repeat(200);
      const result = component.truncateText(text, 200);

      expect(result.length).toBe(203);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle text with newlines and spaces', () => {
      const text = 'Line 1\nLine 2\nLine 3\n' + 'a'.repeat(180);
      const result = component.truncateText(text, 200);

      expect(result.length).toBe(203);
      expect(result.endsWith('...')).toBe(true);
      expect(result.substring(0, 200)).toBe(text.substring(0, 200));
    });
  });
});

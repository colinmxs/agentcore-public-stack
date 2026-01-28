// stream-parser.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { StreamParserService } from './stream-parser.service';
import { ChatStateService } from './chat-state.service';
import { ErrorService } from '../../../services/error/error.service';
import { QuotaWarningService } from '../../../services/quota/quota-warning.service';

describe('StreamParserService - Citation Handling', () => {
  let service: StreamParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        StreamParserService,
        ChatStateService,
        ErrorService,
        QuotaWarningService,
      ],
    });
    service = TestBed.inject(StreamParserService);
    service.reset();
  });

  // =========================================================================
  // Property-Based Tests
  // =========================================================================

  describe('Property Tests', () => {
    // Feature: rag-citation-display, Property 2: Citation s3_key to s3Url mapping
    it('should correctly map s3_key to s3Url for any citation event with non-empty s3_key', () => {
      fc.assert(
        fc.property(
          fc.record({
            documentId: fc.string({ minLength: 1 }),
            fileName: fc.string({ minLength: 1 }),
            text: fc.string({ minLength: 1 }),
            s3_key: fc.string({ minLength: 1 }),
          }),
          (citationData: { documentId: string; fileName: string; text: string; s3_key: string }) => {
            // Reset service for each iteration
            service.reset();

            // Parse citation event
            service.parseEventSourceMessage('citation', citationData);

            // Get accumulated citations
            const citations = service.citations();

            // Verify citation was added
            expect(citations.length).toBe(1);

            // Verify s3_key was mapped to s3Url
            const citation = citations[0];
            expect(citation.documentId).toBe(citationData.documentId);
            expect(citation.fileName).toBe(citationData.fileName);
            expect(citation.text).toBe(citationData.text);
            expect(citation.s3Url).toBe(citationData.s3_key);
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: rag-citation-display, Property 2: Citation s3_key to s3Url mapping (empty case)
    it('should not include s3Url when s3_key is empty or missing', () => {
      fc.assert(
        fc.property(
          fc.record({
            documentId: fc.string({ minLength: 1 }),
            fileName: fc.string({ minLength: 1 }),
            text: fc.string({ minLength: 1 }),
            s3_key: fc.oneof(
              fc.constant(''),
              fc.constant('   '),
              fc.constant(undefined),
              fc.constant(null)
            ),
          }),
          (citationData: { documentId: string; fileName: string; text: string; s3_key: string | undefined | null }) => {
            // Reset service for each iteration
            service.reset();

            // Parse citation event
            service.parseEventSourceMessage('citation', citationData);

            // Get accumulated citations
            const citations = service.citations();

            // Verify citation was added
            expect(citations.length).toBe(1);

            // Verify s3Url is not present when s3_key is empty/missing
            const citation = citations[0];
            expect(citation.documentId).toBe(citationData.documentId);
            expect(citation.fileName).toBe(citationData.fileName);
            expect(citation.text).toBe(citationData.text);
            expect(citation.s3Url).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // =========================================================================
  // Unit Tests - Malformed Citation Handling
  // =========================================================================

  describe('Unit Tests - Malformed Citation Handling', () => {
    it('should skip citation with missing documentId', () => {
      const malformedCitation = {
        // documentId missing
        fileName: 'test.pdf',
        text: 'Some text',
        s3_key: 's3://bucket/key',
      };

      service.parseEventSourceMessage('citation', malformedCitation);

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should skip citation with missing fileName', () => {
      const malformedCitation = {
        documentId: 'doc-123',
        // fileName missing
        text: 'Some text',
        s3_key: 's3://bucket/key',
      };

      service.parseEventSourceMessage('citation', malformedCitation);

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should skip citation with missing text', () => {
      const malformedCitation = {
        documentId: 'doc-123',
        fileName: 'test.pdf',
        // text missing
        s3_key: 's3://bucket/key',
      };

      service.parseEventSourceMessage('citation', malformedCitation);

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should skip citation with non-string documentId', () => {
      const malformedCitation = {
        documentId: 123, // number instead of string
        fileName: 'test.pdf',
        text: 'Some text',
        s3_key: 's3://bucket/key',
      };

      service.parseEventSourceMessage('citation', malformedCitation);

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should skip citation with non-string fileName', () => {
      const malformedCitation = {
        documentId: 'doc-123',
        fileName: null, // null instead of string
        text: 'Some text',
        s3_key: 's3://bucket/key',
      };

      service.parseEventSourceMessage('citation', malformedCitation);

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should skip citation with non-string text', () => {
      const malformedCitation = {
        documentId: 'doc-123',
        fileName: 'test.pdf',
        text: { content: 'Some text' }, // object instead of string
        s3_key: 's3://bucket/key',
      };

      service.parseEventSourceMessage('citation', malformedCitation);

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should skip citation with null data', () => {
      service.parseEventSourceMessage('citation', null);

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should skip citation with undefined data', () => {
      service.parseEventSourceMessage('citation', undefined);

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should skip citation with non-object data', () => {
      service.parseEventSourceMessage('citation', 'invalid string data');

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should not throw error when processing malformed citations', () => {
      const malformedCitations = [
        null,
        undefined,
        'string',
        123,
        [],
        { documentId: 'doc-123' }, // missing required fields
        { fileName: 'test.pdf' }, // missing required fields
        { text: 'Some text' }, // missing required fields
      ];

      malformedCitations.forEach((malformed) => {
        expect(() => {
          service.parseEventSourceMessage('citation', malformed);
        }).not.toThrow();
      });

      const citations = service.citations();
      expect(citations.length).toBe(0);
    });

    it('should handle valid citation after malformed citation', () => {
      // First, send malformed citation
      const malformedCitation = {
        documentId: 'doc-123',
        // missing fileName and text
      };
      service.parseEventSourceMessage('citation', malformedCitation);

      // Then, send valid citation
      const validCitation = {
        documentId: 'doc-456',
        fileName: 'valid.pdf',
        text: 'Valid text',
        s3_key: 's3://bucket/valid',
      };
      service.parseEventSourceMessage('citation', validCitation);

      const citations = service.citations();
      expect(citations.length).toBe(1);
      expect(citations[0].documentId).toBe('doc-456');
      expect(citations[0].fileName).toBe('valid.pdf');
      expect(citations[0].text).toBe('Valid text');
      expect(citations[0].s3Url).toBe('s3://bucket/valid');
    });
  });

  // =========================================================================
  // Unit Tests - Valid Citation Handling
  // =========================================================================

  describe('Unit Tests - Valid Citation Handling', () => {
    it('should handle citation with s3_key', () => {
      const citation = {
        documentId: 'doc-123',
        fileName: 'test.pdf',
        text: 'Some relevant text from the document',
        s3_key: 's3://my-bucket/documents/test.pdf',
      };

      service.parseEventSourceMessage('citation', citation);

      const citations = service.citations();
      expect(citations.length).toBe(1);
      expect(citations[0].documentId).toBe('doc-123');
      expect(citations[0].fileName).toBe('test.pdf');
      expect(citations[0].text).toBe('Some relevant text from the document');
      expect(citations[0].s3Url).toBe('s3://my-bucket/documents/test.pdf');
    });

    it('should handle citation without s3_key', () => {
      const citation = {
        documentId: 'doc-123',
        fileName: 'test.pdf',
        text: 'Some relevant text from the document',
      };

      service.parseEventSourceMessage('citation', citation);

      const citations = service.citations();
      expect(citations.length).toBe(1);
      expect(citations[0].documentId).toBe('doc-123');
      expect(citations[0].fileName).toBe('test.pdf');
      expect(citations[0].text).toBe('Some relevant text from the document');
      expect(citations[0].s3Url).toBeUndefined();
    });

    it('should handle citation with empty s3_key', () => {
      const citation = {
        documentId: 'doc-123',
        fileName: 'test.pdf',
        text: 'Some relevant text from the document',
        s3_key: '',
      };

      service.parseEventSourceMessage('citation', citation);

      const citations = service.citations();
      expect(citations.length).toBe(1);
      expect(citations[0].documentId).toBe('doc-123');
      expect(citations[0].fileName).toBe('test.pdf');
      expect(citations[0].text).toBe('Some relevant text from the document');
      expect(citations[0].s3Url).toBeUndefined();
    });

    it('should handle citation with whitespace-only s3_key', () => {
      const citation = {
        documentId: 'doc-123',
        fileName: 'test.pdf',
        text: 'Some relevant text from the document',
        s3_key: '   ',
      };

      service.parseEventSourceMessage('citation', citation);

      const citations = service.citations();
      expect(citations.length).toBe(1);
      expect(citations[0].documentId).toBe('doc-123');
      expect(citations[0].fileName).toBe('test.pdf');
      expect(citations[0].text).toBe('Some relevant text from the document');
      expect(citations[0].s3Url).toBeUndefined();
    });

    it('should accumulate multiple citations', () => {
      const citation1 = {
        documentId: 'doc-123',
        fileName: 'test1.pdf',
        text: 'Text from first document',
        s3_key: 's3://bucket/doc1.pdf',
      };

      const citation2 = {
        documentId: 'doc-456',
        fileName: 'test2.pdf',
        text: 'Text from second document',
        s3_key: 's3://bucket/doc2.pdf',
      };

      service.parseEventSourceMessage('citation', citation1);
      service.parseEventSourceMessage('citation', citation2);

      const citations = service.citations();
      expect(citations.length).toBe(2);
      expect(citations[0].documentId).toBe('doc-123');
      expect(citations[0].s3Url).toBe('s3://bucket/doc1.pdf');
      expect(citations[1].documentId).toBe('doc-456');
      expect(citations[1].s3Url).toBe('s3://bucket/doc2.pdf');
    });

    it('should clear citations on reset', () => {
      const citation = {
        documentId: 'doc-123',
        fileName: 'test.pdf',
        text: 'Some text',
        s3_key: 's3://bucket/test.pdf',
      };

      service.parseEventSourceMessage('citation', citation);
      expect(service.citations().length).toBe(1);

      service.reset();
      expect(service.citations().length).toBe(0);
    });
  });
});

import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, getResourceName } from '../../config';

/**
 * Build the CSP `frame-ancestors` source list for the proxy origin.
 *
 * The proxy may ONLY be embedded by the SPA (`ai.client`) origin —
 * `https://{domainName}` plus any explicitly-allowed extras (e.g.
 * `http://localhost:4200` for a local SPA pointed at this env).
 *
 * Falls back to `'none'` (deny all framing) when there is no SPA
 * origin to permit — keeps the construct synthesizable for unit/synth
 * tests and domain-less local stacks without ever silently allowing `*`.
 *
 * Exported so the value is unit-testable directly and there's a single
 * source of truth.
 */
export function buildMcpSandboxFrameAncestors(
  domainName: string | undefined,
  extraFrameAncestors: string[],
): string {
  const sources: string[] = [];
  if (domainName) {
    sources.push(`https://${domainName}`);
  }
  for (const extra of extraFrameAncestors) {
    const trimmed = extra.trim();
    if (trimmed) {
      sources.push(trimmed);
    }
  }
  return sources.length > 0 ? sources.join(' ') : `'none'`;
}

/**
 * Assemble the Content-Security-Policy served with `proxy.html`.
 *
 * `frame-ancestors` is the security-critical directive (who may embed
 * the proxy — the SPA only). The rest is deny-by-default hardening for
 * the inert PR #1 shell.
 *
 * Exported for direct unit testing.
 */
export function buildMcpSandboxProxyCsp(frameAncestors: string): string {
  return [
    `default-src 'none'`,
    `script-src 'self'`,
    `frame-src 'self'`,
    `frame-ancestors ${frameAncestors}`,
    `base-uri 'none'`,
    `form-action 'none'`,
  ].join('; ');
}

/**
 * The subdomain label for the MCP Apps sandbox-proxy origin.
 *
 * Matches the working name in
 * `docs/kaizen/scoping/mcp-apps-host-renderer.md` and parallels the
 * existing sibling iframe origin `artifacts.{domain}`. Single source of
 * truth for the label — must stay in sync with the
 * `CDK_MCP_SANDBOX_*` workflow env vars.
 */
export const MCP_SANDBOX_SUBDOMAIN_LABEL = 'mcp-sandbox';

export interface McpSandboxDistributionConstructProps {
  config: AppConfig;
  /** Bucket holding `proxy.html` + `proxy.js` (default origin). */
  bucket: s3.IBucket;
}

/**
 * McpSandboxDistributionConstruct — CloudFront + Route53 ALIAS for the
 * MCP Apps sandbox-proxy origin.
 *
 * Terminates TLS, stamps the CSP (frame-ancestors locked to the SPA
 * origin), and proxies to the S3-hosted shell via OAC.
 *
 * Custom domain + cert + Route53 are attached only when BOTH a domain
 * and an ACM cert are configured (config.ts enforces both, plus the
 * hosted zone, whenever the stack is enabled). Keeping it conditional
 * lets the construct still synthesize on the CloudFront default domain
 * for unit/synth tests and domain-less local stacks.
 *
 * SSM publication: `/{prefix}/mcp-sandbox/origin` →
 * `https://mcp-sandbox.{domainName}` (or the CloudFront default domain
 * fallback when no custom domain is configured).
 */
export class McpSandboxDistributionConstruct extends Construct {
  public readonly distribution: cloudfront.Distribution;
  public readonly proxyOrigin: string;

  constructor(
    scope: Construct,
    id: string,
    props: McpSandboxDistributionConstructProps,
  ) {
    super(scope, id);

    const { config, bucket } = props;

    const domainName = config.domainName;
    const certificateArn = config.mcpSandbox.certificateArn;
    const useCustomDomain = Boolean(domainName && certificateArn);
    const proxySubdomain = domainName
      ? `${MCP_SANDBOX_SUBDOMAIN_LABEL}.${domainName}`
      : undefined;

    const frameAncestors = buildMcpSandboxFrameAncestors(
      domainName,
      config.mcpSandbox.extraFrameAncestors,
    );
    const proxyCsp = buildMcpSandboxProxyCsp(frameAncestors);

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'McpSandboxResponseHeaders',
      {
        responseHeadersPolicyName: getResourceName(
          config,
          'mcp-sandbox-headers',
        ),
        comment:
          'CSP (frame-ancestors = SPA origin only) + security headers for the MCP Apps sandbox proxy',
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy: proxyCsp,
            override: true,
          },
          contentTypeOptions: { override: true },
          // NOT setting frameOptions — frame-ancestors above is the
          // CSP-native equivalent and is what gets enforced cross-browser.
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            override: true,
          },
        },
      },
    );

    const cachePolicy = new cloudfront.CachePolicy(
      this,
      'McpSandboxCachePolicy',
      {
        cachePolicyName: getResourceName(config, 'mcp-sandbox-cache'),
        comment: 'Cache policy for the MCP Apps sandbox proxy shell',
        defaultTtl: cdk.Duration.minutes(5),
        minTtl: cdk.Duration.seconds(0),
        maxTtl: cdk.Duration.hours(1),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      },
    );

    const distributionProps: cloudfront.DistributionProps = {
      comment: getResourceName(config, 'mcp-sandbox-cdn'),
      defaultRootObject: 'proxy.html',
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy,
        responseHeadersPolicy,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enabled: true,
      ...(useCustomDomain
        ? {
            domainNames: [proxySubdomain!],
            certificate: acm.Certificate.fromCertificateArn(
              this,
              'McpSandboxCertificate',
              certificateArn!,
            ),
          }
        : {}),
    };

    this.distribution = new cloudfront.Distribution(
      this,
      'McpSandboxDistribution',
      distributionProps,
    );

    if (useCustomDomain) {
      const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: config.infrastructureHostedZoneDomain!,
      });

      new route53.ARecord(this, 'McpSandboxAliasRecord', {
        zone: hostedZone,
        recordName: proxySubdomain!,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(this.distribution),
        ),
        comment:
          'MCP Apps sandbox-proxy origin — proxies to CloudFront → S3 shell',
      });
    }

    this.proxyOrigin = useCustomDomain
      ? `https://${proxySubdomain}`
      : `https://${this.distribution.distributionDomainName}`;

    new ssm.StringParameter(this, 'McpSandboxOriginParameter', {
      parameterName: `/${config.projectPrefix}/mcp-sandbox/origin`,
      stringValue: this.proxyOrigin,
      description:
        'Origin serving the MCP Apps sandbox proxy shell (https://mcp-sandbox.{domain})',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}

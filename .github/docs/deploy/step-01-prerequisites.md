# Step 1 of 5 — Prerequisites

➡️ **Step 1: Prerequisites** ← You are here<br>
⬜ Step 2: AWS Setup<br>
⬜ Step 3: Configure GitHub<br>
⬜ Step 4: Deploy Workflows<br>
⬜ Step 5: Verify Deployment

⏱️ ~5 minutes · 🟢 Easy

---

## What You'll Need

Confirm you have access to the following before proceeding. Everything on this list is required.

### Accounts & Access

- [ ] **AWS account** with administrator access (or permissions to create IAM roles, VPCs, ECS clusters, CloudFront distributions, Route 53 zones, ACM certificates, Lambda functions, and DynamoDB tables)
- [ ] **GitHub account** with a fork of this repository
- [ ] **Domain name** you control (e.g. `example.com`) with the ability to update nameservers

### Identity Provider

You need an OIDC-compatible identity provider for user login. Any of these work:

- [ ] **Microsoft Entra ID** (Azure AD)
- [ ] **AWS Cognito**
- [ ] **Okta**
- [ ] **Any OIDC-compliant provider**

You'll need these values from your IdP:
- Client ID
- Client Secret
- Issuer URL (e.g. `https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0`)

> [!NOTE]
> Setting up the identity provider itself is outside the scope of this guide. You should have an existing IdP application configured before starting.

<details>
<summary>What if I don't have a domain yet?</summary>

You can register a domain through [AWS Route 53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-register.html) or any domain registrar. If you use Route 53, the hosted zone is created automatically. If you use an external registrar, you'll need to point the domain's nameservers to the Route 53 hosted zone you create in Step 2.

</details>

<details>
<summary>What if I don't have an identity provider yet?</summary>

The quickest option is **AWS Cognito** — you can set up a user pool directly in the AWS Console. For Microsoft environments, **Entra ID** is a natural fit. The key requirement is that your IdP supports OIDC and can provide a client ID, client secret, and issuer URL.

</details>

<details>
<summary>What AWS permissions do I need exactly?</summary>

The deployment creates resources across many AWS services. The simplest approach is to use an account with `AdministratorAccess`. If you need a least-privilege policy, the deployment touches: IAM, VPC, ECS, ECR, ALB, Route 53, ACM, CloudFront, S3, DynamoDB, Lambda, API Gateway, CloudWatch, and Secrets Manager.

</details>

---

## Ready?

Once you have everything checked off above, move on to setting up your AWS resources.

---

### ➡️ [Next: Step 2 — AWS Setup](./step-02-aws-setup.md)

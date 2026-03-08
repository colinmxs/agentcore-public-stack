# Troubleshooting

> Having issues? Find your symptom below. Each section is organized by deployment phase.

---

## AWS Setup Issues

<details>
<summary>ACM certificate stuck in "Pending validation"</summary>

**Symptom:** Certificate status stays "Pending validation" for more than 10 minutes.

**Cause:** DNS validation records are missing or not propagated.

**Fix:**
1. In the ACM Console, expand the certificate and look for the CNAME validation records
2. If using Route 53, click **"Create records in Route 53"** — ACM does this automatically
3. If using an external DNS provider, manually add the CNAME records shown by ACM
4. Verify with: `dig CNAME _acme-challenge.example.com`
5. Wait up to 5 minutes after records are in place

</details>

<details>
<summary>Route 53 hosted zone not resolving</summary>

**Symptom:** `dig NS example.com` doesn't return Route 53 nameservers.

**Cause:** Domain nameservers haven't been updated to point to Route 53.

**Fix:**
1. Go to Route 53 → Hosted zones → your zone
2. Copy the 4 NS records
3. Go to your domain registrar and update the nameservers to match
4. Wait up to 48 hours for propagation (usually much faster)

</details>

---

## GitHub Actions Failures

<details>
<summary>Workflow fails with "credentials" or "authentication" error</summary>

**Symptom:** Workflow fails early with an AWS authentication error.

**Cause:** AWS credentials are missing or incorrect.

**Fix:**
- **OIDC:** Verify `AWS_ROLE_ARN` secret is set and the IAM role trusts your GitHub repo's OIDC provider
- **Access keys:** Verify both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` secrets are set correctly
- Check that the IAM role/user has sufficient permissions

</details>

<details>
<summary>Workflow fails with "variable not found" or empty values</summary>

**Symptom:** Workflow fails referencing an undefined or empty variable.

**Cause:** A required GitHub variable is missing.

**Fix:**
1. Go to **Settings → Secrets and variables → Actions → Variables**
2. Compare your variables against the [required list in Step 3](./step-03-github-config.md#3b-deployment-variables)
3. Add any missing variables
4. Re-run the failed workflow

</details>

<details>
<summary>Infrastructure deploy fails with "resource already exists"</summary>

**Symptom:** CDK deployment fails because a resource name conflicts.

**Cause:** The `CDK_PROJECT_PREFIX` you chose conflicts with existing AWS resources.

**Fix:**
- Choose a more unique `CDK_PROJECT_PREFIX` value
- Or delete the conflicting resources in AWS if they're from a previous failed deployment

</details>

<details>
<summary>CDK deploy fails with "no hosted zone found"</summary>

**Symptom:** Stack deployment fails with an error about Route 53 hosted zone not found.

**Cause:** `CDK_HOSTED_ZONE_DOMAIN` doesn't match an existing hosted zone, or the hosted zone is in a different AWS account.

**Fix:**
1. Verify the hosted zone exists in Route 53 in the same account
2. Ensure `CDK_HOSTED_ZONE_DOMAIN` matches the zone name exactly (e.g. `example.com`, not `www.example.com`)

</details>

---

## Deployment Issues

<details>
<summary>ECS service tasks keep restarting</summary>

**Symptom:** ECS service shows tasks in a start/stop loop, or "desired count" never matches "running count."

**Cause:** Container is crashing on startup. Common reasons: missing environment variables, incorrect IAM permissions, or a code error.

**Fix:**
1. Go to ECS → your cluster → the failing service → **Logs** tab
2. Check CloudWatch logs for error messages
3. Verify all required environment variables are passed through CDK
4. Check that the ECS task role has required IAM permissions

</details>

<details>
<summary>CloudFront returns 403 Forbidden</summary>

**Symptom:** Visiting your frontend URL returns a 403 error.

**Cause:** CloudFront can't access the S3 bucket, or the distribution hasn't propagated yet.

**Fix:**
1. Wait 5-10 minutes after the Frontend workflow completes — CloudFront distributions take time to deploy
2. If it persists, check that the S3 bucket policy grants CloudFront OAI/OAC access
3. Verify the CloudFront distribution's origin points to the correct S3 bucket

</details>

<details>
<summary>API returns 502 Bad Gateway</summary>

**Symptom:** API calls to `api.example.com` return 502.

**Cause:** The ALB can't reach the ECS service, or the service isn't healthy.

**Fix:**
1. Check ECS service health — ensure tasks are running
2. Check the ALB target group — targets should be "healthy"
3. Review CloudWatch logs for the App API service
4. Verify the service's security group allows traffic from the ALB

</details>

---

## Post-Deploy Issues

<details>
<summary>Login page doesn't show the identity provider button</summary>

**Symptom:** The login page loads but there's no button to sign in.

**Cause:** Bootstrap data seeding didn't run or the auth provider config is incorrect.

**Fix:**
1. Verify the **Seed Bootstrap Data** workflow (Step 7) completed successfully
2. Check that `SEED_AUTH_PROVIDER_ID`, `SEED_AUTH_DISPLAY_NAME`, `SEED_AUTH_ISSUER_URL`, `SEED_AUTH_CLIENT_ID`, and `SEED_AUTH_CLIENT_SECRET` are all set
3. Re-run the **Seed Bootstrap Data** workflow

</details>

<details>
<summary>Login succeeds but redirects to an error</summary>

**Symptom:** IdP login works, but the redirect back to the app fails.

**Cause:** Redirect URI mismatch in your IdP's app registration.

**Fix:**
1. In your IdP (Entra ID, Cognito, Okta, etc.), add your frontend domain as an allowed redirect URI
2. The redirect URI format is typically: `https://app.example.com` or `https://app.example.com/auth/callback`
3. Check your browser's developer console (Network tab) for the exact redirect URL being used

</details>

<details>
<summary>Agent doesn't respond to messages</summary>

**Symptom:** You can log in and see the chat UI, but messages get no response or time out.

**Cause:** The Inference API isn't running, or Bedrock model access isn't enabled.

**Fix:**
1. Check ECS — verify the Inference API service has running tasks
2. In the AWS Console, go to **Bedrock → Model access** and ensure you've enabled the models you want to use
3. Check CloudWatch logs for the Inference API service for specific errors
4. Verify the Inference API's task role has `bedrock:InvokeModel` permissions

</details>

<details>
<summary>Admin features aren't visible</summary>

**Symptom:** You're logged in but don't see admin menu items.

**Cause:** Your JWT token doesn't include the expected admin role claim.

**Fix:**
1. Verify `SEED_ADMIN_JWT_ROLE` is set to a role that your IdP includes in tokens
2. In your IdP, check that role/group claims are configured in the token settings
3. Re-run the **Seed Bootstrap Data** workflow if you changed the value
4. Log out and log back in to get a fresh token

</details>

---

## Still Stuck?

- Double-check all values against the [Full Configuration Reference](../../ACTIONS-REFERENCE.md)
- Review the GitHub Actions workflow logs for specific error messages
- Check AWS CloudWatch logs for runtime errors
- [Back to Overview](../../README-ACTIONS.md)

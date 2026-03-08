# Step 5 of 5 — Verify Deployment

✅ Step 1: Prerequisites<br>
✅ Step 2: AWS Setup<br>
✅ Step 3: Configure GitHub<br>
✅ Step 4: Deploy Workflows<br>
➡️ **Step 5: Verify Deployment** ← You are here

⏱️ ~5 minutes · 🟢 Easy

---

All workflows have completed. Let's verify everything is working.

## Verification Checklist

### 1. Frontend Loads

Open your frontend URL in a browser (e.g. `https://app.example.com`).

- [ ] The page loads without errors
- [ ] You see a login page with your identity provider's name (e.g. "Sign in with Microsoft Entra ID")

> [!NOTE]
> CloudFront distributions can take a few minutes to fully propagate after the first deploy. If you get a 403 or "distribution not found" error, wait 5 minutes and try again.

### 2. Authentication Works

Click the login button and authenticate with your identity provider.

- [ ] You're redirected to your IdP's login page
- [ ] After logging in, you're redirected back to the application
- [ ] You land on the chat interface

<details>
<summary>Login redirects to an error page</summary>

Common causes:
- **Redirect URI mismatch:** Your IdP's app registration must include `https://app.example.com` (your frontend domain) as an allowed redirect URI
- **Client ID/secret incorrect:** Double-check `SEED_AUTH_CLIENT_ID` and `SEED_AUTH_CLIENT_SECRET` in GitHub settings
- **Issuer URL wrong:** Verify `SEED_AUTH_ISSUER_URL` matches your IdP's OIDC discovery endpoint

You can re-run the **Seed Bootstrap Data** workflow after fixing any of these values.

</details>

### 3. Agent Responds

Send a test message in the chat (e.g. "Hello, what can you help me with?").

- [ ] You see a streaming response from the agent
- [ ] The response completes without errors

<details>
<summary>Messages aren't getting responses</summary>

Check these in order:
1. **ECS services running:** In the AWS Console, go to ECS → your cluster → verify both the App API and Inference API services show "Running" tasks
2. **Bedrock model access:** Ensure your AWS account has access to the Bedrock models configured in the default model seed data
3. **Logs:** Check CloudWatch logs for the Inference API service for error details

</details>

### 4. Admin Access (Optional)

If you configured `SEED_ADMIN_JWT_ROLE` in Step 3, verify admin features:

- [ ] Navigate to the admin section
- [ ] You can see and manage models, tools, and roles

> [!TIP]
> If admin features aren't visible, verify that your IdP token includes the role claim matching the value you set for `SEED_ADMIN_JWT_ROLE`. You may need to configure role/group claims in your IdP's app registration.

---

## You're Done!

Your AgentCore Public Stack is deployed and running. Here's what you have:

| Service | URL |
|---------|-----|
| Frontend | `https://app.example.com` |
| API | `https://api.example.com` |

### What's Next

- **Customize models:** Use the admin panel to add or modify available AI models
- **Add tools:** Configure additional MCP tools through the admin interface
- **Manage users:** Set up roles and permissions for your team
- **Monitor costs:** Review usage and cost tracking in the admin dashboard
- **Scale up:** Adjust ECS task counts and sizes via the [configuration variables](../../ACTIONS-REFERENCE.md)

---

## Need Help?

- [Troubleshooting Guide](./troubleshooting.md) — common issues and solutions
- [Full Configuration Reference](../../ACTIONS-REFERENCE.md) — all available settings
- [Back to Overview](../../README-ACTIONS.md) — deployment hub page

---

### 🔧 [Troubleshooting](./troubleshooting.md)

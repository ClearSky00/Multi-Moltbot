# Supabase Setup for HiveMind OS Auth

This app uses Supabase for authentication with a custom Electron deep-link protocol (`hivemind-os://`).
Before authentication will work correctly, you must configure your Supabase project as follows:

## 1. Allowed Redirect URLs
By default, Supabase only allows redirects to `localhost` or specific web domains. You must add the custom protocol.

1. Go to your **Supabase Dashboard**
2. Navigate to **Authentication** > **URL Configuration**
3. Under **Redirect URLs**, click "Add URL"
4. Add the following exact URI:
   ```
   hivemind-os://auth/callback
   ```
5. Click **Save**

## 2. Enable PKCE Flow
The Electron app uses PKCE (Proof Key for Code Exchange) to securely exchange codes for tokens without a client secret.

1. In the Supabase Dashboard, go to **Authentication** > **Settings**
2. Scroll to the **Auth Providers** or **Advanced Settings** section
3. Ensure **Enable PKCE flow** is turned **ON**

## 3. OAuth Providers (Optional but recommended)
If you want the Google and GitHub buttons to work:

1. Go to **Authentication** > **Providers**
2. Enable **Google**
   - Provide your Google Client ID and Secret
   - Note: the redirect URI you provide to Google must be `<YOUR_SUPABASE_PROJECT_URL>/auth/v1/callback`
3. Enable **GitHub**
   - Provide your GitHub Client ID and Secret

## Debugging

If the window hangs on the `Authenticating...` spinner or you get redirected to the sign-in page, check the following:
- Did you use `hivemind-os://` instead of `http://localhost`?
- Is the protocol registered in `electron-builder.config.js` properly?
- Was the deep link URL format modified by the OS before reaching the handler?
- Does the `.env` file contain your `SUPABASE_URL` and `SUPABASE_ANON_KEY`?

# GWS HR Bot — Client Deployment Guide

**Time to deploy: ~30 minutes**
Follow these steps exactly for each new client.

---

## Prerequisites

- Super Admin access on the client's GWS domain
- A Google Cloud project linked to that domain (or create one)
- Enterprise License Manager API enabled (see Step 3)

---

## Step 1 — Create the Apps Script project

1. Go to [script.google.com](https://script.google.com) signed in as the client's Super Admin
2. Click **New project** → rename it `GWS HR Bot`
3. In the editor, click **Project Settings** (⚙️) → check **Show appsscript.json in editor**

---

## Step 2 — Paste all files

Copy every `.gs` file and `appsscript.json` from this bundle into the editor.

For each file:
1. Click **+** next to Files → **Script**
2. Name it exactly (e.g. `Setup`, `Code`, `Onboarding`, etc.)
3. Paste the file contents → **Save**

File list:
```
appsscript.json   (replace the existing one)
Code.gs
Setup.gs
Onboarding.gs
Offboarding.gs
Search.gs
Admin.gs
Cards.gs
Diagnostics.gs
Utils.gs
```

---

## Step 3 — Enable required APIs in Google Cloud Console

1. In Apps Script → **Project Settings** → click the **Google Cloud Project** link
2. Go to **APIs & Services → Library** and enable:
   - **Admin SDK API** ← covers Directory + Data Transfer
   - **Enterprise License Manager API** ← required for license assignment

---

## Step 4 — Configure for the client

1. Open `Setup.gs` in the editor
2. Edit the `CLIENT` object at the top of `setup()`:

```javascript
var CLIENT = {
  DOMAIN        : 'clientdomain.com',
  SUPER_ADMIN   : 'admin@clientdomain.com',
  ORG_NAME      : 'Client Company Name',
  OPERATOR_GROUP: 'gws-bot-operators@clientdomain.com',  // or '' for all domain users
  TIMEZONE      : 'America/Chicago',
  LOGIN_URL     : 'https://accounts.google.com/AccountChooser?Email=',
  AUTO_ASSIGN_LICENSE: 'true',
  LICENSES: JSON.stringify([
    { label: 'Business Starter',  skuId: '1010020028' },
    { label: 'No License (skip)', skuId: 'NONE'       },
  ]),
};
```

3. Select `setup` from the function dropdown → click **▶ Run**
4. Authorize when prompted (grant all requested scopes)
5. Check Execution Log — you should see `✅ Config saved`

> **Finding the right SKU IDs:** Run `listAvailableLicenses()` first to see which SKUs the client actually has. Update `LICENSES` in `setup()` and re-run.

---

## Step 5 — Run pre-deployment checks

Select `runAllTests` → click **▶ Run**. Verify all APIs show ✅ before proceeding.

Fix any failures:
- **Directory API ❌** → confirm Admin SDK is enabled in Cloud Console
- **Licensing ❌ (scope)** → revoke access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and re-run
- **Licensing ❌ (412)** → no seats available — update SKU ID in setup()
- **Data Transfer ❌** → enable Admin SDK API; also check Admin Console → Apps → Drive → Transfer ownership → On

---

## Step 6 — Deploy as Web App

1. Click **Deploy → New deployment**
2. Select type: **Web app**
3. Set:
   - **Execute as:** `Me (admin@clientdomain.com)` ← **Critical**
   - **Who has access:** `Anyone`
4. Click **Deploy**
5. **Copy the Web App URL** — you'll need this in Step 7

> Every subsequent code update: **Deploy → Manage deployments → ✏️ Edit → New version → Deploy**

---

## Step 7 — Register in Google Chat API

1. Cloud Console → **APIs & Services → Google Chat API → Configuration**
2. Fill in:
   - **App name:** `HR Bot`
   - **Description:** `Employee onboarding & offboarding for [Client Name]`
   - **Connection settings:** App URL → paste the Web App URL from Step 6
   - **Visibility:** client's domain (e.g. `clientdomain.com`)
3. Click **Save**

---

## Step 8 — Create the Operator Group (optional)

If you set `OPERATOR_GROUP` in setup(), create the group before testing:

1. Admin Console → **Directory → Groups → Create group**
2. Name: `GWS Bot Operators`, Email: `gws-bot-operators@clientdomain.com`
3. Add the HR/IT staff who should have access
4. Add yourself (`user@yourdomain.com`) for initial testing

---

## Step 9 — Test in Google Chat

1. Open Google Chat → click **+** next to Direct Messages → search `HR Bot`
2. Send: `help` → should return the command reference card
3. Send: `onboard Test User` → fill in the form, verify account appears in Admin Console
4. Send: `status Test User` → verify it finds the account by name
5. Send: `offboard Test User` → confirm all 6 steps succeed

---

## Updating config after deployment

To change a single value without full re-setup:

```javascript
// In Diagnostics.gs or Setup.gs, run from editor:
updateConfigValue('LOGIN_URL', 'https://sso.clientdomain.com');
updateConfigValue('OPERATOR_GROUP', '');   // open to all domain users
```

Then redeploy as a new version.

To switch this project to a different client entirely:
1. Run `resetConfig()` to clear all stored values
2. Edit `setup()` with new client values and re-run
3. Redeploy as new version

---

## Troubleshooting quick reference

| Symptom | Fix |
|---|---|
| "Not authorized" for everyone | `event.user.email` not populated — check getSenderEmail() logs |
| Account created but no license | Run `testLicensing()` — likely scope or seat issue |
| "Application Id not found" | Run `testDriveTransfer()` — Data Transfer API not enabled |
| Cards not rendering | Confirm `appsscript.json` scopes saved, redeploy as new version |
| Wrong domain in emails | Re-run `setup()` with correct DOMAIN value |
| OU dropdown shows only Root | Check `admin.directory.orgunit.readonly` scope is in manifest |

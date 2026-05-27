# GWS HR Bot
**Google Chat bot for employee onboarding & offboarding**
Built by: Steve Moynihan, Solutions Engineer [Brio Technologies](https://briotech.com) 

---

## What it does

Manage the full employee lifecycle in Google Workspace directly from Google Chat — no Admin Console access needed for HR staff.

| Command | Action |
|---|---|
| `onboard Jane Smith` | Interactive form → creates account, assigns license, sets OU, emails credentials to new hire (CC manager) |
| `offboard John Smith` | Confirmation card → suspends account, resets password, signs out all sessions, revokes OAuth tokens + ASPs, transfers Drive files |
| `status Jane Smith` | Shows account status, last login, OU, 2SV enrollment |
| `status jsmith@domain.com` | Direct email lookup (bypasses name search) |
| `help` | Command reference card |

---

## Architecture

```
gws-hr-bot/
├── Code.gs          Entry point (doPost) + message/card routers
├── Setup.gs         PropertiesService config + client setup wizard
├── Onboarding.gs    New hire form, account creation, emails, summary card
├── Offboarding.gs   Departure form, 6-step cleanup flow, summary card
├── Search.gs        Name/email lookup, status card, disambiguation card, help card
├── Admin.gs         All GWS API calls (Directory, Data Transfer, Licensing, Tokens)
├── Cards.gs         Widget builders (dropdowns, textInput, kvWidget, actionButton)
├── Diagnostics.gs   runAllTests(), testLicensing(), listAvailableLicenses(), testDriveTransfer()
├── Utils.gs         Auth, name helpers, password generator, form value helpers
└── appsscript.json  OAuth scopes manifest
```

All files share a single global scope in Apps Script — no imports needed.

---

## Multi-client deployment

This codebase is **domain-agnostic**. All client-specific values live in Script Properties (encrypted at rest), not in code. To deploy for a new client:

1. Create a new Apps Script project (copy all `.gs` files + `appsscript.json`)
2. Edit `setup()` in `Setup.gs` with the client's values
3. Run `setup()` from the editor → saves config to that project's Script Properties
4. Deploy as Web App → register URL in Google Chat API
5. Done — zero code changes, zero risk of one client's config leaking to another

Each client gets their own isolated Apps Script project with their own OAuth token, their own deployment URL, and their own Script Properties.

---

## APIs used

| API | Purpose |
|---|---|
| Admin SDK Directory API | Create/suspend/search users, sign out sessions, revoke tokens, fetch OUs |
| Admin SDK Data Transfer API | Transfer Google Drive file ownership |
| Enterprise License Manager API | Assign Workspace licenses |
| Gmail API | Send welcome and manager notification emails |

---

## OAuth Scopes

| Scope | Used for |
|---|---|
| `admin.directory.user` | User CRUD + search |
| `admin.directory.user.security` | Sign out sessions, revoke tokens & ASPs |
| `admin.directory.orgunit.readonly` | Fetch OU list for onboarding dropdown |
| `admin.datatransfer` | Drive file transfer |
| `apps.licensing` | License assignment |
| `gmail.send` | Welcome + manager emails |
| `script.external_request` | All UrlFetchApp calls |

---

## Diagnostics

Run these from the Apps Script editor to verify each API before going live:

```
runAllTests()           — full connectivity check (run this first)
testLicensing()         — confirm apps.licensing scope + seat availability
listAvailableLicenses() — discover SKU IDs active on the client domain
testDriveTransfer()     — confirm Data Transfer API is enabled
testOrgUnits()          — list all OUs on the domain
showCurrentConfig()     — print stored Script Properties
```

---

## License
MIT — free to use, modify, and distribute.
Built and maintained by Steve Moynihan and Brio Technologies

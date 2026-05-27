// ================================================================
// Diagnostics.gs — Test & Discovery Functions
// Run these directly from the Apps Script editor, not via the bot.
// ================================================================

/**
 * Tests the full licensing flow for the configured domain.
 * Run this after adding apps.licensing to appsscript.json to confirm
 * the scope is active before deploying.
 *
 *   1. Select "testLicensing" in the function dropdown
 *   2. Click ▶ Run
 *   3. Accept any new permission prompts
 *   4. Check Execution Log for PASS / SEAT SHORTAGE / FAIL
 *   5. If PASS → redeploy as a New Version
 */
function testLicensing() {
  Logger.log('=== testLicensing START (' + CONFIG.DOMAIN + ') ===');
  Logger.log('OAuth token  : ' + ScriptApp.getOAuthToken().substring(0, 30) + '...');

  listAvailableLicenses();   // show what SKUs are on this domain first

  var testEmail = CONFIG.SUPER_ADMIN;
  var sku       = CONFIG.LICENSES[0].skuId;
  Logger.log('Testing SKU  : ' + sku + ' on ' + testEmail);

  var url = 'https://licensing.googleapis.com/apps/licensing/v1/product/'
          + CONFIG.LICENSE_PRODUCT_ID + '/sku/' + sku + '/user';
  var res  = UrlFetchApp.fetch(url, {
    method            : 'POST',
    headers           : authHeaders(),
    payload           : JSON.stringify({ userId: testEmail }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  Logger.log('POST license : HTTP ' + code + ' — ' + res.getContentText());

  if (code === 200 || code === 409) {
    Logger.log('=== RESULT: PASS — Licensing API is working ===');
    Logger.log('Next: Deploy → Manage deployments → edit → New Version');
  } else if (code === 412) {
    Logger.log('=== RESULT: SEAT SHORTAGE — API reachable but no available seats for SKU ' + sku + ' ===');
    Logger.log('Fix: buy more seats in Admin Console → Billing, or use a different SKU from listAvailableLicenses()');
  } else {
    Logger.log('=== RESULT: FAIL (HTTP ' + code + ') — see response above ===');
    Logger.log('Common fixes:');
    Logger.log('  1. Revoke access at myaccount.google.com/permissions and re-run');
    Logger.log('  2. Confirm apps.licensing scope is in appsscript.json');
    Logger.log('  3. Confirm Enterprise License Manager API is enabled in Cloud Console');
  }
}

/**
 * Lists all known Workspace SKUs and checks if the super admin has them.
 * Use this to discover which SKU IDs to put in CONFIG.LICENSES (via setup()).
 *
 *   ACTIVE  → SKU is assigned to the super admin (safe to use)
 *   none    → Not assigned to super admin (may still have seats)
 *   EMPTY   → SKU exists but NO AVAILABLE SEATS
 *   n/a     → Not available on this domain/plan
 */
function listAvailableLicenses() {
  Logger.log('--- License inventory for ' + CONFIG.DOMAIN + ' ---');
  var skus = [
    { sku: '1010020028', label: 'Business Starter'    },
    { sku: '1010020025', label: 'Business Standard'   },
    { sku: '1010020026', label: 'Business Plus'       },
    { sku: '1010020020', label: 'Workspace Essentials' },
    { sku: '1010060003', label: 'Enterprise Starter'  },
    { sku: '1010060001', label: 'Enterprise Standard' },
    { sku: '1010060002', label: 'Enterprise Plus'     },
    { sku: '1010020049', label: 'Frontline Starter'   },
  ];

  skus.forEach(function (item) {
    var url = 'https://licensing.googleapis.com/apps/licensing/v1/product/Google-Apps/sku/'
            + item.sku + '/user/' + CONFIG.SUPER_ADMIN;
    var res  = UrlFetchApp.fetch(url, { method: 'GET', headers: authHeaders(), muteHttpExceptions: true });
    var code = res.getResponseCode();
    var tag  = code === 200 ? 'ACTIVE' : code === 404 ? 'none  ' : code === 412 ? 'EMPTY ' : 'n/a   ';
    Logger.log('  ' + tag + '  [' + item.sku + ']  ' + item.label);
  });
  Logger.log('--- Copy ACTIVE SKU IDs into LICENSES in setup() ---');
}

/**
 * Verifies the Drive Data Transfer API is enabled and lists
 * available transfer applications for this domain.
 */
function testDriveTransfer() {
  Logger.log('=== testDriveTransfer (' + CONFIG.DOMAIN + ') ===');
  var res  = UrlFetchApp.fetch(
    'https://admin.googleapis.com/admin/datatransfer/v1/applications',
    { method: 'GET', headers: authHeaders(), muteHttpExceptions: true }
  );
  var code = res.getResponseCode();
  Logger.log('GET applications: HTTP ' + code);
  if (code === 200) {
    var apps = JSON.parse(res.getContentText()).applications || [];
    apps.forEach(function (a) { Logger.log('  [' + a.id + '] ' + a.name); });
    Logger.log('=== RESULT: PASS ===');
  } else {
    Logger.log(res.getContentText());
    Logger.log('=== RESULT: FAIL — enable Admin SDK API in Cloud Console ===');
  }
}

/**
 * Verifies OU fetching works and lists all OUs on the domain.
 */
function testOrgUnits() {
  Logger.log('=== testOrgUnits (' + CONFIG.DOMAIN + ') ===');
  var units = fetchOrgUnits();
  units.forEach(function (u) { Logger.log('  ' + u.path + '  (' + u.label + ')'); });
  Logger.log('Total: ' + units.length + ' OUs (including root)');
}

/**
 * Full connectivity check — run this after setup() and before deploying.
 * Calls all four APIs and logs PASS/FAIL for each.
 */
function runAllTests() {
  Logger.log('');
  Logger.log('╔══════════════════════════════════════════╗');
  Logger.log('║  GWS HR Bot — Pre-Deployment Checks       ║');
  Logger.log('║  Domain: ' + CONFIG.DOMAIN.padEnd(31) + '║');
  Logger.log('╚══════════════════════════════════════════╝');
  Logger.log('');

  // 1. Config
  showCurrentConfig();

  // 2. Directory API — user lookup
  Logger.log('--- Directory API ---');
  var user = getUser(CONFIG.SUPER_ADMIN);
  Logger.log(user ? '  ✅ User lookup: ' + CONFIG.SUPER_ADMIN : '  ❌ User lookup failed');

  // 3. Org Units
  Logger.log('--- Org Unit API ---');
  try { testOrgUnits(); Logger.log('  ✅ OU fetch OK'); } catch(e) { Logger.log('  ❌ ' + e.message); }

  // 4. Licensing
  Logger.log('--- Licensing API ---');
  listAvailableLicenses();

  // 5. Data Transfer
  Logger.log('--- Data Transfer API ---');
  testDriveTransfer();

  Logger.log('');
  Logger.log('All checks complete. Fix any ❌ before deploying.');
}

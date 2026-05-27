// ================================================================
// Setup.gs — Client Configuration & Setup Wizard
// ================================================================
// Run setup() once per client deployment from the Apps Script editor.
// All values are stored in Script Properties (encrypted at rest by Google).
// No hardcoded credentials — safe to share the same codebase across clients.
// ================================================================

// ── CONFIG: loaded from Script Properties at runtime ─────────────
// This IIFE runs once per execution and reads from PropertiesService,
// so all other files can use CONFIG.X without any extra boilerplate.
var CONFIG = (function () {
  var p = PropertiesService.getScriptProperties();

  var licensesRaw = p.getProperty('LICENSES');
  var licenses;
  try {
    licenses = licensesRaw ? JSON.parse(licensesRaw) : _defaultLicenses();
  } catch (e) {
    licenses = _defaultLicenses();
  }

  return {
    DOMAIN             : p.getProperty('DOMAIN')               || 'yourdomain.com',
    SUPER_ADMIN        : p.getProperty('SUPER_ADMIN')          || '',
    ORG_NAME           : p.getProperty('ORG_NAME')             || 'Your Organization',
    ORG_UNIT           : p.getProperty('ORG_UNIT')             || '/',
    TIMEZONE           : p.getProperty('TIMEZONE')             || 'America/New_York',
    OPERATOR_GROUP     : p.getProperty('OPERATOR_GROUP')       || '',
    LOGIN_URL          : p.getProperty('LOGIN_URL')            || 'https://accounts.google.com/AccountChooser?Email=',
    AUTO_ASSIGN_LICENSE: p.getProperty('AUTO_ASSIGN_LICENSE')  !== 'false',
    LICENSE_PRODUCT_ID : 'Google-Apps',
    LICENSES           : licenses,
    // Universal constant — Drive app ID for the Data Transfer API
    DRIVE_APP_ID       : '55656082235',
  };
})();

function _defaultLicenses() {
  return [
    { label: 'Business Starter',    skuId: '1010020028' },
    { label: 'Business Standard',   skuId: '1010020025' },
    { label: 'Business Plus',       skuId: '1010020026' },
    { label: 'Workspace Essentials', skuId: '1010020020' },
    { label: 'Enterprise Starter',  skuId: '1010060003' },
    { label: 'Enterprise Standard', skuId: '1010060001' },
    { label: 'Enterprise Plus',     skuId: '1010060002' },
    { label: 'Frontline Starter',   skuId: '1010020049' },
    { label: 'No License (skip)',   skuId: 'NONE'       },
  ];
}


// ================================================================
//  SETUP WIZARD — run once per client deployment
// ================================================================

/**
 * Fill in the CLIENT object below with the new client's details,
 * then select this function in the dropdown and click ▶ Run.
 *
 * Values are saved to Script Properties (encrypted). After running,
 * deploy the script as a Web App and register the URL in Google Chat API.
 *
 * To update a single value later, just edit it here and re-run setup().
 */
function setup() {

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  EDIT THESE VALUES FOR YOUR CLIENT, THEN CLICK ▶ RUN        ║
  // ╚══════════════════════════════════════════════════════════════╝
  var CLIENT = {

    // ── Identity ───────────────────────────────────────────────
    DOMAIN      : 'yourclient.com',            // GWS primary domain
    SUPER_ADMIN : 'admin@yourclient.com',       // Super Admin account (script runs as this)
    ORG_NAME    : 'Client Company Name',        // Used in email templates

    // ── Access control ─────────────────────────────────────────
    // Google Group whose members can use the bot.
    // Leave blank to allow ALL users in the domain.
    OPERATOR_GROUP: 'gws-bot-operators@yourclient.com',

    // ── Locale ─────────────────────────────────────────────────
    // Full IANA timezone name: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
    TIMEZONE: 'America/New_York',

    // ── Login URL sent to new hires ────────────────────────────
    // AccountChooser pre-fills email → lands straight on password screen.
    // Change to 'https://accounts.google.com' for generic, or your SSO URL.
    LOGIN_URL: 'https://accounts.google.com/AccountChooser?Email=',

    // ── Licensing ──────────────────────────────────────────────
    // Set to 'false' to skip license assignment entirely.
    AUTO_ASSIGN_LICENSE: 'true',

    // Licenses shown in the onboarding dropdown.
    // Run listAvailableLicenses() first to discover which SKUs the client has.
    // First entry = default selection. Remove plans the client doesn't own.
    LICENSES: JSON.stringify([
      { label: 'Business Starter',   skuId: '1010020028' },
      { label: 'Business Standard',  skuId: '1010020025' },
      { label: 'No License (skip)',  skuId: 'NONE'       },
    ]),
  };
  // ╚══════════════════════════════════════════════════════════════╝

  var props = PropertiesService.getScriptProperties();
  Object.keys(CLIENT).forEach(function (key) {
    props.setProperty(key, String(CLIENT[key]));
  });

  Logger.log('');
  Logger.log('╔══════════════════════════════════════════╗');
  Logger.log('║  ✅  GWS HR Bot — Setup Complete          ║');
  Logger.log('╚══════════════════════════════════════════╝');
  Logger.log('  Domain         : ' + CLIENT.DOMAIN);
  Logger.log('  Super Admin    : ' + CLIENT.SUPER_ADMIN);
  Logger.log('  Org Name       : ' + CLIENT.ORG_NAME);
  Logger.log('  Operator Group : ' + (CLIENT.OPERATOR_GROUP || '(all domain users)'));
  Logger.log('  Timezone       : ' + CLIENT.TIMEZONE);
  Logger.log('  Auto-License   : ' + CLIENT.AUTO_ASSIGN_LICENSE);
  Logger.log('');
  Logger.log('Next steps:');
  Logger.log('  1. Run listAvailableLicenses() to confirm SKU IDs');
  Logger.log('  2. Deploy → New deployment → Web App');
  Logger.log('     Execute as: Me  |  Access: Anyone');
  Logger.log('  3. Copy the Web App URL');
  Logger.log('  4. Cloud Console → Chat API → Configuration → paste URL');
  Logger.log('  5. Add bot to a Google Chat space or DM');
  Logger.log('  6. Type "help" to verify');
}


// ================================================================
//  CONFIG MANAGEMENT UTILITIES
// ================================================================

/** Prints all stored config values to the execution log. */
function showCurrentConfig() {
  var props = PropertiesService.getScriptProperties().getAll();
  Logger.log('');
  Logger.log('=== Current Config (' + (props['DOMAIN'] || 'not set') + ') ===');
  ['DOMAIN', 'SUPER_ADMIN', 'ORG_NAME', 'OPERATOR_GROUP',
   'TIMEZONE', 'LOGIN_URL', 'AUTO_ASSIGN_LICENSE'].forEach(function (k) {
    Logger.log('  ' + k.padEnd(22) + ': ' + (props[k] || '(not set)'));
  });
  try {
    var licenses = JSON.parse(props['LICENSES'] || '[]');
    Logger.log('  LICENSES              : ' + licenses.map(function (l) {
      return l.label + ' (' + l.skuId + ')';
    }).join(' | '));
  } catch (e) {
    Logger.log('  LICENSES              : (parse error — re-run setup())');
  }
  Logger.log('');
}

/**
 * Updates a single config value without re-running the full setup.
 * Example: updateConfigValue('LOGIN_URL', 'https://sso.yourclient.com')
 */
function updateConfigValue(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
  Logger.log('Updated ' + key + ' → ' + value);
}

/**
 * Clears all stored config. Use before re-deploying to a different client.
 * ⚠️  Irreversible — run setup() again to reconfigure.
 */
function resetConfig() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  Logger.log('⚠️  All config cleared. Run setup() to reconfigure for the new client.');
}

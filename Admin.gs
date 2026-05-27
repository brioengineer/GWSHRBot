// ================================================================
// Admin.gs — Google Workspace Admin SDK API Layer
// ================================================================
// All UrlFetchApp calls to Admin Directory, Data Transfer,
// Licensing, and token management APIs live here.
// ================================================================

// ── Auth ──────────────────────────────────────────────────────────

function authHeaders() {
  // Content-Type is intentionally NOT set here.
  // UrlFetchApp ignores Content-Type when set inside the headers object
  // if a payload is also present — it silently falls back to
  // application/x-www-form-urlencoded, which breaks JSON PATCH/POST calls.
  // Use the top-level contentType option in apiCall instead.
  return {
    'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
  };
}

/**
 * Generic API helper. Throws a descriptive Error on HTTP 4xx/5xx.
 * Returns null on 204 No Content.
 *
 * contentType is set as a top-level UrlFetchApp option (not inside headers)
 * to ensure it is respected for PATCH and POST requests with JSON bodies.
 */
function apiCall(method, url, payload) {
  var opts = {
    method            : method,
    headers           : authHeaders(),
    contentType       : 'application/json',
    muteHttpExceptions: true,
  };
  if (payload !== undefined) opts.payload = JSON.stringify(payload);

  Logger.log('apiCall: ' + method + ' ' + url);
  if (payload !== undefined) Logger.log('apiCall payload: ' + JSON.stringify(payload));

  var res  = UrlFetchApp.fetch(url, opts);
  var code = res.getResponseCode();
  var body = res.getContentText();

  Logger.log('apiCall response: HTTP ' + code + ' — ' + body.substring(0, 400));

  if (code === 204) return null;   // No Content — success

  var parsed;
  try { parsed = JSON.parse(body); } catch (e) { parsed = { raw: body }; }

  if (code >= 400) {
    var msg = (parsed.error && parsed.error.message) || ('HTTP ' + code);
    throw new Error(msg);
  }
  return parsed;
}


// ── Users ─────────────────────────────────────────────────────────

function createUser(opts) {
  var body = {
    primaryEmail             : opts.workEmail,
    name                     : { givenName: opts.firstName, familyName: opts.lastName },
    password                 : opts.tempPass,
    changePasswordAtNextLogin: true,
    orgUnitPath              : opts.orgUnitPath || CONFIG.ORG_UNIT,
  };
  if (opts.jobTitle || opts.department) {
    body.organizations = [{ title: opts.jobTitle || '', department: opts.department || '', primary: true }];
  }
  if (opts.managerEmail) {
    body.relations = [{ type: 'manager', value: opts.managerEmail }];
  }
  return apiCall('POST', 'https://admin.googleapis.com/admin/directory/v1/users', body);
}

function getUser(email) {
  try {
    return apiCall('GET', 'https://admin.googleapis.com/admin/directory/v1/users/' + enc(email));
  } catch (err) {
    if (err.message.indexOf('Resource Not Found') !== -1 || err.message.indexOf('404') !== -1) return null;
    throw err;
  }
}

/**
 * Searches users by given + family name via the Directory API.
 * Returns an array (0, 1, or many) — never guesses the email format.
 */
function searchUsersByName(firstName, lastName) {
  var query = 'givenName:' + firstName + ' familyName:' + lastName;
  var url   = 'https://admin.googleapis.com/admin/directory/v1/users'
            + '?domain=' + enc(CONFIG.DOMAIN)
            + '&query='  + enc(query)
            + '&projection=basic&maxResults=10';

  var res  = UrlFetchApp.fetch(url, { method: 'GET', headers: authHeaders(), muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('Directory search failed (HTTP ' + code + ')');
  return JSON.parse(res.getContentText()).users || [];
}

function suspendUser(email) {
  return apiCall('PATCH',
    'https://admin.googleapis.com/admin/directory/v1/users/' + enc(email),
    { suspended: true });
}

function resetPassword(email, newPass) {
  return apiCall('PATCH',
    'https://admin.googleapis.com/admin/directory/v1/users/' + enc(email),
    { password: newPass, changePasswordAtNextLogin: true });
}

function signOutUser(email) {
  return apiCall('POST',
    'https://admin.googleapis.com/admin/directory/v1/users/' + enc(email) + '/signOut',
    {});
}


// ── Tokens & ASPs ────────────────────────────────────────────────

function revokeTokens(email) {
  var res   = apiCall('GET',
    'https://admin.googleapis.com/admin/directory/v1/users/' + enc(email) + '/tokens');
  var items = (res && res.items) || [];
  items.forEach(function (token) {
    try {
      apiCall('DELETE',
        'https://admin.googleapis.com/admin/directory/v1/users/' + enc(email) + '/tokens/' + enc(token.clientId));
    } catch (e) { Logger.log('Token delete warn: ' + e.message); }
  });
}

function revokeASPs(email) {
  var res   = apiCall('GET',
    'https://admin.googleapis.com/admin/directory/v1/users/' + enc(email) + '/asps');
  var items = (res && res.items) || [];
  items.forEach(function (asp) {
    try {
      apiCall('DELETE',
        'https://admin.googleapis.com/admin/directory/v1/users/' + enc(email) + '/asps/' + asp.codeId);
    } catch (e) { Logger.log('ASP delete warn: ' + e.message); }
  });
}


// ── Data Transfer (Drive files) ───────────────────────────────────

/**
 * Discovers the Google Drive application ID from the Data Transfer API
 * at runtime rather than hardcoding it — different domain configs can
 * return different IDs.
 */
function getDriveAppId() {
  var res  = UrlFetchApp.fetch(
    'https://admin.googleapis.com/admin/datatransfer/v1/applications',
    { method: 'GET', headers: authHeaders(), muteHttpExceptions: true }
  );
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('Could not fetch Data Transfer applications (HTTP ' + code
      + '). Ensure the Admin SDK API is enabled in Cloud Console.');
  }

  var apps      = JSON.parse(res.getContentText()).applications || [];
  var driveApp  = apps.filter(function (a) {
    return a.name && a.name.toLowerCase().indexOf('drive') !== -1;
  })[0];

  if (!driveApp) {
    throw new Error('Google Drive not found in Data Transfer applications. '
      + 'Available: [' + apps.map(function (a) { return a.name; }).join(', ') + ']. '
      + 'Enable Drive transfer in Admin Console → Apps → Google Workspace → Drive.');
  }
  Logger.log('getDriveAppId: resolved → ' + driveApp.id);
  return driveApp.id;
}

function transferDriveFiles(fromEmail, toEmail) {
  var fromUser   = getUser(fromEmail);
  var toUser     = getUser(toEmail);

  if (!fromUser) throw new Error('Source user ' + fromEmail + ' not found');
  if (!toUser)   throw new Error('Destination user ' + toEmail + ' not found');

  var driveAppId = getDriveAppId();

  return apiCall('POST', 'https://admin.googleapis.com/admin/datatransfer/v1/transfers', {
    oldOwnerUserId: fromUser.id,
    newOwnerUserId: toUser.id,
    applicationDataTransfers: [{
      applicationId            : driveAppId,
      applicationTransferParams: [{ key: 'PRIVACY_LEVEL', value: ['PRIVATE', 'SHARED'] }]
    }]
  });
}


// ── Licensing ────────────────────────────────────────────────────

/**
 * Assigns a Workspace license via the Licensing API.
 * 200 = newly assigned | 409 = already licensed — both treated as success.
 * 412 = no available seats — thrown as a typed error { code: 412, message }.
 */
function assignLicense(workEmail, skuId) {
  var resolvedSku = skuId || CONFIG.LICENSES[0].skuId;
  var url         = 'https://licensing.googleapis.com/apps/licensing/v1/product/'
                  + CONFIG.LICENSE_PRODUCT_ID + '/sku/' + resolvedSku + '/user';

  Logger.log('assignLicense: POST ' + url + ' for ' + workEmail);

  var res  = UrlFetchApp.fetch(url, {
    method            : 'POST',
    headers           : authHeaders(),
    payload           : JSON.stringify({ userId: workEmail }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  Logger.log('assignLicense: HTTP ' + code + ' — ' + body);

  if (code === 200 || code === 409) return;   // success

  if (code === 412) {
    throw { code: 412, message: 'No available seats for this SKU. '
      + 'Purchase more seats in Admin Console → Billing, '
      + 'or run listAvailableLicenses() in the Apps Script editor.' };
  }

  var parsed = {};
  try { parsed = JSON.parse(body); } catch (e) {}
  throw new Error((parsed.error && parsed.error.message) || 'HTTP ' + code + ': ' + body);
}


// ── Org Units ────────────────────────────────────────────────────

/**
 * Returns all OUs on the domain as [{ label, path }], sorted by path.
 * Root "/" is always prepended. Falls back to root-only on API failure.
 */
function fetchOrgUnits() {
  var root = [{ label: '/ (Root — Default)', path: '/' }];
  try {
    var res = UrlFetchApp.fetch(
      'https://admin.googleapis.com/admin/directory/v1/customer/my_customer/orgunits?type=all',
      { method: 'GET', headers: authHeaders(), muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) return root;

    var units = (JSON.parse(res.getContentText()).organizationUnits || [])
      .map(function (ou) {
        return {
          label: ou.orgUnitPath.replace(/^\//, '').replace(/\//g, ' / ') || ou.name,
          path : ou.orgUnitPath
        };
      })
      .sort(function (a, b) { return a.path.localeCompare(b.path); });

    Logger.log('fetchOrgUnits: found ' + units.length + ' OUs');
    return root.concat(units);
  } catch (err) {
    Logger.log('fetchOrgUnits error: ' + err.message + ' — falling back to root');
    return root;
  }
}

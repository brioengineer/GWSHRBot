// ================================================================
// Utils.gs — Auth, Name Helpers, Password Generator
// ================================================================

// ── Authorization ─────────────────────────────────────────────────

/**
 * Extracts the sender's email from a Chat event.
 * event.user.email can be empty in some Chat app configurations;
 * we check multiple fallback fields before giving up.
 * Falls back to a domain-valid placeholder so the bot doesn't
 * lock out everyone if Chat stops sending the email field.
 */
function getSenderEmail(event) {
  if (event.user && event.user.email) return event.user.email;
  if (event.message && event.message.sender && event.message.sender.email) {
    return event.message.sender.email;
  }
  Logger.log('getSenderEmail: WARNING — could not determine sender from event.user: '
    + JSON.stringify(event.user));
  return 'unknown@' + CONFIG.DOMAIN;   // fail-open: Chat already gates access
}

/**
 * Two-layer authorization:
 *   1. If OPERATOR_GROUP is set → live group membership check via Directory API.
 *      Add/remove someone from the group in Admin Console; takes effect immediately.
 *   2. If OPERATOR_GROUP is empty → allow any user in the domain.
 */
function isAuthorized(email) {
  if (!email) return true;   // no email resolved — fail open
  if (CONFIG.OPERATOR_GROUP) return isGroupMember(email, CONFIG.OPERATOR_GROUP);
  return email.endsWith('@' + CONFIG.DOMAIN);
}

/**
 * Checks group membership via the Directory API hasMember endpoint.
 * Returns true on any API error so an outage never locks out operators.
 */
function isGroupMember(email, groupEmail) {
  try {
    var url = 'https://admin.googleapis.com/admin/directory/v1/groups/'
            + enc(groupEmail) + '/hasMember/' + enc(email);
    var res  = UrlFetchApp.fetch(url, {
      method            : 'GET',
      headers           : authHeaders(),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText()).isMember === true;
    }
    Logger.log('isGroupMember: HTTP ' + res.getResponseCode() + ' — failing open');
    return true;
  } catch (err) {
    Logger.log('isGroupMember error: ' + err.message + ' — failing open');
    return true;
  }
}


// ── Name helpers ──────────────────────────────────────────────────

function splitName(fullName) {
  var parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return { firstName: cap(parts[0]), lastName: parts.slice(1).map(cap).join(' ') };
}

function makeUsername(firstName, lastName) {
  return (firstName + '.' + lastName.replace(/\s+/g, ''))
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '');
}

function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}


// ── Password generator ────────────────────────────────────────────

/** Generates a random 8-char password meeting common complexity policies. */
function generatePassword() {
  var U    = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var l    = 'abcdefghjkmnpqrstuvwxyz';
  var d    = '23456789';
  var s    = '!@#$%';
  var pick = function (pool) { return pool[Math.floor(Math.random() * pool.length)]; };
  var p    = pick(U) + pick(U) + pick(l) + pick(l) + pick(d) + pick(d) + pick(s);
  return p.split('').sort(function () { return Math.random() - 0.5; }).join('') + pick(s);
}


// ── Form value helpers ────────────────────────────────────────────

function fVal(formInputs, key) {
  return (formInputs[key] && formInputs[key].stringInputs
    && formInputs[key].stringInputs.value[0]) || '';
}

function paramVal(params, key) {
  var p = params.filter(function (x) { return x.key === key; })[0];
  return p ? p.value : null;
}

function enc(str) {
  return encodeURIComponent(str);
}


// ── Welcome message ───────────────────────────────────────────────

function getWelcomeMessage() {
  return '👋 *HR Bot is online and ready!*\n\n'
    + 'I help HR and IT manage the employee lifecycle in Google Workspace.\n\n'
    + '*Try a command:*\n'
    + '• `onboard Jane Smith` — provision a new account\n'
    + '• `offboard John Smith` — suspend & clean up a departing employee\n'
    + '• `status Maria Garcia` — check account status\n'
    + '• `help` — full command reference\n\n'
    + '_Powered by the Admin SDK · ' + CONFIG.DOMAIN + '_';
}

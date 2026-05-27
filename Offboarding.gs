// ================================================================
// Offboarding.gs — Employee Departure & Account Cleanup
// ================================================================

// ── Step 1: Find user + show confirmation card ────────────────────

function buildOffboardForm(fullName, senderEmail) {
  // Direct email shortcut: "offboard jsmith@domain.com"
  if (fullName.indexOf('@') !== -1) {
    var direct = getUser(fullName.trim());
    if (!direct) return { text: '⚠️ No GWS account found for *' + fullName.trim() + '*' };
    if (direct.suspended) return { text: '⚠️ *' + direct.primaryEmail + '* is already suspended.' };
    return buildOffboardFormCard(
      direct.name.givenName, direct.name.familyName, direct.primaryEmail, senderEmail);
  }

  var parts = splitName(fullName);
  if (!parts) {
    return { text: '⚠️ Please provide a name or email.\nExamples:\n• `offboard Jane Smith`\n• `offboard jsmith@' + CONFIG.DOMAIN + '`' };
  }

  try {
    var matches = searchUsersByName(parts.firstName, parts.lastName);

    if (matches.length === 0) {
      return { text: '⚠️ No account found matching *' + parts.firstName + ' ' + parts.lastName
        + '*. Try: `offboard email@' + CONFIG.DOMAIN + '`' };
    }
    if (matches.length === 1) {
      var u = matches[0];
      if (u.suspended) return { text: '⚠️ *' + u.primaryEmail + '* is already suspended.' };
      return buildOffboardFormCard(u.name.givenName, u.name.familyName, u.primaryEmail, senderEmail);
    }
    return buildDisambiguationCard('offboard', parts.firstName, parts.lastName, matches);

  } catch (err) {
    return { text: '⚠️ Error searching for user: ' + err.message };
  }
}

function buildOffboardFormCard(firstName, lastName, workEmail, senderEmail) {
  return {
    cardsV2: [{
      cardId: 'offboard_form',
      card: {
        header: {
          title   : '🔴 Employee Offboarding',
          subtitle: firstName + ' ' + lastName + '  ·  ' + workEmail,
        },
        sections: [
          {
            header : '⚠️ The following actions will be executed automatically:',
            widgets: [{
              textParagraph: {
                text: [
                  '• <b>Suspend</b> the Google Workspace account',
                  '• <b>Reset</b> the account password',
                  '• <b>Sign out</b> all active browser sessions',
                  '• <b>Revoke</b> all OAuth tokens & app-specific passwords',
                  '• <b>Transfer</b> Google Drive files to the person you specify',
                  '',
                  'This action <b>cannot be undone</b> without manual Admin intervention.'
                ].join('\n')
              }
            }]
          },
          {
            header : 'Transfer & Details',
            widgets: [
              textInput('Transfer Drive Files To', 'transferTo', '', 'recipient@' + CONFIG.DOMAIN),
              textInput('Reason (optional)',        'reason',     '', 'e.g. Resignation, End of Contract'),
            ]
          },
          {
            widgets: [{
              buttonList: {
                buttons: [
                  actionButton('🔴  Confirm Offboard', 'executeOffboarding',
                    [
                      { key: 'email',       value: workEmail   },
                      { key: 'firstName',   value: firstName   },
                      { key: 'lastName',    value: lastName    },
                      { key: 'requestedBy', value: senderEmail }
                    ],
                    { red: 0.83, green: 0.18, blue: 0.18, alpha: 1 }),
                  actionButton('✖  Cancel', 'cancelAction', [], null)
                ]
              }
            }]
          }
        ]
      }
    }]
  };
}


// ── Step 2: Execute ───────────────────────────────────────────────

function runOffboarding(event) {
  var f      = event.common ? event.common.formInputs : {};
  var params = event.action.parameters || [];

  // Log everything received so we can diagnose email-not-passed issues
  Logger.log('runOffboarding — params: ' + JSON.stringify(params));
  Logger.log('runOffboarding — formInputs keys: ' + Object.keys(f || {}).join(', '));

  var workEmail   = paramVal(params, 'email');
  var firstName   = paramVal(params, 'firstName') || 'Unknown';
  var lastName    = paramVal(params, 'lastName')  || 'User';
  var requestedBy = paramVal(params, 'requestedBy') || CONFIG.SUPER_ADMIN;
  var transferTo  = fVal(f, 'transferTo') || CONFIG.SUPER_ADMIN;
  var reason      = fVal(f, 'reason')     || 'Not specified';

  // ── Guard: email must be present ─────────────────────────
  if (!workEmail) {
    Logger.log('runOffboarding — ERROR: workEmail is null/undefined. Full event.action: '
      + JSON.stringify(event.action));
    return {
      actionResponse: { type: 'UPDATE_MESSAGE' },
      text: '❌ Offboarding failed: could not determine the account email. '
          + 'Please try again using the direct email format: `offboard user@' + CONFIG.DOMAIN + '`'
    };
  }

  Logger.log('runOffboarding — targeting: ' + workEmail);

  // ── Guard: block Super Admin accounts ────────────────────
  var targetUser = getUser(workEmail);
  if (targetUser && targetUser.isAdmin === true) {
    Logger.log('runOffboarding BLOCKED: ' + workEmail + ' is a Super Admin');
    return {
      actionResponse: { type: 'UPDATE_MESSAGE' },
      text: '🚫 Cannot offboard ' + workEmail + ' - this account has the Super Admin role. '
          + 'Remove the Super Admin role in Admin Console first, then retry.'
    };
  }

  var steps = [], errors = [];

  // ── 1. Suspend ────────────────────────────────────────────
  try {
    Logger.log('runOffboarding step 1: suspending ' + workEmail);
    suspendUser(workEmail);

    // Pause to allow GWS to propagate before verifying
    Utilities.sleep(2000);

    // Verify the suspension — re-fetch and check the flag
    var check = getUser(workEmail);
    Logger.log('runOffboarding step 1 verify: suspended=' + (check ? check.suspended : 'user not found'));
    if (check && check.suspended === true) {
      steps.push('✅ Account suspended — verified');
    } else {
      errors.push('⚠️ Suspend API returned success but account shows suspended='
        + (check ? check.suspended : 'unknown')
        + '. Check Execution Log for the raw API response and verify in Admin Console.');
      Logger.log('runOffboarding step 1: SUSPEND NOT CONFIRMED for ' + workEmail);
    }
  } catch (err) {
    errors.push('❌ Suspend failed: ' + err.message);
    Logger.log('runOffboarding step 1 ERROR: ' + err.message);
  }

  // ── 2. Reset password ────────────────────────────────────
  // Brief pause prevents 409 Conflicting requests if suspend is still propagating
  Utilities.sleep(2000);
  try {
    Logger.log('runOffboarding step 2: resetting password for ' + workEmail);
    resetPassword(workEmail, generatePassword());
    steps.push('✅ Password reset');
  } catch (err) {
    if (err.message.indexOf('409') !== -1 || err.message.toLowerCase().indexOf('conflict') !== -1) {
      errors.push('❌ Password reset blocked (409 Conflicting requests). '
        + 'The account may still have an admin role. Check Execution Log for details.');
    } else {
      errors.push('❌ Password reset failed: ' + err.message);
    }
    Logger.log('runOffboarding step 2 ERROR: ' + err.message);
  }

  // ── 3. Sign out all sessions ─────────────────────────────
  try {
    signOutUser(workEmail);
    steps.push('✅ All active sessions terminated');
  } catch (err) {
    // signOut returns 204 on success; a 400 here often means user is already signed out
    if (err.message.indexOf('400') !== -1 || err.message.indexOf('invalid') !== -1) {
      steps.push('✅ Sessions cleared (user had no active sessions)');
    } else {
      errors.push('❌ Session sign-out failed: ' + err.message);
    }
    Logger.log('runOffboarding — signOut threw: ' + err.message);
  }

  // ── 4. Revoke OAuth tokens ───────────────────────────────
  try {
    revokeTokens(workEmail);
    steps.push('✅ OAuth tokens revoked');
  } catch (err) {
    errors.push('❌ Token revocation failed: ' + err.message);
    Logger.log('runOffboarding — revokeTokens threw: ' + err.message);
  }

  // ── 5. Revoke App-Specific Passwords ────────────────────
  try {
    revokeASPs(workEmail);
    steps.push('✅ App-specific passwords removed');
  } catch (err) {
    errors.push('⚠️ ASP removal partial: ' + err.message);
    Logger.log('runOffboarding — revokeASPs threw: ' + err.message);
  }

  // ── 6. Transfer Drive files ──────────────────────────────
  try {
    transferDriveFiles(workEmail, transferTo);
    steps.push('✅ Drive file transfer queued → ' + transferTo);
  } catch (err) {
    errors.push('❌ Drive transfer failed: ' + err.message);
    Logger.log('runOffboarding — transferDriveFiles threw: ' + err.message);
  }

  return updateCard(buildOffboardSummaryCard(
    firstName, lastName, workEmail, transferTo, reason, steps, errors, requestedBy));
}


// ── Summary card ─────────────────────────────────────────────────

function buildOffboardSummaryCard(firstName, lastName, workEmail,
                                   transferTo, reason, steps, errors, requestedBy) {
  var allOk = errors.length === 0;
  return {
    cardsV2: [{
      cardId: 'offboard_summary',
      card: {
        header: {
          title   : allOk ? '✅ Offboarding Complete' : '⚠️ Offboarding Complete with Warnings',
          subtitle: firstName + ' ' + lastName + '  ·  ' + workEmail,
        },
        sections: [
          {
            header : 'Summary',
            widgets: [
              kvWidget('Account',              workEmail),
              kvWidget('Files Transferred To', transferTo),
              kvWidget('Reason',               reason),
              kvWidget('Processed By',         requestedBy),
              kvWidget('Timestamp',            new Date().toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE })),
            ]
          },
          {
            header : 'Actions Taken',
            widgets: [{ textParagraph: { text: steps.concat(errors).join('\n') || '—' } }]
          }
        ]
      }
    }]
  };
}

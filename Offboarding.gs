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
  var f           = event.common.formInputs;
  var params      = event.action.parameters || [];

  var workEmail   = paramVal(params, 'email');
  var firstName   = paramVal(params, 'firstName');
  var lastName    = paramVal(params, 'lastName');
  var requestedBy = paramVal(params, 'requestedBy') || CONFIG.SUPER_ADMIN;
  var transferTo  = fVal(f, 'transferTo') || CONFIG.SUPER_ADMIN;
  var reason      = fVal(f, 'reason')     || 'Not specified';

  var steps = [], errors = [];

  // ── 1. Suspend ────────────────────────────────────────────
  try {
    suspendUser(workEmail);
    steps.push('✅ Account suspended');
  } catch (err) { errors.push('❌ Suspend failed: ' + err.message); }

  // ── 2. Reset password ────────────────────────────────────
  try {
    resetPassword(workEmail, generatePassword());
    steps.push('✅ Password reset');
  } catch (err) { errors.push('❌ Password reset failed: ' + err.message); }

  // ── 3. Sign out all sessions ─────────────────────────────
  try {
    signOutUser(workEmail);
    steps.push('✅ All active sessions terminated');
  } catch (err) { errors.push('❌ Session sign-out failed: ' + err.message); }

  // ── 4. Revoke OAuth tokens ───────────────────────────────
  try {
    revokeTokens(workEmail);
    steps.push('✅ OAuth tokens revoked');
  } catch (err) { errors.push('❌ Token revocation failed: ' + err.message); }

  // ── 5. Revoke App-Specific Passwords ────────────────────
  try {
    revokeASPs(workEmail);
    steps.push('✅ App-specific passwords removed');
  } catch (err) { errors.push('⚠️ ASP removal partial: ' + err.message); }

  // ── 6. Transfer Drive files ──────────────────────────────
  try {
    transferDriveFiles(workEmail, transferTo);
    steps.push('✅ Drive file transfer queued → ' + transferTo);
  } catch (err) { errors.push('❌ Drive transfer failed: ' + err.message); }

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

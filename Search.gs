// ================================================================
// Search.gs — User Status Lookup, Disambiguation & Help
// ================================================================

// ── Status lookup ─────────────────────────────────────────────────

function fetchUserStatus(fullName) {
  // Direct email shortcut: "status jsmith@domain.com"
  if (fullName.indexOf('@') !== -1) {
    var direct = getUser(fullName.trim());
    if (!direct) return { text: '❓ No account found for *' + fullName.trim() + '*' };
    return buildStatusCard(direct);
  }

  var parts = splitName(fullName);
  if (!parts) {
    return { text: '⚠️ Please provide a name or email.\nExamples:\n• `status Jane Smith`\n• `status jsmith@' + CONFIG.DOMAIN + '`' };
  }

  try {
    var matches = searchUsersByName(parts.firstName, parts.lastName);

    if (matches.length === 0) {
      return { text: '❓ No account found matching *' + parts.firstName + ' ' + parts.lastName
        + '*. Try: `status email@' + CONFIG.DOMAIN + '`' };
    }
    if (matches.length === 1) return buildStatusCard(matches[0]);
    return buildDisambiguationCard('status', parts.firstName, parts.lastName, matches);

  } catch (err) {
    return { text: '⚠️ Error searching for user: ' + err.message };
  }
}

function buildStatusCard(user) {
  var fullName   = (user.name && (user.name.fullName
    || user.name.givenName + ' ' + user.name.familyName)) || user.primaryEmail;
  var statusIcon = user.suspended ? '🔴 Suspended' : '🟢 Active';
  var lastLogin  = user.lastLoginTime
    ? new Date(user.lastLoginTime).toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE })
    : 'Never';
  var created    = new Date(user.creationTime).toLocaleDateString('en-US', { timeZone: CONFIG.TIMEZONE });

  return {
    cardsV2: [{
      cardId: 'status_card',
      card: {
        header: { title: '👤 Account Status', subtitle: fullName },
        sections: [{
          widgets: [
            kvWidget('Email',        user.primaryEmail),
            kvWidget('Status',       statusIcon),
            kvWidget('Org Unit',     user.orgUnitPath || '/'),
            kvWidget('Last Login',   lastLogin),
            kvWidget('Created',      created),
            kvWidget('2SV Enrolled', user.isEnrolledIn2Sv ? '✅ Yes' : '❌ No'),
          ]
        }]
      }
    }]
  };
}


// ── Disambiguation (multiple accounts share a name) ───────────────

/**
 * Shown when a name search returns more than one GWS account.
 * Each result shows email + status + OU with an action button.
 * action = 'status' | 'offboard'
 */
function buildDisambiguationCard(action, firstName, lastName, matches) {
  var isOffboard = action === 'offboard';
  var widgets    = [{
    textParagraph: {
      text: 'Multiple accounts match <b>' + firstName + ' ' + lastName + '</b>. '
          + 'Select the correct one, or re-type the command with their full email address.'
    }
  }];

  matches.forEach(function (u) {
    var statusLabel = u.suspended ? '🔴 Suspended' : '🟢 Active';
    var ouLabel     = (u.orgUnitPath && u.orgUnitPath !== '/') ? u.orgUnitPath : '/ (Root)';
    var btnColor    = isOffboard
      ? { red: 0.83, green: 0.18, blue: 0.18, alpha: 1 }
      : { red: 0.13, green: 0.45, blue: 0.80, alpha: 1 };

    widgets.push({
      decoratedText: {
        topLabel: u.primaryEmail,
        text    : statusLabel + '  ·  ' + ouLabel,
        button  : {
          text   : isOffboard ? '🔴 Offboard this account' : '👤 View status',
          color  : btnColor,
          onClick: {
            action: {
              function  : isOffboard ? 'executeOffboarding' : 'viewStatusByEmail',
              parameters: [
                { key: 'email',       value: u.primaryEmail    },
                { key: 'firstName',   value: u.name.givenName  },
                { key: 'lastName',    value: u.name.familyName },
                { key: 'requestedBy', value: CONFIG.SUPER_ADMIN }
              ]
            }
          }
        }
      }
    });
  });

  return {
    cardsV2: [{
      cardId: 'disambig_card',
      card: {
        header: {
          title   : '⚠️ Multiple Matches Found',
          subtitle: firstName + ' ' + lastName + ' — ' + matches.length + ' accounts'
        },
        sections: [{ widgets: widgets }]
      }
    }]
  };
}


// ── Help card ─────────────────────────────────────────────────────

function buildHelpCard() {
  return {
    cardsV2: [{
      cardId: 'help_card',
      card: {
        header: { title: '🤖 HR Bot — Command Reference', subtitle: CONFIG.DOMAIN },
        sections: [
          {
            header : 'Commands',
            widgets: [
              kvWidget('`onboard [First] [Last]`',  'Creates GWS account, sends credentials to employee & manager'),
              kvWidget('`offboard [First] [Last]`', 'Suspends account, revokes sessions/tokens, transfers Drive files'),
              kvWidget('`status [First] [Last]`',   'Displays account status, last login, 2SV enrollment'),
              kvWidget('`help`',                    'Shows this reference card'),
            ]
          },
          {
            header : 'Examples',
            widgets: [{
              textParagraph: {
                text: '• <code>onboard Sarah Connor</code>\n'
                    + '• <code>offboard John Smith</code>\n'
                    + '• <code>status Maria Garcia</code>\n'
                    + '• <code>status jsmith@' + CONFIG.DOMAIN + '</code>  ← direct email lookup'
              }
            }]
          },
          {
            header : 'Notes',
            widgets: [{
              textParagraph: {
                text: '• Accounts found by <b>display name</b> — non-standard usernames (jsmith, john.s) work automatically\n'
                    + '• Use email for precision: <code>status email@' + CONFIG.DOMAIN + '</code>\n'
                    + '• Multiple name matches show a picker card\n'
                    + '• Offboarding is irreversible without manual Admin action\n'
                    + '• Drive transfers run asynchronously via the Data Transfer API'
              }
            }]
          }
        ]
      }
    }]
  };
}

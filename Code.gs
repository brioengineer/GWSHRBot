// ================================================================
// Code.gs — Entry Point & Router
// GWS HR Bot  |  Brio Technologies 
// ================================================================
// All config lives in Setup.gs (PropertiesService).
// Logic is split across: Onboarding.gs, Offboarding.gs,
// Search.gs, Admin.gs, Cards.gs, Diagnostics.gs, Utils.gs
// ================================================================

/**
 * HTTP entry point — Google Chat calls this URL for every event.
 * Deployed as: Web App → Execute as Me → Access Anyone
 */
function doPost(e) {
  try {
    var event    = JSON.parse(e.postData.contents);
    var response;

    switch (event.type) {
      case 'ADDED_TO_SPACE':
        response = { text: getWelcomeMessage() };
        break;
      case 'MESSAGE':
        response = routeMessage(event);
        break;
      case 'CARD_CLICKED':
        response = routeCardClick(event);
        break;
      default:
        response = { text: '' };
    }

    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doPost error: ' + err.stack);
    return ContentService
      .createTextOutput(JSON.stringify({ text: '⚠️ Unexpected error: ' + err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── Message Router ────────────────────────────────────────────────

function routeMessage(event) {
  var sender  = getSenderEmail(event);
  var rawText = (event.message.text || '').trim();
  var text    = rawText.replace(/<[^>]+>/g, '').trim();   // strip @-mention markup

  Logger.log('HR Bot — sender: ' + sender + ' | text: ' + text);

  if (!isAuthorized(sender)) {
    return { text: '🚫 You are not authorized to use this bot. Contact your GWS Super Admin.' };
  }

  var onboardMatch  = text.match(/^onboard\s+(.+)$/i);
  var offboardMatch = text.match(/^offboard\s+(.+)$/i);
  var statusMatch   = text.match(/^status\s+(.+)$/i);

  if (onboardMatch)  return buildOnboardForm(onboardMatch[1].trim(), sender);
  if (offboardMatch) return buildOffboardForm(offboardMatch[1].trim(), sender);
  if (statusMatch)   return fetchUserStatus(statusMatch[1].trim());
  if (/^help$/i.test(text) || text === '') return buildHelpCard();

  return { text: "❓ I didn't catch that. Type `help` to see available commands." };
}


// ── Card Click Router ─────────────────────────────────────────────

function routeCardClick(event) {
  var fn = (event.action && (event.action.function || event.action.actionMethodName)) || '';

  switch (fn) {
    case 'executeOnboarding':
      return runOnboarding(event);

    case 'executeOffboarding':
      return runOffboarding(event);

    case 'viewStatusByEmail': {
      var emailParam = (event.action.parameters || []).filter(function (p) { return p.key === 'email'; })[0];
      var user       = emailParam ? getUser(emailParam.value) : null;
      return user
        ? Object.assign({ actionResponse: { type: 'NEW_MESSAGE' } }, buildStatusCard(user))
        : { text: '⚠️ Could not find that account.' };
    }

    case 'cancelAction':
      return { actionResponse: { type: 'UPDATE_MESSAGE' }, text: '❌ Action cancelled.' };

    default:
      return { text: '⚠️ Unknown action: ' + fn };
  }
}

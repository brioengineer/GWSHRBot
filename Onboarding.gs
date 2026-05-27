// ================================================================
// Onboarding.gs — New Employee Provisioning
// ================================================================

// ── Step 1: Show form card ────────────────────────────────────────

function buildOnboardForm(fullName, senderEmail) {
  var parts = splitName(fullName);
  if (!parts) {
    return { text: '⚠️ Please include both first and last name. Example: `onboard Jane Smith`' };
  }
  var firstName = parts.firstName;
  var lastName  = parts.lastName;

  return {
    cardsV2: [{
      cardId: 'onboard_form',
      card: {
        header: {
          title   : '🟢 New Employee Onboarding',
          subtitle: firstName + ' ' + lastName,
        },
        sections: [
          {
            header : 'Employee Details',
            widgets: [
              textInput('First Name',       'firstName',    firstName, 'Given name'),
              textInput('Last Name',        'lastName',     lastName,  'Surname'),
              textInput('Job Title',        'jobTitle',     '',        'e.g. Account Executive'),
              textInput('Department',       'department',   '',        'e.g. Sales'),
              textInput("Manager's Email",  'managerEmail', '',        'manager@' + CONFIG.DOMAIN),
              textInput('Personal Email',   'personalEmail','',        'For first-login instructions (optional)'),
            ]
          },
          {
            header : 'Account Settings',
            widgets: [
              buildOrgUnitDropdown(),
              buildLicenseDropdown(),
            ]
          },
          {
            widgets: [{
              buttonList: {
                buttons: [
                  actionButton('✅  Create Account', 'executeOnboarding',
                    [{ key: 'requestedBy', value: senderEmail }],
                    { red: 0.13, green: 0.69, blue: 0.30, alpha: 1 }),
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

function runOnboarding(event) {
  var f           = event.common.formInputs;
  var params      = event.action.parameters || [];
  var requestedBy = paramVal(params, 'requestedBy') || CONFIG.SUPER_ADMIN;

  var firstName    = fVal(f, 'firstName');
  var lastName     = fVal(f, 'lastName');
  var jobTitle     = fVal(f, 'jobTitle');
  var department   = fVal(f, 'department');
  var managerEmail = fVal(f, 'managerEmail');
  var personalEmail = fVal(f, 'personalEmail');
  var selectedSku  = fVal(f, 'licenseSkuId')  || CONFIG.LICENSES[0].skuId;
  var selectedLicenseLabel = getLicenseLabel(selectedSku);
  var selectedOrgUnit = fVal(f, 'orgUnitPath') || CONFIG.ORG_UNIT;

  if (!firstName || !lastName || !managerEmail) {
    return { text: '⚠️ First name, last name, and manager email are all required.' };
  }

  var username  = makeUsername(firstName, lastName);
  var workEmail = username + '@' + CONFIG.DOMAIN;
  var tempPass  = generatePassword();
  var steps = [], errors = [];

  // ── 1. Create GWS account ──────────────────────────────────
  try {
    createUser({ workEmail: workEmail, firstName: firstName, lastName: lastName,
                 tempPass: tempPass, jobTitle: jobTitle, department: department,
                 managerEmail: managerEmail, orgUnitPath: selectedOrgUnit });
    steps.push('✅ Account created — ' + workEmail + ' (' + selectedOrgUnit + ')');
  } catch (err) {
    errors.push('❌ Account creation failed: ' + err.message);
    return updateCard(buildOnboardSummaryCard(
      firstName, lastName, workEmail, managerEmail, tempPass, selectedOrgUnit,
      steps, errors, requestedBy));
  }

  // ── 2. Assign license ─────────────────────────────────────
  if (CONFIG.AUTO_ASSIGN_LICENSE && selectedSku !== 'NONE') {
    try {
      Utilities.sleep(2000);   // brief pause for account propagation
      assignLicense(workEmail, selectedSku);
      steps.push('✅ License assigned — ' + selectedLicenseLabel);
    } catch (err) {
      if (err.code === 412) {
        errors.push('⚠️ No available seats for *' + selectedLicenseLabel + '*. '
          + 'Purchase more seats in Admin Console → Billing, or run '
          + '`listAvailableLicenses()` in the Apps Script editor.');
      } else {
        errors.push('⚠️ License assignment failed: ' + (err.message || err));
      }
    }
  } else if (selectedSku === 'NONE') {
    steps.push('⏭️ License skipped — assign manually in Admin Console');
  }

  // ── 3. Send welcome email to personal address ─────────────
  if (personalEmail) {
    try {
      sendWelcomeEmail(personalEmail, firstName, workEmail, tempPass, managerEmail);
      steps.push('✅ Welcome email sent → ' + personalEmail);
    } catch (err) {
      errors.push('⚠️ Welcome email failed: ' + err.message);
    }
  }

  // ── 4. Notify manager ────────────────────────────────────
  try {
    sendManagerNotice(managerEmail, firstName, lastName, workEmail, tempPass, requestedBy);
    steps.push('✅ Manager notified — ' + managerEmail);
  } catch (err) {
    errors.push('⚠️ Manager notification failed: ' + err.message);
  }

  return updateCard(buildOnboardSummaryCard(
    firstName, lastName, workEmail, managerEmail, tempPass, selectedOrgUnit,
    steps, errors, requestedBy));
}


// ── Email notifications ───────────────────────────────────────────

function sendWelcomeEmail(toEmail, firstName, workEmail, tempPass, managerEmail) {
  var subject = 'Welcome to ' + CONFIG.ORG_NAME + ' — Your Account is Ready';
  var body = 'Hi ' + firstName + ',\n\n'
    + 'Your Google Workspace account at ' + CONFIG.ORG_NAME + ' has been created.\n\n'
    + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    + 'YOUR LOGIN DETAILS\n'
    + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    + 'Email Address  :  ' + workEmail + '\n'
    + 'Temp Password  :  ' + tempPass + '\n'
    + 'Login URL      :  ' + CONFIG.LOGIN_URL + workEmail + '\n\n'
    + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    + '⚠️  You will be required to set a new password on first login.\n\n'
    + 'Your manager has also been notified.\n\n'
    + 'Questions? Contact IT at ' + CONFIG.SUPER_ADMIN + '.\n\n'
    + 'Welcome aboard!\n'
    + '— ' + CONFIG.ORG_NAME + ' IT Team';

  GmailApp.sendEmail(toEmail, subject, body, {
    cc  : managerEmail,
    name: CONFIG.ORG_NAME + ' IT'
  });
}

function sendManagerNotice(managerEmail, firstName, lastName, workEmail, tempPass, requestedBy) {
  var subject = 'New Hire Account Created: ' + firstName + ' ' + lastName;
  var body = 'Hi,\n\n'
    + 'A Google Workspace account has been provisioned for a new team member.\n\n'
    + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    + 'NEW HIRE ACCOUNT DETAILS\n'
    + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    + 'Name           :  ' + firstName + ' ' + lastName + '\n'
    + 'Work Email     :  ' + workEmail + '\n'
    + 'Temp Password  :  ' + tempPass + '\n\n'
    + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    + 'Employee will be prompted to change password on first login.\n'
    + 'Login URL: ' + CONFIG.LOGIN_URL + workEmail + '\n\n'
    + 'Requested by: ' + requestedBy + '\n\n'
    + '— ' + CONFIG.ORG_NAME + ' IT Team';

  GmailApp.sendEmail(managerEmail, subject, body, {
    name: CONFIG.ORG_NAME + ' IT'
  });
}


// ── Summary card ─────────────────────────────────────────────────

function buildOnboardSummaryCard(firstName, lastName, workEmail, managerEmail,
                                  tempPass, orgUnit, steps, errors, requestedBy) {
  var allOk = errors.length === 0;
  return {
    cardsV2: [{
      cardId: 'onboard_summary',
      card: {
        header: {
          title   : allOk ? '✅ Onboarding Complete' : '⚠️ Onboarding Complete with Warnings',
          subtitle: firstName + ' ' + lastName,
        },
        sections: [
          {
            header : 'Account Details',
            widgets: [
              kvWidget('Work Email',       workEmail),
              kvWidget('Temp Password',    tempPass + '  (changes on first login)'),
              kvWidget('Org Unit',         orgUnit),
              kvWidget('Manager Notified', managerEmail),
              kvWidget('Requested By',     requestedBy),
              kvWidget('Timestamp',        new Date().toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE })),
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

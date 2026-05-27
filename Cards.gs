// ================================================================
// Cards.gs — Card & Widget Builder Helpers
// ================================================================

// ── Dropdowns ────────────────────────────────────────────────────

/** OU dropdown — populated live from Admin SDK on each form load. */
function buildOrgUnitDropdown() {
  var units = fetchOrgUnits();
  return {
    selectionInput: {
      label: 'Organizational Unit',
      name : 'orgUnitPath',
      type : 'DROPDOWN',
      items: units.map(function (ou, idx) {
        return { text: ou.label, value: ou.path, selected: idx === 0 };
      })
    }
  };
}

/** License dropdown — populated from CONFIG.LICENSES (set in setup()). */
function buildLicenseDropdown() {
  return {
    selectionInput: {
      label: 'License',
      name : 'licenseSkuId',
      type : 'DROPDOWN',
      items: CONFIG.LICENSES.map(function (lic, idx) {
        return { text: lic.label, value: lic.skuId, selected: idx === 0 };
      })
    }
  };
}

/** Returns the human-readable label for a SKU ID. */
function getLicenseLabel(skuId) {
  var match = CONFIG.LICENSES.filter(function (l) { return l.skuId === skuId; })[0];
  return match ? match.label : skuId;
}


// ── Primitive widgets ─────────────────────────────────────────────

function textInput(label, name, value, hint) {
  return { textInput: { label: label, name: name, value: value || '', hintText: hint || '', type: 'SINGLE_LINE' } };
}

function kvWidget(topLabel, content) {
  return { decoratedText: { topLabel: topLabel, text: String(content) } };
}

function actionButton(text, fn, parameters, color) {
  var btn = {
    text   : text,
    onClick: { action: { function: fn, parameters: parameters || [] } }
  };
  if (color) btn.color = color;
  return btn;
}

/** Wraps a cardsV2 response so it replaces the original interactive card. */
function updateCard(cardResponse) {
  return Object.assign({ actionResponse: { type: 'UPDATE_MESSAGE' } }, cardResponse);
}

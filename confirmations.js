// --- CONFIRMACIONES ("Los niños ya están conmigo") -----------
// Registro verificable de recepción, ya sea en un día de cambio de
// custodia o al terminar una salida temporal. Una fila por
// confirmación (no se sobrescribe), así queda historial real.

async function recordCustodyConfirmation(contextType, relatedId, childIds) {
  if (!FAMILY_ID || !USER) return { error: { message: 'Sin sesión activa' } };
  var { data, error } = await supa.from('custody_confirmations').insert({
    family_id:         FAMILY_ID,
    confirmed_by:      USER.id,
    confirmed_by_role: myRole(),
    child_ids:         childIds || [],
    context_type:      contextType,
    related_event_id:  relatedId || null
  }).select().single();
  if (error) return { error: error };
  var row = toCamel(data);
  custodyConfirmations.push(row);
  return { data: row };
}

function custodyDayConfirmation(dateStr) {
  return (custodyConfirmations || []).find(function(c) {
    return c.contextType === 'custody_day' && (c.confirmedAt || '').slice(0, 10) === dateStr;
  });
}

function outingConfirmation(outingId) {
  return (custodyConfirmations || []).find(function(c) {
    return c.contextType === 'outing' && c.relatedEventId === outingId;
  });
}

function _confirmationLabel(c) {
  if (!c) return '';
  var who = c.confirmedByRole === 'p1' ? p1() : p2();
  var time = c.confirmedAt ? new Date(c.confirmedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
  return '✓ ' + who + ' confirmó' + (time ? ' · ' + time : '');
}

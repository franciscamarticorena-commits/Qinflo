// --- PLANES (modelo centralizado) -----------------------------
// Fuente única de verdad para qué incluye cada plan (features, limits,
// flags), leída desde public.plans / public.subscriptions. Esta primera
// etapa SOLO carga el plan de la familia y expone helpers de consulta --
// nada en la app usa todavía estos helpers para restringir nada. Eso es
// la segunda etapa.

async function loadFamilyPlan() {
  if (!FAMILY_ID) return;
  var planRow = null;

  var { data: sub } = await supa.from('subscriptions')
    .select('status, plans(slug, name, price_clp, objective, features, limits, flags)')
    .eq('family_id', FAMILY_ID)
    .eq('status', 'active')
    .maybeSingle();
  if (sub && sub.plans) planRow = sub.plans;

  if (!planRow) {
    var { data: fallback } = await supa.from('plans')
      .select('slug, name, price_clp, objective, features, limits, flags')
      .eq('slug', 'esencial')
      .maybeSingle();
    planRow = fallback || null;
  }

  FAMILY_PLAN = planRow;
  FAMILY_PLAN_SLUG = planRow ? planRow.slug : 'esencial';
}

// Helpers de consulta -- listos para la segunda etapa (restricciones).
function planHasFeature(key) {
  return !!(FAMILY_PLAN && FAMILY_PLAN.features && FAMILY_PLAN.features[key]);
}
function planFeatureValue(key) {
  return FAMILY_PLAN && FAMILY_PLAN.features ? FAMILY_PLAN.features[key] : undefined;
}
function planLimit(key) {
  return FAMILY_PLAN && FAMILY_PLAN.limits ? FAMILY_PLAN.limits[key] : undefined;
}
function planFlag(key) {
  return FAMILY_PLAN && FAMILY_PLAN.flags ? FAMILY_PLAN.flags[key] : undefined;
}

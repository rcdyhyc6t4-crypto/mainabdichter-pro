function ceil(value) {
  return Math.ceil(Number.isFinite(value) ? value : 0);
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resinBasePrice(settings, length) {
  const cfg = settings.resinPriceList;
  const meters = num(length);
  const keys = Object.keys(cfg.tiers).map(Number).sort((a, b) => a - b);
  for (const key of keys) {
    if (meters <= key) return num(cfg.tiers[String(key)]);
  }
  return num(cfg.tiers[String(cfg.threshold)]) + Math.max(0, meters - num(cfg.threshold)) * num(cfg.additionalPerMeter);
}

function workHours(settings, holes) {
  if (holes <= 0) return 0;
  return holes / Math.max(1, num(settings.drillRate))
    + holes / Math.max(1, num(settings.fillRate))
    + holes / Math.max(1, num(settings.closeRate))
    + num(settings.setupHours);
}

export function calculateMeasure(settings, measure) {
  const type = measure.type;
  const wall = num(measure.wall) || 30;
  const spacing = [0.125, 0.25].includes(num(measure.spacing)) ? num(measure.spacing) : 0.25;
  const reserveFactor = 1 + num(settings.reservePct) / 100;

  let holes = 0;
  let rawLiters = 0;
  let saleLiters = 0;
  let materialCostNet = 0;
  let gross = 0;
  let quantity = 0;
  let unitName = "lfm";
  let scope = "";
  let eligibleHorizontalMeters = 0;

  if (type === "Horizontalsperre") {
    quantity = num(measure.length);
    eligibleHorizontalMeters = quantity;
    holes = ceil(quantity / spacing);
    rawLiters = holes * wall * 14 / 1000;
    saleLiters = ceil(rawLiters * reserveFactor);
    materialCostNet = saleLiters * num(settings.hzPurchaseNet);
    gross = saleLiters * num(settings.hzSaleNet) * 1.19;
    scope = `${quantity.toLocaleString("de-DE")} lfm`;
  }

  if (type === "Flächensperre") {
    const width = num(measure.width);
    const height = num(measure.height);
    quantity = width * height;
    unitName = "m²";
    const holesPerRow = ceil(width / spacing);
    const rows = ceil(height / 0.25);
    holes = holesPerRow * rows;
    rawLiters = holesPerRow * wall * 14 / 1000
      + Math.max(0, rows - 1) * holesPerRow * wall * 10 / 1000;
    saleLiters = ceil(rawLiters * reserveFactor);
    materialCostNet = saleLiters * num(settings.hzPurchaseNet);
    gross = saleLiters * num(settings.hzSaleNet) * 1.19;
    scope = `${width.toLocaleString("de-DE")} × ${height.toLocaleString("de-DE")} m = ${quantity.toLocaleString("de-DE")} m²`;
  }

  if (type === "Harzverpressung") {
    quantity = num(measure.length);
    const extraKg = num(measure.extraResinKg);
    gross = resinBasePrice(settings, quantity) + extraKg * num(settings.extraResinKgNet) * 1.19;
    scope = `${quantity.toLocaleString("de-DE")} lfm${extraKg > 0 ? ` + ${extraKg.toLocaleString("de-DE")} kg Mehraufwand` : ""}`;
  }

  if (type === "Wand-Sohlen-Anschluss") {
    quantity = num(measure.length);
    eligibleHorizontalMeters = quantity;
    holes = ceil(quantity / spacing);
    rawLiters = holes * wall * 14 / 1000;
    saleLiters = ceil(rawLiters * reserveFactor);
    materialCostNet = saleLiters * num(settings.hzPurchaseNet);
    gross = quantity * num(settings.wallSoleGrossPerMeter) + saleLiters * num(settings.hzSaleNet) * 1.19;
    scope = `${quantity.toLocaleString("de-DE")} lfm inkl. Horizontalsperre`;
  }

  return {
    type, quantity, unitName, scope, holes,
    rawLiters, saleLiters, materialCostNet,
    hours: workHours(settings, holes),
    gross,
    grossUnit: quantity > 0 ? gross / quantity : gross,
    eligibleHorizontalMeters
  };
}

function smallJobSurcharge(settings, horizontalMeters, baseGross) {
  const cfg = settings.smallJob;
  if (!cfg.enabled || horizontalMeters <= 0 || horizontalMeters >= num(cfg.thresholdMeters)) return 0;
  return cfg.type === "percent"
    ? baseGross * num(cfg.value) / 100
    : num(cfg.value);
}

function priceAdjustment(discount, normalGross) {
  const skontoPct = discount.skontoType === "custom"
    ? num(discount.skontoCustom)
    : discount.skontoType === "none" ? 0 : num(discount.skontoType);

  let specialAmount = 0;
  if (discount.specialType === "percent") specialAmount = normalGross * num(discount.specialValue) / 100;
  if (discount.specialType === "amount") specialAmount = num(discount.specialValue);
  specialAmount = Math.max(0, Math.min(normalGross, specialAmount));

  const offerGross = normalGross - specialAmount;
  return {
    skontoPct,
    specialAmount,
    offerGross,
    skontoGross: offerGross * (1 - skontoPct / 100)
  };
}

export function calculateOffer(settings, visit, discount) {
  const lineItems = [];
  let baseGross = 0;
  let materialCostNet = 0;
  let totalHours = 0;
  let totalHzLiters = 0;
  let horizontalMeters = 0;

  for (const area of visit.areas) {
    for (const measure of area.measures) {
      const result = calculateMeasure(settings, measure);
      baseGross += result.gross;
      materialCostNet += result.materialCostNet;
      totalHours += result.hours;
      totalHzLiters += result.saleLiters;
      horizontalMeters += result.eligibleHorizontalMeters;
      lineItems.push({
        kind: "measure",
        areaName: area.name,
        name: measure.type,
        description: measure.note || "",
        articleId: settings.articleMappings[measure.type] || "",
        quantity: result.quantity || 1,
        unitName: result.unitName,
        scope: result.scope,
        grossUnit: result.grossUnit,
        totalGross: result.gross,
        holes: result.holes,
        saleLiters: result.saleLiters,
        hours: result.hours
      });
    }
  }

  for (const extra of settings.extras.filter(item => item.active)) {
    const quantity = num(visit.extraQuantities[extra.id] || 0);
    if (quantity <= 0) continue;
    const article = settings.lexwareArticles.find(item => item.id === extra.lexwareArticleId);
    const grossUnit = num(extra.grossPrice);
    const totalGross = quantity * grossUnit;
    baseGross += totalGross;
    lineItems.push({
      kind: "extra",
      name: article?.title || extra.name,
      description: article?.description || "",
      articleId: article?.id || "",
      quantity,
      unitName: article?.unitName || extra.unit,
      grossUnit,
      totalGross
    });
  }

  const smallJob = smallJobSurcharge(settings, horizontalMeters, baseGross);
  if (smallJob > 0) {
    baseGross += smallJob;
    lineItems.push({
      kind: "smallJob",
      name: "Kleinbaustellenzuschlag",
      description: `Horizontalsperre unter ${num(settings.smallJob.thresholdMeters).toLocaleString("de-DE")} lfm`,
      articleId: settings.articleMappings.smallJob || "",
      quantity: 1,
      unitName: "pauschal",
      grossUnit: smallJob,
      totalGross: smallJob,
      hiddenToCustomer: !settings.smallJob.visibleToCustomer
    });
  }

  const adjustment = priceAdjustment(discount, baseGross);
  const contributionBeforeOtherCosts = adjustment.offerGross / 1.19 - materialCostNet;

  return {
    lineItems, baseGross, materialCostNet, totalHours, totalHzLiters,
    contributionBeforeOtherCosts,
    ...adjustment
  };
}

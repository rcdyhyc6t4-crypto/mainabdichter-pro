import { parseDecimal } from "./utils-v227.js";

const num = parseDecimal;

function ceil(value) {
  return Math.ceil(num(value));
}

function oneDecimal(value) {
  return num(value).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function upToTwoDecimals(value) {
  return num(value).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  });
}

function injectionLitersPerHole(wallCm, baseMlPerCm, spacing) {
  const baseAt25Cm = num(wallCm) * num(baseMlPerCm) / 1000;
  const spacingFactor = num(spacing) / 0.25;
  return Math.max(0.2, baseAt25Cm * spacingFactor);
}

function resinBasePrice(settings, length) {
  const cfg = settings.resinPriceList;
  const meters = num(length);
  const keys = Object.keys(cfg.tiers).map(Number).sort((a, b) => a - b);
  for (const key of keys) {
    if (meters <= key) return num(cfg.tiers[String(key)]);
  }
  return num(cfg.tiers[String(cfg.threshold)])
    + Math.max(0, meters - num(cfg.threshold)) * num(cfg.additionalPerMeter);
}

function workHours(settings, holes) {
  if (holes <= 0) return 0;
  return holes / Math.max(1, num(settings.drillRate))
    + holes / Math.max(1, num(settings.fillRate))
    + holes / Math.max(1, num(settings.closeRate))
    + num(settings.setupHours);
}

function strategyFactor(settings, pricingTier = "standard") {
  const strategy = settings.priceStrategy || {};
  if (pricingTier === "minimum") return Math.max(0, num(strategy.minimumFactor) || 0.9);
  if (pricingTier === "premium") return Math.max(0, num(strategy.premiumFactor) || 1.15);
  return Math.max(0, num(strategy.standardFactor) || 1);
}

export function calculateSurfaceBarrierPlan(earthContactHeightCm, availableWallHeightCm = 0, allowLimitedHeight = false) {
  const earthHeight = Math.max(0, num(earthContactHeightCm) / 100);
  if (earthHeight <= 0) return null;
  const firstRowHeight = 0.125;
  const rowSpacing = 0.25;
  const minimumAboveEarth = 0.15;
  const targetHeight = earthHeight + minimumAboveEarth;
  const requiredRowCount = Math.max(1, Math.ceil((targetHeight - firstRowHeight) / rowSpacing - 1e-9) + 1);
  const requiredTopRowHeight = firstRowHeight + (requiredRowCount - 1) * rowSpacing;
  const availableHeight = Math.max(0, num(availableWallHeightCm) / 100);
  const heightLimited = availableHeight > 0 && requiredTopRowHeight > availableHeight + 1e-9;
  const availableRowCount = availableHeight >= firstRowHeight
    ? Math.max(1, Math.floor((availableHeight - firstRowHeight) / rowSpacing + 1e-9) + 1)
    : 0;
  const useLimitedHeight = heightLimited && allowLimitedHeight && availableRowCount > 0;
  const rowCount = useLimitedHeight ? availableRowCount : requiredRowCount;
  const topRowHeight = firstRowHeight + (rowCount - 1) * rowSpacing;
  return {
    earthHeight,
    targetHeight,
    requiredRowCount,
    requiredTopRowHeight,
    availableHeight,
    availableRowCount,
    heightLimited,
    useLimitedHeight,
    confirmed: !heightLimited || useLimitedHeight,
    rowCount,
    topRowHeight,
    calculationHeight: rowCount * rowSpacing,
    shortfall: Math.max(0, targetHeight - topRowHeight)
  };
}

export function calculateMeasure(settings, measure) {
  const type = measure.type;
  const wall = num(measure.wall) || 30;
  const spacing = [0.125, 0.25].includes(num(measure.spacing))
    ? num(measure.spacing)
    : 0.25;
  const reserveFactor = 1 + num(settings.reservePct) / 100;

  let holes = 0;
  let rawLiters = 0;
  let saleLiters = 0;
  let hsKg = 0;
  let materialCostNet = 0;
  let gross = 0;
  let grossUnit = 0;
  let quantity = 0;
  let unitName = "lfm";
  let scope = "";
  let resinIncludedKg = 0;
  let resinTotalKg = 0;
  let resinExtraKg = 0;

  if (type === "Horizontalsperre") {
    quantity = num(measure.length);
    const holesPerMeter = 1 / spacing;
    const litersPerHole = injectionLitersPerHole(wall, 14, spacing);
    const rawLitersPerMeter = holesPerMeter * litersPerHole;
    const saleLitersPerMeter = rawLitersPerMeter * reserveFactor;

    holes = ceil(quantity / spacing);
    rawLiters = holes * litersPerHole;
    saleLiters = ceil(rawLiters * reserveFactor);

    grossUnit = saleLitersPerMeter * num(settings.hzSaleNet) * 1.19;
    gross = quantity * grossUnit;
    materialCostNet = saleLiters * num(settings.hzPurchaseNet);
    scope = `${oneDecimal(quantity)} lfm`;
  }

  if (type === "Flächensperre") {
    const width = num(measure.width);
    const height = num(measure.height);
    const excludeHorizontalBaseRow = Boolean(measure.excludeHorizontalBaseRow);
    const billableHeight = excludeHorizontalBaseRow ? Math.max(0, height - 0.25) : height;
    quantity = width * billableHeight;
    unitName = "m²";

    const holesPerRowPerMeter = 1 / spacing;
    const firstRowLitersPerHole = injectionLitersPerHole(wall, 14, spacing);
    const followingRowLitersPerHole = injectionLitersPerHole(wall, 10, spacing);
    const holesPerRow = ceil(width / spacing);
    const firstRowHeight = 0.125;
    const verticalRowSpacing = 0.25;
    const rowCount = height < firstRowHeight
      ? 0
      : Math.floor((height - firstRowHeight) / verticalRowSpacing) + 1;
    const billedRowCount = excludeHorizontalBaseRow ? Math.max(0, rowCount - 1) : rowCount;
    holes = holesPerRow * billedRowCount;
    rawLiters = excludeHorizontalBaseRow
      ? billedRowCount * holesPerRow * followingRowLitersPerHole
      : holesPerRow * firstRowLitersPerHole
        + Math.max(0, rowCount - 1) * holesPerRow * followingRowLitersPerHole;
    saleLiters = ceil(rawLiters * reserveFactor);

    const rawLitersPerMeter = excludeHorizontalBaseRow
      ? billedRowCount * holesPerRowPerMeter * followingRowLitersPerHole
      : rowCount > 0
        ? holesPerRowPerMeter * firstRowLitersPerHole
          + Math.max(0, rowCount - 1) * holesPerRowPerMeter * followingRowLitersPerHole
        : 0;
    gross = width * rawLitersPerMeter * reserveFactor * num(settings.hzSaleNet) * 1.19;
    grossUnit = quantity > 0 ? gross / quantity : 0;
    materialCostNet = saleLiters * num(settings.hzPurchaseNet);
    scope = excludeHorizontalBaseRow
      ? `${oneDecimal(width)} × ${upToTwoDecimals(billableHeight)} m = ${upToTwoDecimals(quantity)} m² oberhalb der separaten Horizontalsperre (Gesamthöhe ${oneDecimal(height)} m)`
      : `${oneDecimal(width)} × ${oneDecimal(height)} m = ${oneDecimal(quantity)} m²`;
    if (measure.surfaceHeightLimited) {
      scope += ` · Aus baulichen und ausführungstechnischen Gründen ist die vorgeschriebene Sollhöhe nicht erreichbar; Ausführung bis zur höchstmöglichen fachgerecht bohrbaren Reihe bei ${upToTwoDecimals(measure.surfaceTopRowHeight)} m über OK Fußboden (Unterschreitung der Sollhöhe: ${upToTwoDecimals(measure.surfaceShortfall)} m)`;
    }
  }

  if (type === "Harzverpressung") {
    quantity = num(measure.length);
    const configuredHolesPerMeter = num(measure.resinHolesPerMeter) || 15;
    const configuredIncludedKgPerMeter =
      num(measure.resinIncludedKgPerMeter) || 4;
    const holesPerMeter = Math.min(
      20,
      Math.max(10, configuredHolesPerMeter)
    );
    const includedKgPerMeter = Math.min(
      5,
      Math.max(3, configuredIncludedKgPerMeter)
    );
    resinIncludedKg = quantity * includedKgPerMeter;
    resinTotalKg = Math.max(0, num(measure.resinTotalKg));
    resinExtraKg = Math.max(0, resinTotalKg - resinIncludedKg);
    holes = ceil(quantity * holesPerMeter);
    gross = resinBasePrice(settings, quantity)
      + resinExtraKg * num(settings.extraResinKgNet) * 1.19;
    grossUnit = quantity > 0 ? gross / quantity : gross;
    materialCostNet = resinTotalKg * num(settings.resinPurchaseNet);
    scope = `${oneDecimal(quantity)} lfm, ${holesPerMeter} Bohrlöcher/lfm, ${includedKgPerMeter.toLocaleString("de-DE")} kg Harz/lfm enthalten${resinExtraKg > 0
      ? ` + ${resinExtraKg.toLocaleString("de-DE")} kg Mehrverbrauch`
      : ""}`;
  }

  if (type === "Wand-Sohlen-Anschluss") {
    quantity = num(measure.length);
    hsKg = quantity * num(settings.hsKgPerWallSoleMeter || 7);

    // Die erforderliche Horizontalsperre wird als eigene Maßnahme und eigene
    // Angebotsposition ergänzt. Der Wand-Sohlen-Preis enthält nur diese Leistung.
    grossUnit = num(settings.wallSoleGrossPerMeter);
    gross = quantity * grossUnit;

    const hsProduct = settings.inventory?.products?.find(
      product => product.id === "bkm-hs-sperrmoertel"
    );
    materialCostNet = hsKg * num(hsProduct?.purchaseNet);

    scope = `${oneDecimal(quantity)} lfm${measure.wallSoleHorizontalNotRequired ? " · WU-Beton, ohne Horizontalsperre" : ""}`;
  }

  return {
    type,
    quantity,
    unitName,
    scope,
    holes,
    rawLiters,
    saleLiters,
    hsKg,
    materialCostNet,
    hours: type === "Harzverpressung"
      ? quantity * num(settings.resinHoursPerMeter)
      : type === "Wand-Sohlen-Anschluss"
        ? quantity * num(settings.wallSoleHoursPerMeter)
        : workHours(settings, holes),
    resinIncludedKg,
    resinTotalKg,
    resinExtraKg,
    gross,
    grossUnit,
    pricingMode: quantity > 0 ? "unit" : "flat"
  };
}

export function expandMeasuresForArea(area) {
  const expanded = [];
  const measures = area.measures || [];
  const wuConcrete = measures.some(measure => measure.type === "Wand-Sohlen-Anschluss" && measure.wallSoleHorizontalNotRequired);
  if (wuConcrete) {
    return measures.filter(measure => !["Horizontalsperre","Flächensperre"].includes(measure.type));
  }
  const requiredWallSole = measures.filter(measure => measure.type === "Wand-Sohlen-Anschluss" && !measure.wallSoleHorizontalNotRequired);
  const surfaceMeasures = measures.filter(measure => measure.type === "Flächensperre");
  const combinedWall = requiredWallSole.length > 0 && surfaceMeasures.length > 0;

  const addMeasure = measure => {
    expanded.push(measure);
    if (measure.type !== "Wand-Sohlen-Anschluss" || measure.wallSoleHorizontalNotRequired) return;
    expanded.push({
      id: `${measure.id}-required-horizontal`,
      type: "Horizontalsperre",
      length: measure.length,
      wall: measure.wall || area.wallThickness || 30,
      spacing: measure.spacing || .25,
      note: "Technisch erforderliche Horizontalsperre zum Wand-Sohlen-Anschluss",
      confirmed: true,
      generatedFromWallSole: true,
      linkedToMeasure: measure.id
    });
  };

  if (combinedWall) {
    for (const measure of measures.filter(item => item.type === "Wand-Sohlen-Anschluss")) addMeasure(measure);
    for (const measure of surfaceMeasures) expanded.push({
      ...measure,
      excludeHorizontalBaseRow: true,
      linkedToWallSole: requiredWallSole[0]?.id || ""
    });
    for (const measure of measures.filter(item => !["Wand-Sohlen-Anschluss","Flächensperre"].includes(item.type))) addMeasure(measure);
    return expanded;
  }

  for (const measure of measures) {
    expanded.push(measure);
    if (measure.type !== "Wand-Sohlen-Anschluss" || measure.wallSoleHorizontalNotRequired) continue;
    expanded.push({
      id: `${measure.id}-required-horizontal`,
      type: "Horizontalsperre",
      length: measure.length,
      wall: measure.wall || area.wallThickness || 30,
      spacing: measure.spacing || .25,
      note: "Technisch erforderliche Horizontalsperre zum Wand-Sohlen-Anschluss",
      confirmed: true,
      generatedFromWallSole: true,
      linkedToMeasure: measure.id
    });
  }
  return expanded;
}

function determineSmallJob(settings, measureRows) {
  const cfg = settings.smallJob || {};
  if (!cfg.enabled) return null;

  const active = measureRows.filter(row => row.result.quantity > 0);
  const types = [...new Set(active.map(row => row.measure.type))];

  // Nur eine einzige Maßnahmenart. Sobald Wand-Sohle, Harz oder eine
  // Kombination vorhanden ist, wird niemals ein Kleinmengenaufschlag berechnet.
  if (types.length !== 1) return null;

  const onlyType = types[0];
  if (onlyType === "Horizontalsperre") {
    const quantity = active.reduce((sum, row) => sum + row.result.quantity, 0);
    const threshold = num(cfg.horizontalThresholdMeters || 12);
    if (quantity <= 0 || quantity >= threshold) return null;
    return { type: onlyType, quantity, threshold, unitName: "lfm" };
  }

  if (onlyType === "Flächensperre") {
    const quantity = active.reduce((sum, row) => sum + row.result.quantity, 0);
    const threshold = num(cfg.surfaceThresholdSquareMeters || 3);
    if (quantity <= 0 || quantity >= threshold) return null;
    return { type: onlyType, quantity, threshold, unitName: "m²" };
  }

  return null;
}

function surchargeAmount(settings, eligibleBaseGross) {
  const cfg = settings.smallJob || {};
  return cfg.type === "percent"
    ? eligibleBaseGross * num(cfg.value) / 100
    : num(cfg.value);
}

function priceAdjustment(discount, normalGross) {
  const skontoPct = discount.skontoType === "custom"
    ? num(discount.skontoCustom)
    : discount.skontoType === "none" ? 0 : num(discount.skontoType);

  let specialAmount = 0;
  if (discount.specialType === "percent") {
    specialAmount = normalGross * num(discount.specialValue) / 100;
  }
  if (discount.specialType === "amount") {
    specialAmount = num(discount.specialValue);
  }
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
  const measureRows = [];
  for (const area of visit.areas || []) {
    for (const measure of expandMeasuresForArea(area)) {
      measureRows.push({
        area,
        measure,
        result: calculateMeasure(settings, measure)
      });
    }
  }

  // Bei Wand-Sohle + Flächensperre derselben Wand wird die unterste Reihe nur
  // einmal als Horizontalsperre geführt. Auch die Liter-Aufrundung erfolgt für
  // die zusammengehörigen Injektionsreihen gemeinsam, damit der Materialbedarf
  // gegenüber der bisherigen Flächensperrenlogik nicht künstlich steigt.
  const reserveFactor = 1 + num(settings.reservePct) / 100;
  for (const horizontalRow of measureRows.filter(row => row.measure.generatedFromWallSole)) {
    const linkedId = horizontalRow.measure.linkedToMeasure;
    const surfaceRows = measureRows.filter(row => row.measure.linkedToWallSole === linkedId);
    if (!surfaceRows.length) continue;
    const combinedRawLiters = horizontalRow.result.rawLiters
      + surfaceRows.reduce((sum, row) => sum + row.result.rawLiters, 0);
    let remainingSaleLiters = Math.max(0, ceil(combinedRawLiters * reserveFactor) - horizontalRow.result.saleLiters);
    surfaceRows.forEach((row, index) => {
      const previousSaleLiters = row.result.saleLiters;
      const nextSaleLiters = index === surfaceRows.length - 1
        ? remainingSaleLiters
        : Math.min(remainingSaleLiters, Math.round(row.result.rawLiters * reserveFactor));
      row.result.saleLiters = nextSaleLiters;
      row.result.materialCostNet += (nextSaleLiters - previousSaleLiters) * num(settings.hzPurchaseNet);
      remainingSaleLiters -= nextSaleLiters;
    });
  }

  const smallJob = determineSmallJob(settings, measureRows);
  if (smallJob) {
    const eligible = measureRows.filter(
      row => row.measure.type === smallJob.type && row.result.quantity > 0
    );
    const eligibleBaseGross = eligible.reduce(
      (sum, row) => sum + row.result.gross, 0
    );
    const surcharge = surchargeAmount(settings, eligibleBaseGross);
    const surchargePerUnit = surcharge / Math.max(smallJob.quantity, 0.0001);

    for (const row of eligible) {
      row.result.smallJobSurcharge = surchargePerUnit * row.result.quantity;
      row.result.smallJobSurchargePerUnit = surchargePerUnit;
      row.result.grossUnit += surchargePerUnit;
      row.result.gross = row.result.quantity * row.result.grossUnit;
    }
    smallJob.amount = surcharge;
    smallJob.perUnit = surchargePerUnit;
  }

  const factor = strategyFactor(settings, discount.pricingTier || "standard");
  const lineItems = [];
  let baseGross = 0;
  let materialCostNet = 0;
  let totalHours = 0;
  let totalHzLiters = 0;
  let totalHsKg = 0;

  for (const row of measureRows) {
    const { area, measure, result } = row;
    const grossUnit = result.grossUnit * factor;
    const gross = result.gross * factor;

    baseGross += gross;
    materialCostNet += result.materialCostNet;
    totalHours += result.hours;
    totalHzLiters += result.saleLiters;
    totalHsKg += result.hsKg;

    lineItems.push({
      kind: "measure",
      areaName: area.name,
      name: measure.type,
      description: [
        measure.note || "",
        measure.surfaceSupplementalAccess === "outside"
          ? "Die von innen nicht erreichbaren Bohrlochreihen werden zur vollständigen Sollhöhe von außen hergestellt."
          : measure.surfaceSupplementalAccess === "upper-floor"
            ? "Die von innen nicht erreichbaren Bohrlochreihen werden zur vollständigen Sollhöhe aus dem darüberliegenden Geschoss hergestellt."
            : "",
        measure.surfaceHeightLimited
          ? `Aus baulichen und ausführungstechnischen Gründen ist die vorgeschriebene Sollhöhe von innen nicht erreichbar. Ausführung bis zur höchstmöglichen fachgerecht bohrbaren Reihe bei ${upToTwoDecimals(measure.surfaceTopRowHeight)} m über OK Fußboden; Unterschreitung der Sollhöhe ${upToTwoDecimals(measure.surfaceShortfall)} m.${measure.surfaceHeightResolution === "customer-declined" ? " Der Kunde hat die zusätzliche Ausführung von außen beziehungsweise aus dem darüberliegenden Geschoss abgelehnt." : ""}`
          : ""
      ].filter(Boolean).join(" "),
      articleId: settings.articleMappings[measure.type] || "",
      quantity: result.quantity || 1,
      unitName: result.unitName,
      scope: result.scope,
      grossUnit,
      standardGrossUnit: result.grossUnit,
      totalGross: gross,
      pricingMode: result.pricingMode,
      holes: result.holes,
      saleLiters: result.saleLiters,
      hsKg: result.hsKg,
      hours: result.hours,
      resinIncludedKg: result.resinIncludedKg,
      resinTotalKg: result.resinTotalKg,
      resinExtraKg: result.resinExtraKg,
      smallJobIntegrated: num(result.smallJobSurcharge) > 0,
      smallJobSurchargePerUnit: num(result.smallJobSurchargePerUnit),
      linkedToMeasure: measure.linkedToMeasure || "",
      generatedFromWallSole: Boolean(measure.generatedFromWallSole)
    });

    if (
      measure.type === "Wand-Sohlen-Anschluss" &&
      measure.disposeDebris
    ) {
      const debrisExtra = settings.extras.find(extra =>
        extra.active &&
        String(extra.name || "").toLowerCase().includes("bauschutt")
      );
      if (debrisExtra) {
        const article = settings.lexwareArticles.find(
          item => item.id === debrisExtra.lexwareArticleId
        );
        const grossUnitExtra = num(debrisExtra.grossPrice) * factor;
        baseGross += grossUnitExtra;
        lineItems.push({
          kind: "extra",
          name: article?.title || debrisExtra.name,
          description: article?.description ||
            "Aufnehmen, Abfahren und fachgerechtes Entsorgen des anfallenden mineralischen Bauschutts.",
          articleId: article?.id || "",
          quantity: 1,
          unitName: article?.unitName || debrisExtra.unit || "pauschal",
          grossUnit: grossUnitExtra,
          totalGross: grossUnitExtra,
          pricingMode: "flat",
          linkedToMeasure: measure.id
        });
      }
    }
  }

  for (const extra of settings.extras.filter(item => item.active)) {
    const quantity = num(visit.extraQuantities?.[extra.id] || 0);
    if (quantity <= 0) continue;
    const article = settings.lexwareArticles.find(
      item => item.id === extra.lexwareArticleId
    );
    const grossUnit = num(extra.grossPrice) * factor;
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
      totalGross,
      pricingMode: "flat"
    });
  }

  const adjustment = priceAdjustment(discount, baseGross);
  const contributionBeforeOtherCosts =
    adjustment.offerGross / 1.19 - materialCostNet;

  return {
    lineItems,
    baseGross,
    materialCostNet,
    totalHours,
    totalHzLiters,
    totalHsKg,
    smallJob,
    pricingTier: discount.pricingTier || "standard",
    pricingFactor: factor,
    contributionBeforeOtherCosts,
    ...adjustment
  };
}

export function calculatePriceStrategies(settings, visit, discount) {
  const tiers = ["minimum", "standard", "premium"];
  return Object.fromEntries(
    tiers.map(tier => {
      const tierDiscount = { ...discount, pricingTier: tier };
      return [tier, calculateOffer(settings, visit, tierDiscount)];
    })
  );
}

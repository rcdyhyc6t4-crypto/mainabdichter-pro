import { parseDecimal } from "./utils.js";

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

  if (type === "Horizontalsperre") {
    quantity = num(measure.length);
    const holesPerMeter = 1 / spacing;
    const rawLitersPerMeter = holesPerMeter * wall * 14 / 1000;
    const saleLitersPerMeter = rawLitersPerMeter * reserveFactor;

    holes = ceil(quantity / spacing);
    rawLiters = quantity * rawLitersPerMeter;
    saleLiters = ceil(rawLiters * reserveFactor);

    grossUnit = saleLitersPerMeter * num(settings.hzSaleNet) * 1.19;
    gross = quantity * grossUnit;
    materialCostNet = saleLiters * num(settings.hzPurchaseNet);
    scope = `${oneDecimal(quantity)} lfm`;
  }

  if (type === "Flächensperre") {
    const width = num(measure.width);
    const height = num(measure.height);
    quantity = width * height;
    unitName = "m²";

    const holesPerRowPerMeter = 1 / spacing;
    const rowsPerMeterHeight = 1 / 0.25;
    const rawLitersPerSquareMeter =
      holesPerRowPerMeter * wall * 14 / 1000
      + (rowsPerMeterHeight - 1)
        * holesPerRowPerMeter * wall * 10 / 1000;
    const saleLitersPerSquareMeter =
      rawLitersPerSquareMeter * reserveFactor;

    holes = ceil(width / spacing) * ceil(height / 0.25);
    rawLiters = quantity * rawLitersPerSquareMeter;
    saleLiters = ceil(rawLiters * reserveFactor);

    grossUnit = saleLitersPerSquareMeter * num(settings.hzSaleNet) * 1.19;
    gross = quantity * grossUnit;
    materialCostNet = saleLiters * num(settings.hzPurchaseNet);
    scope = `${oneDecimal(width)} × ${oneDecimal(height)} m = ${oneDecimal(quantity)} m²`;
  }

  if (type === "Harzverpressung") {
    quantity = num(measure.length);
    const extraKg = num(measure.extraResinKg);
    gross = resinBasePrice(settings, quantity)
      + extraKg * num(settings.extraResinKgNet) * 1.19;
    grossUnit = quantity > 0 ? gross / quantity : gross;
    scope = `${oneDecimal(quantity)} lfm${extraKg > 0
      ? ` + ${extraKg.toLocaleString("de-DE")} kg Mehraufwand`
      : ""}`;
  }

  if (type === "Wand-Sohlen-Anschluss") {
    quantity = num(measure.length);
    const holesPerMeter = 1 / spacing;
    const rawLitersPerMeter = holesPerMeter * wall * 14 / 1000;
    const saleLitersPerMeter = rawLitersPerMeter * reserveFactor;

    holes = ceil(quantity / spacing);
    rawLiters = quantity * rawLitersPerMeter;
    saleLiters = ceil(rawLiters * reserveFactor);
    hsKg = quantity * num(settings.hsKgPerWallSoleMeter || 7);

    grossUnit =
      num(settings.wallSoleGrossPerMeter)
      + saleLitersPerMeter * num(settings.hzSaleNet) * 1.19;
    gross = quantity * grossUnit;

    const hsProduct = settings.inventory?.products?.find(
      product => product.id === "bkm-hs-sperrmoertel"
    );
    materialCostNet =
      saleLiters * num(settings.hzPurchaseNet)
      + hsKg * num(hsProduct?.purchaseNet);

    scope = `${oneDecimal(quantity)} lfm inkl. Horizontalsperre`;
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
    hours: workHours(settings, holes),
    gross,
    grossUnit,
    pricingMode: quantity > 0 ? "unit" : "flat"
  };
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
    for (const measure of area.measures || []) {
      measureRows.push({
        area,
        measure,
        result: calculateMeasure(settings, measure)
      });
    }
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
      description: measure.note || "",
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
      smallJobIntegrated: num(result.smallJobSurcharge) > 0,
      smallJobSurchargePerUnit: num(result.smallJobSurchargePerUnit)
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

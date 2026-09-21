import { state } from "./storage-v227.js";
import { calculateOffer } from "./calculator-v227.js";
import { $, eur, num, esc } from "./utils-v227.js";
import { buildExecutionNotices } from "./texts-v227.js";
import { localPhotoUrl } from "./drive-photos.js?v=32.7.8";
import { getDocumentProfile, documentSenderLine } from "./document-profile.js?v=32.7.8";

function offerItemKey(item, index) {
  return [item.kind || "item", item.areaName || "", item.name || "", item.linkedToMeasure || "", index].join("|");
}

function customerItems(result) {
  const savedItems = state.visit.offerDraft?.items || {};
  const adjustmentFactor = result.baseGross > 0 ? result.offerGross / result.baseGross : 1;
  return result.lineItems.map((item, index) => {
    const saved = savedItems[offerItemKey(item, index)] || {};
    const quantity = item.pricingMode === "flat" ? 1 : Number(item.quantity || 0);
    const calculatedUnitGross = item.pricingMode === "flat"
      ? Number(item.totalGross || 0) * adjustmentFactor
      : Number(item.grossUnit || 0) * adjustmentFactor;
    const unitGross = Number.isFinite(Number(saved.unitGross)) ? Number(saved.unitGross) : calculatedUnitGross;
    return {
      ...item,
      quantity,
      unitGross,
      totalGross: quantity * unitGross,
      included: saved.included !== false
    };
  }).filter(item => item.included && !item.hiddenToCustomer);
}

function buildCustomerData() {
  const result = calculateOffer(state.settings, state.visit, state.discount);
  const items = customerItems(result);
  const articleFor = item => state.settings.lexwareArticles.find(candidate => candidate.id === item.articleId);
  const normalize = item => {
    const article = articleFor(item);
    return {
      areaName: item.areaName || "",
      title: article?.title || item.name,
      description: article?.description || item.description || "",
      quantity: item.quantity,
      unitName: item.pricingMode === "flat" ? (article?.unitName || item.unitName || "pauschal") : (article?.unitName || item.unitName || ""),
      totalGross: item.totalGross
    };
  };
  const measures = items.filter(item => item.kind === "measure").map(normalize);
  const extras = items.filter(item => item.kind !== "measure").map(normalize);
  const offerGross = items.reduce((sum, item) => sum + item.totalGross, 0);
  const photos = (state.visit.areas || []).flatMap(area =>
    (area.photos || [])
      .filter(photo => photo.show !== false)
      .map(photo => ({
        areaName: area.name,
        src: localPhotoUrl(photo),
        caption: photo.caption
      }))
      .filter(photo => typeof photo.src === "string" && photo.src.trim())
  );
  const customer = state.visit.customer || {};
  return {
    customerName: [customer.salutation, customer.firstName, customer.lastName].filter(Boolean).join(" "),
    company: customer.company || "",
    postalAddress: [customer.street, [customer.zip, customer.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    address: customer.objectAddress || [customer.street, customer.zip, customer.city].filter(Boolean).join(", "),
    date: state.visit.visitDate || new Date().toISOString().slice(0, 10),
    visitNumber: state.visit.visitNumber || "–",
    recommendation: state.visit.customerRecommendation || "–",
    measures, extras, photos,
    normalGross: offerGross + Number(result.specialAmount || 0),
    specialLabel: state.discount.specialLabel || "Sonderaktion",
    specialAmount: Number(result.specialAmount || 0),
    offerGross,
    skontoPct: result.skontoPct,
    skontoGross: offerGross * (1 - Number(result.skontoPct || 0) / 100),
    notices: buildExecutionNotices(state.settings, state.visit)
  };
}

function itemHtml(item) {
  return `<div class="offer-row" role="row">
    <div class="offer-cell">
      <strong class="offer-title">${esc(item.title)}</strong>
      ${item.areaName ? `<span class="offer-area">${esc(item.areaName)}</span>` : ""}
      ${item.description ? `<span class="offer-description">${esc(item.description)}</span>` : ""}
    </div>
    <div class="offer-cell">${num(item.quantity)} ${esc(item.unitName)}</div>
    <div class="offer-cell amount">${eur(item.totalGross)}</div>
  </div>`;
}

try {
  const data = buildCustomerData();
  const profile = getDocumentProfile(state.settings);
  $("cDocumentLogo").src = profile.logoDataUrl || "assets/mainabdichter-header-logo.png";
  $("cDocumentSubtitle").textContent = profile.documentSubtitle;
  $("cSenderLine").textContent = documentSenderLine(profile);
  $("cFooterBusiness").textContent = [profile.businessName, profile.ownerName].filter(Boolean).join(" · ");
  $("cFooterStreet").textContent = profile.street;
  $("cFooterCity").textContent = [profile.zip, profile.city].filter(Boolean).join(" ");
  $("cFooterRegionalOfficeLabel").textContent = profile.regionalOfficeLabel || "Regionalbüro";
  $("cFooterRegionalOfficeStreet").textContent = profile.regionalOfficeStreet;
  $("cFooterRegionalOfficeCity").textContent = [
    profile.regionalOfficeZip,
    profile.regionalOfficeCity
  ].filter(Boolean).join(" ");
  $("cFooterPhone").textContent = profile.phone ? `Tel. ${profile.phone}` : "";
  $("cFooterEmail").textContent = profile.email;
  $("cFooterWebsite").textContent = profile.website;
  $("cFooterBank").textContent = ["Bankverbindung", profile.bankName].filter(Boolean).join(" · ");
  $("cFooterIban").textContent = profile.iban ? `IBAN ${profile.iban}` : "";
  $("cFooterBic").textContent = profile.bic ? `BIC ${profile.bic}` : "";
  $("cFooterTrade").textContent = profile.tradeLine;
  $("cFooterVat").textContent = profile.vatId ? `USt-IdNr. ${profile.vatId}` : "";
  $("cFooterTaxNumber").textContent = profile.taxNumber
    ? `Steuernummer ${profile.taxNumber}`
    : "";
  $("cName").textContent = [data.customerName, data.company].filter(Boolean).join(" – ") || "–";
  $("cPostalAddress").textContent = data.postalAddress || "–";
  $("cAddress").textContent = data.address || "–";
  $("cDate").textContent = data.date.split("-").reverse().join(".");
  $("cNumber").textContent = data.visitNumber;
  $("cRecommendation").textContent = data.recommendation;
  $("cMeasures").innerHTML = data.measures.map(itemHtml).join("");
  $("cExtras").innerHTML = data.extras.map(itemHtml).join("");

  if (data.specialAmount > 0) {
    $("cNormalRow").classList.remove("hidden");
    $("cSpecialRow").classList.remove("hidden");
    $("cNormal").textContent = eur(data.normalGross);
    $("cSpecialLabel").textContent = data.specialLabel;
    $("cSpecial").textContent = "− " + eur(data.specialAmount);
  }
  $("cOffer").textContent = eur(data.offerGross);

  if (data.skontoPct > 0) {
    $("cSkontoRow").classList.remove("hidden");
    $("cSkontoLabel").textContent = `${num(data.skontoPct)} % Skonto bei Zahlung innerhalb von 3 Werktagen`;
    $("cSkonto").textContent = eur(data.skontoGross);
  }

  if (data.notices.length) {
    $("cNoticesSection").classList.remove("hidden");
    $("cNotices").innerHTML = data.notices.map(notice => `
      <article class="customer-notice-card">
        <h3>${esc(notice.title)}</h3>
        <div class="notice-flowtext">${esc(notice.text)}</div>
      </article>`).join("");
  }

  $("cPhotos").innerHTML = data.photos.map(photo => `
    <div class="photo-card" hidden>
      <img src="${esc(photo.src)}" alt="" loading="lazy">
      <strong>${esc(photo.areaName)}</strong>
      ${photo.caption ? `<p>${esc(photo.caption)}</p>` : ""}
    </div>`).join("");
  $("cPhotos").querySelectorAll(".photo-card img").forEach(image => {
    image.addEventListener("load", () => {
      image.closest(".photo-card").hidden = false;
    }, { once: true });
    image.addEventListener("error", () => {
      image.closest(".photo-card").remove();
    }, { once: true });
  });
} catch (error) {
  $("document").innerHTML = `<h1>Kundenansicht konnte nicht geladen werden</h1><p>${esc(error.message)}</p>`;
}

$("print").onclick = () => window.print();
$("close").onclick = () => window.history.length > 1 ? window.history.back() : window.location.assign("./index.html");

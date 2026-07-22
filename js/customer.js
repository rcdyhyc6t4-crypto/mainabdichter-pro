import { state } from "./storage.js";
import { calculateOffer } from "./calculator.js";
import { $, eur, num, esc } from "./utils.js";
import { buildExecutionNotices } from "./texts.js";

function buildCustomerData() {
  const result = calculateOffer(
    state.settings,
    state.visit,
    state.discount
  );

  const measures = result.lineItems
    .filter(item => item.kind === "measure")
    .map(item => {
      const article = state.settings.lexwareArticles.find(
        candidate => candidate.id === item.articleId
      );

      return {
        areaName: item.areaName,
        title: article?.title || item.name,
        description:
          article?.description || item.description || "",
        scope: item.scope
      };
    });

  const extras = result.lineItems
    .filter(
      item =>
        item.kind !== "measure" &&
        !item.hiddenToCustomer
    )
    .map(item => {
      const article = state.settings.lexwareArticles.find(
        candidate => candidate.id === item.articleId
      );

      return {
        title: article?.title || item.name,
        description:
          article?.description || item.description || "",
        quantity: item.quantity,
        unitName: article?.unitName || item.unitName
      };
    });

  const photos = state.visit.areas.flatMap(area =>
    area.photos
      .filter(photo => photo.show)
      .map(photo => ({
        areaName: area.name,
        src: photo.src,
        caption: photo.caption
      }))
  );

  return {
    customerName: [
      state.visit.customer.salutation,
      state.visit.customer.firstName,
      state.visit.customer.lastName
    ].filter(Boolean).join(" "),
    company: state.visit.customer.company,
    address:
      state.visit.customer.objectAddress ||
      [
        state.visit.customer.street,
        state.visit.customer.zip,
        state.visit.customer.city
      ].filter(Boolean).join(", "),
    recommendation:
      state.visit.customerRecommendation ||
      "–",
    measures,
    extras,
    photos,
    normalGross: result.baseGross,
    specialLabel:
      state.discount.specialLabel || "Sonderaktion",
    specialAmount: result.specialAmount,
    offerGross: result.offerGross,
    skontoPct: result.skontoPct,
    skontoGross: result.skontoGross,
    notices: buildExecutionNotices(state.settings, state.visit)
  };
}

try {
  const data = buildCustomerData();

  $("cName").textContent =
    [data.customerName, data.company]
      .filter(Boolean)
      .join(" – ") || "–";

  $("cAddress").textContent = data.address || "–";
  $("cRecommendation").textContent =
    data.recommendation || "–";

  $("cMeasures").innerHTML = data.measures
    .map(
      item => `
        <div class="result">
          <strong>
            ${esc(item.areaName)} – ${esc(item.title)}
          </strong>
          ${
            item.description
              ? `<div class="article-description">${esc(item.description)}</div>`
              : ""
          }
          <div class="metric">
            <span>Umfang</span>
            <strong>${esc(item.scope)}</strong>
          </div>
        </div>
      `
    )
    .join("");

  $("cExtras").innerHTML = data.extras
    .map(
      item => `
        <div class="result">
          <strong>${esc(item.title)}</strong>
          ${
            item.description
              ? `<div class="article-description">${esc(item.description)}</div>`
              : ""
          }
          <div class="metric">
            <span>Menge</span>
            <strong>
              ${num(item.quantity)} ${esc(item.unitName)}
            </strong>
          </div>
        </div>
      `
    )
    .join("");

  if (data.specialAmount > 0) {
    $("cNormalRow").classList.remove("hidden");
    $("cSpecialRow").classList.remove("hidden");
    $("cNormal").textContent = eur(data.normalGross);
    $("cSpecialLabel").textContent = data.specialLabel;
    $("cSpecial").textContent =
      "− " + eur(data.specialAmount);
  }

  $("cOffer").textContent = eur(data.offerGross);

  if (data.skontoPct > 0) {
    $("cSkontoRow").classList.remove("hidden");
    $("cSkontoLabel").textContent =
      `${num(data.skontoPct)} % Skonto bei Zahlung ` +
      "innerhalb von 3 Werktagen";
    $("cSkonto").textContent = eur(data.skontoGross);
  }

  if (data.notices.length) {
    $("cNoticesSection").classList.remove("hidden");
    $("cNotices").innerHTML = data.notices.map(notice => `
      <article class="customer-notice-card">
        <h3>${esc(notice.title)}</h3>
        <div class="notice-flowtext">${esc(notice.text)}</div>
      </article>
    `).join("");
  }

  $("cPhotos").innerHTML = data.photos
    .map(
      photo => `
        <div class="photo-card">
          <img src="${photo.src}" alt="">
          <strong>${esc(photo.areaName)}</strong>
          ${
            photo.caption
              ? `<p>${esc(photo.caption)}</p>`
              : ""
          }
        </div>
      `
    )
    .join("");
} catch (error) {
  $("document").innerHTML = `
    <h1>Kundenansicht konnte nicht geladen werden</h1>
    <p>${esc(error.message)}</p>
  `;
}

$("print").onclick = () => window.print();

$("close").onclick = () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.assign("./index.html");
  }
};

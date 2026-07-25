export const DEFAULT_DOCUMENT_PROFILE = Object.freeze({
  businessName: "mainabdichter",
  ownerName: "Mike Sprager",
  street: "Zum Tannengarten 10",
  zip: "35794",
  city: "Mengerskirchen",
  regionalOfficeLabel: "Regionalbüro Friedrichsdorf",
  regionalOfficeStreet: "Bahnstraße 34",
  regionalOfficeZip: "61381",
  regionalOfficeCity: "Friedrichsdorf",
  phone: "+49 (0) 6476 736 939-0",
  email: "info@mainabdichter.de",
  website: "www.mainabdichter.de",
  bankName: "N26",
  iban: "DE19 1001 1001 2620 0531 83",
  bic: "NTSBDEB1XXX",
  vatId: "DE228953591",
  taxNumber: "03887060428",
  tradeLine: "BKM.MANNESMANN Fachbetrieb",
  serviceLine: "Abdichtung feuchter Keller und Wände",
  tagline: "Nachhaltig. Sicher. Trocken.",
  documentSubtitle: "Bauwerksabdichtung im Bestand",
  logoDataUrl: ""
});

export function getDocumentProfile(settings = {}) {
  const saved = settings.documentProfile && typeof settings.documentProfile === "object"
    ? settings.documentProfile
    : {};
  return { ...DEFAULT_DOCUMENT_PROFILE, ...saved };
}

export function documentProfileAddress(profile) {
  return [profile.street, [profile.zip, profile.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
}

export function documentRegionalOfficeAddress(profile) {
  return [
    profile.regionalOfficeStreet,
    [profile.regionalOfficeZip, profile.regionalOfficeCity].filter(Boolean).join(" ")
  ].filter(Boolean).join(" · ");
}

export function documentSenderLine(profile) {
  return [profile.businessName, profile.tradeLine].filter(Boolean).join(" · ");
}

export function documentFooterColumns(settings = {}) {
  const profile = getDocumentProfile(settings);
  return [
    [
      [profile.businessName, profile.ownerName].filter(Boolean).join(" · "),
      profile.street,
      [profile.zip, profile.city].filter(Boolean).join(" ")
    ],
    [
      profile.regionalOfficeLabel || "Regionalbüro",
      profile.regionalOfficeStreet,
      [profile.regionalOfficeZip, profile.regionalOfficeCity].filter(Boolean).join(" ")
    ],
    [
      profile.phone ? `Tel. ${profile.phone}` : "",
      profile.email,
      profile.website
    ],
    [
      ["Bankverbindung", profile.bankName].filter(Boolean).join(" · "),
      profile.iban ? `IBAN ${profile.iban}` : "",
      profile.bic ? `BIC ${profile.bic}` : ""
    ],
    [
      profile.tradeLine,
      profile.vatId ? `USt-IdNr. ${profile.vatId}` : "",
      profile.taxNumber ? `Steuernummer ${profile.taxNumber}` : ""
    ]
  ].map(column => column.filter(Boolean));
}

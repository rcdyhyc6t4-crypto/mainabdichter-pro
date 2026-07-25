export const DEFAULT_DOCUMENT_IDENTITY = Object.freeze({
  companyName: "mainabdichter",
  ownerName: "Mike Sprager",
  documentSubtitle: "Bauwerksabdichtung im Bestand",
  headquartersStreet: "Zum Tannengarten 10",
  headquartersZip: "35794",
  headquartersCity: "Mengerskirchen",
  regionalOfficeName: "Regionalbüro Friedrichsdorf",
  regionalOfficeStreet: "Bahnstraße 34",
  regionalOfficeZip: "61381",
  regionalOfficeCity: "Friedrichsdorf",
  phone: "+49 (0) 6476 736 939-0",
  email: "info@mainabdichter.de",
  website: "www.mainabdichter.de",
  bankName: "N26",
  iban: "DE19 1001 1001 2620 0531 83",
  bic: "NTSBDEB1XXX",
  specialistLabel: "BKM.MANNESMANN Fachbetrieb",
  vatId: "DE228953591",
  taxNumber: "03887060428"
});

export function getDocumentIdentity(settings = {}) {
  return { ...DEFAULT_DOCUMENT_IDENTITY, ...(settings.documentIdentity || {}) };
}

export function documentFooterColumns(settings = {}) {
  const data = getDocumentIdentity(settings);
  return [
    [
      [data.companyName, data.ownerName].filter(Boolean).join(" · "),
      data.headquartersStreet,
      [data.headquartersZip, data.headquartersCity].filter(Boolean).join(" ")
    ],
    [
      data.regionalOfficeName,
      data.regionalOfficeStreet,
      [data.regionalOfficeZip, data.regionalOfficeCity].filter(Boolean).join(" ")
    ],
    [
      data.phone ? `Tel. ${data.phone}` : "",
      data.email,
      data.website
    ],
    [
      ["Bankverbindung", data.bankName].filter(Boolean).join(" · "),
      data.iban ? `IBAN ${data.iban}` : "",
      data.bic ? `BIC ${data.bic}` : ""
    ],
    [
      data.specialistLabel,
      data.vatId ? `USt-IdNr. ${data.vatId}` : "",
      data.taxNumber ? `St-Nr. ${data.taxNumber}` : ""
    ]
  ].map(column => column.filter(Boolean));
}

export const DEFAULTS = {
  settings: {
    priceListName: "mainabdichter Kalkulationsbasis",
    priceListDate: "2026-07-01",
    hzPurchaseNet: 30,
    hzSaleNet: 98,
    reservePct: 10,
    drillRate: 60,
    fillRate: 60,
    closeRate: 40,
    setupHours: 1,
    wallSoleHoursPerMeter: 0.4,
    resinHoursPerMeter: 0,
    wallSoleGrossPerMeter: 300,
    extraResinKgNet: 98,
    hsKgPerWallSoleMeter: 7,
    priceStrategy: {
      minimumFactor: 0.90,
      standardFactor: 1.00,
      premiumFactor: 1.15
    },
    smallJob: {
      enabled: true,
      horizontalThresholdMeters: 12,
      surfaceThresholdSquareMeters: 3,
      type: "amount",
      value: 250
    },
    inventory: {
      products: [
        {
          id: "bkm-hz-250-pro",
          name: "BKM HZ 250 Pro",
          unit: "Liter",
          stock: 0,
          minimumStock: 20,
          packageSize: 10,
          purchaseNet: 30,
          active: true
        },
        {
          id: "bkm-hs-sperrmoertel",
          name: "BKM HS Sperrmörtel",
          unit: "kg",
          stock: 0,
          minimumStock: 50,
          packageSize: 25,
          purchaseNet: 0,
          active: true
        }
      ],
      transactions: []
    },
    resinPriceList: {
      tiers: {
        "2": 1180, "3": 1750, "4": 2310, "5": 2860,
        "6": 3400, "7": 3930, "8": 4450, "9": 4960, "10": 5460
      },
      threshold: 10,
      additionalPerMeter: 495
    },
    extras: [
      { id: crypto.randomUUID(), name: "Baustelleneinrichtung", unit: "pauschal", grossPrice: 320.11, active: true, lexwareArticleId: "" },
      { id: crypto.randomUUID(), name: "Sauberkeitspaket", unit: "pauschal", grossPrice: 0, active: true, lexwareArticleId: "" },
      { id: crypto.randomUUID(), name: "Bauschutt entsorgen", unit: "pauschal", grossPrice: 0, active: true, lexwareArticleId: "" }
    ],
    articleMappings: {
      Horizontalsperre: "",
      Flächensperre: "",
      Harzverpressung: "",
      "Wand-Sohlen-Anschluss": "",
      smallJob: ""
    },
    lexwareArticles: [],
    offerTexts: {
      introduction: `{{ANREDE}},

auf Grundlage unserer Ortsbesichtigung und der durchgeführten Schadenanalyse am Objekt {{OBJEKTANSCHRIFT}} erhalten Sie nachfolgend unser Angebot über die mit Ihnen abgestimmten Abdichtungsmaßnahmen.

Das Angebot basiert auf den zum Zeitpunkt der Besichtigung erkennbaren Schadensmerkmalen, den vor Ort festgestellten Gegebenheiten sowie den gemeinsam abgestimmten technischen Anforderungen. Es umfasst ausschließlich die besprochenen und im Aufmaß gekennzeichneten Wand- beziehungsweise Bauteilbereiche. Nach Abschluss der Arbeiten kann die Situation gemeinsam bewertet und bei Bedarf über weitere Maßnahmen entschieden werden.

Für die Ausführung verwenden wir aufeinander abgestimmte Abdichtungssysteme aus dem Hause BKM.MANNESMANN, die speziell für die Sanierung von feuchtem Mauerwerk entwickelt wurden.

Ihre Vorteile:
– Aufeinander abgestimmtes Produktsystem für eine technisch sichere und nachhaltige Ausführung
– Jahrzehntelange europaweite Erfahrung in der Bauwerksabdichtung und Mauertrocknung
– Attraktives Preis-Leistungs-Verhältnis
– Schnelle, saubere und zuverlässige Ausführung
– Praxiserprobte Produkte für die Bauwerksabdichtung
{{HZ_VOC_VORTEIL}}

Die Auswahl des Abdichtungssystems erfolgt passend zur festgestellten Schadenssituation und zu den technischen Anforderungen des jeweiligen Bauteils.`
    },
    noticeTexts: {
      standard: "Feuchteschäden können mehrere Ursachen haben. Die Bearbeitung erfolgt deshalb im Ausschlussverfahren nach dem bei der Besichtigung sicht- und messbaren Schadensbild. Nach angemessener Standzeit wird die Wirkung bewertet. Später erkennbare Fehlstellen, etwa Risse oder Kiesnester, und daraus folgende Zusatzmaßnahmen sind nicht enthalten und werden gesondert abgestimmt, beauftragt und abgerechnet.\n\nDie Maßnahme betrifft nur die beschriebenen und im Aufmaß gekennzeichneten Bauteilbereiche. Soweit nicht ausdrücklich angeboten, sind Feuchteeintritte durch drückendes oder eindringendes Wasser, Risse, undichte Boden-Wand-Anschlüsse, mangelhafte Durchführungen sowie eine Über- oder Unterwanderung der Abdichtung ausgeschlossen. Erforderliche Harzverpressungen werden mit 98,00 € brutto je tatsächlich eingesetztem Packer abgerechnet.\n\nEin nach der Austrocknung erforderlicher Austausch salzbelasteter Putze ist nicht enthalten. Dies gilt auch für Schäden durch Hochwasser, Starkregen oder Überflutung außerhalb des vereinbarten Leistungsumfangs.\n\nGrundlage ist die jeweils gültige BKM.MANNESMANN-Richtlinie für Flächen- beziehungsweise Horizontalsperren mit flüssigen Injektionsmitteln. Im Übrigen gelten die gesetzlichen Vorschriften des BGB.",
      wallSole: "Wand-Sohlen-Anschluss: Enthalten sind das Öffnen des Estrichs auf ca. 15–20 cm Breite bis zur Bodenplatte, Reinigung, Dichtkehle, Dichtmörtel bis mindestens 15 cm über eine vorhandene Sperrbahn sowie eine Horizontalsperre mit BKM HZ 250 PRO. Die Ausführung erfolgt im Ausschlussverfahren. Eine erst nach angemessener Standzeit erkennbare Harzverpressung wird im notwendigen Umfang gesondert beauftragt und abgerechnet.",
      resin: "Harzverpressung: Erfasst werden nur die bei Ausführung festgestellten und zugänglichen Fehlstellen. Später erkennbare weitere Fehlstellen und erforderliche Ergänzungen werden gesondert abgestimmt, beauftragt und abgerechnet."
    },
    pipedriveSync: {
      autoSync: true,
      fields: [],
      stages: [],
      fieldMappings: {},
      stageMappings: {},
      log: []
    },
    workerUrl: "https://mainabdichter-lexoffice.cmww7htry5.workers.dev",
    appSecret: ""
  },
  visit: {
    customer: {
      salutation: "", firstName: "", lastName: "", company: "",
      phone: "", email: "", street: "", zip: "", city: "",
      objectAddress: "", pipedriveId: "", pipedriveDealId: "", lexwareContactId: ""
    },
    building: {
      yearBuilt: "", buildingType: "", floor: "", roomUse: "",
      foundationType: "", floorCover: "", climateMeasured: false,
      roomTemp: "", humidity: "", surfaceTemp: "", dewPoint: ""
    },
    visitDate: new Date().toISOString().slice(0, 10),
    visitStartTime: new Date().toTimeString().slice(0, 5),
    visitEndTime: "",
    visitNumber: "",
    visitLatitude: "",
    visitLongitude: "",
    visitAccuracy: "",
    visitWeather: "",
    visitOutdoorTemp: "",
    visitPrecipitation: "",
    damageDescription: "",
    inquiry: {
      source: "", ownerStatus: "", appointment: "", message: "",
      rawText: "", screenshot: "", importedAt: "", concern: "",
      symptoms: [], urgency: "normal", appointmentStatus: "open",
      appointmentDate: "", appointmentTime: "", updatedAt: ""
    },
    customerRecommendation: "",
    recordContext: {loaded:false,loadedAt:"",deal:null,person:null,notes:[],activities:[],files:[],relatedDeals:[],lexwareContact:null,lexwareDocuments:[],localVisits:[],localWorksites:[],caseType:"",error:""},
    inventoryDeducted: false,
    inventoryDeductedAt: "",
    offerDraft: { items: {}, approved: false, approvedAt: "" },
    areas: [],
    extraQuantities: {}
  },
  discount: {
    pricingTier: "standard",
    skontoType: "none",
    skontoCustom: 0,
    specialType: "none",
    specialValue: 0,
    specialLabel: "Sonderaktion"
  }
};

export function createArea(name = "") {
  return {id:crypto.randomUUID(),name,wallMaterial:"",wallMaterialOther:"",wallThickness:"",wallType:"",earthContact:"",wallCover:"",access:"",notes:"",dryReference:"",measurementRemark:"",measurements:[],measures:[],photos:[]};
}

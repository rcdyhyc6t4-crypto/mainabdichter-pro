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
    noticeTexts: {
      standard: "Feuchteschäden können unterschiedliche Ursachen und Folgeschäden aufweisen. Die Bearbeitung erfolgt daher im Ausschlussverfahren. Es werden zunächst die sichtbaren und messbaren Schadensursachen bearbeitet. Nach einer angemessenen Standzeit wird das Bauwerk erneut überprüft. Weitere Maßnahmen erfolgen nur nach gesonderter Feststellung und Abstimmung mit dem Auftraggeber. Werden infolge des Schadensbildes nach der Injektion zusätzliche Fehlstellen, zum Beispiel Risse oder Kiesnester, sichtbar, sind ergänzende Maßnahmen, zum Beispiel eine Harzverpressung, gesondert zu beauftragen und abzurechnen.\n\nDie angebotene Abdichtungsmaßnahme dient ausschließlich der Unterbindung des kapillaren Feuchtetransports im Bauteil. Nicht Bestandteil des Angebots sind Schäden oder Feuchteeintritte infolge von drückendem Wasser, Rissen im Mauerwerk oder Putz, Undichtigkeiten im Boden-Wand-Anschluss, mangelhaften Wanddurchführungen oder vergleichbaren Fremdeinflüssen.\n\nMaßnahmen gegen drückendes Wasser beziehungsweise eindringendes Wasser sind nicht enthalten und werden, soweit erforderlich, gesondert berechnet (98,00 € brutto je Packer). Maßnahmen gegen eine Über- oder Unterwanderung der Abdichtung sind ebenfalls nicht enthalten. Hierfür können ergänzende Abdichtungsmaßnahmen, zum Beispiel eine Erweiterung der Horizontalsperre oder Flächensperre, erforderlich werden.\n\nNach ausreichender Austrocknung kann ein Austausch des salzbelasteten Putzsystems erforderlich sein. Diese Leistung ist nicht Bestandteil des Angebots.\n\nGewährleistungsansprüche bestehen nicht für Schäden infolge außergewöhnlicher Naturereignisse, insbesondere Hochwasser, Starkregen oder Überflutung, soweit diese außerhalb des vereinbarten Leistungsumfangs liegen.\n\nGrundlage der Ausführung ist die jeweils gültige Richtlinie „Flächensperre / Horizontalsperre mit flüssigen Injektionsmitteln“ der BKM.MANNESMANN AG. Im Übrigen gelten die gesetzlichen Vorschriften des BGB.",
      wallSole: "Der Wand-Sohlen-Anschluss wird grundsätzlich im Ausschlussverfahren ausgeführt. Der Leistungsumfang umfasst das Öffnen des Estrichs auf einer Breite von mindestens ca. 15–20 cm von der Wand bis zur Bodenplatte, die Reinigung des Anschlussbereiches, die Herstellung einer Dichtkehle, das Aufbringen des Dichtmörtels bis mindestens 15 cm über eine vorhandene Sperrbahn sowie das anschließende Einbringen einer Horizontalsperre mit BKM HZ 250 Pro.\n\nNach einer angemessenen Standzeit wird das Bauwerk erneut überprüft. Sollte sich dabei zeigen, dass eine ergänzende Harzverpressung erforderlich ist, wird diese ausschließlich in den tatsächlich notwendigen Bereichen ausgeführt und nach dem tatsächlich ausgeführten Umfang gesondert berechnet.",
      resin: "Harzverpressungen erfassen ausschließlich die zum Zeitpunkt der Ausführung festgestellten und zugänglichen Fehlstellen. Weitere Fehlstellen können erst im Zuge der Austrocknung oder nach einer angemessenen Standzeit sichtbar werden. Hieraus entstehende ergänzende Maßnahmen sind gesondert festzustellen, mit dem Auftraggeber abzustimmen, zu beauftragen und abzurechnen."
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
      rawText: "", screenshot: "", importedAt: ""
    },
    customerRecommendation: "",
    recordContext: {loaded:false,loadedAt:"",deal:null,person:null,notes:[],activities:[],files:[],relatedDeals:[],lexwareContact:null,lexwareDocuments:[],localVisits:[],localWorksites:[],error:""},
    inventoryDeducted: false,
    inventoryDeductedAt: "",
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

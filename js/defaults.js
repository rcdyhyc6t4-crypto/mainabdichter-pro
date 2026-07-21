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
    smallJob: {
      enabled: true,
      thresholdMeters: 12,
      type: "amount",
      value: 250,
      visibleToCustomer: false
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
      { id: crypto.randomUUID(), name: "Sauberkeitspaket", unit: "pauschal", grossPrice: 0, active: true, lexwareArticleId: "" }
    ],
    articleMappings: {
      Horizontalsperre: "",
      Flächensperre: "",
      Harzverpressung: "",
      "Wand-Sohlen-Anschluss": "",
      smallJob: ""
    },
    lexwareArticles: [],
    workerUrl: "https://mainabdichter-lexoffice.cmww7htry5.workers.dev",
    appSecret: ""
  },
  visit: {
    customer: {
      salutation: "", firstName: "", lastName: "", company: "",
      phone: "", email: "", street: "", zip: "", city: "",
      objectAddress: "", pipedriveId: "", lexwareContactId: ""
    },
    building: {
      yearBuilt: "", buildingType: "freistehendes Einfamilienhaus",
      floor: "Keller", roomUse: "Kellerraum",
      foundationType: "Streifenfundament",
      roomHeight: "", floorCover: "",
      roomTemp: "", humidity: "", surfaceTemp: "", dewPoint: ""
    },
    damageDescription: "",
    customerRecommendation: "",
    areas: [],
    extraQuantities: {}
  },
  discount: {
    skontoType: "none",
    skontoCustom: 0,
    specialType: "none",
    specialValue: 0,
    specialLabel: "Sonderaktion"
  }
};

export function createArea(name = "Vorderwand") {
  return {
    id: crypto.randomUUID(),
    name,
    wallMaterial: "HBL / Hohlblockstein",
    wallMaterialOther: "",
    wallThickness: 30,
    wallType: "Außenwand",
    earthContact: "erdberührt",
    wallCover: "Putz",
    access: "normal",
    notes: "",
    measurements: [{
      id: crypto.randomUUID(),
      device: "Gann Hydromette Compact B",
      value: "",
      unit: "Digits",
      height: "",
      location: "",
      note: ""
    }],
    measures: [{
      id: crypto.randomUUID(),
      type: "Horizontalsperre",
      length: 0,
      width: 0,
      height: 0,
      wall: 30,
      spacing: 0.25,
      extraResinKg: 0,
      note: ""
    }],
    photos: []
  };
}

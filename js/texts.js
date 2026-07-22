export function selectedMeasureTypes(visit) {
  return new Set(
    (visit.areas || []).flatMap(area =>
      (area.measures || []).map(measure => measure.type)
    )
  );
}

export function buildExecutionNotices(settings, visit) {
  const types = selectedMeasureTypes(visit);
  const texts = settings.noticeTexts || {};
  const notices = [];

  const usesInjectionSystem =
    types.has("Horizontalsperre") ||
    types.has("Flächensperre") ||
    types.has("Wand-Sohlen-Anschluss");

  if (usesInjectionSystem && String(texts.standard || "").trim()) {
    notices.push({
      key: "standard",
      title: "Allgemeine Hinweise zur Ausführung",
      text: String(texts.standard).trim()
    });
  }

  if (
    types.has("Wand-Sohlen-Anschluss") &&
    String(texts.wallSole || "").trim()
  ) {
    notices.push({
      key: "wallSole",
      title: "Zusatzhinweis Wand-Sohlen-Anschluss",
      text: String(texts.wallSole).trim()
    });
  }

  if (
    types.has("Harzverpressung") &&
    String(texts.resin || "").trim()
  ) {
    notices.push({
      key: "resin",
      title: "Zusatzhinweis Harzverpressung",
      text: String(texts.resin).trim()
    });
  }

  return notices;
}

export const $ = id => document.getElementById(id);

/**
 * Akzeptiert deutsche und internationale Dezimalzahlen:
 * 12,5 | 12.5 | 1.234,56 | 1,234.56
 */
export function parseDecimal(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;

  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    // Das zuletzt vorkommende Trennzeichen ist das Dezimalzeichen.
    if (comma > dot) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    text = text.replace(/\./g, "").replace(",", ".");
  }

  text = text.replace(/[^0-9+\-.]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDecimalInput(value, maximumFractionDigits = 3) {
  if (value === "" || value === null || value === undefined) return "";
  return new Intl.NumberFormat("de-DE", {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(parseDecimal(value));
}

export const eur = value => new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR"
}).format(parseDecimal(value));

export const num = value => new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2
}).format(parseDecimal(value));

export const esc = value => String(value || "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

export function showStatus(id, message, ok = true) {
  const element = $(id);
  if (!element) {
    console.warn(`Statusfeld ${id} fehlt:`, message);
    return;
  }
  element.className = `status ${ok ? "ok" : "err"}`;
  element.textContent = message;
}

export function bindSpeechButtons() {
  document.querySelectorAll("[data-speech-target]").forEach(button => {
    button.onclick = () => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        alert("Nutze bitte die Mikrofontaste der iPhone-Tastatur.");
        return;
      }
      const recognition = new Recognition();
      recognition.lang = "de-DE";
      recognition.onresult = event => {
        const target = $(button.dataset.speechTarget);
        target.value += `${target.value ? " " : ""}${event.results[0][0].transcript}`;
        target.dispatchEvent(new Event("input", { bubbles: true }));
      };
      recognition.start();
    };
  });
}

export const $ = id => document.getElementById(id);
export const eur = value => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
export const num = value => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(value) || 0);
export const esc = value => String(value || "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

export function showStatus(id, message, ok = true) {
  const element = $(id);
  if (!element) return;
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

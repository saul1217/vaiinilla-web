// Local browser shapes keep this helper usable by the Node-only E2E project
// without changing its global DOM types (and unrelated typed lint diagnostics).
interface ContrastElement { parentElement: ContrastElement | null }
declare const document: { querySelector(selector: string): ContrastElement | null };
declare function getComputedStyle(element: ContrastElement): { color: string; backgroundColor: string };
// Serialized by Playwright; keep this function self-contained.
export function staffContrastPairs() {
      type RGB = number[];
      const parse = (s: string): RGB => {
        const values = s.match(/[\d.]+/g)!.map(Number);
        // Chromium preserves color-mix backgrounds as color(srgb … / alpha).
        return s.startsWith('color(srgb') ? values.map((v, i) => i < 3 ? v * 255 : v) : values;
      };
      const over = (fg: RGB, bg: RGB): RGB => fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + bg[i]! * (1 - (fg[3] ?? 1)));
      const background = (el: ContrastElement | null): RGB => el ? over(parse(getComputedStyle(el).backgroundColor), background(el.parentElement)) : [255, 255, 255];
      const luminance = (c: RGB) => c.map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i]!, 0);
      return ['.kitchen-work__heading', '.kitchen-work__queue p', '.kitchen-ticket__stamp', '.reject-order-form__suggestions .button', '.reject-order-form__folio', '.cashier-receipt__folio', '.cashier-receipt__totals dt', '.cashier-receipt__totals dd', '.space-payment-balance > span', '.space-payment-balance > strong', '.app-account-button', '.queue-column__header h2', '.queue-column__header p', '.kitchen-ticket__product strong', '.kitchen-ticket__quantity', '.kitchen-ticket__options li', '.staff-chip', '.space-account__chip', '.space-account__chip--due', '.guest-tag', '.app-mobile-nav .app-link--active', '.app-mobile-nav button', '.app-sheet__header h2', '.app-sheet__close', '.staff-tile--call', '.staff-tile--ready', '.staff-stat--ready dt', ".app-segments input:checked + span", ".app-segments input:not(:checked) + span", '.field__control'].map((selector) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error(`Missing contrast surface: ${selector}`);
        const bg = background(el);
        const fg = over(parse(getComputedStyle(el).color), bg);
        const a = luminance(fg), b = luminance(bg);
        return { selector, fg, bg, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
      });

}

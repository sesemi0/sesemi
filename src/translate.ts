/**
 * Browser-translation adaptation (Chrome / Google Translate).
 * The per-word animation spans break sentence-level machine translation, and
 * the Latin display fonts / negative letter-spacing look wrong in Persian.
 * When the browser translates the page we flatten the word spans back into
 * natural sentences (so the translator can re-translate them properly) and let
 * CSS switch typography to Vazirmatn with RTL-aware spacing.
 */
const TRANSLATED_CLASSES = ['translated-rtl', 'translated-ltr'];

function flattenWordSpans(): void {
  const spans = document.querySelectorAll<HTMLElement>('.motion-word');
  for (const span of spans) {
    span.replaceWith(document.createTextNode(span.textContent || ''));
  }
}

let installed = false;

export function watchTranslation(): void {
  if (installed || typeof MutationObserver === 'undefined') return;
  installed = true;

  const apply = () => {
    const root = document.documentElement;
    const translated = TRANSLATED_CLASSES.some(name => root.classList.contains(name));
    if (translated && !root.dataset.sesemiTranslated) {
      root.dataset.sesemiTranslated = '1';
      flattenWordSpans();
    }
  };

  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

import katex from "katex";

/**
 * Render LaTeX to an HTML string with KaTeX.
 *
 * `trust: false` and `throwOnError: false` mean model-supplied LaTeX can never
 * inject markup/script (KaTeX escapes everything) and a malformed expression
 * renders as a harmless error string instead of throwing. The returned HTML is
 * safe to pass to dangerouslySetInnerHTML.
 */
export function renderLatex(latex: string, displayMode = true): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: "ignore",
      output: "html",
    });
  } catch {
    return "";
  }
}

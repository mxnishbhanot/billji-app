// The invoice HTML returned by the backend is a fixed 794px-wide A4 page.
export const A4_PAGE_WIDTH = 794;
export const A4_PAGE_HEIGHT = 1123;
export const A4_RATIO = A4_PAGE_WIDTH / A4_PAGE_HEIGHT;

// A native WebView has no viewport of its own, so without help it renders the fixed
// 794px page at 1:1 and the user sees it zoomed in with no way to zoom out. The
// backend template also ships `initial-scale=1, maximum-scale=1`, which pins it
// zoomed in and disables pinch-zoom. Strip any existing viewport and inject one that
// only pins the layout width to the page width — the WebView then scales the whole
// page down to fit its frame, and leaving initial-scale/maximum-scale unset keeps
// pinch-to-zoom available so the user can zoom in when they want to.
const FIT_VIEWPORT_TAG = `<meta name="viewport" content="width=${A4_PAGE_WIDTH}, user-scalable=yes">`;

export function withFittedViewport(html: string): string {
  const stripped = html.replace(/<meta[^>]*name=["']viewport["'][^>]*>/i, '');
  if (/<head[^>]*>/i.test(stripped)) return stripped.replace(/<head[^>]*>/i, (head) => `${head}${FIT_VIEWPORT_TAG}`);
  if (/<html[^>]*>/i.test(stripped)) return stripped.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${FIT_VIEWPORT_TAG}</head>`);
  return `${FIT_VIEWPORT_TAG}${stripped}`;
}

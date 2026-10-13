import { useSearchParams, Link } from 'react-router-dom';

/**
 * This page is opened synchronously (in the new tab) the instant the user
 * clicks "Place Order". It is a real, same-origin page with real content —
 * unlike the old `about:blank` window that sat empty and was rewritten by
 * JS a moment later. Browsers, ad blockers, and security extensions treat
 * "blank window silently redirected by script" as a classic pop-under /
 * tab-nabbing pattern and are more likely to flag or block it. Navigating
 * to real content immediately, then updating the URL again once the order
 * is confirmed, avoids that pattern entirely while keeping the same
 * "opens in a new tab" behavior.
 */
export default function OrderProcessingPage() {
  const [params] = useSearchParams();
  const error = params.get('error');

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-xl font-bold text-foreground font-sans">We couldn't place your order</h1>
          <p className="text-sm text-secondary-text">{decodeURIComponent(error)}</p>
          <Link
            to="/checkout"
            className="inline-block rounded bg-foreground px-5 py-2 font-semibold text-white hover:bg-black"
          >
            Back to checkout
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-foreground" />
        <h1 className="text-lg font-semibold text-foreground font-sans">Preparing your order…</h1>
        <p className="text-sm text-secondary-text">This will just take a moment. Please don't close this tab.</p>
      </div>
    </div>
  );
}

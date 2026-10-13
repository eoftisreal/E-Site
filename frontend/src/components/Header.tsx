import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getAuthToken, clearAuth, TOKEN_KEY } from '@/lib/storage';
import { Heart, LogIn, LogOut, Menu, ShoppingCart, UserRound } from 'lucide-react';
import { parseJwt } from '@/lib/jwt';
import { useCartStore } from '@/store/cart';
import { useWishlistStore } from '@/store/wishlist';

const linkClass = 'text-sm font-medium text-secondary-text hover:text-foreground transition-colors tracking-wide';

const iconButtonClass = `${linkClass} relative inline-flex h-8 w-8 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2`;
const iconClass = 'h-5 w-5 md:h-6 md:w-6';
const badgeClass = 'pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-foreground text-background text-[10px] font-bold leading-none inline-flex items-center justify-center';

export default function Header() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAuthToken()));
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { items, fetchCart, clearLocalCart } = useCartStore();
  const { items: wishlistItems, fetchWishlist, clearLocalWishlist } = useWishlistStore();
  const cartItemCount = items.reduce((total, item) => total + item.quantity, 0);
  const wishlistItemCount = wishlistItems.length;

  useEffect(() => {
    // If the user navigates away from the checkout page (e.g., clicks a header link), clear any active direct checkout draft
    const handleBeforeUnload = () => {
       if (window.location.pathname !== '/checkout') {
          sessionStorage.removeItem('directCheckoutDraft');
       }
    };
    handleBeforeUnload(); // Check on mount
    window.addEventListener('popstate', handleBeforeUnload);
    return () => window.removeEventListener('popstate', handleBeforeUnload);
  }, [window.location.pathname]);

  useEffect(() => {
    const checkAuth = () => {
      const token = getAuthToken();
      if (token) {
        setIsAuthenticated(true);
        try {
          const payload = parseJwt(token);
          setIsAdmin(payload.role === 'admin' || payload.role === 'master_admin');
        } catch (e) {
          setIsAdmin(false);
        }
      } else {
        setIsAuthenticated(false);
        setIsAdmin(false);
      }
    };
    checkAuth();

    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY || event.key === null) checkAuth();
    };

    window.addEventListener('auth-change', checkAuth);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth-change', checkAuth);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    // Delay loading non-critical data
    const timer = setTimeout(() => {
      fetchCart();
      fetchWishlist();
    }, 100);
    return () => clearTimeout(timer);
  }, [fetchCart, fetchWishlist, isAuthenticated]);

  const handleLogout = () => {
    clearLocalCart();
    clearLocalWishlist();
    clearAuth();
    setIsAuthenticated(false);
    setIsAdmin(false);
    navigate('/auth/login');
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20 gap-2 sm:gap-4">

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center flex-1">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={iconButtonClass} title="Menu" aria-label="Menu" aria-expanded={isMobileMenuOpen} aria-controls="mobile-navigation">
              <Menu className={iconClass} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-4 md:gap-6 flex-1">
            <Link to="/products" className={linkClass}>Shop</Link>
            <Link to="/products?tag=Collections" className={linkClass}>Collections</Link>
            <Link to="/about" className={linkClass}>About</Link>
          </nav>

          <Link to="/" className="flex justify-center shrink-0 w-auto">
            <img
              src="/logo.png"
              alt="Kapda Kraft"
              className="h-8 md:h-10 w-auto object-contain mix-blend-multiply"
              loading="eager"
            />
          </Link>

          <div className="flex items-center justify-end gap-1 sm:gap-2 flex-1">
            {isAdmin && (
              <Link to="/admin" className={`${linkClass} hidden sm:inline-block`} title="Admin">Admin</Link>
            )}

            {isAuthenticated ? (
              <>
                <Link to="/account" className={iconButtonClass} title="Account" aria-label="Account">
                  <UserRound className={iconClass} strokeWidth={1.75} aria-hidden="true" />
                </Link>
                <button onClick={handleLogout} className={iconButtonClass} title="Log Out" aria-label="Log Out">
                  <LogOut className={iconClass} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </>
            ) : (
              <Link to="/auth/login" className={iconButtonClass} title="Log In" aria-label="Log In">
                <LogIn className={iconClass} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
            <Link to="/account#wishlist" className={iconButtonClass} title="Wishlist" aria-label="Wishlist">
              <Heart className={iconClass} strokeWidth={1.75} aria-hidden="true" />
              {wishlistItemCount > 0 && (
                <span className={badgeClass}>
                  {wishlistItemCount}
                </span>
              )}
            </Link>
            <Link to="/cart" className={iconButtonClass} title="Cart" aria-label="Cart">
              <ShoppingCart className={iconClass} strokeWidth={1.75} aria-hidden="true" />
              {cartItemCount > 0 && (
                <span className={badgeClass}>
                  {cartItemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background">
            <nav id="mobile-navigation" className="flex flex-col px-4 py-2">
              <Link to="/products" className="py-3 border-b border-border/50 text-sm font-medium text-secondary-text hover:text-foreground" onClick={() => setIsMobileMenuOpen(false)}>Shop</Link>
              <Link to="/products?tag=Collections" className="py-3 border-b border-border/50 text-sm font-medium text-secondary-text hover:text-foreground" onClick={() => setIsMobileMenuOpen(false)}>Collections</Link>
              <Link to="/about" className="py-3 text-sm font-medium text-secondary-text hover:text-foreground" onClick={() => setIsMobileMenuOpen(false)}>About</Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

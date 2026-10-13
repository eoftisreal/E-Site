import { Link } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import ProductCard from '@/components/ProductCard';
import { useQuery } from '@tanstack/react-query';
import { apiGet, Product } from '@/lib/api';
import SEO from '@/components/SEO';
import { inventoryQueryOptions } from '@/lib/stock';

type Category = {
  _id: string;
  name: string;
  description: string;
  image?: string;
};

export default function Home() {
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => apiGet('/products/categories')
  });

  const { data: featuredProductsRes } = useQuery<{ products: Product[] }>({
    ...inventoryQueryOptions,
    queryKey: ['featuredProducts'],
    queryFn: () => apiGet('/products?isFeatured=true&limit=24')
  });
  const featuredProducts = featuredProductsRes?.products || [];

  const { data: settingsRes } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetch((import.meta.env.VITE_API_URL || '/api') + '/public/settings').then(res => res.json())
  });

  const parsedSettings = settingsRes as { heroBannerUrl?: string, heroBannerUrls?: string[] } | undefined;
  let heroBannerUrls: string[] = [];
  if (parsedSettings?.heroBannerUrls && parsedSettings.heroBannerUrls.length > 0) {
    heroBannerUrls = parsedSettings.heroBannerUrls.filter(Boolean);
  } else if (parsedSettings?.heroBannerUrl) {
    heroBannerUrls = [parsedSettings.heroBannerUrl];
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInteracting = useRef(false);

  // Keep the clone only when there is more than one banner.
  const hasBanners = heroBannerUrls.length > 0;
  const bannerCount = heroBannerUrls.length;
  const loopBanners = bannerCount > 1 ? [...heroBannerUrls, heroBannerUrls[0]] : heroBannerUrls;

  // A reset must happen only after scrolling has settled. Resetting when the
  // cloned slide is merely halfway into view can strand desktop browsers
  // between two banners.
  const settleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || bannerCount <= 1 || !container.clientWidth) return;

    const slideWidth = container.clientWidth;
    const cloneOffset = bannerCount * slideWidth;
    if (Math.abs(container.scrollLeft - cloneOffset) <= 2) {
      container.scrollTo({ left: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  const handleScroll = () => {
    if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
    // Fallback for browsers without the native scrollend event.
    scrollSettleTimer.current = setTimeout(settleScroll, 180);
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Re-align on banner count changes and desktop window resizes.
    container.scrollTo({ left: 0, behavior: 'instant' as ScrollBehavior });
    let previousWidth = container.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = container.clientWidth;
      if (!previousWidth || !nextWidth || previousWidth === nextWidth) return;

      const slide = Math.round(container.scrollLeft / previousWidth);
      previousWidth = nextWidth;
      container.scrollTo({
        left: (slide >= bannerCount ? 0 : slide * nextWidth),
        behavior: 'instant' as ScrollBehavior
      });
    });
    observer.observe(container);
    const onScrollEnd = () => {
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
      settleScroll();
    };
    container.addEventListener('scrollend', onScrollEnd);
    return () => {
      observer.disconnect();
      container.removeEventListener('scrollend', onScrollEnd);
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
    };
  }, [bannerCount]);

  useEffect(() => {
    if (bannerCount <= 1) return;

    const intervalId = setInterval(() => {
      if (isInteracting.current) return;
      const container = scrollContainerRef.current;
      if (!container || !container.clientWidth) return;
      const position = container.scrollLeft / container.clientWidth;
      const index = Math.round(position);

      // Don't start another transition while a previous one is still moving.
      if (Math.abs(position - index) > 0.02 || index >= bannerCount) return;
      container.scrollTo({
        left: (index + 1) * container.clientWidth,
        behavior: 'smooth'
      });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [bannerCount]);

  return (
    <div className="space-y-10 md:space-y-16 pb-10 md:pb-16">
      <SEO
        title="Kapda Kraft - Premium Clothing & Accessories"
        description="Discover premium quality clothing and accessories at Kapda Kraft. Curated collections designed for the modern aesthetic. Shop the latest trends today."
        keywords={["clothing", "fashion", "accessories", "online shopping", "premium wear"]}
        image="https://kapdakraft.live/logo.png"
      />
      {/* Hero Section */}
      <section
        className="relative overflow-hidden aspect-[2/1] w-full flex items-end justify-center pb-8 sm:pb-12 md:pb-20 bg-secondary-bg"
        onMouseEnter={() => isInteracting.current = true}
        onMouseLeave={() => isInteracting.current = false}
        onTouchStart={() => isInteracting.current = true}
        onTouchEnd={() => {
           // Small delay to allow scroll to finish snapping before resuming auto-slide
           setTimeout(() => { isInteracting.current = false; }, 1000);
        }}
      >
        {hasBanners ? (
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="absolute inset-0 z-0 flex w-full overflow-x-auto snap-x snap-mandatory overscroll-x-contain scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {loopBanners.map((url, idx) => (
              <div key={idx} className="relative h-full w-full min-w-full shrink-0 snap-center snap-always">
                <img src={url} alt={`Hero Banner ${idx + 1}`} className="w-full h-full object-cover object-center" loading={idx === 0 ? "eager" : "lazy"} fetchPriority={idx === 0 ? "high" : "auto"} />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 z-0 bg-accent/30"></div>
        )}

        {/* Fixed Overlay */}
        <div className="relative z-10 text-center max-w-2xl px-2 sm:px-4 flex flex-col items-center pointer-events-none w-full">
          {!hasBanners && (
            <>
              <h1 className="text-2xl sm:text-3xl md:text-6xl font-heading text-foreground mb-2 md:mb-6 leading-tight">
                Discover the Art of Style
              </h1>
              <p className="text-[10px] sm:text-xs md:text-base text-secondary-text mb-4 md:mb-8 max-w-md mx-auto px-4">
                Explore our latest collection of curated pieces designed for the modern aesthetic.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Category Grid Section */}
      <section className="px-4 md:px-8 max-w-[1600px] mx-auto">
        <h2 className="mb-6 md:mb-8 text-xl md:text-2xl font-heading text-center">Shop by Category</h2>
        <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => (
            <Link
              key={category._id}
              to={`/products?category=${encodeURIComponent(category.name)}`}
              className="group relative overflow-hidden rounded-md border border-secondary-bg aspect-square flex flex-col justify-end bg-white"
            >
              {category.image ? (
                <>
                  <div className="absolute inset-0 z-0">
                    <img src={category.image} alt={category.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent transition-opacity group-hover:from-black/80 group-hover:via-black/40"></div>
                  </div>
                  <div className="relative z-10 p-4 md:p-6 drop-shadow-md">
                    <p className="text-[9px] md:text-[10px] tracking-widest uppercase text-white/90 mb-1 md:mb-2">{category.description || 'Collection'}</p>
                    <p className="text-lg md:text-xl font-heading text-white">{category.name}</p>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 z-0 transition-colors group-hover:bg-secondary-bg/50">
                  <div className="p-4 md:p-6 h-full flex flex-col justify-end">
                    <p className="text-[9px] md:text-[10px] tracking-widest uppercase text-secondary-text mb-1 md:mb-2">{category.description || 'Collection'}</p>
                    <p className="text-lg md:text-xl font-heading text-foreground">{category.name}</p>
                  </div>
                </div>
              )}
            </Link>
          ))}
          {categories.length === 0 && (
            <p className="col-span-full text-center text-secondary-text">No collections available at the moment.</p>
          )}
        </div>
      </section>

      {/* Featured Products Section */}
      {featuredProducts.length > 0 && (
        <section className="px-4 md:px-8 max-w-[1600px] mx-auto">
          <div className="flex justify-between items-end mb-6 md:mb-8">
            <h2 className="text-xl md:text-2xl font-heading">Featured Pieces</h2>
            <Link to="/products" className="text-xs md:text-sm border-b border-foreground pb-0.5 md:pb-1 hover:text-secondary-text hover:border-secondary-text transition-colors">
              View All
            </Link>
          </div>
          <div className="grid gap-4 md:gap-6 grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

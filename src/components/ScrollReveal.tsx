import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  delayMs?: number;
  immediate?: boolean;
  className?: string;
}

type RevealState = 'visible' | 'enter' | 'pending';

const useSafeLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function ScrollReveal({
  children,
  delayMs = 0,
  immediate = false,
  className = '',
}: ScrollRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [revealState, setRevealState] = useState<RevealState>(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return 'visible';
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return 'visible';
    }
    return immediate ? 'enter' : 'pending';
  });

  useSafeLayoutEffect(() => {
    if (revealState !== 'pending') return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setRevealState('visible');
      return;
    }

    const revealIfInView = () => {
      const rect = node.getBoundingClientRect();
      if (rect.top <= window.innerHeight * 0.92) {
        setRevealState(rect.bottom < 0 ? 'visible' : 'enter');
        return true;
      }
      return false;
    };

    if (revealIfInView()) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealState('enter');
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );

    const onScroll = () => {
      if (revealIfInView()) {
        observer.disconnect();
        window.removeEventListener('scroll', onScroll);
      }
    };

    observer.observe(node);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [revealState]);

  const cappedDelay = Math.min(Math.max(delayMs, 0), 220);
  const delayStyle =
    cappedDelay > 0 && revealState !== 'pending'
      ? revealState === 'enter'
        ? { animationDelay: `${cappedDelay}ms` }
        : { transitionDelay: `${cappedDelay}ms` }
      : undefined;

  return (
    <div
      ref={containerRef}
      data-reveal={revealState}
      style={delayStyle}
      className={`printula-scroll-reveal ${className}`}
    >
      {children}
    </div>
  );
}

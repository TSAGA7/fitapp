import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * "Back to top": appears as soon as the page is scrolled down a little (not only at the very bottom), so a long list
 * (the food catalog, the exercises) can be left from anywhere in one tap.
 */
export function ScrollTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // The page scrolls the window, but with overflow set on <body> some browsers scroll the body instead: both are read.
    const onScroll = () => setShow(Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop) > 500);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.body.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.body.removeEventListener('scroll', onScroll);
    };
  }, []);
  return (
    <button type="button" className={`to-top ${show ? 'show' : ''}`} aria-label="Наверх" aria-hidden={!show} tabIndex={show ? 0 : -1} onClick={() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
    }}>
      <Icon name="arrowUp" size={22} strokeWidth={2.2} />
    </button>
  );
}

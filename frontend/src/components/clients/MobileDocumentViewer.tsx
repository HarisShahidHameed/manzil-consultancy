import React, { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence, motion, MotionConfig, useMotionValue, useTransform,
  animate as springTo, type PanInfo,
} from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Trash2, Loader2 } from 'lucide-react';

export interface ViewerItem {
  id: string;
  src: string;
  fileName: string;
  subtitle?: string;
}

interface Props {
  items: ViewerItem[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onDelete?: (item: ViewerItem) => void;
  deleteBusy?: boolean;
  layoutIdFor: (item: ViewerItem) => string;
}

// Apple's "Designing Fluid Interfaces" defaults, translated to Motion's bounce+duration
// spring API: critically damped (no overshoot) for anything not gesture-driven, a touch
// of bounce reserved for motion a flick/drag actually carried momentum into.
const SETTLE = { type: 'spring', bounce: 0, duration: 0.38 } as const;
const FLICK = { type: 'spring', bounce: 0.18, duration: 0.4 } as const;

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir >= 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? -60 : 60, opacity: 0 }),
};

const ChromeButton: React.FC<{ onClick: () => void; title: string; disabled?: boolean; children: React.ReactNode }> = ({ onClick, title, disabled, children }) => (
  <motion.button
    onClick={onClick}
    disabled={disabled}
    title={title}
    whileTap={{ scale: 0.88 }}
    transition={{ duration: 0.1 }}
    className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white backdrop-blur-md disabled:opacity-50"
  >
    {children}
  </motion.button>
);

// A full-screen, gesture-driven document viewer built to feel like a native photo
// gallery rather than a generic web lightbox:
//  - Tapping a grid thumbnail morphs it into the fullscreen view via a shared layoutId
//    (see the invisible "hero" image below) — the one moment this component uses a true
//    layout animation. Swiping between photos afterward is a plain directional slide, not
//    another grid-morph, so browsing a large gallery never sends images flying in from
//    wherever their thumbnail happens to be scrolled to.
//  - Swipe left/right to move between images, drag down to dismiss, double-tap to zoom —
//    all 1:1 with the pointer, springing back when a gesture doesn't cross its threshold
//    (Motion's dragSnapToOrigin), matching Apple's fluid-interface guidance.
export const MobileDocumentViewer: React.FC<Props> = ({ items, index, onClose, onIndexChange, onDelete, deleteBusy, layoutIdFor }) => {
  const [chromeVisible, setChromeVisible] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [direction, setDirection] = useState(0);

  const lastItemRef = useRef<ViewerItem | null>(null);
  const wasOpenRef = useRef(false);
  const lastTapRef = useRef(0);

  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, 60, 260], [1, 0.97, 0.55]);
  const dragScale = useTransform(y, [-160, 0, 160], [0.94, 1, 0.88]);

  const open = index !== null;
  if (index !== null) lastItemRef.current = items[index];
  const activeItem = lastItemRef.current;

  // The hero only plays its shared-layout morph on the true open transition — flag it the
  // instant `index` flips from closed to open, so it's correct on the very first paint
  // (no one-frame flash of the plain carousel first). `wasOpenRef` is updated right here,
  // synchronously, in the same statement — not in a separate effect — specifically so it
  // can't race Framer's onLayoutAnimationComplete (which can fire before effects ever get
  // a chance to commit) into re-triggering this and ping-ponging heroVisible forever.
  if (open !== wasOpenRef.current) {
    wasOpenRef.current = open;
    if (open) setHeroVisible(true);
  }

  useEffect(() => {
    y.set(0);
    setZoomed(false);
    setChromeVisible(true);
  }, [index, y]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  const step = (dir: 1 | -1) => {
    if (index === null) return;
    const next = index + dir;
    if (next < 0 || next >= items.length) return;
    setDirection(dir);
    onIndexChange(next);
  };

  // Re-show (and re-sync) the hero right before closing so the shrink-back morph always
  // targets whichever photo is actually on screen, even if the user swiped past the one
  // they originally tapped open.
  const requestClose = () => {
    setHeroVisible(true);
    onClose();
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (zoomed) return;
    const { offset, velocity } = info;
    if (Math.abs(offset.x) > Math.abs(offset.y) && Math.abs(offset.x) > 70) {
      if ((offset.x < 0 || velocity.x < -500) && index !== null && index < items.length - 1) { step(1); return; }
      if ((offset.x > 0 || velocity.x > 500) && index !== null && index > 0) { step(-1); return; }
    } else if (offset.y > 110 || velocity.y > 550) {
      requestClose();
      return;
    }
    springTo(y, 0, SETTLE);
  };

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      setZoomed(z => !z);
      setChromeVisible(false);
    } else {
      setChromeVisible(v => !v);
    }
    lastTapRef.current = now;
  };

  const handleHeroLayoutComplete = () => {
    if (index !== null) setHeroVisible(false);
  };

  if (!open && !heroVisible) return null;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence onExitComplete={() => setHeroVisible(false)}>
        {open && activeItem && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black touch-none"
            style={{ opacity: backdropOpacity }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SETTLE}
          >
            {/* Top glass chrome: filename, counter, close, delete */}
            <AnimatePresence>
              {chromeVisible && (
                <motion.div
                  initial={{ opacity: 0, y: -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={SETTLE}
                  className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-b from-black/50 to-transparent"
                >
                  <ChromeButton onClick={requestClose} title="Close"><X className="w-5 h-5" /></ChromeButton>
                  <div className="flex-1 min-w-0 text-center text-white">
                    <p className="text-sm truncate">{activeItem.fileName}</p>
                    <p className="text-xs text-white/60 tabular-nums">{index! + 1} / {items.length}</p>
                  </div>
                  {onDelete ? (
                    <ChromeButton onClick={() => onDelete(activeItem)} disabled={deleteBusy} title="Delete">
                      {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </ChromeButton>
                  ) : (
                    <div className="w-10 h-10" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Interactive carousel — swipe, drag-to-dismiss, double-tap zoom. Hidden until
                the hero's opening morph settles so the two never fight for the same pixels. */}
            {!heroVisible && (
              <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                <motion.img
                  key={activeItem.id}
                  custom={direction}
                  variants={SLIDE_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={FLICK}
                  src={activeItem.src}
                  alt={activeItem.fileName}
                  drag={!zoomed}
                  dragSnapToOrigin
                  dragElastic={1}
                  dragTransition={{ bounceStiffness: 380, bounceDamping: 32 }}
                  onDragEnd={handleDragEnd}
                  onTap={handleTap}
                  style={{ y, scale: zoomed ? 2.4 : dragScale }}
                  className={`max-h-[85vh] max-w-[92vw] object-contain rounded-lg select-none ${zoomed ? 'cursor-zoom-out' : 'cursor-grab active:cursor-grabbing'}`}
                />
              </AnimatePresence>
            )}

            {/* The morph vehicle: only visible during the open/close boundary transitions. */}
            {heroVisible && (
              <motion.img
                key="hero"
                layoutId={layoutIdFor(activeItem)}
                src={activeItem.src}
                alt={activeItem.fileName}
                onLayoutAnimationComplete={handleHeroLayoutComplete}
                transition={SETTLE}
                className="max-h-[85vh] max-w-[92vw] object-contain rounded-lg"
              />
            )}

            {/* Desktop prev/next affordance — swipe covers touch, arrows cover mouse/keyboard users. */}
            {!zoomed && index! > 0 && (
              <button
                onClick={() => step(-1)}
                className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {!zoomed && index! < items.length - 1 && (
              <button
                onClick={() => step(1)}
                className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}

            {/* Bottom glass strip: a hint of dismiss + a filmstrip-style position indicator */}
            <AnimatePresence>
              {chromeVisible && items.length > 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={SETTLE}
                  className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-center gap-1.5 px-4 py-4 bg-gradient-to-t from-black/50 to-transparent"
                >
                  {items.map((it, i) => (
                    <span
                      key={it.id}
                      className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ease-out ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/35'}`}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
};

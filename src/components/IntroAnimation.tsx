import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "app_intro_seen";
const REPLAY_FLAG = "intro:replay-pending";
const BOT_RE = /Lighthouse|PageSpeed|PTST|Googlebot|Chrome-Lighthouse/i;

const isBot = () =>
  typeof navigator !== "undefined" && BOT_RE.test(navigator.userAgent);

const IntroAnimation = () => {
  const [visible, setVisible] = useState(false);
  const [showSkipHint, setShowSkipHint] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Decide whether to show on mount + listen for replay events
  useEffect(() => {
    if (isBot()) return;

    const start = () => {
      sessionStorage.removeItem(STORAGE_KEY);
      setVisible(true);
    };

    // Pending replay from another route
    if (sessionStorage.getItem(REPLAY_FLAG) === "1") {
      sessionStorage.removeItem(REPLAY_FLAG);
      start();
    } else if (!sessionStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }

    const onReplay = () => start();
    window.addEventListener("intro:replay", onReplay);
    return () => window.removeEventListener("intro:replay", onReplay);
  }, []);

  // Lock scroll + skip hint timer + iOS autoplay retry
  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const hintTimer = window.setTimeout(() => setShowSkipHint(true), 1500);

    const tryPlay = () => {
      const v = videoRef.current;
      if (!v) return;
      const p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // Retry once after a short delay (iOS quirk)
          window.setTimeout(() => {
            videoRef.current?.play().catch(() => {});
          }, 250);
        });
      }
    };

    const v = videoRef.current;
    v?.addEventListener("canplay", tryPlay);
    tryPlay();

    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(hintTimer);
      v?.removeEventListener("canplay", tryPlay);
      setShowSkipHint(false);
    };
  }, [visible]);

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center cursor-pointer"
          onClick={dismiss}
          role="dialog"
          aria-label="Úvodní animace"
        >
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            {...({ "webkit-playsinline": "true" } as Record<string, string>)}
            preload="auto"
            onEnded={dismiss}
          >
            <source src="/intro.webm" type="video/webm" />
            <source src="/intro.mp4" type="video/mp4" />
          </video>

          <AnimatePresence>
            {showSkipHint && (
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 0.7, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] sm:text-xs uppercase tracking-[0.25em] text-white/70 pointer-events-none select-none"
              >
                Klikněte pro přeskočení
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default IntroAnimation;

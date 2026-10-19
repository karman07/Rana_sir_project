"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Fades content up as it scrolls into view. No-op for people who prefer reduced motion. */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

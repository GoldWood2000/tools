import React, { useCallback, useEffect, useRef } from "react";
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";

// Adapted from React Bits CountUp; reduced-motion support and dashboard timing added.

export default function CountUp({ to, from = 0, duration = 0.55, className = "" }) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(from);
  const springValue = useSpring(motionValue, { damping: 20 + 40 / duration, stiffness: 100 / duration });
  const isInView = useInView(ref, { once: true });
  const format = useCallback((value) => Math.round(value).toLocaleString("zh-CN"), []);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.textContent = format(reduceMotion ? to : from);
  }, [format, from, reduceMotion, to]);

  useEffect(() => {
    if (isInView) motionValue.set(to);
  }, [isInView, motionValue, to]);

  useEffect(() => springValue.on("change", (value) => {
    if (ref.current && !reduceMotion) ref.current.textContent = format(value);
  }), [format, reduceMotion, springValue]);

  return <span className={className} ref={ref} />;
}

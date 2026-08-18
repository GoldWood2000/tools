import React, { useRef } from "react";

// Adapted from React Bits SpotlightCard (JS-CSS variant).

export default function SpotlightCard({ children, className = "", spotlightColor = "rgba(73, 104, 246, .12)" }) {
  const cardRef = useRef(null);

  function handleMouseMove(event) {
    const rect = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
    cardRef.current.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
    cardRef.current.style.setProperty("--spotlight-color", spotlightColor);
  }

  return <article ref={cardRef} onMouseMove={handleMouseMove} className={`card-spotlight ${className}`}>{children}</article>;
}

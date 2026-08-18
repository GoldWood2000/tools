import React from "react";

// Adapted from React Bits StarBorder (JS-CSS variant).

export default function StarBorder({ children, className = "", color = "#9fb0ff", speed = "7s", ...props }) {
  return (
    <button className={`star-border-container ${className}`} {...props}>
      <span className="border-gradient-bottom" style={{ background: `radial-gradient(circle, ${color}, transparent 12%)`, animationDuration: speed }} />
      <span className="border-gradient-top" style={{ background: `radial-gradient(circle, ${color}, transparent 12%)`, animationDuration: speed }} />
      <span className="inner-content">{children}</span>
    </button>
  );
}

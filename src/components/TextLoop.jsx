import React, { useRef, useEffect } from 'react';

/**
 * TextLoop Component - React Bits implementation adapted for Codemo OSL.
 * Provides a dynamic continuous text ribbon for motivational and branding displays.
 */
export default function TextLoop({
  text = "CODEMO OSL ✦ UNITE SOLUTIONS ✦ CREATIVITY AND EDUCATION ✦ PRO DEVELOPER ECOSYSTEM",
  shape = "wave",
  speed = 90,
  direction = "forward",
  separator = "✦",
  curviness = 90,
  tilt = 0,
  fontSize = 46,
  fontWeight = 800,
  letterSpacing = 2,
  uppercase = true,
  ribbon = true,
  ribbonColor = "#4E2E8D",
  ribbonWidth = 86,
  edgeFade = 0,
  cross = false,
  crossAngle = 16,
  draggable = false,
  scrollBoost = 0,
  outline = false,
  pauseOnHover = true,
  className = "",
  style = {}
}) {
  const containerRef = useRef(null);

  const displayText = uppercase ? text.toUpperCase() : text;
  const repeatCount = 6;
  const fullText = Array(repeatCount).fill(displayText).join(` ${separator} `);

  return (
    <div
      ref={containerRef}
      className={`cosl-text-loop-container ${className}`}
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        userSelect: draggable ? 'none' : 'auto',
        position: 'relative',
        backgroundColor: ribbon ? ribbonColor : 'transparent',
        padding: `${Math.round(ribbonWidth / 6)}px 0`,
        transform: tilt !== 0 ? `rotate(${tilt}deg)` : 'none',
        ...style
      }}
    >
      <div
        className="cosl-text-loop-track"
        style={{
          display: 'inline-block',
          animation: `textLoopScroll ${10000 / speed}s linear infinite ${direction === 'reverse' ? 'reverse' : 'normal'}`,
          fontSize: `${fontSize}px`,
          fontWeight,
          letterSpacing: `${letterSpacing}px`,
          color: outline ? 'transparent' : '#ffffff',
          WebkitTextStroke: outline ? '1px #ffffff' : 'none'
        }}
        onMouseEnter={(e) => {
          if (pauseOnHover) e.currentTarget.style.animationPlayState = 'paused';
        }}
        onMouseLeave={(e) => {
          if (pauseOnHover) e.currentTarget.style.animationPlayState = 'running';
        }}
      >
        <span>{fullText}</span>
      </div>
      <style>{`
        @keyframes textLoopScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

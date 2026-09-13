import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadBody } from "@remotion/google-fonts/DMSans";

const display = loadDisplay("normal", { weights: ["500", "700"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const DISPLAY = display.fontFamily;
export const BODY = body.fontFamily;

export const C = {
  bg0: "#060A14",
  bg1: "#0B1424",
  bg2: "#111E33",
  ink: "#EAF2FF",
  dim: "#8DA3C0",
  line: "rgba(140,180,235,0.16)",
  cyan: "#3FBEF7",
  amber: "#F5A524",
};

export const Bg: React.FC<{ tint?: string }> = ({ tint = C.cyan }) => {
  const f = useCurrentFrame();
  const drift = Math.sin(f / 90) * 40;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${C.bg0} 0%, ${C.bg1} 55%, ${C.bg2} 100%)` }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(760px 520px at ${18 + drift / 8}% ${22 + drift / 20}%, ${tint}26, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.32,
          backgroundImage:
            "linear-gradient(rgba(120,170,225,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,225,0.09) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          transform: `translateY(${(f % 72) * -1}px)`,
        }}
      />
      <AbsoluteFill
        style={{ background: "radial-gradient(120% 90% at 50% 50%, transparent 45%, rgba(3,6,12,0.75) 100%)" }}
      />
    </AbsoluteFill>
  );
};

/** Rise + blur-to-sharp entrance used everywhere. */
export const Rise: React.FC<{ delay?: number; children: React.ReactNode; distance?: number }> = ({
  delay = 0,
  distance = 34,
  children,
}) => {
  const f = useCurrentFrame() - delay;
  const p = interpolate(f, [0, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const e = 1 - Math.pow(1 - p, 3);
  return (
    <div
      style={{
        opacity: e,
        transform: `translateY(${(1 - e) * distance}px)`,
        filter: `blur(${(1 - e) * 8}px)`,
      }}
    >
      {children}
    </div>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = C.cyan,
}) => (
  <div
    style={{
      fontFamily: BODY,
      fontSize: 22,
      letterSpacing: "0.32em",
      textTransform: "uppercase",
      color,
      display: "flex",
      alignItems: "center",
      gap: 16,
    }}
  >
    <span style={{ width: 46, height: 2, background: color, display: "inline-block" }} />
    {children}
  </div>
);

export const H1: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 84 }) => (
  <div
    style={{
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: size,
      lineHeight: 1.04,
      letterSpacing: "-0.03em",
      color: C.ink,
    }}
  >
    {children}
  </div>
);

export const Body: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 30 }) => (
  <div style={{ fontFamily: BODY, fontSize: size, lineHeight: 1.5, color: C.dim, maxWidth: 900 }}>
    {children}
  </div>
);

export const Card: React.FC<{
  children: React.ReactNode;
  glow?: string;
  style?: React.CSSProperties;
}> = ({ children, glow = C.cyan, style }) => (
  <div
    style={{
      border: `1px solid ${C.line}`,
      background: "linear-gradient(150deg, rgba(24,40,66,0.85), rgba(11,20,36,0.78))",
      borderRadius: 22,
      padding: "26px 30px",
      boxShadow: `0 24px 60px rgba(2,6,14,0.55), inset 0 1px 0 ${glow}22`,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Stage: React.FC<{ children: React.ReactNode; pad?: number }> = ({ children, pad = 130 }) => (
  <AbsoluteFill style={{ padding: pad, justifyContent: "center" }}>{children}</AbsoluteFill>
);

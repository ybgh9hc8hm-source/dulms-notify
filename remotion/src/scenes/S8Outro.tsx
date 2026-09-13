import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, BODY, C, DISPLAY, Rise } from "../theme";

export const S8Outro: React.FC = () => {
  const f = useCurrentFrame();
  const glow = 0.5 + 0.5 * Math.sin(f / 16);
  const line = interpolate(f, [24, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Bg />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Rise>
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 120,
              letterSpacing: "-0.04em",
              color: C.ink,
              textShadow: `0 0 ${40 + 30 * glow}px rgba(63,190,247,0.4)`,
            }}
          >
            DULMS Notify
          </div>
        </Rise>
        <div style={{ height: 22 }} />
        <div style={{ width: 520 * line, height: 2, background: C.cyan, opacity: 0.8 }} />
        <div style={{ height: 26 }} />
        <Rise delay={34}>
          <div style={{ fontFamily: BODY, fontSize: 34, color: C.dim, textAlign: "center" }}>
            Notifications, automation and academic insight
            <br />
            for a portal that offers none.
          </div>
        </Rise>
        <div style={{ height: 56 }} />
        <Rise delay={58}>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: 30,
              color: C.ink,
              padding: "16px 28px",
              border: `1px solid ${C.line}`,
              borderRadius: 16,
              background: "rgba(63,190,247,0.08)",
            }}
          >
            Developed by Eng. HASSAN MOHAMED
          </div>
        </Rise>
        <div style={{ height: 20 }} />
        <Rise delay={70}>
          <div style={{ fontFamily: BODY, fontSize: 22, color: C.dim }}>
            © 2026 · Independent project, not affiliated with the university
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

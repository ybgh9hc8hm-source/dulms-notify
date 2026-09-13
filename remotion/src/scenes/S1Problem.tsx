import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, C, DISPLAY, BODY, H1, Kicker, Rise, Stage } from "../theme";

const NOPE = ["No public API", "No notifications", "No webhooks"];

export const S1Problem: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Bg tint={C.amber} />
      <Stage>
        <Rise>
          <Kicker color={C.amber}>The starting point</Kicker>
        </Rise>
        <div style={{ height: 34 }} />
        <Rise delay={12}>
          <H1 size={96}>
            A university portal
            <br />
            that tells students
            <span style={{ color: C.amber }}> nothing.</span>
          </H1>
        </Rise>
        <div style={{ height: 56 }} />
        <div style={{ display: "flex", gap: 22 }}>
          {NOPE.map((t, i) => {
            const d = 46 + i * 20;
            const p = interpolate(f - d, [0, 22], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const strike = interpolate(f - d - 14, [0, 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={t}
                style={{
                  position: "relative",
                  padding: "20px 30px",
                  border: `1px solid rgba(245,165,36,${0.28 * p})`,
                  borderRadius: 16,
                  background: `rgba(245,165,36,${0.07 * p})`,
                  fontFamily: DISPLAY,
                  fontWeight: 500,
                  fontSize: 34,
                  color: C.ink,
                  opacity: p,
                  transform: `translateY(${(1 - p) * 20}px)`,
                }}
              >
                {t}
                <div
                  style={{
                    position: "absolute",
                    left: 24,
                    right: 24,
                    top: "52%",
                    height: 3,
                    background: C.amber,
                    transformOrigin: "left center",
                    transform: `scaleX(${strike})`,
                    borderRadius: 2,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{ height: 46 }} />
        <Rise delay={110}>
          <div style={{ fontFamily: BODY, fontSize: 32, color: C.dim, maxWidth: 1000 }}>
            Deadlines, grades, absences and course registration windows all live behind a
            session-only web portal. Miss the page, miss the deadline.
          </div>
        </Rise>
      </Stage>
    </AbsoluteFill>
  );
};

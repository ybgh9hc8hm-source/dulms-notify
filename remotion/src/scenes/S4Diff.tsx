import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, BODY, C, Card, DISPLAY, H1, Kicker, Rise, Stage } from "../theme";

const OLD = ["Quiz 3 — not published", "Assignment 2 — no grade", "Networks group — closed"];
const NEW = ["Quiz 3 — opens tonight 8 PM", "Assignment 2 — 9.5 / 10", "Networks group — 1 seat open"];

export const S4Diff: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Bg />
      <Stage pad={110}>
        <Rise>
          <Kicker>Layer 2 — change detection</Kicker>
        </Rise>
        <div style={{ height: 24 }} />
        <Rise delay={10}>
          <H1 size={70}>We don't resend data. We only report what changed.</H1>
        </Rise>
        <div style={{ height: 46 }} />
        <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
          <Rise delay={26}>
            <Card style={{ width: 520 }}>
              <div style={{ fontFamily: BODY, fontSize: 22, color: C.dim, letterSpacing: "0.2em" }}>
                PREVIOUS SNAPSHOT
              </div>
              <div style={{ height: 16 }} />
              {OLD.map((t) => (
                <div
                  key={t}
                  style={{ fontFamily: DISPLAY, fontSize: 27, color: C.dim, padding: "10px 0", opacity: 0.7 }}
                >
                  {t}
                </div>
              ))}
            </Card>
          </Rise>
          <div style={{ position: "relative", width: 120, height: 8 }}>
            <div style={{ position: "absolute", inset: "3px 0", background: C.line }} />
            <div
              style={{
                position: "absolute",
                width: 30,
                height: 6,
                top: 1,
                borderRadius: 6,
                background: C.amber,
                left: `${((f * 3) % 130) - 12}px`,
                boxShadow: `0 0 16px ${C.amber}`,
              }}
            />
          </div>
          <Rise delay={50}>
            <Card glow={C.amber} style={{ width: 560 }}>
              <div style={{ fontFamily: BODY, fontSize: 22, color: C.amber, letterSpacing: "0.2em" }}>
                FRESH READ → DIFF
              </div>
              <div style={{ height: 16 }} />
              {NEW.map((t, i) => {
                const d = 62 + i * 22;
                const p = interpolate(f - d, [0, 18], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                return (
                  <div
                    key={t}
                    style={{
                      fontFamily: DISPLAY,
                      fontSize: 29,
                      color: C.ink,
                      padding: "10px 14px",
                      marginBottom: 6,
                      borderRadius: 12,
                      borderInlineStart: `3px solid rgba(245,165,36,${p})`,
                      background: `rgba(245,165,36,${0.09 * p})`,
                      opacity: 0.25 + 0.75 * p,
                      transform: `translateX(${(1 - p) * 18}px)`,
                    }}
                  >
                    {t}
                  </div>
                );
              })}
            </Card>
          </Rise>
        </div>
        <div style={{ height: 40 }} />
        <Rise delay={130}>
          <div style={{ fontFamily: BODY, fontSize: 27, color: C.dim, maxWidth: 1100 }}>
            Per-field rules decide what deserves a human's attention: a new deadline does, a re-ordered
            row does not. Everything else is archived silently.
          </div>
        </Rise>
      </Stage>
    </AbsoluteFill>
  );
};

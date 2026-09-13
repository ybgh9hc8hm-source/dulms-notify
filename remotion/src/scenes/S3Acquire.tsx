import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, Body, BODY, C, Card, DISPLAY, H1, Kicker, Rise, Stage } from "../theme";

const NODES = ["Scheduler tick", "Warm session", "Portal JSON endpoints", "Normalized records"];

const ITEMS: [string, string][] = [
  ["Session reuse", "One managed sign-in serves ~20 minutes of reads instead of a login per request."],
  ["Stable fingerprint", "Each student keeps one consistent client profile — no rotating identities."],
  ["Internal JSON, not HTML", "We call the endpoints the portal's own UI calls, so no fragile page scraping."],
  ["Jittered pacing", "Randomized micro-delays keep the traffic pattern human and polite."],
];

export const S3Acquire: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Bg />
      <Stage pad={110}>
        <Rise>
          <Kicker>Layer 1 — acquisition</Kicker>
        </Rise>
        <div style={{ height: 24 }} />
        <Rise delay={10}>
          <H1 size={70}>No API? Then become a well-behaved client.</H1>
        </Rise>
        <div style={{ height: 40 }} />
        {/* pipeline */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {NODES.map((n, i) => {
            const d = 26 + i * 16;
            const p = interpolate(f - d, [0, 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const pulse = 0.5 + 0.5 * Math.sin((f - d) / 9);
            return (
              <React.Fragment key={n}>
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: 25,
                    color: C.ink,
                    padding: "16px 22px",
                    borderRadius: 14,
                    border: `1px solid rgba(63,190,247,${0.2 + 0.25 * pulse})`,
                    background: "rgba(63,190,247,0.07)",
                    opacity: p,
                    transform: `translateY(${(1 - p) * 16}px)`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {n}
                </div>
                {i < NODES.length - 1 ? (
                  <div style={{ width: 66, height: 2, background: C.line, position: "relative", opacity: p }}>
                    <div
                      style={{
                        position: "absolute",
                        width: 22,
                        height: 4,
                        top: -1,
                        borderRadius: 4,
                        background: C.cyan,
                        left: `${(((f * 2.4 + i * 30) % 88) / 88) * 100 - 12}%`,
                        boxShadow: `0 0 14px ${C.cyan}`,
                      }}
                    />
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ height: 46 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
          {ITEMS.map(([t, s], i) => (
            <Rise key={t} delay={80 + i * 14}>
              <Card>
                <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 32, color: C.ink }}>{t}</div>
                <div style={{ fontFamily: BODY, fontSize: 23, color: C.dim, marginTop: 8, lineHeight: 1.45 }}>
                  {s}
                </div>
              </Card>
            </Rise>
          ))}
        </div>
        <div style={{ height: 30 }} />
        <Rise delay={150}>
          <Body size={26}>Quizzes · assignments · attendance · grades · timetable · registration windows</Body>
        </Rise>
      </Stage>
    </AbsoluteFill>
  );
};

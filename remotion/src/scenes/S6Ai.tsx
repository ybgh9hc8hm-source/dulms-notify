import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Bg, BODY, C, Card, DISPLAY, H1, Kicker, Rise, Stage } from "../theme";

const CARDS: [string, string][] = [
  ["Account-aware assistant", "Answers from the student's own records — deadlines, grades, attendance."],
  ["GPA modelling", "History, what-if simulations, target grades, retakes, graduation progress."],
  ["Timetable advisor", "Ranks registration choices against conflicts and gaps."],
  ["Vision for verification", "Reads the portal's verification image so a watched seat can be claimed in seconds."],
];

const Core: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "relative", width: 300, height: 300 }}>
      {[0, 1, 2].map((r) => {
        const s = 1 + 0.16 * r + 0.05 * Math.sin(f / 14 - r);
        return (
          <div
            key={r}
            style={{
              position: "absolute",
              inset: 40,
              borderRadius: 300,
              border: `1px solid rgba(63,190,247,${0.35 - r * 0.1})`,
              transform: `scale(${s}) rotate(${f * (r + 1) * 0.4}deg)`,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          inset: 92,
          borderRadius: 300,
          background: `radial-gradient(circle at 40% 35%, #BFE9FF, ${C.cyan} 55%, #1E6FA8 100%)`,
          boxShadow: `0 0 ${60 + 20 * Math.sin(f / 10)}px rgba(63,190,247,0.55)`,
        }}
      />
    </div>
  );
};

export const S6Ai: React.FC = () => (
  <AbsoluteFill>
    <Bg />
    <Stage pad={110}>
      <Rise>
        <Kicker>Layer 4 — intelligence</Kicker>
      </Rise>
      <div style={{ height: 24 }} />
      <Rise delay={10}>
        <H1 size={70}>Data becomes advice.</H1>
      </Rise>
      <div style={{ height: 36 }} />
      <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, flex: 1 }}>
          {CARDS.map(([t, s], i) => (
              <Rise key={t} delay={24 + i * 15}>
                <Card>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 30, color: C.ink }}>{t}</div>
                  <div style={{ fontFamily: BODY, fontSize: 22, color: C.dim, marginTop: 8, lineHeight: 1.45 }}>
                    {s}
                  </div>
                </Card>
              </Rise>
          ))}
        </div>
        <Core />
      </div>
      <div style={{ height: 34 }} />
      <Rise delay={110}>
        <div style={{ fontFamily: BODY, fontSize: 26, color: C.dim, maxWidth: 1100 }}>
          Automation only acts when the student explicitly enables or confirms it.
        </div>
      </Rise>
    </Stage>
  </AbsoluteFill>
);

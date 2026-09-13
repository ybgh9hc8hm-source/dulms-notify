import React from "react";
import { AbsoluteFill } from "remotion";
import { Bg, BODY, C, Card, DISPLAY, H1, Kicker, Rise, Stage } from "../theme";

const HARD: [string, string][] = [
  ["Sessions expire mid-read", "Detect the redirect to the login page, re-authenticate, resume — silently."],
  ["Capacity, not code, is the limit", "Shared egress + portal politeness caps throughput; scheduling beats brute force."],
  ["Human verification in the loop", "A visual challenge sits between a free seat and the student."],
  ["Zero contract, zero warning", "Any markup or endpoint can change overnight; every reader is defensive by default."],
];

export const S7Hard: React.FC = () => (
  <AbsoluteFill>
    <Bg tint={C.amber} />
    <Stage pad={120}>
      <Rise>
        <Kicker color={C.amber}>Why it was hard</Kicker>
      </Rise>
      <div style={{ height: 26 }} />
      <Rise delay={10}>
        <H1 size={72}>Everything a real API would have given us for free.</H1>
      </Rise>
      <div style={{ height: 46 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {HARD.map(([t, s], i) => (
          <Rise key={t} delay={26 + i * 16}>
            <Card glow={C.amber}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 32, color: C.ink }}>{t}</div>
              <div style={{ fontFamily: BODY, fontSize: 23, color: C.dim, marginTop: 8, lineHeight: 1.45 }}>
                {s}
              </div>
            </Card>
          </Rise>
        ))}
      </div>
    </Stage>
  </AbsoluteFill>
);

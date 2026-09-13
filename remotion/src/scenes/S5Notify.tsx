import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, BODY, C, Card, DISPLAY, H1, Kicker, Rise, Stage } from "../theme";

const MSGS: [string, string][] = [
  ["🔔 New quiz", "Data Structures — opens today 20:00, 2 attempts"],
  ["📝 Grade posted", "Assignment 2 — 9.5 / 10"],
  ["🎯 Group opened", "Computer Networks — group 4 has a free seat"],
];

export const S5Notify: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Bg tint={C.amber} />
      <Stage pad={110}>
        <Rise>
          <Kicker color={C.amber}>Layer 3 — delivery</Kicker>
        </Rise>
        <div style={{ height: 24 }} />
        <Rise delay={10}>
          <H1 size={70}>The portal has no notifications. So we built the missing channel.</H1>
        </Rise>
        <div style={{ height: 46 }} />
        <div style={{ display: "flex", gap: 40 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
            {[
              ["Outbox, not fire-and-forget", "Every alert is persisted, then delivered with retries and back-off."],
              ["Exactly once per change", "Deduplicated by item + field, so nobody gets the same alert twice."],
              ["Rate-aware sending", "Telegram limits are respected with queued, throttled batches."],
            ].map(([t, s], i) => (
              <Rise key={t} delay={26 + i * 16}>
                <Card glow={C.amber}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 31, color: C.ink }}>{t}</div>
                  <div style={{ fontFamily: BODY, fontSize: 23, color: C.dim, marginTop: 8 }}>{s}</div>
                </Card>
              </Rise>
            ))}
          </div>
          {/* phone */}
          <div
            style={{
              width: 420,
              height: 640,
              borderRadius: 44,
              border: `1px solid ${C.line}`,
              background: "linear-gradient(170deg, rgba(20,34,56,0.95), rgba(9,16,29,0.95))",
              padding: 26,
              boxShadow: "0 36px 90px rgba(2,6,14,0.65)",
            }}
          >
            <div style={{ fontFamily: BODY, fontSize: 20, color: C.dim, letterSpacing: "0.18em" }}>
              TELEGRAM · DULMS NOTIFY
            </div>
            <div style={{ height: 22 }} />
            {MSGS.map(([h, b], i) => {
              const d = 46 + i * 34;
              const p = interpolate(f - d, [0, 20], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const e = 1 - Math.pow(1 - p, 3);
              return (
                <div
                  key={h}
                  style={{
                    marginBottom: 16,
                    padding: "16px 18px",
                    borderRadius: "18px 18px 18px 6px",
                    background: "rgba(63,190,247,0.12)",
                    border: `1px solid rgba(63,190,247,0.22)`,
                    opacity: e,
                    transform: `translateY(${(1 - e) * 26}px) scale(${0.95 + 0.05 * e})`,
                  }}
                >
                  <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 27, color: C.ink }}>{h}</div>
                  <div style={{ fontFamily: BODY, fontSize: 21, color: C.dim, marginTop: 6 }}>{b}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

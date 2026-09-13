import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Bg, BODY, C, DISPLAY, H1, Kicker, Rise, Stage } from "../theme";

const STEPS = [
  ["01", "Read & accept the usage policy", "Consent version + timestamp stored on the account"],
  ["02", "Sign in with the university ID", "Credentials encrypted at rest, never logged"],
  ["03", "Link Telegram in one tap", "A signed one-time token binds chat ↔ student"],
];

const Shot: React.FC<{ file: string; pan: number; delay: number }> = ({ file, pan, delay }) => {
  const f = useCurrentFrame() - delay;
  const p = interpolate(f, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const e = 1 - Math.pow(1 - p, 3);
  const y = interpolate(f, [0, 240], [0, pan], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        width: 470,
        height: 560,
        borderRadius: 18,
        overflow: "hidden",
        border: `1px solid ${C.line}`,
        boxShadow: "0 30px 70px rgba(2,6,14,0.6)",
        opacity: e,
        transform: `translateY(${(1 - e) * 40}px) scale(${0.96 + e * 0.04})`,
        background: C.bg1,
      }}
    >
      <div
        style={{
          height: 34,
          background: "rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 14px",
        }}
      >
        {["#F5A524", "#3FBEF7", "#5AD1A0"].map((c) => (
          <span key={c} style={{ width: 9, height: 9, borderRadius: 9, background: c, opacity: 0.75 }} />
        ))}
      </div>
      <Img
        src={staticFile(`images/${file}`)}
        style={{
          width: "100%",
          minHeight: 1100,
          objectFit: "cover",
          objectPosition: "top center",
          transform: `translateY(${-y}px)`,
        }}
      />
    </div>
  );
};

export const S2Journey: React.FC = () => (
  <AbsoluteFill>
    <Bg />
    <Stage pad={110}>
      <Rise>
        <Kicker>The user journey</Kicker>
      </Rise>
      <div style={{ height: 26 }} />
      <Rise delay={10}>
        <H1 size={72}>Three steps, then it runs on its own.</H1>
      </Rise>
      <div style={{ height: 44 }} />
      <div style={{ display: "flex", gap: 46, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, flex: 1 }}>
          {STEPS.map(([n, t, s], i) => (
            <Rise key={n} delay={30 + i * 18}>
              <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 700,
                    fontSize: 26,
                    color: C.cyan,
                    border: `1px solid rgba(63,190,247,0.4)`,
                    borderRadius: 12,
                    padding: "10px 14px",
                    background: "rgba(63,190,247,0.08)",
                  }}
                >
                  {n}
                </div>
                <div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 36, color: C.ink }}>{t}</div>
                  <div style={{ fontFamily: BODY, fontSize: 24, color: C.dim, marginTop: 6 }}>{s}</div>
                </div>
              </div>
            </Rise>
          ))}
        </div>
        <div style={{ display: "flex", gap: 26 }}>
          <Shot file="01-landing-desktop.png" pan={430} delay={20} />
          <Shot file="04-auth-consent-captcha-desktop.png" pan={90} delay={44} />
        </div>
      </div>
    </Stage>
  </AbsoluteFill>
);

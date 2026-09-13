import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { S1Problem } from "./scenes/S1Problem";
import { S2Journey } from "./scenes/S2Journey";
import { S3Acquire } from "./scenes/S3Acquire";
import { S4Diff } from "./scenes/S4Diff";
import { S5Notify } from "./scenes/S5Notify";
import { S6Ai } from "./scenes/S6Ai";
import { S7Hard } from "./scenes/S7Hard";
import { S8Outro } from "./scenes/S8Outro";

const T = 24;
export const SCENES: [React.FC, number][] = [
  [S1Problem, 165],
  [S2Journey, 210],
  [S3Acquire, 220],
  [S4Diff, 205],
  [S5Notify, 215],
  [S6Ai, 195],
  [S7Hard, 190],
  [S8Outro, 170],
];

export const TOTAL = SCENES.reduce((a, [, d]) => a + d, 0) - T * (SCENES.length - 1);

export const MainVideo: React.FC = () => (
  <AbsoluteFill style={{ background: "#060A14" }}>
    <TransitionSeries>
      {SCENES.map(([Comp, dur], i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <TransitionSeries.Transition
              presentation={i % 2 === 0 ? wipe({ direction: "from-right" }) : fade()}
              timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
            />
          ) : null}
          <TransitionSeries.Sequence durationInFrames={dur}>
            <Comp />
          </TransitionSeries.Sequence>
        </React.Fragment>
      ))}
    </TransitionSeries>
  </AbsoluteFill>
);

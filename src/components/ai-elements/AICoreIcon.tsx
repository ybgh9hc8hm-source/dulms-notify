import { cn } from "@/lib/utils";
import aiCoreMobile from "@/assets/ai-core-mobile.webp";

interface AICoreIconProps {
  size?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * The raw animated AI core — transparent image, no frame, no background.
 * Animated WebP is used instead of video because mobile Safari renders MP4
 * fallbacks with their original black background.
 */
export function AICoreIcon({ size = 40, className, ariaLabel = "AI" }: AICoreIconProps) {
  return (
    <img
      src={aiCoreMobile}
      alt=""
      aria-label={ariaLabel}
      role="img"
      draggable={false}
      className={cn("ai-core-video pointer-events-none object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

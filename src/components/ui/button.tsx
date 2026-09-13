import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Apple HIG: 44pt-friendly targets, continuous radii, press-down feedback,
  // color carries the emphasis instead of shadow.
  "press inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-[0.9375rem] font-semibold tracking-[-0.01em] cursor-pointer active:scale-[0.97] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-[1.05rem] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/88",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/88",
        outline:
          "border-[0.5px] border-input bg-secondary/40 text-foreground hover:bg-secondary/70",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        ghost: "text-foreground hover:bg-secondary/60",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg px-3 text-[0.8125rem]",
        lg: "h-12 rounded-2xl px-7 text-[1.0625rem]",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-lg p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

// components/ui/progress-circle.tsx
// Tremor ProgressCircle [v0.0.3] — radial progress ring with a centered slot
// for the value. Adapted to this repo's `cn` util; extra brand color variants.

import * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/utils";

const progressCircleVariants = tv({
  slots: {
    background: "",
    circle: "",
  },
  variants: {
    variant: {
      default: {
        background: "stroke-blue-200",
        circle: "stroke-blue-500",
      },
      indigo: {
        background: "stroke-indigo-100",
        circle: "stroke-indigo-500",
      },
      amber: {
        background: "stroke-amber-100",
        circle: "stroke-amber-500",
      },
      neutral: {
        background: "stroke-gray-200",
        circle: "stroke-gray-500",
      },
      warning: {
        background: "stroke-amber-100",
        circle: "stroke-amber-500",
      },
      error: {
        background: "stroke-red-200",
        circle: "stroke-red-500",
      },
      success: {
        background: "stroke-emerald-100",
        circle: "stroke-emerald-500",
      },
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface ProgressCircleProps
  extends Omit<React.SVGProps<SVGSVGElement>, "value">,
    VariantProps<typeof progressCircleVariants> {
  value?: number;
  max?: number;
  showAnimation?: boolean;
  radius?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}

const ProgressCircle = React.forwardRef<SVGSVGElement, ProgressCircleProps>(
  (
    {
      value = 0,
      max = 100,
      radius = 32,
      strokeWidth = 6,
      showAnimation = true,
      variant,
      className,
      children,
      ...props
    }: ProgressCircleProps,
    forwardedRef
  ) => {
    const safeValue = Math.min(max, Math.max(value, 0));
    const normalizedRadius = radius - strokeWidth / 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const offset = circumference - (safeValue / max) * circumference;

    const { background, circle } = progressCircleVariants({ variant });

    return (
      <div
        className="relative"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <svg
          ref={forwardedRef}
          width={radius * 2}
          height={radius * 2}
          viewBox={`0 0 ${radius * 2} ${radius * 2}`}
          className={cn("-rotate-90 transform", className)}
          {...props}
        >
          <circle
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            strokeWidth={strokeWidth}
            fill="transparent"
            stroke=""
            strokeLinecap="round"
            className={cn("transition-colors ease-linear", background())}
          />
          {safeValue >= 0 ? (
            <circle
              r={normalizedRadius}
              cx={radius}
              cy={radius}
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={offset}
              fill="transparent"
              stroke=""
              strokeLinecap="round"
              className={cn(
                "transition-colors ease-linear",
                circle(),
                showAnimation &&
                  "transform-gpu transition-all duration-300 ease-in-out"
              )}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      </div>
    );
  }
);

ProgressCircle.displayName = "ProgressCircle";

export { ProgressCircle, type ProgressCircleProps };

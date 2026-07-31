// components/flags/axis-style.ts

/**
 * Per-axis colour code used to tell Media Spend / Labs / Revenue flags apart at
 * a glance on the Flags page. Brand palette, deliberately avoiding yellow
 * (reserved for the warning surface) and green (reserved for the validated
 * state): Media = blue, Labs = purple, Revenue = pink. `stripe` is a left border
 * accent, `chip` a small label pill.
 */

import type { AxisId } from "../../lib/types/forecaster.types";

export const AXIS_STYLE: Record<
  AxisId,
  { label: string; stripe: string; chip: string }
> = {
  media: { label: "Media Spend", stripe: "border-l-blue-500", chip: "bg-blue-200 text-gray-900" },
  labs: { label: "Labs", stripe: "border-l-purple-600", chip: "bg-purple-600 text-white" },
  revenue: { label: "Revenue", stripe: "border-l-pink-500", chip: "bg-pink-500 text-gray-900" },
};

// components/dashboard/charts/chart-card.tsx

/**
 * Card shell for a dashboard chart — title row (optional icon + subtitle) over
 * the chart body. Built on the shared shadcn/ui Card primitive so every card on
 * the dashboard shares one consistent surface, spacing and shadow.
 */

import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "../../ui/card";

export default function ChartCard({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className="flex-shrink-0 text-primary" />}
          <div>
            <CardTitle>{title}</CardTitle>
            {subtitle && <CardDescription className="mt-0.5">{subtitle}</CardDescription>}
          </div>
        </div>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

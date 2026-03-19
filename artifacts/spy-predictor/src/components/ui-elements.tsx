import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn(
        "glass-panel rounded-2xl overflow-hidden transition-all duration-300 hover:border-white/10 hover:shadow-black/60",
        className
      )} 
      {...props}
    >
      {children}
    </div>
  );
}

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center min-h-[200px]", className)}>
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
}

export function Badge({ 
  children, 
  variant = "neutral",
  className 
}: { 
  children: React.ReactNode; 
  variant?: "bullish" | "bearish" | "neutral" | "outline";
  className?: string;
}) {
  const variants = {
    bullish: "bg-bullish/15 text-bullish border-bullish/30 shadow-[0_0_10px_rgba(22,163,74,0.1)]",
    bearish: "bg-bearish/15 text-bearish border-bearish/30 shadow-[0_0_10px_rgba(225,29,72,0.1)]",
    neutral: "bg-neutral/15 text-neutral border-neutral/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]",
    outline: "bg-transparent text-muted-foreground border-border",
  };

  return (
    <span className={cn(
      "px-2.5 py-1 rounded-full text-xs font-semibold border uppercase tracking-wider font-mono inline-flex items-center justify-center",
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}

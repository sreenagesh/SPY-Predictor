import React from "react";
import { Activity, LayoutDashboard, Settings, TrendingUp, ClipboardList } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { name: "Dashboard", href: "/",        icon: LayoutDashboard },
    { name: "History",   href: "/history", icon: ClipboardList },
    { name: "Analysis",  href: "/analysis", icon: Activity },
    { name: "Models",    href: "/models",   icon: TrendingUp },
    { name: "Settings",  href: "/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row dark">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border/50 bg-card/30 backdrop-blur-md flex-shrink-0 z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-lg shadow-primary/20">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg leading-tight tracking-wide">SPY Predictor</h1>
            <p className="text-xs text-muted-foreground font-medium">Alpha Quant Engine</p>
          </div>
        </div>

        <nav className="px-4 pb-6 space-y-1 mt-4 md:mt-8 flex md:flex-col overflow-x-auto md:overflow-visible">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href} className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium whitespace-nowrap",
                isActive 
                  ? "bg-primary/10 text-primary shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
                <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 max-h-screen overflow-y-auto">
        <header className="h-16 flex items-center justify-between px-8 border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-bullish animate-pulse" />
            <span className="text-sm font-mono text-muted-foreground">System Operational • Live Feed</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </header>
        
        <div className="p-4 md:p-8 w-full max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

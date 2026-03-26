import React, { useState, useCallback } from "react";
import { Trophy, Zap, TrendingUp, RotateCcw, Plus } from "lucide-react";
import { getAllScores, clearScores, recordManualOutcome } from "@/hooks/use-trade-tracker";
import { cn } from "@/lib/utils";

interface ScoreCardProps {
  label: string;
  icon: React.ElementType;
  iconColor: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  onManualRecord?: () => void;
}

function ScoreCard({ label, icon: Icon, iconColor, wins, losses, total, winRate, onManualRecord }: ScoreCardProps) {
  const hasData = total > 0;
  const rateColor = winRate >= 60 ? "text-emerald-400" : winRate >= 40 ? "text-amber-400" : winRate > 0 ? "text-red-400" : "text-muted-foreground";

  return (
    <div className="flex-1 min-w-0 bg-white/3 border border-white/8 rounded-xl px-3 py-2.5 flex items-center gap-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-black text-emerald-400">{wins}W</span>
          <span className="text-[10px] text-muted-foreground">/</span>
          <span className="text-sm font-black text-red-400">{losses}L</span>
          {hasData && (
            <span className={cn("text-[10px] font-bold ml-1", rateColor)}>{winRate}%</span>
          )}
          {!hasData && (
            <span className="text-[10px] text-muted-foreground/50 ml-1">—</span>
          )}
        </div>
      </div>
      {onManualRecord && (
        <button
          onClick={onManualRecord}
          className="flex-shrink-0 w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          title="Record trade outcome"
        >
          <Plus className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function ManualEntryModal({ onClose, onRecord }: {
  onClose: () => void;
  onRecord: (signal: "CALL" | "PUT", outcome: "T1" | "T2" | "SL") => void;
}) {
  const [signal, setSignal] = useState<"CALL" | "PUT">("CALL");
  const outcomes: { value: "T1" | "T2" | "SL"; label: string; color: string }[] = [
    { value: "T1", label: "T1 Hit (Win)", color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" },
    { value: "T2", label: "T2 Hit (Big Win)", color: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20" },
    { value: "SL", label: "SL Hit (Loss)", color: "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl p-5 w-72 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-sm font-bold text-center">Record Best Options Trade</p>
        <div className="flex gap-2">
          {(["CALL", "PUT"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSignal(s)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all",
                signal === s
                  ? s === "CALL" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "bg-red-500/20 border-red-500/40 text-red-400"
                  : "border-white/10 text-muted-foreground hover:border-white/20",
              )}
            >{s}</button>
          ))}
        </div>
        <div className="space-y-2">
          {outcomes.map(o => (
            <button
              key={o.value}
              onClick={() => { onRecord(signal, o.value); onClose(); }}
              className={cn("w-full py-2 rounded-lg text-xs font-bold border transition-all", o.color)}
            >{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Scoreboard() {
  const [tick, setTick] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const scores = getAllScores();

  const handleReset = () => {
    if (confirm("Reset all trade history?")) { clearScores(); refresh(); }
  };

  const handleRecord = (signal: "CALL" | "PUT", outcome: "T1" | "T2" | "SL") => {
    recordManualOutcome("best", signal, outcome);
    refresh();
  };

  return (
    <>
      <div className="glass-panel rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 mr-1">
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Scoreboard</span>
          </div>

          <div className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
            <ScoreCard
              label="Intraday"
              icon={Zap}
              iconColor="bg-blue-500/20 text-blue-400"
              {...scores.intraday}
            />
            <ScoreCard
              label="Swing / BTST"
              icon={TrendingUp}
              iconColor="bg-purple-500/20 text-purple-400"
              {...scores.swing}
            />
            <ScoreCard
              label="Best Options"
              icon={Trophy}
              iconColor="bg-yellow-500/20 text-yellow-400"
              {...scores.best}
              onManualRecord={() => setShowModal(true)}
            />
          </div>

          <button
            onClick={handleReset}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title="Reset scores"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showModal && (
        <ManualEntryModal
          onClose={() => setShowModal(false)}
          onRecord={handleRecord}
        />
      )}
    </>
  );
}

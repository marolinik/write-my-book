"use client";

import { useEffect, useRef } from "react";

interface FloatingAgentOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
}

export function FloatingAgentOverlay({
  children,
  onClose,
}: FloatingAgentOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const x = e.clientX - dragRef.current.offsetX;
      const y = e.clientY - dragRef.current.offsetY;
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;
      panel.style.right = "auto";
      panel.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
      panel.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    };

    const handleMouseUp = () => {
      dragRef.current.dragging = false;
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    document.body.style.userSelect = "none";
  };

  return (
    <div
      ref={panelRef}
      className="fixed z-30 flex flex-col rounded-xl border bg-background shadow-2xl overflow-hidden overscroll-contain"
      style={{
        right: 20,
        top: 64,
        width: 400,
        maxHeight: "calc(100vh - 80px)",
      }}
    >
      {/* Thin drag grip — replaces the old duplicate header */}
      <div
        className="flex items-center justify-center py-1 cursor-grab active:cursor-grabbing select-none shrink-0 bg-muted/30 hover:bg-muted/50 transition-colors"
        onMouseDown={handleDragStart}
      >
        <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
      </div>

      {/* Panel content — AgentPanel provides its own header */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useState, useRef } from "react";
import { UploadIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxSizeMB?: number;
  disabled?: boolean;
}

export function FileDropzone({
  onFilesSelected,
  accept = ".md,.txt,.docx",
  maxSizeMB = 20,
  disabled = false,
}: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;

      const files = Array.from(e.dataTransfer.files).filter((f) => {
        const ext = "." + f.name.split(".").pop()?.toLowerCase();
        return accept.split(",").includes(ext);
      });

      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [accept, disabled, onFilesSelected]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [onFilesSelected]
  );

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50",
        disabled && "pointer-events-none opacity-50"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <UploadIcon className="mb-3 size-8 text-muted-foreground" />
      <p className="text-sm font-medium">
        Drop your manuscript files here, or click to browse
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Supports .md, .txt, .docx (max {maxSizeMB}MB)
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}

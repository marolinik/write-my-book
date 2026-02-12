"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import {
  BookOpenIcon,
  UploadIcon,
  PaletteIcon,
  BookMarkedIcon,
  LayoutIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ChevronLeftIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAgentStore } from "@/stores/agent-store";
import { useBook, useUpdateBook } from "@/hooks/use-books";

const STEPS = [
  {
    id: "basics",
    title: "Basics",
    icon: BookOpenIcon,
    description: "Set your book's name, genre, and language",
  },
  {
    id: "import",
    title: "Import",
    icon: UploadIcon,
    description: "Import an existing manuscript (optional)",
  },
  {
    id: "style",
    title: "Style",
    icon: PaletteIcon,
    description: "Capture your unique writing voice",
  },
  {
    id: "bible",
    title: "Story Bible",
    icon: BookMarkedIcon,
    description: "Build your world, characters, and rules",
  },
  {
    id: "architecture",
    title: "Architecture",
    icon: LayoutIcon,
    description: "Design your story structure",
  },
  {
    id: "done",
    title: "Done",
    icon: CheckCircle2Icon,
    description: "You're all set!",
  },
] as const;

export default function SetupPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const [currentStep, setCurrentStep] = useState(0);
  const openWithWorkflow = useAgentStore((s) => s.openWithWorkflow);
  const { data: book } = useBook(bookId);
  const updateBook = useUpdateBook(bookId);

  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("en");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (book) {
      setName(book.name ?? "");
      setGenre(book.genre ?? "");
      setLanguage(book.language ?? "en");
    }
  }, [book]);

  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  const next = () => setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const handleSaveBasics = async () => {
    await updateBook.mutateAsync({
      name: name || undefined,
      genre: genre || undefined,
      language: language || undefined,
    });
    next();
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold mb-2">Book Setup</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Complete these steps to set up your book for writing.
      </p>

      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <button
                onClick={() => setCurrentStep(i)}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors w-full ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="hidden sm:inline truncate">{s.title}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRightIcon className="size-3 text-muted-foreground mx-0.5 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <step.icon className="size-5" />
            {step.title}
          </CardTitle>
          <CardDescription>{step.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step.id === "basics" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Book Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Novel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="genre">Genre</Label>
                <Input
                  id="genre"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="Fantasy, Sci-Fi, Romance..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Input
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A brief summary of your book..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  onClick={handleSaveBasics}
                  disabled={updateBook.isPending}
                >
                  Save & Continue
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "import" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                If you have an existing manuscript, you can import it now. This
                step is optional -- you can always import later.
              </p>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <Link href={`/books/${bookId}/import`}>
                    <UploadIcon className="mr-2 size-4" />
                    Go to Import
                  </Link>
                </Button>
              </div>
              <div className="flex justify-between pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  Back
                </Button>
                <Button variant="outline" size="sm" onClick={next}>
                  Skip
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "style" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Analyze your writing samples to create a unique voice
                fingerprint. The agent will examine your prose and build a style
                profile that guides the ghostwriter.
              </p>
              <Button onClick={() => openWithWorkflow("capture-style")}>
                <SparklesIcon className="mr-2 size-4" />
                Capture My Writing Style
              </Button>
              <div className="flex justify-between pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  Back
                </Button>
                <Button variant="outline" size="sm" onClick={next}>
                  Skip
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "bible" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Build a story bible with your world, characters, rules, and
                lore. This keeps the ghostwriter consistent across chapters.
              </p>
              <Button onClick={() => openWithWorkflow("create-story-bible")}>
                <BookMarkedIcon className="mr-2 size-4" />
                Create Story Bible
              </Button>
              <div className="flex justify-between pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  Back
                </Button>
                <Button variant="outline" size="sm" onClick={next}>
                  Skip
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "architecture" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Design your story structure -- acts, chapters, plot arcs, and
                pacing. The agent will help you outline the full book.
              </p>
              <Button onClick={() => openWithWorkflow("build-architecture")}>
                <LayoutIcon className="mr-2 size-4" />
                Build Architecture
              </Button>
              <div className="flex justify-between pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  Back
                </Button>
                <Button variant="outline" size="sm" onClick={next}>
                  Skip
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md bg-green-50 dark:bg-green-950/30 p-4">
                <CheckCircle2Icon className="size-6 text-green-600 dark:text-green-400" />
                <div>
                  <p className="font-medium text-sm">Setup Complete</p>
                  <p className="text-xs text-muted-foreground">
                    Your book is ready. You can revisit any setup step later.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/books/${bookId}`}>
                    <BookOpenIcon className="mr-1 size-4" />
                    Book Overview
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/books/${bookId}/editorial`}>
                    <SparklesIcon className="mr-1 size-4" />
                    Editorial
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/books/${bookId}/documents`}>
                    <LayoutIcon className="mr-1 size-4" />
                    Documents
                  </Link>
                </Button>
              </div>
              <div className="flex justify-start pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  Back
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

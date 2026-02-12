"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useParams } from "next/navigation";
import {
  BookOpenIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  PenLineIcon,
  FileTextIcon,
  PlusIcon,
  ChevronRightIcon,
  PenToolIcon,
  BarChart3Icon,
  DownloadIcon,
  UploadIcon,
  SettingsIcon,
  PaletteIcon,
  WandIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useBook } from "@/hooks/use-books";
import { useSeriesDetail } from "@/hooks/use-series";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured =
  clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");

// Dynamic import: avoids loading @clerk/nextjs module when Clerk isn't configured
const UserButton = dynamic(
  () => import("@clerk/nextjs").then((mod) => ({ default: mod.UserButton })),
  { ssr: false }
);

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Books", href: "/books", icon: BookOpenIcon },
  { title: "Series", href: "/series", icon: LibraryIcon },
];

export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams();
  const bookId = params?.bookId as string | undefined;
  const seriesId = params?.seriesId as string | undefined;

  const { data: book } = useBook(bookId ?? "");
  const { data: series } = useSeriesDetail(seriesId ?? "");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <PenLineIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-display text-base font-semibold">
                    WriteMyBook
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Writing Platform
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href)
                    }
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Active Series Context */}
        {seriesId && series && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-1">
              <LibraryIcon className="size-3" />
              <span className="truncate">{series.title}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      pathname === `/series/${seriesId}` &&
                      !pathname.includes("/analytics")
                    }
                  >
                    <Link href={`/series/${seriesId}`}>
                      <FileTextIcon />
                      <span>Overview</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={false}
                  >
                    <Link href={`/series/${seriesId}`}>
                      <DownloadIcon />
                      <span>Documents</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={false}
                  >
                    <Link href={`/series/${seriesId}`}>
                      <BarChart3Icon />
                      <span>Analytics</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Books sub-nav */}
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <ChevronRightIcon />
                    <span>Books</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    {series.books?.map((b) => (
                      <SidebarMenuSubItem key={b.id}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname.includes(`/books/${b.id}`)}
                        >
                          <Link href={`/books/${b.id}`}>
                            <span>
                              {b.bookNumber}. {b.name}
                            </span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Active Book Context */}
        {bookId && book && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-1">
              <BookOpenIcon className="size-3" />
              <span className="truncate">{book.name}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      pathname === `/books/${bookId}` &&
                      !pathname.includes("/chapters") &&
                      !pathname.includes("/settings")
                    }
                  >
                    <Link href={`/books/${bookId}`}>
                      <FileTextIcon />
                      <span>Overview</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes("/setup")}
                  >
                    <Link href={`/books/${bookId}/setup`}>
                      <WandIcon />
                      <span>Setup</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes("/documents")}
                  >
                    <Link href={`/books/${bookId}/documents`}>
                      <FileTextIcon />
                      <span>Documents</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes("/editorial")}
                  >
                    <Link href={`/books/${bookId}/editorial`}>
                      <PenToolIcon />
                      <span>Editorial</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes("/import")}
                  >
                    <Link href={`/books/${bookId}/import`}>
                      <UploadIcon />
                      <span>Import</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes("/export")}
                  >
                    <Link href={`/books/${bookId}/export`}>
                      <DownloadIcon />
                      <span>Export</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes("/reports")}
                  >
                    <Link href={`/books/${bookId}/reports`}>
                      <BarChart3Icon />
                      <span>Reports</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes("/style")}
                  >
                    <Link href={`/books/${bookId}/style`}>
                      <PaletteIcon />
                      <span>Style</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Chapters sub-nav */}
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <ChevronRightIcon />
                    <span>Chapters</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    {book.chapters?.map((ch) => (
                      <SidebarMenuSubItem key={ch.id}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname.includes(`/chapters/${ch.id}`)}
                        >
                          <Link
                            href={`/books/${bookId}/chapters/${ch.id}`}
                          >
                            <span>
                              Ch. {ch.chapterNumber}
                              {ch.title ? `: ${ch.title}` : ""}
                            </span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild>
                        <Link href={`/books/${bookId}/chapters/new`}>
                          <PlusIcon className="size-3" />
                          <span>Add Chapter</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
            >
              <Link href="/settings">
                <SettingsIcon />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isClerkConfigured && (
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="cursor-default">
                <UserButton
                  afterSignOutUrl="/login"
                  appearance={{
                    elements: { avatarBox: "size-8" },
                  }}
                />
                <span className="truncate text-sm">Account</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

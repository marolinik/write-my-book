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
import { useLanguage } from "@/components/providers/language-provider";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured =
  clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");

// Dynamic import: avoids loading @clerk/nextjs module when Clerk isn't configured
const UserButton = dynamic(
  () => import("@clerk/nextjs").then((mod) => ({ default: mod.UserButton })),
  { ssr: false }
);

export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams();
  const bookId = params?.bookId as string | undefined;
  const seriesId = params?.seriesId as string | undefined;
  const { t } = useLanguage();

  const { data: book } = useBook(bookId ?? "");
  const { data: series } = useSeriesDetail(seriesId ?? "");

  const navItems = [
    { title: t.nav.dashboard, href: "/dashboard", icon: LayoutDashboardIcon },
    { title: t.nav.books, href: "/books", icon: BookOpenIcon },
    { title: t.nav.series, href: "/series", icon: LibraryIcon },
  ];

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
                    {t.nav.writingPlatform}
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
          <SidebarGroupLabel>{t.nav.navigation}</SidebarGroupLabel>
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
                      <span>{t.nav.overview}</span>
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
                      <span>{t.nav.documents}</span>
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
                      <span>{t.nav.analytics}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Books sub-nav */}
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <ChevronRightIcon />
                    <span>{t.nav.books}</span>
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
                      <span>{t.nav.overview}</span>
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
                      <span>{t.nav.setup}</span>
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
                      <span>{t.nav.documents}</span>
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
                      <span>{t.nav.editorial}</span>
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
                      <span>{t.nav.import}</span>
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
                      <span>{t.nav.export}</span>
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
                      <span>{t.nav.reports}</span>
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
                      <span>{t.nav.style}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Chapters sub-nav */}
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <ChevronRightIcon />
                    <span>{t.nav.chapters}</span>
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
                          <span>{t.nav.addChapter}</span>
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
                <span>{t.nav.settings}</span>
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
                <span className="truncate text-sm">{t.nav.account}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

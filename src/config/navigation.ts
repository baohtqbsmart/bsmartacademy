import {
  AlarmClockIcon,
  BanknoteIcon,
  BookOpenIcon,
  ChartColumnIcon,
  FileTextIcon,
  ReceiptTextIcon,
  TagsIcon,
  WalletIcon,
  CalendarCheckIcon,
  ClipboardListIcon,
  FileCheckIcon,
  LibraryBigIcon,
  LanguagesIcon,
  BookAIcon,
  NotebookTextIcon,
  PenLineIcon,
  VideoIcon,
  CalendarDaysIcon,
  LibraryIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  PresentationIcon,
  PaletteIcon,
  FolderOpenIcon,
  TrendingUpIcon,
  HeartHandshakeIcon,
  GaugeIcon,
  SparklesIcon,
  FileBarChartIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react"

import { canAccessRoute } from "@/config/access"
import { routes } from "@/config/routes"
import type { PermissionGrants } from "@/lib/auth/permissions"

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
}

export type NavSection = {
  label: string
  items: NavItem[]
}

/**
 * Sidebar navigation. Add an entry only when the route exists. Visibility is
 * derived from config/access.ts, the same rules the pages enforce.
 */
export const navigation: NavSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: routes.dashboard, icon: LayoutDashboardIcon },
      { title: "Admin dashboard", href: routes.adminDashboard, icon: GaugeIcon },
      { title: "Reports", href: routes.reports, icon: FileBarChartIcon },
      { title: "My family", href: routes.family, icon: HeartHandshakeIcon },
      { title: "Progress", href: routes.analytics, icon: TrendingUpIcon },
    ],
  },
  {
    label: "Communication",
    items: [
      { title: "Announcements", href: routes.announcements, icon: MegaphoneIcon },
      { title: "Messages", href: routes.messages, icon: MessagesSquareIcon },
    ],
  },
  {
    label: "Academics",
    items: [
      { title: "Timetable", href: routes.timetable, icon: CalendarDaysIcon },
      { title: "Online classes", href: routes.online, icon: VideoIcon },
      { title: "Attendance", href: routes.attendance, icon: CalendarCheckIcon },
      { title: "Assignments", href: routes.assignments, icon: ClipboardListIcon },
      { title: "Tests", href: routes.tests, icon: FileCheckIcon },
      { title: "Question bank", href: routes.questionBank, icon: LibraryBigIcon },
      { title: "Lesson designer", href: routes.designs, icon: PaletteIcon },
      { title: "Material library", href: routes.library, icon: FolderOpenIcon },
      { title: "AI assistant", href: routes.ai, icon: SparklesIcon },
      { title: "Classes", href: routes.classes, icon: PresentationIcon },
      { title: "Courses", href: routes.courses, icon: BookOpenIcon },
      { title: "Subjects & levels", href: routes.subjects, icon: LibraryIcon },
    ],
  },
  {
    label: "English",
    items: [
      { title: "English dashboard", href: routes.english, icon: LanguagesIcon },
      { title: "Vocabulary", href: routes.vocabulary, icon: BookAIcon },
      { title: "Lessons", href: routes.lessons, icon: NotebookTextIcon },
      { title: "Writing & speaking", href: routes.assessments, icon: PenLineIcon },
    ],
  },
  {
    label: "People",
    items: [
      { title: "Students", href: routes.students, icon: GraduationCapIcon },
      { title: "Parents", href: routes.parents, icon: UsersRoundIcon },
      { title: "Teachers", href: routes.teachers, icon: UsersIcon },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Tuition", href: routes.tuition, icon: WalletIcon },
      { title: "Student tuition", href: routes.tuitionStudents, icon: ReceiptTextIcon },
      { title: "Outstanding fees", href: `${routes.invoices}?status=outstanding`, icon: AlarmClockIcon },
      { title: "Invoices", href: routes.invoices, icon: FileTextIcon },
      { title: "Payments", href: routes.payments, icon: BanknoteIcon },
      { title: "Tuition plans", href: routes.tuitionPlans, icon: TagsIcon },
      { title: "Reports", href: routes.tuitionReports, icon: ChartColumnIcon },
    ],
  },
  {
    label: "Administration",
    items: [{ title: "Users & roles", href: routes.users, icon: ShieldCheckIcon }],
  },
  {
    label: "Account",
    items: [{ title: "My profile", href: routes.profile, icon: UserRoundIcon }],
  },
]

export function navigationFor(grants: PermissionGrants): NavSection[] {
  return navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessRoute(grants, item.href)),
    }))
    .filter((section) => section.items.length > 0)
}

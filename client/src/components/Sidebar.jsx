import { Link, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import ThemeToggle from "./ThemeToggle.jsx";
import {
  Home,
  LayoutDashboard,
  MessageSquare,
  Users,
  UserRound,
  Video,
  Bot,
  BookOpen,
  FileText,
  ListChecks,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { to: "/profile", label: "Profile", icon: <UserRound size={18} /> },
  { to: "/todos", label: "To-do", icon: <ListChecks size={18} /> },
  { to: "/feed", label: "Feed", icon: <Home size={18} /> },
  { to: "/friends", label: "Friends", icon: <Users size={18} /> },
  { to: "/chat", label: "Chat", icon: <MessageSquare size={18} /> },
  { to: "/groq", label: "Groq Assistant", icon: <Bot size={18} /> },
  { to: "/classrooms", label: "Classrooms", icon: <Video size={18} /> },
  { to: "/courses", label: "Courses", icon: <BookOpen size={18} /> },
  { to: "/summaries", label: "Summaries", icon: <FileText size={18} /> },
];

const NavItem = ({ to, label, icon }) => {
  const { pathname } = useLocation();
  const active = pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-2 rounded-lg font-medium transition 
      ${active
          ? "bg-base-300 text-primary border-r-4 border-primary"
          : "hover:bg-base-200"}`
      }
    >
      <span>{icon}</span>
      {label}
    </Link>
  );
};

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen border-r bg-base-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b">
        <h2 className="text-lg font-semibold">Edufy</h2>
        <ThemeToggle />
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3 mt-3 flex-1">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t px-4 py-3 flex items-center gap-3">
        <UserButton afterSignOutUrl="/" />
        <div className="text-sm opacity-70">Account</div>
      </div>
    </aside>
  );
}

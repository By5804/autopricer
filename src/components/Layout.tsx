import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Settings,
  Bot,
  LogOut,
  Package2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { href: "/", label: "Products", icon: LayoutDashboard },
  { href: "/configuration", label: "Configuration", icon: Settings },
  { href: "/automation", label: "Automation", icon: Bot },
];

export const Layout = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen w-full flex">
      <aside
        className={cn(
          "flex-shrink-0 border-r bg-background flex flex-col transition-all duration-300 ease-in-out",
          isCollapsed ? "w-20" : "w-64"
        )}
        onMouseEnter={() => setIsCollapsed(false)}
        onMouseLeave={() => setIsCollapsed(true)}
      >
        <div className="flex items-center p-4 border-b h-16">
          <a href="/" className="flex items-center gap-2 font-bold text-lg whitespace-nowrap">
            <Package2 className="h-6 w-6 text-primary" />
            {!isCollapsed && <span>Itemku Pricer</span>}
          </a>
        </div>

        <nav className="flex flex-col gap-1 flex-grow p-2">
          {navItems.map((item) => (
            <Tooltip key={item.href} delayDuration={0}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.href}
                  end={item.href === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "text-muted-foreground hover:text-primary",
                      isActive && "bg-muted text-primary font-semibold",
                      isCollapsed ? "justify-center" : ""
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right">{item.label}</TooltipContent>
              )}
            </Tooltip>
          ))}
        </nav>

        <div className="mt-auto p-2 border-t">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className={cn(
                  "w-full text-muted-foreground hover:text-primary",
                  isCollapsed ? "justify-center" : "justify-start gap-3"
                )}
              >
                <LogOut className="h-5 w-5" />
                {!isCollapsed && <span className="text-sm font-medium">Logout</span>}
              </Button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right">Logout</TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-muted/40">
        <Outlet />
      </main>
    </div>
  );
};
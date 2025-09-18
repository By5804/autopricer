import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, LogOut, Package2, Users, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "User Management", icon: Users },
];

export const AdminLayout = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen w-full flex">
      <aside className="flex-shrink-0 border-r bg-background flex flex-col w-64">
        <div className="flex items-center p-4 border-b h-16">
          <a href="/admin" className="flex items-center gap-2 font-bold text-lg whitespace-nowrap">
            <Package2 className="h-6 w-6 text-primary" />
            <span>Itemku Pricer - Admin</span>
          </a>
        </div>

        <nav className="flex flex-col gap-1 flex-grow p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:text-primary",
                  isActive && "bg-muted text-primary font-semibold"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto p-2 border-t">
           <div className="flex items-center gap-2 text-sm font-medium p-3 text-muted-foreground">
            <Shield className="h-5 w-5 text-red-500" />
            <span>Admin Mode</span>
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-primary"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Logout</span>
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-muted/40">
        <Outlet />
      </main>
    </div>
  );
};
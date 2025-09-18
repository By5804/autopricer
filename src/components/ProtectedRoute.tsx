import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole: 'user' | 'admin';
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile) {
    if (profile.role !== requiredRole) {
      const destination = profile.role === 'admin' ? '/admin' : '/';
      return <Navigate to={destination} replace />;
    }

    // Untuk pengguna biasa, periksa apakah mereka diaktifkan
    if (requiredRole === 'user' && !profile.is_enabled) {
      return <Navigate to="/pending-approval" replace />;
    }
  }

  return <>{children}</>;
};
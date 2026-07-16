import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

const Login = () => {
  const { user, profile, loading, syncingTime, error } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {syncingTime ? (
          <div className="text-center space-y-1">
            <p className="font-semibold text-sm text-primary flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Menyelaraskan Waktu Server...
            </p>
            <p className="text-xs text-muted-foreground max-w-xs px-4">
              Server Supabase sedang menyesuaikan waktu token keamanan Anda. Mohon tunggu beberapa detik.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Memuat data pengguna...</p>
        )}
      </div>
    );
  }

  if (user && profile) {
    const destination = profile.role === 'admin' ? '/admin' : '/';
    return <Navigate to={destination} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Itemku Price Updater</CardTitle>
          <CardDescription>
            Masuk untuk mengelola harga produk Anda
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Terjadi Kesalahan</AlertTitle>
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: 'hsl(var(--primary))',
                    brandAccent: 'hsl(var(--primary))',
                  },
                },
              },
            }}
            theme="light"
            providers={[]}
            redirectTo={window.location.origin}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
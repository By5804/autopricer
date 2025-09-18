import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PendingApproval = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Akun Anda Sedang Ditinjau</CardTitle>
          <CardDescription>
            Terima kasih telah mendaftar. Akun Anda perlu diaktifkan oleh administrator sebelum Anda dapat melanjutkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Silakan hubungi admin untuk persetujuan. Anda akan dapat login setelah akun Anda diaktifkan.
          </p>
          <Button onClick={handleLogout} variant="outline">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApproval;
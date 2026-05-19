import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Bot, Clock, Settings } from 'lucide-react';
import { useUserData } from '@/contexts/UserDataContext';
import { showError, showSuccess } from '@/utils/toast';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export const Automation = () => {
  const { config, saveConfig } = useUserData();
  const [isCronActive, setIsCronActive] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (config) {
      setIsCronActive(config.is_cron_active || false);
    }
  }, [config]);

  const handleSave = async () => {
    const success = await saveConfig({
      is_cron_active: isCronActive,
    });
    if (success) showSuccess('Automation status updated.');
    else showError('Failed to update automation status.');
  };

  const lastRunText = config?.cron_last_run_at
    ? `${formatDistanceToNow(new Date(config.cron_last_run_at), { addSuffix: true })}`
    : 'Never';

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Bot className="mr-2 h-5 w-5" />Master Automation Switch</CardTitle>
          <CardDescription>Enable or disable all background price checks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4 rounded-md border p-4 bg-muted/30">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">Automatic Price Checking</p>
              <p className="text-xs text-muted-foreground">Saat aktif, bot akan berjalan otomatis sesuai interval yang diatur.</p>
            </div>
            <Switch checked={isCronActive} onCheckedChange={setIsCronActive} />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="mr-2 h-4 w-4" />
              <span>Pengecekan otomatis terakhir: <strong>{lastRunText}</strong></span>
            </div>
            <div className="flex items-center text-sm text-muted-foreground">
              <Settings className="mr-2 h-4 w-4" />
              <span>Interval saat ini: <strong>{config?.cron_interval_minutes || 5} menit</strong>. Ubah di <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/configuration')}>Halaman Konfigurasi</Button></span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSave}>Save Automation Status</Button>
        </CardFooter>
      </Card>
    </div>
  );
};
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Bot, Clock } from 'lucide-react';
import useUserData from '@/hooks/useUserData';
import { showError, showSuccess } from '@/utils/toast';
import { formatDistanceToNow } from 'date-fns';

export const Automation = () => {
  const { config, saveConfig } = useUserData();
  const [isCronActive, setIsCronActive] = useState(false);
  const [cronInterval, setCronInterval] = useState(15);

  useEffect(() => {
    if (config) {
      setIsCronActive(config.is_cron_active || false);
      setCronInterval(config.cron_interval || 15);
    }
  }, [config]);

  const handleSave = async () => {
    const success = await saveConfig({
      is_cron_active: isCronActive,
      cron_interval: cronInterval,
    });
    if (success) showSuccess('Automation settings saved successfully.');
    else showError('Failed to save automation settings.');
  };

  const lastRunText = config.last_cron_run
    ? `${formatDistanceToNow(new Date(config.last_cron_run), { addSuffix: true })}`
    : 'Never';

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Bot className="mr-2 h-5 w-5" />Automation Settings</CardTitle>
          <CardDescription>Enable background price checks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4 rounded-md border p-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">Automatic Price Checking</p>
            </div>
            <Switch checked={isCronActive} onCheckedChange={setIsCronActive} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cron-interval">Interval (minutes)</Label>
            <Input id="cron-interval" type="number" value={cronInterval} onChange={(e) => setCronInterval(Number(e.target.value))} disabled={!isCronActive} />
          </div>
           <div className="flex items-center text-sm text-muted-foreground">
            <Clock className="mr-2 h-4 w-4" />
            <span>Last automatic run: <strong>{lastRunText}</strong></span>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSave}>Save Settings</Button>
        </CardFooter>
      </Card>
    </div>
  );
};
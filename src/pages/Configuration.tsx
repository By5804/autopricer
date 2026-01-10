import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { showError, showSuccess } from '@/utils/toast';
import useUserData from '@/hooks/useUserData';
import { Clock } from 'lucide-react';

export const Configuration = () => {
  const { config, saveConfig } = useUserData();
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [storeName, setStoreName] = useState('');
  const [whitelist, setWhitelist] = useState('');
  const [undercutAmount, setUndercutAmount] = useState(10);
  const [triggerCount, setTriggerCount] = useState(5);
  const [triggerHours, setTriggerHours] = useState(1);
  const [cronInterval, setCronInterval] = useState(5);

  useEffect(() => {
    if (config) {
      setApiKey(config.api_key || '');
      setSecretKey(config.secret_key || '');
      setStoreName(config.store_name || '');
      setWhitelist(config.whitelist || '');
      setUndercutAmount(config.undercut_amount || 10);
      setTriggerCount(config.price_war_trigger_count || 5);
      setTriggerHours(config.price_war_trigger_hours || 1);
      setCronInterval(config.cron_interval_minutes || 5);
    }
  }, [config]);

  const handleSave = async () => {
    const success = await saveConfig({
      api_key: apiKey,
      secret_key: secretKey,
      store_name: storeName,
      whitelist: whitelist,
      undercut_amount: undercutAmount,
      price_war_trigger_count: triggerCount,
      price_war_trigger_hours: triggerHours,
      cron_interval_minutes: cronInterval,
    });
    if (success) showSuccess('Configuration saved successfully.');
    else showError('Failed to save configuration.');
  };

  return (
    <div className="p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Itemku Configuration</CardTitle>
          <CardDescription>Manage your store details for Itemku.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Store Name</Label>
              <Input id="store-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="undercut-amount">Global Undercut Amount</Label>
              <Input id="undercut-amount" type="number" value={undercutAmount} onChange={(e) => setUndercutAmount(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input id="api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret-key">Secret Key</Label>
              <Input id="secret-key" type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="whitelist">Whitelisted Stores</Label>
            <Textarea id="whitelist" value={whitelist} onChange={(e) => setWhitelist(e.target.value)} />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button onClick={handleSave}>Save Basic Config</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Automation & Trigger Settings</CardTitle>
          <CardDescription>Configure background sync interval and price war detection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cron-interval">Global Auto Run Interval (minutes)</Label>
              <Input 
                id="cron-interval" 
                type="number" 
                min="1"
                value={cronInterval} 
                onChange={(e) => setCronInterval(Number(e.target.value))} 
              />
              <p className="text-xs text-muted-foreground">Berapa menit sekali bot akan mengecek harga secara otomatis.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trigger-count">Price War Trigger Count (times)</Label>
              <Input 
                id="trigger-count" 
                type="number" 
                value={triggerCount} 
                onChange={(e) => setTriggerCount(Number(e.target.value))} 
              />
              <p className="text-xs text-muted-foreground">Jumlah undercut rival untuk memicu banting harga.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trigger-hours">Price War Window (hours)</Label>
              <Input 
                id="trigger-hours" 
                type="number" 
                value={triggerHours} 
                onChange={(e) => setTriggerHours(Number(e.target.value))} 
              />
              <p className="text-xs text-muted-foreground">Rentang waktu pendeteksian perang harga.</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSave}>Save Automation Settings</Button>
        </CardFooter>
      </Card>
    </div>
  );
};
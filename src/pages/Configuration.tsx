import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { showError, showSuccess } from '@/utils/toast';
import { useUserData } from '@/contexts/UserDataContext';
import { Clock, Save, ShieldAlert } from 'lucide-react';

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
  const [isCronActive, setIsCronActive] = useState(false);

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
      setIsCronActive(config.is_cron_active || false);
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
      is_cron_active: isCronActive,
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
            <Textarea id="whitelist" value={whitelist} onChange={(e) => setWhitelist(e.target.value)} placeholder="Toko A, Toko B (Pisahkan dengan koma)" />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" /> Save Basic Config
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Automation & Price War Settings</CardTitle>
          <CardDescription>Configure background sync and defensive triggers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-base">Master Automation Status</Label>
              <p className="text-sm text-muted-foreground">Aktifkan untuk mengizinkan pengecekan harga otomatis.</p>
            </div>
            <Switch checked={isCronActive} onCheckedChange={setIsCronActive} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="cron-interval">Global Auto Run Interval (minutes)</Label>
              <Input 
                id="cron-interval" 
                type="number" 
                min="1"
                value={cronInterval} 
                onChange={(e) => setCronInterval(Number(e.target.value))} 
              />
              <p className="text-xs text-muted-foreground">Interval pengecekan otomatis seluruh produk.</p>
            </div>
            
            <div className="space-y-4 p-4 border rounded-lg bg-red-50/30 dark:bg-red-950/10 border-red-100 dark:border-red-900">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold mb-2">
                <ShieldAlert className="h-4 w-4" />
                <span>Price War Detection</span>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trigger-count">Trigger Count (times)</Label>
                  <Input 
                    id="trigger-count" 
                    type="number" 
                    value={triggerCount} 
                    onChange={(e) => setTriggerCount(Number(e.target.value))} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trigger-hours">Within Duration (hours)</Label>
                  <Input 
                    id="trigger-hours" 
                    type="number" 
                    step="0.5"
                    value={triggerHours} 
                    onChange={(e) => setTriggerHours(Number(e.target.value))} 
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Jika rival memotong harga sebanyak <strong>{triggerCount} kali</strong> dalam <strong>{triggerHours} jam</strong>, bot akan banting harga ke batas minimum secara otomatis.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" /> Save Automation Settings
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
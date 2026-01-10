import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Upload } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import useUserData from '@/hooks/useUserData';

export const Configuration = () => {
  const { config, saveConfig } = useUserData();
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [storeName, setStoreName] = useState('');
  const [whitelist, setWhitelist] = useState('');
  const [priceUndercutAmount, setPriceUndercutAmount] = useState(10);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config) {
      setApiKey(config.api_key || '');
      setSecretKey(config.secret_key || '');
      setStoreName(config.store_name || '');
      setWhitelist(config.whitelist || '');
      setPriceUndercutAmount(config.price_undercut_amount || 10);
    }
  }, [config]);

  const handleSave = async () => {
    const success = await saveConfig({
      api_key: apiKey,
      secret_key: secretKey,
      store_name: storeName,
      whitelist: whitelist,
      price_undercut_amount: priceUndercutAmount,
    });
    if (success) showSuccess('Configuration saved successfully.');
    else showError('Failed to save configuration.');
  };

  return (
    <div className="p-8">
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
              <Input id="undercut-amount" type="number" value={priceUndercutAmount} onChange={(e) => setPriceUndercutAmount(Number(e.target.value))} />
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
          <Button onClick={handleSave}>Save Config</Button>
        </CardFooter>
      </Card>
    </div>
  );
};
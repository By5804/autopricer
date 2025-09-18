import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Upload } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import useUserData from '@/hooks/useUserData';
import type { Product } from '@/types';

export const Configuration = () => {
  const { config, saveConfig, products, saveProduct } = useUserData();
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [storeName, setStoreName] = useState('');
  const [whitelist, setWhitelist] = useState('');
  const [priceUndercutAmount, setPriceUndercutAmount] = useState(10);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config) {
      setApiKey(config.api_key);
      setSecretKey(config.secret_key);
      setStoreName(config.store_name);
      setWhitelist(config.whitelist);
      setPriceUndercutAmount(config.undercut_amount);
    }
  }, [config]);

  const handleSave = async () => {
    const success = await saveConfig({
      ...config,
      api_key: apiKey,
      secret_key: secretKey,
      store_name: storeName,
      whitelist: whitelist,
      undercut_amount: priceUndercutAmount,
    });
    if (success) {
      showSuccess('Configuration saved successfully.');
    } else {
      showError('Failed to save configuration.');
    }
  };

  const handleClearConfig = () => {
    setApiKey('');
    setSecretKey('');
    setStoreName('');
    setWhitelist('');
    setPriceUndercutAmount(10);
  };

  const handleExportConfig = () => {
    try {
      const configData = {
        apiKey,
        secretKey,
        storeName,
        whitelist,
        priceUndercutAmount,
        products: products.map(({ status, message, messageParams, ...coreProduct }) => coreProduct),
      };
      const jsonString = JSON.stringify(configData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `itemku-pricer-backup-${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showSuccess('Configuration exported successfully.');
    } catch (error) {
      console.error('Export failed:', error);
      showError('Failed to export configuration.');
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('File content is not readable.');
        const importedData = JSON.parse(text);
        if (typeof importedData.apiKey !== 'string' || typeof importedData.secretKey !== 'string' || typeof importedData.storeName !== 'string' || typeof importedData.whitelist !== 'string' || typeof importedData.priceUndercutAmount !== 'number' || !Array.isArray(importedData.products)) {
          throw new Error('Invalid or corrupted file format.');
        }
        setApiKey(importedData.apiKey);
        setSecretKey(importedData.secretKey);
        setStoreName(importedData.storeName);
        setWhitelist(importedData.whitelist);
        setPriceUndercutAmount(importedData.priceUndercutAmount);
        const importedProducts = importedData.products.map((p: Product) => ({ ...p, isActive: p.isActive ?? true }));
        importedProducts.forEach(async (product: Product) => { await saveProduct(product); });
        showSuccess('Configuration imported successfully.');
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Failed to import configuration.');
      } finally {
        if (event.target) event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle>Itemku Configuration</CardTitle>
          <CardDescription>
            Manage your connection settings and store details for Itemku.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Your Itemku Store Name</Label>
              <Input id="store-name" type="text" placeholder="Your Itemku Store Name" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="undercut-amount">Price Undercut Amount (min. 10)</Label>
              <Input id="undercut-amount" type="number" min="10" placeholder="e.g., 10" value={priceUndercutAmount} onChange={(e) => setPriceUndercutAmount(Math.max(10, Number(e.target.value)))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input id="api-key" type="text" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret-key">Secret Key</Label>
              <Input id="secret-key" type="password" placeholder="Secret Key" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="whitelist">Whitelisted Stores (comma-separated)</Label>
            <Textarea id="whitelist" placeholder="e.g., Toko A, Toko B, Toko C" value={whitelist} onChange={(e) => setWhitelist(e.target.value)} />
            <p className="text-sm text-muted-foreground">
              Products from these stores will not be undercut.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={handleImportClick}>
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          <input type="file" ref={importInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
          <Button variant="secondary" onClick={handleExportConfig}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" onClick={handleClearConfig}>Clear Config</Button>
          <Button onClick={handleSave}>Save Config</Button>
        </CardFooter>
      </Card>
    </div>
  );
};
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { ProductForm } from '@/components/ProductForm';
import { ProductTable } from '@/components/ProductTable';
import { LogicExplanationDialog } from '@/components/LogicExplanationDialog';
import { ChevronsDown, ChevronsUp, Play, Loader2, ListFilter } from 'lucide-react';
import useUserData from '@/hooks/useUserData';
import type { Product, ProductStatus } from '@/types';
import { showError, showSuccess } from '@/utils/toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { NextRunCountdown } from '@/components/NextRunCountdown';
import { formatMessage } from '@/utils/translations';
import { supabase } from '@/integrations/supabase/client';

export const Products = () => {
  const { 
    products, 
    loading: userDataLoading, 
    logs,
    config,
    saveProduct, 
    deleteProduct, 
    batchUpdateProductStatus,
    processSingleProduct, 
  } = useUserData();

  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProductStatus; direction: 'ascending' | 'descending' } | null>(null);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showOptimalLogs, setShowOptimalLogs] = useState(false);
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  const handleActiveChange = async (productId: number, isActive: boolean) => {
    const success = await batchUpdateProductStatus([{ productId, isActive }]);
    if (success) {
      showSuccess(`Product status updated to ${isActive ? 'active' : 'inactive'}.`);
    } else {
      showError('Failed to update product status.');
    }
  };

  const handleRunAll = async () => {
    if (isProcessingAll) return;
    setIsProcessingAll(true);
    showSuccess('Starting manual sync for all active products...');
    
    try {
      const { error } = await supabase.functions.invoke('cron-scheduler', {
        body: { force: true }
      });
      if (error) throw error;
      showSuccess('Manual sync triggered successfully.');
    } catch (err) {
      console.error(err);
      showError('Failed to trigger manual sync.');
    } finally {
      setIsProcessingAll(false);
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsFormDialogOpen(true);
  };

  const handleDeleteProduct = async (productId: number) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      const success = await deleteProduct(productId);
      if (success) {
        showSuccess('Product deleted successfully.');
      } else {
        showError('Failed to delete product.');
      }
    }
  };

  const handleFormSubmit = async (data: Omit<Product, 'isActive'>) => {
    const submissionData = editingProduct ? { ...data, id: editingProduct.id } : data;
    
    const success = await saveProduct(submissionData);
    if (success) {
      showSuccess(editingProduct ? 'Product updated successfully.' : 'Product added successfully.');
      setIsFormDialogOpen(false);
      setEditingProduct(null);
    } else {
      showError('Failed to save product details.');
    }
  };

  const handleSort = (key: keyof ProductStatus) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const filteredProducts = showActiveOnly
    ? products.filter(p => p.isActive)
    : products;

  const groupedProducts = filteredProducts.reduce<Record<string, ProductStatus[]>>((acc, product) => {
    const category = product.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {});

  const sortedCategories = Object.keys(groupedProducts).sort((a, b) => a.localeCompare(b));

  const handleExpandAll = () => setOpenCategories(sortedCategories);
  const handleCollapseAll = () => setOpenCategories([]);

  const filteredLogs = logs.filter(log => {
    if (!showOptimalLogs && log.message === 'logic.cheapestOptimal') {
      return false;
    }
    return true;
  });

  if (userDataLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your Products</CardTitle>
            <CardDescription>Add, edit, and manage products for price checking.</CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              onClick={handleRunAll} 
              disabled={isProcessingAll || products.filter(p => p.isActive).length === 0}
            >
              {isProcessingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run All Now
            </Button>
            <LogicExplanationDialog />
            <Button onClick={() => { setEditingProduct(null); setIsFormDialogOpen(true); }}>
              Add Product
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="active-products-only"
                checked={showActiveOnly}
                onCheckedChange={setShowActiveOnly}
              />
              <Label htmlFor="active-products-only">Show Active Products Only</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleExpandAll}>
                <ChevronsUp className="mr-2 h-4 w-4" />
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={handleCollapseAll}>
                <ChevronsDown className="mr-2 h-4 w-4" />
                Collapse All
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            {products.length > 0 ? (
              sortedCategories.length > 0 ? (
                <Accordion 
                  type="multiple" 
                  className="w-full"
                  value={openCategories}
                  onValueChange={setOpenCategories}
                >
                  {sortedCategories.map(category => {
                    const categoryProducts = groupedProducts[category];
                    const sortedProducts = [...categoryProducts].sort((a, b) => {
                      if (!sortConfig) return 0;
                      const { key, direction } = sortConfig;
                      const valA = a[key];
                      const valB = b[key];
                      if (valA === valB) return 0;
                      if (valA === null || valA === undefined) return 1;
                      if (valB === null || valB === undefined) return -1;
                      let comparison = 0;
                      if (typeof valA === 'number' && typeof valB === 'number') {
                        comparison = (valA as number) - (valB as number);
                      } else {
                        comparison = String(valA).localeCompare(String(valB));
                      }
                      return direction === 'ascending' ? comparison : -comparison;
                    });

                    return (
                      <AccordionItem value={category} key={category}>
                        <AccordionTrigger className="text-xl font-semibold px-4 hover:no-underline">
                          <div className="flex justify-between w-full items-center">
                            <span>{category}</span>
                            <span className="text-sm font-normal text-muted-foreground mr-4">
                              {categoryProducts.length} products
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <ProductTable 
                            products={sortedProducts} 
                            onEdit={handleEditProduct} 
                            onDelete={handleDeleteProduct} 
                            onSort={handleSort} 
                            sortConfig={sortConfig} 
                            onActiveChange={handleActiveChange}
                            onRetry={processSingleProduct} 
                          />
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              ) : (
                <p className="text-center text-gray-500 py-4">No products match the current filter.</p>
              )
            ) : (
              <p className="text-center text-gray-500 py-4">No products added yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <ProductForm 
          onSubmit={handleFormSubmit} 
          productToEdit={editingProduct}
        />
      </Dialog>

      {config && (
        <NextRunCountdown 
          lastRunAt={config.cron_last_run_at} 
          intervalMinutes={config.cron_interval_minutes} 
          isCronActive={config.is_cron_active} 
        />
      )}

      {logs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent Activity Logs</CardTitle>
              <CardDescription>Latest price checking results</CardDescription>
            </div>
            <div className="flex items-center space-x-2 bg-muted/50 px-3 py-1.5 rounded-lg border">
              <ListFilter className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-optimal-logs"
                  checked={showOptimalLogs}
                  onCheckedChange={setShowOptimalLogs}
                  className="scale-75"
                />
                <Label htmlFor="show-optimal-logs" className="text-xs cursor-pointer select-none">
                  Show "Optimal" Logs
                </Label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-md max-h-128 overflow-y-auto">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log, index) => {
                  const prevLog = filteredLogs[index + 1];
                  const TIME_GAP_SECONDS = 60;
                  let showSeparator = false;

                  if (prevLog) {
                    const currentTimestamp = new Date(log.createdAt);
                    const prevTimestamp = new Date(prevLog.createdAt);
                    const diffInSeconds = (currentTimestamp.getTime() - prevTimestamp.getTime()) / 1000;
                    
                    if (diffInSeconds > TIME_GAP_SECONDS) {
                      showSeparator = true;
                    }
                  }

                  return (
                    <div key={index}>
                      {showSeparator && (
                        <div className="my-2 border-t border-dashed border-border/50"></div>
                      )}
                      <div className="text-sm font-mono py-1 flex gap-2">
                        <span className="text-muted-foreground shrink-0">
                          [{new Date(log.createdAt).toLocaleTimeString()}]
                        </span>
                        <span className="font-semibold text-primary shrink-0">
                          {log.productName}:
                        </span>
                        <span>{formatMessage(log.message, log.messageParams)}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No logs to display with current filter.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
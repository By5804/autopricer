import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { ProductForm } from '@/components/ProductForm';
import { ProductTable } from '@/components/ProductTable';
import { LogicExplanationDialog } from '@/components/LogicExplanationDialog';
import { Save, ChevronsDown, ChevronsUp } from 'lucide-react';
import useUserData from '@/hooks/useUserData';
import type { Product, ProductStatus } from '@/types';
import { showError, showSuccess } from '@/utils/toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export const Products = () => {
  const { 
    products, 
    loading: userDataLoading, 
    logs,
    saveProduct, 
    deleteProduct, 
    batchUpdateProductStatus,
  } = useUserData();

  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProductStatus; direction: 'ascending' | 'descending' } | null>(null);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<number, boolean>>(new Map());
  const [openCategories, setOpenCategories] = useState<string[]>([]);

  const handleActiveChange = (productId: number, isActive: boolean) => {
    setPendingChanges(prev => {
      const newChanges = new Map(prev);
      const originalProduct = products.find(p => p.product_id === productId);
      if (originalProduct && originalProduct.isActive !== isActive) {
        newChanges.set(productId, isActive);
      } else {
        newChanges.delete(productId);
      }
      return newChanges;
    });
  };

  const handleSaveChanges = async () => {
    if (pendingChanges.size === 0) return;
    const updates = Array.from(pendingChanges.entries()).map(([productId, isActive]) => ({
      productId,
      isActive,
    }));
    const success = await batchUpdateProductStatus(updates);
    if (success) {
      showSuccess('Product statuses updated successfully.');
      setPendingChanges(new Map());
    } else {
      showError('Failed to update some product statuses.');
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsFormDialogOpen(true);
  };

  const handleDeleteProduct = async (productId: number) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      await deleteProduct(productId);
    }
  };

  const handleFormSubmit = async (data: Omit<Product, 'isActive'>) => {
    await saveProduct(data);
    setIsFormDialogOpen(false);
    setEditingProduct(null);
  };

  const handleImportSubmit = (productsToImport: Omit<Product, 'isActive'>[]) => {
    if (productsToImport.length === 0) {
      showError("No products found in the provided JSON.");
      return;
    }
    
    const importPromises = productsToImport.map(product => saveProduct(product));
    
    Promise.all(importPromises).then(() => {
      showSuccess(`${productsToImport.length} products imported successfully.`);
      setIsFormDialogOpen(false);
    }).catch(() => {
      showError("An error occurred while importing products.");
    });
  };

  const handleSort = (key: keyof ProductStatus) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'desending';
    }
    setSortConfig({ key, direction });
  };

  const filteredProducts = showActiveOnly
    ? products.filter(p => pendingChanges.get(p.product_id) ?? p.isActive)
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

  const handleExpandAll = () => {
    setOpenCategories(sortedCategories);
  };

  const handleCollapseAll = () => {
    setOpenCategories([]);
  };

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
            {pendingChanges.size > 0 && (
              <Button onClick={handleSaveChanges}>
                <Save className="mr-2 h-4 w-4" />
                Save Changes ({pendingChanges.size})
              </Button>
            )}
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
                        comparison = valA - valB;
                      } else {
                        comparison = String(valA).localeCompare(String(valB));
                      }
                      return direction === 'ascending' ? comparison : -comparison;
                    });

                    return (
                      <AccordionItem value={category} key={category}>
                        <AccordionTrigger className="text-xl font-semibold px-4">
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
                            pendingChanges={pendingChanges}
                            onEdit={handleEditProduct} 
                            onDelete={handleDeleteProduct} 
                            onSort={handleSort} 
                            sortConfig={sortConfig} 
                            onActiveChange={handleActiveChange}
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

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity Logs</CardTitle>
            <CardDescription>Latest price checking results</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-md max-h-64 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index} className="text-sm font-mono py-1 border-b border-border/50 last:border-b-0">
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
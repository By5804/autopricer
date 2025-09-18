import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ProductForm } from '@/components/ProductForm';
import { ProductTable } from '@/components/ProductTable';
import { LogicExplanationDialog } from '@/components/LogicExplanationDialog';
import { Upload, Save } from 'lucide-react';
import useUserData from '@/hooks/useUserData';
import type { Product } from '@/types';
import { showError, showSuccess } from '@/utils/toast';

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
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Product; direction: 'ascending' | 'descending' } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [pendingChanges, setPendingChanges] = useState<Map<number, boolean>>(new Map());

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[]];
  const filteredProducts = selectedCategory === 'All' 
    ? products 
    : products.filter(p => p.category === selectedCategory);

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

  const handleSort = (key: keyof Product) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleJsonImportSubmit = () => {
    try {
      const data = JSON.parse(jsonInput);
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((item: any) => {
          const product: Omit<Product, 'isActive'> = {
            name: item.name,
            category: item.category_name,
            product_id: item.id,
            minPrice: item.min_price || 0,
            maxPrice: item.max_price || 0,
            game_id: item.game_id,
            item_type_id: item.item_type_id,
            item_info_group_id: item.item_info_group_id,
            item_info_id: item.item_info_id,
          };
          saveProduct(product);
        });
        setIsImportDialogOpen(false);
        setJsonInput('');
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      alert('Invalid JSON format');
    }
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
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" /> Import Products
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Products from JSON</DialogTitle>
                  <DialogDescription>Paste the JSON response from the Itemku product list API here.</DialogDescription>
                </DialogHeader>
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder="Paste your JSON here..." 
                  className="h-64" 
                />
                <DialogFooter>
                  <Button onClick={handleJsonImportSubmit}>Import</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button onClick={() => { setEditingProduct(null); setIsFormDialogOpen(true); }}>
              Add Product
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {categories.length > 1 && (
            <Tabs defaultValue="All" value={selectedCategory} onValueChange={setSelectedCategory} className="mb-4">
              <TabsList>
                {categories.map(c => (
                  <TabsTrigger key={c} value={c}>{c}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <ProductTable 
            products={filteredProducts} 
            pendingChanges={pendingChanges}
            onEdit={handleEditProduct} 
            onDelete={handleDeleteProduct} 
            onSort={handleSort} 
            sortConfig={sortConfig} 
            onActiveChange={handleActiveChange}
          />
          {products.length > 0 && filteredProducts.length === 0 && (
            <p className="text-center text-gray-500 py-4">No products in this category.</p>
          )}
          {products.length === 0 && (
            <p className="text-center text-gray-500 py-4">No products added yet.</p>
          )}
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
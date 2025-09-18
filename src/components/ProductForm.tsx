import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { showError } from '@/utils/toast';
import type { Product } from '@/types';

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required.'),
  category: z.string().optional(),
  product_id: z.coerce.number().min(1, 'Product ID is required.'),
  minPrice: z.coerce.number().min(1, 'Minimum price is required.'),
  maxPrice: z.coerce.number().min(1, 'Maximum price is required.'),
  priceUndercutAmount: z.preprocess(
    (val) => (val === "" || val === null || val === 0 ? undefined : val),
    z.coerce.number().min(10).optional()
  ),
  game_id: z.coerce.number().min(1, 'Game ID is required.'),
  item_type_id: z.coerce.number().min(1, 'Item Type ID is required.'),
  item_info_group_id: z.preprocess(
    (val) => (val === "" || val === null || val === 0 ? undefined : val),
    z.coerce.number().optional()
  ),
  item_info_id: z.coerce.number().min(1, 'Item Info ID is required.'),
}).refine(data => data.maxPrice >= data.minPrice, {
  message: 'Max price must be greater than or equal to min price.',
  path: ["maxPrice"],
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  onSubmit: (data: Omit<Product, 'isActive'>) => void;
  onImport: (products: Omit<Product, 'isActive'>[]) => void;
  productToEdit?: Product | null;
}

export function ProductForm({ onSubmit, onImport, productToEdit }: ProductFormProps) {
  const [jsonInput, setJsonInput] = useState('');
  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      category: '',
      product_id: 0,
      minPrice: 0,
      maxPrice: 0,
      priceUndercutAmount: undefined,
      game_id: 0,
      item_type_id: 0,
      item_info_group_id: undefined,
      item_info_id: 0,
    },
  });

  useEffect(() => {
    if (productToEdit) {
      form.reset(productToEdit);
    } else {
      form.reset({
        name: '',
        category: '',
        product_id: 0,
        minPrice: 0,
        maxPrice: 0,
        priceUndercutAmount: undefined,
        game_id: 0,
        item_type_id: 0,
        item_info_group_id: undefined,
        item_info_id: 0,
      });
    }
  }, [productToEdit, form.reset]);

  const handleFormSubmit = (data: ProductFormData) => {
    onSubmit(data as Omit<Product, 'isActive'>);
  };

  const handleJsonImport = () => {
    try {
      const data = JSON.parse(jsonInput);
      if (data.data && Array.isArray(data.data)) {
        const productsToImport = data.data.map((item: any) => ({
          name: item.name,
          category: item.category_name,
          product_id: item.id,
          minPrice: item.min_price || 0,
          maxPrice: item.max_price || 0,
          game_id: item.game_id,
          item_type_id: item.item_type_id,
          item_info_group_id: item.item_info_group_id,
          item_info_id: item.item_info_id,
        }));
        onImport(productsToImport);
        setJsonInput('');
      } else {
        throw new Error('Invalid JSON structure. Expected a `data` array.');
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Invalid JSON format.');
    }
  };

  const manualForm = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Product Name</FormLabel>
            <FormControl><Input placeholder="e.g., 1000 Diamonds" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="category" render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <FormControl><Input placeholder="e.g., Mobile Legends" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="product_id" render={({ field }) => (
          <FormItem>
            <FormLabel>Product ID</FormLabel>
            <FormControl><Input type="number" placeholder="e.g., 123456" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
         <FormField control={form.control} name="game_id" render={({ field }) => (
          <FormItem>
            <FormLabel>Game ID</FormLabel>
            <FormControl><Input type="number" placeholder="e.g., 5" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="minPrice" render={({ field }) => (
          <FormItem>
            <FormLabel>Minimum Price</FormLabel>
            <FormControl><Input type="number" placeholder="e.g., 400000" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="maxPrice" render={({ field }) => (
          <FormItem>
            <FormLabel>Maximum Price</FormLabel>
            <FormControl><Input type="number" placeholder="e.g., 500000" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="priceUndercutAmount" render={({ field }) => (
          <FormItem>
            <FormLabel>Price Undercut Amount (Optional)</FormLabel>
            <FormControl><Input type="number" min="10" placeholder="Uses global setting if empty" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="item_type_id" render={({ field }) => (
          <FormItem>
            <FormLabel>Item Type ID</FormLabel>
            <FormControl><Input type="number" placeholder="e.g., 10" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="item_info_group_id" render={({ field }) => (
          <FormItem>
            <FormLabel>Item Info Group ID (Optional)</FormLabel>
            <FormControl><Input type="number" placeholder="e.g., 20" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="item_info_id" render={({ field }) => (
          <FormItem>
            <FormLabel>Item Info ID</FormLabel>
            <FormControl><Input type="number" placeholder="e.g., 30" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <DialogFooter className="md:col-span-2">
          <Button type="submit">{productToEdit ? 'Save Changes' : 'Add Product'}</Button>
        </DialogFooter>
      </form>
    </Form>
  );

  return (
    <DialogContent 
      className="sm:max-w-[600px]"
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{productToEdit ? 'Edit Product' : 'Add Products'}</DialogTitle>
        {!productToEdit && <DialogDescription>Add a single product manually or import multiple products using JSON.</DialogDescription>}
      </DialogHeader>
      
      {productToEdit ? (
        manualForm
      ) : (
        <Tabs defaultValue="manual" className="w-full pt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Add Manually</TabsTrigger>
            <TabsTrigger value="import">Import from JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            {manualForm}
          </TabsContent>
          <TabsContent value="import">
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Paste the JSON response from the Itemku product list API here.
              </p>
              <Textarea 
                value={jsonInput} 
                onChange={(e) => setJsonInput(e.target.value)} 
                placeholder="Paste your JSON here..." 
                className="h-64 font-mono" 
              />
            </div>
            <DialogFooter>
              <Button onClick={handleJsonImport}>Import Products</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      )}
    </DialogContent>
  );
}
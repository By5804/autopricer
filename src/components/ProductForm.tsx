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
  onJsonImport: (jsonString: string) => void;
  productToEdit?: Product | null;
}

export function ProductForm({ onSubmit, onJsonImport, productToEdit }: ProductFormProps) {
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

  return (
    <DialogContent 
      className="sm:max-w-[600px]"
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{productToEdit ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogDescription>
          {productToEdit ? 'Update the details for your product.' : 'Add a new product manually or import from JSON.'}
        </DialogDescription>
      </DialogHeader>
      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="manual">Manual Input</TabsTrigger>
          <TabsTrigger value="import" disabled={!!productToEdit}>Import from JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="manual">
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
                <Button type="submit">Save Product</Button>
              </DialogFooter>
            </form>
          </Form>
        </TabsContent>
        <TabsContent value="import">
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="json-import">Paste JSON Here</Label>
              <Textarea 
                id="json-import"
                value={jsonInput} 
                onChange={(e) => setJsonInput(e.target.value)} 
                placeholder="Paste the JSON response from the Itemku product list API here..." 
                className="h-64 font-mono" 
              />
            </div>
            <DialogFooter>
              <Button onClick={() => onJsonImport(jsonInput)}>Import Products</Button>
            </DialogFooter>
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}
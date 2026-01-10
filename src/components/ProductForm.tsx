import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Upload } from 'lucide-react';
import { showError } from '@/utils/toast';
import type { Product } from '@/types';

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required.'),
  category: z.string().optional(),
  product_id: z.coerce.number().min(1, 'Product ID is required.'),
  modalPrice: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.coerce.number().min(0, 'Modal price cannot be negative.').optional()
  ),
  minPrice: z.coerce.number().min(1, 'Minimum price is required.'),
  maxPrice: z.coerce.number().min(1, 'Maximum price is required.'),
  priceUndercutAmount: z.preprocess(
    (val) => (val === "" || val === null || val === 0 ? undefined : val),
    z.coerce.number().min(10).optional()
  ),
  price_war_undercut_amount: z.preprocess(
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
  cron_interval_minutes: z.preprocess(
    (val) => (val === "" || val === null || val === 0 ? undefined : val),
    z.coerce.number().min(1).optional()
  ),
  rivalStoreName: z.string().optional(),
}).refine(data => data.maxPrice >= data.minPrice, {
  message: 'Max price must be greater than or equal to min price.',
  path: ["maxPrice"],
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  onSubmit: (data: Omit<Product, 'isActive'>) => void;
  productToEdit?: Product | null;
}

const MARKETPLACE_FEE = 0.05; // 5%
const MIN_PROFIT_PERCENTAGE = 0.005; // 0.5%
const MAX_PROFIT_PERCENTAGE = 0.15; // 15%

export function ProductForm({ onSubmit, productToEdit }: ProductFormProps) {
  const [jsonInput, setJsonInput] = useState('');
  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      category: '',
      product_id: 0,
      modalPrice: undefined,
      minPrice: 0,
      maxPrice: 0,
      priceUndercutAmount: undefined,
      price_war_undercut_amount: 50,
      game_id: 0,
      item_type_id: 0,
      item_info_group_id: undefined,
      item_info_id: 0,
      cron_interval_minutes: undefined,
      rivalStoreName: '',
    },
  });

  const modalPrice = form.watch('modalPrice');

  useEffect(() => {
    if (productToEdit) {
      const cleanedProduct = {
        ...productToEdit,
        category: productToEdit.category ?? '',
        priceUndercutAmount: productToEdit.priceUndercutAmount ?? undefined,
        price_war_undercut_amount: productToEdit.price_war_undercut_amount ?? 50,
        item_info_group_id: productToEdit.item_info_group_id ?? undefined,
        cron_interval_minutes: productToEdit.cron_interval_minutes ?? undefined,
        rivalStoreName: productToEdit.rivalStoreName ?? '',
      };
      form.reset(cleanedProduct as ProductFormData);
    }
  }, [productToEdit, form.reset]);

  useEffect(() => {
    if (modalPrice !== undefined && modalPrice !== null && modalPrice > 0) {
      const calculatePrice = (profitPercentage: number) => {
        const targetNet = modalPrice * (1 + profitPercentage);
        const rawPrice = targetNet / (1 - MARKETPLACE_FEE);
        return Math.ceil(rawPrice / 10) * 10;
      };

      const calculatedMinPrice = calculatePrice(MIN_PROFIT_PERCENTAGE);
      const calculatedMaxPrice = calculatePrice(MAX_PROFIT_PERCENTAGE);
      
      form.setValue('minPrice', calculatedMinPrice);
      form.setValue('maxPrice', calculatedMaxPrice);
    }
  }, [modalPrice, form.setValue]);

  const handleFormSubmit = (data: ProductFormData) => {
    onSubmit(data as Omit<Product, 'isActive'>);
  };

  const handleJsonAutoFill = () => {
    try {
      const parsedJson = JSON.parse(jsonInput);
      const productData = parsedJson?.data?.data?.[0];

      if (!productData) {
        throw new Error('Invalid JSON structure. Expected data.data[0] to contain product details.');
      }

      form.setValue('name', productData.name || '');
      form.setValue('category', productData.item_type?.name || '');
      form.setValue('product_id', productData.id || 0);
      form.setValue('game_id', productData.game_id || 0);
      form.setValue('item_type_id', productData.item_type_id || 0);
      form.setValue('item_info_group_id', productData.item_info_group_id || undefined);
      form.setValue('item_info_id', productData.item_info_id || 0);
      
      setJsonInput('');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Invalid JSON format or missing product data.');
    }
  };

  return (
    <DialogContent 
      className="sm:max-w-[600px]"
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{productToEdit ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogDescription>
          {productToEdit ? 'Edit the details of your product.' : 'Add a new product to your list.'}
        </DialogDescription>
      </DialogHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <div className="md:col-span-2 space-y-2">
            <FormLabel>Import from Itemku JSON (Optional)</FormLabel>
            <Textarea 
              value={jsonInput} 
              onChange={(e) => setJsonInput(e.target.value)} 
              placeholder="Paste Itemku product JSON here to auto-fill fields..." 
              className="h-32 font-mono" 
            />
            <Button type="button" onClick={handleJsonAutoFill} disabled={!jsonInput.trim()}>
              <Upload className="mr-2 h-4 w-4" /> Auto-fill from JSON
            </Button>
          </div>

          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Product Name</FormLabel>
              <FormControl><Input placeholder="e.g., 1000 Diamonds" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl><Input placeholder="e.g., Mobile Legends" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="product_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Product ID</FormLabel>
              <FormControl><Input type="number" placeholder="e.g., 123456" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
           <FormField control={form.control} name="game_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Game ID</FormLabel>
              <FormControl><Input type="number" placeholder="e.g., 43" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="modalPrice" render={({ field }) => (
            <FormItem>
              <FormLabel>Modal Price (Harga Modal)</FormLabel>
              <FormControl><Input type="number" placeholder="e.g., 380000" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="minPrice" render={({ field }) => (
            <FormItem>
              <FormLabel>Minimum Price</FormLabel>
              <FormControl><Input type="number" placeholder="e.g., 400000" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="maxPrice" render={({ field }) => (
            <FormItem>
              <FormLabel>Maximum Price</FormLabel>
              <FormControl><Input type="number" placeholder="e.g., 500000" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="priceUndercutAmount" render={({ field }) => (
            <FormItem>
              <FormLabel>Price Undercut Amount (Normal)</FormLabel>
              <FormControl><Input type="number" min="10" placeholder="10" {...field} value={field.value ?? ""} /></FormControl>
              <FormDescription>Kosongkan untuk menggunakan Global Undercut.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="price_war_undercut_amount" render={({ field }) => (
            <FormItem>
              <FormLabel>Undercut Amount (Rival Price War)</FormLabel>
              <FormControl><Input type="number" min="10" placeholder="50" {...field} value={field.value ?? ""} /></FormControl>
              <FormDescription>Digunakan saat rival banting harga.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="item_type_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Item Type ID</FormLabel>
              <FormControl><Input type="number" placeholder="e.g., 39" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="item_info_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Item Info ID</FormLabel>
              <FormControl><Input type="number" placeholder="e.g., 7196" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="cron_interval_minutes" render={({ field }) => (
            <FormItem>
              <FormLabel>Custom Interval (minutes)</FormLabel>
              <FormControl><Input type="number" min="1" placeholder="Uses default if empty" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="rivalStoreName" render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Underpricecut for rival store (Rival Name)</FormLabel>
              <FormControl><Input placeholder="e.g., Toko Rival A" {...field} value={field.value ?? ""} /></FormControl>
              <FormDescription>
                Jika diisi, toko ini akan memicu nominal undercut khusus di atas.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <DialogFooter className="md:col-span-2">
            <Button type="submit">{productToEdit ? 'Save Changes' : 'Add Product'}</Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}
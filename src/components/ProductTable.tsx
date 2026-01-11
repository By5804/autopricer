import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product, ProductStatus } from "@/types";
import { formatMessage } from "@/utils/translations";

interface ProductTableProps {
  products: ProductStatus[];
  onEdit: (product: Product) => void;
  onDelete: (productId: number) => void;
  onSort: (key: keyof ProductStatus) => void;
  sortConfig: { key: keyof ProductStatus; direction: 'ascending' | 'descending' } | null;
  onActiveChange: (productId: number, isActive: boolean) => void;
  onRefresh: (productId: number) => void; 
}

export function ProductTable({ products, onEdit, onDelete, onSort, sortConfig, onActiveChange, onRefresh }: ProductTableProps) {
  const getStatusVariant = (status: ProductStatus['status']) => {
    switch (status) {
      case 'success':
      case 'updated':
        return 'success';
      case 'error':
        return 'destructive';
      case 'loading':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const formatNumber = (num?: number | null) => {
    return num != null ? num.toLocaleString('id-ID') : '-';
  };

  const formatPrice = (num?: number | null) => {
    return num != null ? `Rp ${num.toLocaleString('id-ID')}` : '-';
  };

  const renderSortIcon = (columnKey: keyof ProductStatus) => {
    if (sortConfig?.key !== columnKey) {
      return <span className="w-4 h-4 inline-block ml-1 opacity-0 group-hover:opacity-50 transition-opacity"></span>;
    }
    if (sortConfig.direction === 'ascending') {
      return <ArrowUp className="inline-block ml-1 h-4 w-4" />;
    }
    return <ArrowDown className="inline-block ml-1 h-4 w-4" />;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[80px]">Active</TableHead>
          <TableHead className="w-[200px] group cursor-pointer select-none" onClick={() => onSort('name')}>
            Product Name {renderSortIcon('name')}
          </TableHead>
          <TableHead className="text-right group cursor-pointer select-none" onClick={() => onSort('myStock')}>
            My Stock {renderSortIcon('myStock')}
          </TableHead>
          <TableHead className="text-right group cursor-pointer select-none" onClick={() => onSort('myPrice')}>
            My Price {renderSortIcon('myPrice')}
          </TableHead>
          <TableHead className="group cursor-pointer select-none" onClick={() => onSort('competitorStoreName')}>
            Competitor {renderSortIcon('competitorStoreName')}
          </TableHead>
          <TableHead className="text-right group cursor-pointer select-none" onClick={() => onSort('competitorStock')}>
            Competitor Stock {renderSortIcon('competitorStock')}
          </TableHead>
          <TableHead className="text-right group cursor-pointer select-none" onClick={() => onSort('competitorPrice')}>
            Competitor Price {renderSortIcon('competitorPrice')}
          </TableHead>
          <TableHead className="group cursor-pointer select-none" onClick={() => onSort('status')}>
            Status {renderSortIcon('status')}
          </TableHead>
          <TableHead className="w-[250px]">Message</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => {
          const isLoading = product.status === 'loading';
          // Tampilkan harga usulan (newPrice) hanya jika sedang di-update, 
          // Jika tidak, tampilkan harga asli dari Itemku (myPrice)
          const displayPrice = product.status === 'updated' ? (product.newPrice || product.myPrice) : (product.myPrice || product.newPrice);

          return (
            <TableRow 
              key={product.product_id}
              className={cn(!product.isActive && "text-muted-foreground opacity-70")}
            >
              <TableCell>
                <Switch
                  checked={product.isActive}
                  onCheckedChange={(checked) => onActiveChange(product.product_id, checked)}
                  aria-label="Toggle product active state"
                />
              </TableCell>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell className="text-right">{formatNumber(product.myStock)}</TableCell>
              <TableCell className="text-right font-semibold">
                {formatPrice(displayPrice)}
              </TableCell>
              <TableCell>{product.competitorStoreName || '-'}</TableCell>
              <TableCell className="text-right">
                {formatNumber(product.competitorStock)}
              </TableCell>
              <TableCell className="text-right">
                {formatPrice(product.competitorPrice)}
              </TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(product.status)}>{product.status}</Badge>
              </TableCell>
              <TableCell>{formatMessage(product.message, product.messageParams)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onRefresh(product.product_id)}
                    disabled={isLoading}
                    className={cn("text-blue-500 hover:text-blue-600", isLoading && "animate-spin")}
                    title="Refresh this product"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onEdit(product)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/90" onClick={() => onDelete(product.product_id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
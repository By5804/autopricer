import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input"; // Import Input component
import { Pencil, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product, ProductStatus } from "@/types";
import { formatMessage } from "@/utils/translations";
import { useState } from "react"; // Import useState
import { showError } from "@/utils/toast"; // Import showError

interface ProductTableProps {
  products: ProductStatus[];
  onEdit: (product: Product) => void;
  onDelete: (productId: number) => void;
  onSort: (key: keyof ProductStatus) => void;
  sortConfig: { key: keyof ProductStatus; direction: 'ascending' | 'descending' } | null;
  onActiveChange: (productId: number, isActive: boolean) => void;
  onRetry: (productId: number) => void;
  onOverrideMinMax: (productId: number, type: 'min' | 'max', value: number) => void; // New prop
}

export function ProductTable({ products, onEdit, onDelete, onSort, sortConfig, onActiveChange, onRetry, onOverrideMinMax }: ProductTableProps) {
  const [overridePriceInput, setOverridePriceInput] = useState<Record<number, number>>({});

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

  const handleOverrideChange = (productId: number, value: string) => {
    setOverridePriceInput(prev => ({
      ...prev,
      [productId]: Number(value)
    }));
  };

  const handleApplyOverride = (product: ProductStatus) => {
    const value = overridePriceInput[product.product_id];
    if (value === undefined || isNaN(value) || value <= 0) {
      showError("Please enter a valid price.");
      return;
    }

    let type: 'min' | 'max' | null = null;
    if (product.message === 'logic.violatesMinPrice') {
      type = 'min';
    } else if (product.message === 'logic.violatesMaxPrice') {
      type = 'max';
    }

    if (type) {
      onOverrideMinMax(product.product_id, type, value);
      setOverridePriceInput(prev => {
        const newState = { ...prev };
        delete newState[product.product_id]; // Clear input after applying
        return newState;
      });
    }
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
          <TableHead className="text-right group cursor-pointer select-none" onClick={() => onSort('mySoldCount')}>
            My Sold {renderSortIcon('mySoldCount')}
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
          <TableHead className="w-[200px]">Override Min/Max</TableHead> {/* New TableHead */}
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => {
          const showOverrideInput = product.status === 'error' && 
            (product.message === 'logic.violatesMinPrice' || product.message === 'logic.violatesMaxPrice');
          
          const defaultOverrideValue = showOverrideInput 
            ? (product.messageParams?.proposedPrice || 0) 
            : 0;

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
              <TableCell className="text-right">{formatNumber(product.mySoldCount)}</TableCell>
              <TableCell className="text-right font-semibold">
                {formatPrice(product.newPrice || product.myPrice)}
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
              <TableCell> {/* New TableCell for override input */}
                {showOverrideInput && (
                  <div className="flex items-center space-x-2">
                    <Input
                      type="number"
                      value={overridePriceInput[product.product_id] ?? defaultOverrideValue}
                      onChange={(e) => handleOverrideChange(product.product_id, e.target.value)}
                      className="w-32"
                      min={1}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleApplyOverride(product)}
                    >
                      Apply
                    </Button>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                {product.status === 'error' && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onRetry(product.product_id)}
                    className="text-orange-500 hover:text-orange-600"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => onEdit(product)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(product.product_id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
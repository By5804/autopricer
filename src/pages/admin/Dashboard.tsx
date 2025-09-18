import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Package, Tag, BarChart3 } from 'lucide-react';

interface UserStats {
  id: string;
  email: string;
  role: string;
  is_enabled: boolean;
  product_count: number;
  categories: string[];
}

const AdminDashboard = () => {
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStats, setTotalStats] = useState({
    totalUsers: 0,
    totalProducts: 0,
    totalCategories: 0,
    activeUsers: 0
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch semua produk terlebih dahulu (termasuk yang tidak aktif)
        const { data: allProducts, error: productsError } = await supabase
          .from('user_products')
          .select('user_id, category, is_active');

        console.log('All products (including inactive):', allProducts); // Debug log

        if (productsError) throw productsError;

        // Fetch semua pengguna (kecuali admin)
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('*')
          .neq('role', 'admin')
          .order('created_at', { ascending: false });

        console.log('Users data:', usersData); // Debug log

        if (usersError) throw usersError;

        // Hitung statistik untuk setiap user
        const usersWithStats = usersData.map(user => {
          const userProducts = allProducts?.filter(product => product.user_id === user.id) || [];
          const productCount = userProducts.length;
          
          const categories = userProducts
            .map(p => p.category)
            .filter(Boolean)
            .filter((category, index, arr) => arr.indexOf(category) === index);

          return {
            ...user,
            product_count: productCount,
            categories
          };
        });

        setUserStats(usersWithStats);

        // Hitung statistik total
        const totalUsers = usersWithStats.length;
        const totalProducts = allProducts?.length || 0;
        
        const allCategories = allProducts
          ?.map(p => p.category)
          .filter(Boolean)
          .filter((category, index, arr) => arr.indexOf(category) === index) || [];
        
        const totalCategories = allCategories.length;
        const activeUsers = usersWithStats.filter(user => user.is_enabled).length;

        console.log('Total stats:', { totalUsers, totalProducts, totalCategories, activeUsers }); // Debug log

        setTotalStats({
          totalUsers,
          totalProducts,
          totalCategories,
          activeUsers
        });

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {totalStats.activeUsers} active users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              All products (active + inactive)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalCategories}</div>
            <p className="text-xs text-muted-foreground">
              Unique categories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalStats.totalUsers > 0 ? Math.round((totalStats.activeUsers / totalStats.totalUsers) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Users enabled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>User Statistics</CardTitle>
          <CardDescription>
            Detailed overview of users and their products
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Categories</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userStats.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_enabled ? 'success' : 'outline'}>
                      {user.is_enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {user.product_count}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.categories.slice(0, 3).map((category, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {category}
                        </Badge>
                      ))}
                      {user.categories.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{user.categories.length - 3} more
                        </Badge>
                      )}
                      {user.categories.length === 0 && (
                        <span className="text-sm text-muted-foreground">No categories</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
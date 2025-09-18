import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { showError, showSuccess } from '@/utils/toast';
import type { Profile } from '@/contexts/AuthContext';

const UserManagement = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
        showError('Failed to load users.');
      } else {
        setUsers(data as Profile[]);
      }
      setLoading(false);
    };

    fetchUsers();
  }, []);

  const handleToggleEnabled = async (userId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    
    // Optimistically update UI
    setUsers(users.map(u => u.id === userId ? { ...u, is_enabled: newStatus } : u));

    const { error } = await supabase
      .from('profiles')
      .update({ is_enabled: newStatus })
      .eq('id', userId);

    if (error) {
      showError(`Failed to update user status.`);
      // Revert UI on error
      setUsers(users.map(u => u.id === userId ? { ...u, is_enabled: currentStatus } : u));
    } else {
      showSuccess(`User has been ${newStatus ? 'enabled' : 'disabled'}.`);
    }
  };

  if (loading) {
    return <div className="p-8">Loading users...</div>;
  }

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Enable or disable user accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Enable/Disable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
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
                  <TableCell className="text-right">
                    {user.role !== 'admin' && (
                       <Switch
                        checked={user.is_enabled}
                        onCheckedChange={() => handleToggleEnabled(user.id, user.is_enabled)}
                        aria-label={`Toggle user ${user.email}`}
                      />
                    )}
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

export default UserManagement;
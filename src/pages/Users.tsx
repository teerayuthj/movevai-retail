import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Laptop, Loader2, Plus, RefreshCw, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  createRetailUser,
  fetchRetailRoles,
  fetchRetailUsers,
  resetRetailUserPassword,
  revokeRetailUserSessions,
  updateRetailUser,
  type RetailRole,
  type RetailUser,
} from '@/lib/retailApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const EMPTY_FORM = { name: '', email: '', password: '', roleId: '' };

type UserAction = 'password' | 'logout' | 'status';

export function UsersPage() {
  const [users, setUsers] = useState<RetailUser[]>([]);
  const [roles, setRoles] = useState<RetailRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [actionUser, setActionUser] = useState<RetailUser | null>(null);
  const [userAction, setUserAction] = useState<UserAction | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextUsers, nextRoles] = await Promise.all([fetchRetailUsers(), fetchRetailRoles()]);
      setUsers(nextUsers);
      setRoles(nextRoles);
      setForm((current) => ({
        ...current,
        roleId: current.roleId || nextRoles.find((role) => role.code === 'user')?.id || '',
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลดข้อมูลผู้ใช้งานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const activeCount = useMemo(() => users.filter((user) => user.isActive).length, [users]);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createRetailUser(form);
      toast.success('สร้างผู้ใช้งานแล้ว');
      setForm({ ...EMPTY_FORM, roleId: roles.find((role) => role.code === 'user')?.id ?? '' });
      setShowCreate(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'สร้างผู้ใช้งานไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (user: RetailUser, roleId: string) => {
    try {
      await updateRetailUser(user.id, { roleId });
      toast.success('อัปเดต Role แล้ว และยกเลิก Session เดิมเพื่อใช้สิทธิ์ใหม่');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'อัปเดต Role ไม่สำเร็จ');
    }
  };

  const closeActionModal = (force = false) => {
    if (saving && !force) return;
    setActionUser(null);
    setUserAction(null);
    setNewPassword('');
  };

  const openActionModal = (action: UserAction, user: RetailUser) => {
    setUserAction(action);
    setActionUser(user);
    setNewPassword('');
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!actionUser) return;
    setSaving(true);
    try {
      const result = await resetRetailUserPassword(actionUser.id, newPassword);
      toast.success(
        result.sessionsRevoked
          ? 'ตั้งรหัสผ่านใหม่และยกเลิก Session เดิมแล้ว'
          : 'ตั้งรหัสผ่านใหม่แล้ว',
      );
      closeActionModal(true);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ตั้งรหัสผ่านไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const revokeSessions = async () => {
    if (!actionUser) return;
    setSaving(true);
    try {
      const result = await revokeRetailUserSessions(actionUser.id);
      toast.success(`ยกเลิก ${result.revoked} Session แล้ว`);
      closeActionModal(true);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ยกเลิก Session ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!actionUser) return;
    setSaving(true);
    try {
      await updateRetailUser(actionUser.id, { isActive: !actionUser.isActive });
      toast.success(actionUser.isActive ? 'ปิดบัญชีแล้ว' : 'เปิดบัญชีแล้ว');
      closeActionModal(true);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <Users className="h-4 w-4" /> ตั้งค่าระบบ
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">ผู้ใช้งาน</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            สร้างบัญชี กำหนด Role และจัดการ Session ของทีมงาน
          </p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)}>
          <Plus />
          เพิ่มผู้ใช้งาน
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">ทั้งหมด</div>
            <div className="mt-1 text-2xl font-semibold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">กำลังใช้งาน</div>
            <div className="mt-1 text-2xl font-semibold text-success">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Active sessions</div>
            <div className="mt-1 text-2xl font-semibold">
              {users.reduce((sum, user) => sum + (user.activeSessionCount ?? 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {showCreate && (
        <div
          className="fixed inset-x-0 top-0 z-[60] flex h-dvh w-full items-end justify-center overscroll-contain bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-user-title"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !saving) setShowCreate(false);
          }}
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
            <div className="border-b px-5 py-4">
              <h2 id="create-user-title" className="text-base font-semibold">
                สร้างผู้ใช้งานใหม่
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร
              </p>
            </div>
            <form onSubmit={createUser} className="overflow-y-auto px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">ชื่อผู้ใช้งาน</span>
                  <Input
                    placeholder="เช่น สมชาย ใจดี"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    required
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">อีเมล</span>
                  <Input
                    type="email"
                    placeholder="name@company.com"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    required
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">รหัสผ่านเริ่มต้น</span>
                  <Input
                    type="password"
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    minLength={8}
                    required
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Role</span>
                  <Select
                    value={form.roleId}
                    onChange={(event) => setForm({ ...form, roleId: event.target.value })}
                    required
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                  disabled={saving}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />}สร้างบัญชี
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {actionUser && userAction && (
        <div
          className="fixed inset-x-0 top-0 z-[60] flex h-dvh w-full items-end justify-center overscroll-contain bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-action-title"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeActionModal();
          }}
        >
          <div className="w-full max-w-md rounded-xl border bg-background shadow-xl">
            <div className="border-b px-5 py-4">
              <h2 id="user-action-title" className="text-base font-semibold">
                {userAction === 'password'
                  ? 'ตั้งรหัสผ่านใหม่'
                  : userAction === 'logout'
                    ? 'ยืนยันการ Logout'
                    : actionUser.isActive
                      ? 'ยืนยันการปิดบัญชี'
                      : 'ยืนยันการเปิดบัญชี'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {actionUser.name} · {actionUser.email}
              </p>
            </div>

            {userAction === 'password' ? (
              <form onSubmit={resetPassword} className="p-5">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">รหัสผ่านใหม่</span>
                  <Input
                    type="password"
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                    minLength={8}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    autoFocus
                  />
                </label>
                <p className="mt-3 text-xs text-muted-foreground">
                  Session เดิมอาจถูกยกเลิกตามนโยบายความปลอดภัยของระบบ
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => closeActionModal()}
                    disabled={saving}
                  >
                    ยกเลิก
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="animate-spin" />}
                    บันทึกรหัสผ่าน
                  </Button>
                </div>
              </form>
            ) : (
              <div className="p-5">
                <p className="text-sm text-muted-foreground">
                  {userAction === 'logout'
                    ? 'ระบบจะยกเลิก Session ที่กำลังใช้งานทั้งหมดของผู้ใช้งานรายนี้ และต้องเข้าสู่ระบบใหม่'
                    : actionUser.isActive
                      ? 'ผู้ใช้งานจะไม่สามารถเข้าสู่ระบบได้จนกว่าจะเปิดบัญชีอีกครั้ง'
                      : 'ผู้ใช้งานจะสามารถเข้าสู่ระบบได้อีกครั้งตามสิทธิ์เดิม'}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => closeActionModal()}
                    disabled={saving}
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    type="button"
                    variant={
                      userAction === 'status' && actionUser.isActive ? 'destructive' : 'default'
                    }
                    onClick={() =>
                      void (userAction === 'logout' ? revokeSessions() : confirmStatusChange())
                    }
                    disabled={saving}
                  >
                    {saving && <Loader2 className="animate-spin" />}
                    {userAction === 'logout'
                      ? 'ยืนยัน Logout'
                      : actionUser.isActive
                        ? 'ยืนยันปิดบัญชี'
                        : 'ยืนยันเปิดบัญชี'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>บัญชีภายในระบบ</CardTitle>
            <CardDescription>
              Admin คนสุดท้ายและบัญชีที่กำลัง Login จะได้รับการป้องกัน
            </CardDescription>
          </div>
          <Button variant="outline" size="icon" onClick={() => void load()} aria-label="รีเฟรช">
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-3 font-medium">ผู้ใช้งาน</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium">สถานะ</th>
                <th className="pb-3 font-medium">Session</th>
                <th className="pb-3 text-right font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="py-4">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </td>
                  <td className="py-4">
                    <Select
                      containerClassName="w-36"
                      value={user.role.id}
                      onChange={(event) => void changeRole(user, event.target.value)}
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-4">
                    <Badge variant={user.isActive ? 'success' : 'muted'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="py-4">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Laptop className="h-4 w-4" />
                      {user.activeSessionCount ?? 0}
                    </span>
                  </td>
                  <td className="py-4">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          openActionModal('password', user);
                        }}
                      >
                        <KeyRound />
                        รหัสผ่าน
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openActionModal('logout', user)}
                      >
                        <Laptop />
                        Logout
                      </Button>
                      <Button
                        size="sm"
                        variant={user.isActive ? 'destructive' : 'secondary'}
                        onClick={() => openActionModal('status', user)}
                      >
                        <UserCog />
                        {user.isActive ? 'ปิดบัญชี' : 'เปิดบัญชี'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    ยังไม่มีผู้ใช้งาน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

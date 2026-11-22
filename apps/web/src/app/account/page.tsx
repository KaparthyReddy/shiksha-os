import ActionForm from "@/components/ActionForm";
import { Card, Label, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import type { Me, Tenant } from "@/lib/types";
import { changePasswordAction } from "./actions";

export default async function AccountPage() {
  const [me, tenant] = await Promise.all([api<Me>("/auth/me"), api<Tenant>("/tenant")]);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Account</h1>

      <Card title="Profile">
        <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd>{me.name}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd>{me.email}</dd>
          <dt className="text-slate-500">Role</dt>
          <dd className="capitalize">{me.role}</dd>
          <dt className="text-slate-500">Institute</dt>
          <dd>{tenant.name}</dd>
        </dl>
      </Card>

      <Card title="Change password">
        <ActionForm action={changePasswordAction} submitLabel="Change password">
          <Label text="Current password">
            <input name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
          </Label>
          <Label text="New password">
            <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
          </Label>
          <Label text="Confirm new password">
            <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
          </Label>
          <p className="text-xs text-slate-500">At least 8 characters. Changing it signs out every other device.</p>
        </ActionForm>
      </Card>
    </div>
  );
}

import type { Change, SeedPlan } from './seed-plan';

/** Bản mô tả kế hoạch seed bằng tiếng Việt, dùng chung cho `--dry-run` và lần chạy thật. */

const VERB: Record<Change, string> = {
  CREATE: 'tạo mới',
  UPDATE: 'cập nhật',
  REACTIVATE: 'kích hoạt lại',
  UNCHANGED: 'giữ nguyên',
};

function refundRate(rate: number | null): string {
  return rate === null ? 'chưa khai' : `${(rate * 100).toFixed(2).replace('.', ',')}%`;
}

function line(change: Change, text: string): string {
  return `  ${change === 'UNCHANGED' ? '·' : '+'} ${VERB[change]}: ${text}`;
}

export function describePlan(plan: SeedPlan): string[] {
  const out: string[] = [];

  out.push('Client');
  out.push(
    line(
      plan.client.change,
      plan.client.before && plan.client.before.name !== plan.client.name
        ? `${plan.client.code} — "${plan.client.before.name}" → "${plan.client.name}"`
        : `${plan.client.code} — ${plan.client.name}`,
    ),
  );

  out.push('', 'Brand');
  for (const brand of plan.brands) {
    out.push(
      line(
        brand.change,
        brand.before && brand.before.name !== brand.name
          ? `${brand.code} — "${brand.before.name}" → "${brand.name}"`
          : `${brand.code} — ${brand.name}`,
      ),
    );
  }

  out.push('', 'Tài khoản nền tảng');
  for (const account of plan.accounts) {
    const rate =
      account.change === 'UNCHANGED' || account.estimatedRefundRate === null
        ? refundRate(account.before?.estimatedRefundRate ?? account.estimatedRefundRate)
        : refundRate(account.estimatedRefundRate);
    out.push(
      line(
        account.change,
        `${account.brandCode} / ${account.accountName} (${account.platform}, hoàn ước tính ${rate})`,
      ),
    );
  }

  out.push('', 'Nhân sự');
  for (const user of plan.users) {
    const roles = plan.roles
      .filter((role) => role.email === user.email)
      .map((role) => (role.brandCode ? `${role.role}@${role.brandCode}` : role.role))
      .join(', ');
    out.push(line(user.change, `${user.email} — ${user.fullName} [${roles}]`));
  }

  const newRoles = plan.roles.filter((role) => role.change === 'CREATE');
  if (newRoles.length > 0) {
    out.push('', `Vai trò cấp thêm: ${newRoles.length}`);
  }

  if (plan.settings.length > 0) {
    out.push('', 'Ngưỡng hệ thống');
    for (const setting of plan.settings) {
      const shown =
        setting.change === 'UPDATE'
          ? `${setting.key}: ${JSON.stringify(setting.before)} → ${JSON.stringify(setting.value)}`
          : `${setting.key}: ${JSON.stringify(setting.value)}`;
      out.push(line(setting.change, shown));
    }
  }

  const { untracked } = plan;
  if (untracked.brands.length > 0 || untracked.users.length > 0 || untracked.roles.length > 0) {
    out.push('', 'Có trong database nhưng không có trong file cấu hình (seed không đụng tới):');
    for (const code of untracked.brands) out.push(`  ? brand ${code}`);
    for (const email of untracked.users) out.push(`  ? nhân sự ${email}`);
    for (const role of untracked.roles) {
      out.push(`  ? vai trò ${role.role}${role.brandCode ? `@${role.brandCode}` : ''} của ${role.email}`);
    }
    out.push('  Muốn gỡ thì gỡ bằng tay — seed cố ý không xoá gì.');
  }

  return out;
}

export function countChanges(plan: SeedPlan): number {
  const steps: { change: Change | 'CREATE' | 'UNCHANGED' }[] = [
    plan.client,
    ...plan.brands,
    ...plan.accounts,
    ...plan.users,
    ...plan.roles,
    ...plan.settings,
  ];
  return steps.filter((step) => step.change !== 'UNCHANGED').length;
}

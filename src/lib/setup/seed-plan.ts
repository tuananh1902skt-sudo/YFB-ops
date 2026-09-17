import type { PlatformCode, SeedConfig, SettingKey, UserRoleCode } from './seed-config';

/**
 * So khớp cấu hình với những gì database đang có, rồi mô tả đúng những gì sẽ đổi.
 *
 * Tách khỏi phần ghi database để chạy lại seed lần thứ hai có thể kiểm chứng bằng
 * test: lần hai phải ra toàn UNCHANGED. Seed chỉ thêm và sửa, không bao giờ xoá —
 * thứ có trong database mà không có trong file cấu hình được báo cáo, không bị dọn.
 */

export type Change = 'CREATE' | 'UPDATE' | 'REACTIVATE' | 'UNCHANGED';

export interface ExistingClient {
  id: string;
  code: string;
  name: string;
}

export interface ExistingBrand {
  id: string;
  clientId: string;
  code: string;
  name: string;
}

export interface ExistingAccount {
  id: string;
  brandId: string;
  accountName: string;
  platform: PlatformCode;
  externalShopId: string | null;
  estimatedRefundRate: number;
}

export interface ExistingUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
}

export interface ExistingRole {
  userId: string;
  role: UserRoleCode;
  brandId: string | null;
}

export interface ExistingSetting {
  key: string;
  value: unknown;
}

export interface ExistingOrganisation {
  clients: ExistingClient[];
  brands: ExistingBrand[];
  accounts: ExistingAccount[];
  users: ExistingUser[];
  roles: ExistingRole[];
  settings: ExistingSetting[];
}

export const EMPTY_ORGANISATION: ExistingOrganisation = {
  clients: [],
  brands: [],
  accounts: [],
  users: [],
  roles: [],
  settings: [],
};

export interface ClientStep {
  change: Change;
  id: string | null;
  code: string;
  name: string;
  /** Giá trị hiện có, chỉ để in ra cho người đọc thấy cái gì đổi thành cái gì. */
  before: { name: string } | null;
}

export interface BrandStep {
  change: Change;
  id: string | null;
  code: string;
  name: string;
  before: { name: string } | null;
}

export interface AccountStep {
  change: Change;
  id: string | null;
  brandCode: string;
  accountName: string;
  platform: PlatformCode;
  externalShopId: string | null;
  estimatedRefundRate: number | null;
  before: Omit<ExistingAccount, 'id' | 'brandId' | 'accountName'> | null;
}

export interface UserStep {
  change: Change;
  id: string | null;
  email: string;
  fullName: string;
  phone: string | null;
  before: { fullName: string; phone: string | null; isActive: boolean } | null;
}

export interface RoleStep {
  change: 'CREATE' | 'UNCHANGED';
  email: string;
  role: UserRoleCode;
  brandCode: string | null;
}

export interface SettingStep {
  change: Change;
  key: SettingKey;
  value: unknown;
  before: unknown;
}

export interface SeedPlan {
  client: ClientStep;
  brands: BrandStep[];
  accounts: AccountStep[];
  users: UserStep[];
  roles: RoleStep[];
  settings: SettingStep[];
  /** Có trong database, không có trong file cấu hình. Báo cáo để người quyết định. */
  untracked: {
    brands: string[];
    users: string[];
    roles: { email: string; role: UserRoleCode; brandCode: string | null }[];
  };
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

/** `platform_accounts.estimated_refund_rate` là numeric(6,4). */
function toRateScale(rate: number): number {
  return Math.round(rate * 10_000);
}

export function planSeed(config: SeedConfig, existing: ExistingOrganisation): SeedPlan {
  const clientByCode = new Map(existing.clients.map((c) => [c.code, c]));
  const currentClient = clientByCode.get(config.client.code) ?? null;

  const client: ClientStep = currentClient
    ? {
        change: currentClient.name === config.client.name ? 'UNCHANGED' : 'UPDATE',
        id: currentClient.id,
        code: config.client.code,
        name: config.client.name,
        before: { name: currentClient.name },
      }
    : { change: 'CREATE', id: null, code: config.client.code, name: config.client.name, before: null };

  // Brand được tra theo (client, code) đúng như ràng buộc unique của bảng: hai client
  // khác nhau được phép dùng chung một mã brand.
  const brandsOfClient = currentClient
    ? existing.brands.filter((b) => b.clientId === currentClient.id)
    : [];
  const brandByCode = new Map(brandsOfClient.map((b) => [b.code, b]));

  const brands: BrandStep[] = config.brands.map((brand) => {
    const current = brandByCode.get(brand.code);
    if (!current) {
      return { change: 'CREATE', id: null, code: brand.code, name: brand.name, before: null };
    }
    return {
      change: current.name === brand.name ? 'UNCHANGED' : 'UPDATE',
      id: current.id,
      code: brand.code,
      name: brand.name,
      before: { name: current.name },
    };
  });

  const accounts: AccountStep[] = [];
  for (const brand of config.brands) {
    const currentBrand = brandByCode.get(brand.code);
    const existingAccounts = currentBrand
      ? existing.accounts.filter((a) => a.brandId === currentBrand.id)
      : [];

    for (const account of brand.platformAccounts) {
      const rate = account.estimatedRefundRate ?? null;
      const current = existingAccounts.find((a) => a.accountName === account.accountName);
      if (!current) {
        accounts.push({
          change: 'CREATE',
          id: null,
          brandCode: brand.code,
          accountName: account.accountName,
          platform: account.platform,
          externalShopId: account.externalShopId ?? null,
          estimatedRefundRate: rate,
          before: null,
        });
        continue;
      }

      // Bỏ trống tỷ lệ hoàn nghĩa là "không khai", không phải "đặt về 0": giữ
      // nguyên giá trị đang có thay vì ghi đè bằng một con số không ai chọn.
      // Cột lưu numeric(6,4) nên so sánh ở đúng 4 chữ số thập phân, nếu không một
      // giá trị bị làm tròn khi ghi sẽ khiến seed báo "cập nhật" mãi không dứt.
      const rateChanged = rate !== null && toRateScale(rate) !== toRateScale(current.estimatedRefundRate);
      const changed =
        rateChanged ||
        current.platform !== account.platform ||
        !sameText(current.externalShopId, account.externalShopId);

      accounts.push({
        change: changed ? 'UPDATE' : 'UNCHANGED',
        id: current.id,
        brandCode: brand.code,
        accountName: account.accountName,
        platform: account.platform,
        externalShopId: account.externalShopId ?? null,
        estimatedRefundRate: rate,
        before: {
          platform: current.platform,
          externalShopId: current.externalShopId,
          estimatedRefundRate: current.estimatedRefundRate,
        },
      });
    }
  }

  const userByEmail = new Map(existing.users.map((u) => [u.email.toLowerCase(), u]));
  const users: UserStep[] = config.users.map((user) => {
    const current = userByEmail.get(user.email);
    const phone = user.phone ?? null;
    if (!current) {
      return { change: 'CREATE', id: null, email: user.email, fullName: user.fullName, phone, before: null };
    }
    const before = { fullName: current.fullName, phone: current.phone, isActive: current.isActive };
    const detailsChanged = current.fullName !== user.fullName || !sameText(current.phone, phone);
    const change: Change = !current.isActive ? 'REACTIVATE' : detailsChanged ? 'UPDATE' : 'UNCHANGED';
    return { change, id: current.id, email: user.email, fullName: user.fullName, phone, before };
  });

  const brandIdByCode = new Map<string, string>();
  for (const step of brands) if (step.id) brandIdByCode.set(step.code, step.id);
  const brandCodeById = new Map([...brandIdByCode].map(([code, id]) => [id, code]));

  const heldRoles = new Set(existing.roles.map((r) => `${r.userId}|${r.role}|${r.brandId ?? ''}`));
  const roles: RoleStep[] = [];
  const plannedRoles = new Set<string>();

  for (const user of config.users) {
    const userId = userByEmail.get(user.email)?.id ?? null;
    for (const role of user.roles) {
      const brandCode = role.brand ?? null;
      const brandId = brandCode ? (brandIdByCode.get(brandCode) ?? null) : null;
      // Chưa có user hoặc chưa có brand thì chắc chắn chưa có vai trò.
      const held =
        userId !== null &&
        (brandCode === null || brandId !== null) &&
        heldRoles.has(`${userId}|${role.role}|${brandId ?? ''}`);
      if (userId !== null && brandId !== null) plannedRoles.add(`${userId}|${role.role}|${brandId}`);
      if (userId !== null && brandCode === null) plannedRoles.add(`${userId}|${role.role}|`);
      roles.push({ change: held ? 'UNCHANGED' : 'CREATE', email: user.email, role: role.role, brandCode });
    }
  }

  const configuredBrandCodes = new Set(config.brands.map((b) => b.code));
  const configuredEmails = new Set(config.users.map((u) => u.email));
  const emailById = new Map(existing.users.map((u) => [u.id, u.email]));

  const untrackedRoles = existing.roles
    .filter((role) => {
      const email = emailById.get(role.userId);
      if (!email || !configuredEmails.has(email.toLowerCase())) return false;
      return !plannedRoles.has(`${role.userId}|${role.role}|${role.brandId ?? ''}`);
    })
    .map((role) => ({
      email: emailById.get(role.userId) ?? role.userId,
      role: role.role,
      brandCode: role.brandId ? (brandCodeById.get(role.brandId) ?? role.brandId) : null,
    }));

  const settingByKey = new Map(existing.settings.map((s) => [s.key, s.value]));
  const settings: SettingStep[] = Object.entries(config.settings ?? {}).map(([key, value]) => {
    const before = settingByKey.get(key);
    const present = settingByKey.has(key);
    return {
      change: !present ? 'CREATE' : JSON.stringify(before) === JSON.stringify(value) ? 'UNCHANGED' : 'UPDATE',
      key: key as SettingKey,
      value,
      before: present ? before : null,
    };
  });

  return {
    client,
    brands,
    accounts,
    users,
    roles,
    settings,
    untracked: {
      brands: brandsOfClient.filter((b) => !configuredBrandCodes.has(b.code)).map((b) => b.code),
      users: existing.users.filter((u) => !configuredEmails.has(u.email.toLowerCase())).map((u) => u.email),
      roles: untrackedRoles,
    },
  };
}

export function isNoop(plan: SeedPlan): boolean {
  const steps: { change: Change | 'CREATE' | 'UNCHANGED' }[] = [
    plan.client,
    ...plan.brands,
    ...plan.accounts,
    ...plan.users,
    ...plan.roles,
    ...plan.settings,
  ];
  return steps.every((step) => step.change === 'UNCHANGED');
}

import { PERMISSIONS } from "@rhcm/shared";
import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  Users,
  Stethoscope,
  ScrollText,
  UserSearch,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown if the caller holds ANY of these permissions in the current entity; omit for always-visible items. */
  anyOf?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: UserSearch, anyOf: [PERMISSIONS.PATIENT_READ, PERMISSIONS.PATIENT_REGISTER] },
  { href: "/admin/entities", label: "Entity Settings", icon: Building2, anyOf: [PERMISSIONS.ENTITY_SETTINGS_MANAGE, PERMISSIONS.RESOURCE_MANAGE] },
  { href: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck, anyOf: [PERMISSIONS.ROLE_MANAGE] },
  { href: "/admin/users", label: "Users", icon: Users, anyOf: [PERMISSIONS.USER_MANAGE] },
  { href: "/admin/staff", label: "Doctors & Staff", icon: Stethoscope, anyOf: [PERMISSIONS.DOCTOR_MANAGE, PERMISSIONS.STAFF_MANAGE] },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText, anyOf: [PERMISSIONS.AUDIT_LOG_READ] },
];

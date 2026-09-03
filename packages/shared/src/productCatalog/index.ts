/**
 * AVS AI Shield Product Catalog — single source of truth for all products.
 *
 * Defines product codes, names, availability, platforms, plans, features,
 * downloads, system requirements, and coming-soon status.
 *
 * Website, Customer Portal, License Server, and Desktop all reference
 * this catalog (directly or mirrored).
 *
 * Future products can be enabled simply by flipping `availability` from
 * 'coming_soon' to 'available'.
 */

import { PRODUCT_CODES, EDITIONS } from '../platformConfig';

// ── Types ────────────────────────────────────────────────────────

export type Availability = 'available' | 'coming_soon';
export type Platform = 'windows';
export type EditionName = 'FREE' | 'PROFESSIONAL';

export interface PlanFeature {
  name: string;
  description: string;
}

export interface Plan {
  edition: EditionName;
  label: string;
  price: string;
  priceValue: number;
  period: string;
  description: string;
  features: string[];
}

export interface SystemRequirement {
  label: string;
  value: string;
}

export interface ProductCatalogEntry {
  productCode: string;
  productName: string;
  tagline: string;
  description: string;
  availability: Availability;
  platforms: Platform[];
  plans: Plan[];
  systemRequirements: SystemRequirement[];
  downloadUrl: string | null;
  downloadSize: string | null;
  version: string | null;
  icon: string;
}

// ── Feature definitions per plan ─────────────────────────────────

const FREE_FEATURES = [
  'Junk Cleaner',
  'Registry Cleaner',
  'Startup Manager',
];

const PROFESSIONAL_FEATURES = [
  'Junk Cleaner',
  'Registry Cleaner',
  'Startup Manager',
  'Privacy Cleaner',
  'Duplicate Finder',
  'Disk Analyzer',
  'Software Uninstaller',
  'Software Updater',
  'Performance Optimization',
];

// ── Product Catalog ──────────────────────────────────────────────

export const PRODUCT_CATALOG: readonly ProductCatalogEntry[] = [
  {
    productCode: PRODUCT_CODES.optimizer,
    productName: 'AVS AI Shield: Security & System Intelligence',
    tagline: 'Professional Windows PC Optimization',
    description:
      'Clean junk files, fix registry errors, manage startup programs, and boost your PC performance. The complete Windows optimization suite.',
    availability: 'available',
    platforms: ['windows'],
    plans: [
      {
        edition: EDITIONS.FREE,
        label: 'Free',
        price: '$0',
        priceValue: 0,
        period: 'forever',
        description: 'Essential PC maintenance tools at no cost.',
        features: FREE_FEATURES,
      },
      {
        edition: EDITIONS.PROFESSIONAL,
        label: 'Professional',
        price: '$29.99',
        priceValue: 29.99,
        period: '/year',
        description: 'Complete optimization suite with advanced tools.',
        features: PROFESSIONAL_FEATURES,
      },
    ],
    systemRequirements: [
      { label: 'Operating System', value: 'Windows 10 (64-bit) or Windows 11 (64-bit)' },
      { label: 'Processor', value: '1 GHz or faster' },
      { label: 'RAM', value: '1 GB minimum (2 GB recommended)' },
      { label: 'Disk Space', value: '50 MB for installation' },
      { label: 'Internet', value: 'Required for activation and updates' },
    ],
    downloadUrl: 'https://www.avsshield.com/download',
    downloadSize: '45 MB',
    version: '1.2.0',
    icon: 'Cpu',
  },
  {
    productCode: PRODUCT_CODES.antivirus,
    productName: 'AVS AI Shield Antivirus',
    tagline: 'Real-Time Protection',
    description: 'Real-time protection against viruses, malware, and ransomware for Windows.',
    availability: 'coming_soon',
    platforms: ['windows'],
    plans: [],
    systemRequirements: [],
    downloadUrl: null,
    downloadSize: null,
    version: null,
    icon: 'ShieldCheck',
  },
  {
    productCode: PRODUCT_CODES.vpn,
    productName: 'AVS AI Shield VPN',
    tagline: 'Secure Browsing',
    description: 'Secure, anonymous browsing with military-grade encryption.',
    availability: 'coming_soon',
    platforms: ['windows'],
    plans: [],
    systemRequirements: [],
    downloadUrl: null,
    downloadSize: null,
    version: null,
    icon: 'Lock',
  },
  {
    productCode: PRODUCT_CODES.driverUpdater,
    productName: 'Driver Updater',
    tagline: 'Keep Drivers Current',
    description: 'Automatically update outdated drivers for better hardware performance.',
    availability: 'coming_soon',
    platforms: ['windows'],
    plans: [],
    systemRequirements: [],
    downloadUrl: null,
    downloadSize: null,
    version: null,
    icon: 'Cpu',
  },
  {
    productCode: PRODUCT_CODES.passwordManager,
    productName: 'Password Manager',
    tagline: 'Secure Passwords',
    description: 'Securely store and manage your passwords with encryption.',
    availability: 'coming_soon',
    platforms: ['windows'],
    plans: [],
    systemRequirements: [],
    downloadUrl: null,
    downloadSize: null,
    version: null,
    icon: 'FileCheck',
  },
  {
    productCode: PRODUCT_CODES.mobileSecurity,
    productName: 'Mobile Security',
    tagline: 'Mobile Protection',
    description: 'Protect your mobile devices with comprehensive security tools.',
    availability: 'coming_soon',
    platforms: ['windows'],
    plans: [],
    systemRequirements: [],
    downloadUrl: null,
    downloadSize: null,
    version: null,
    icon: 'ShieldCheck',
  },
] as const;

// ── Catalog accessors ────────────────────────────────────────────

export function getAvailableProducts(): readonly ProductCatalogEntry[] {
  return PRODUCT_CATALOG.filter((p) => p.availability === 'available');
}

export function getComingSoonProducts(): readonly ProductCatalogEntry[] {
  return PRODUCT_CATALOG.filter((p) => p.availability === 'coming_soon');
}

export function getProductByCode(productCode: string): ProductCatalogEntry | undefined {
  return PRODUCT_CATALOG.find((p) => p.productCode === productCode);
}

export function isProductAvailable(productCode: string): boolean {
  const product = getProductByCode(productCode);
  return Boolean(product && product.availability === 'available');
}

export function getPlansForProduct(productCode: string): readonly Plan[] {
  return getProductByCode(productCode)?.plans ?? [];
}

export function getFeaturesForPlan(productCode: string, edition: EditionName): readonly string[] {
  const product = getProductByCode(productCode);
  if (!product) return [];
  const plan = product.plans.find((p) => p.edition === edition);
  return plan?.features ?? [];
}

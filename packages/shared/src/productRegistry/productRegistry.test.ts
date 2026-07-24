/**
 * Product registry tests — validates future product registration architecture.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  registerProduct,
  unregisterProduct,
  getRegisteredProducts,
  getProduct,
  isProductActive,
  getProductFeatures,
  registerBuiltinProducts,
  AVS_PC_OPTIMIZER,
} from './index';

describe('Product Registry', () => {
  beforeEach(() => {
    // Clear registry by unregistering all known products
    unregisterProduct(AVS_PC_OPTIMIZER);
  });

  it('registers and retrieves a product', () => {
    registerProduct({
      productCode: 'AVS_TEST',
      productName: 'Test Product',
      features: ['test.scan'],
      featureKeys: [],
      editions: ['free', 'professional', 'ultimate', 'trial'],
      active: true,
    });

    const product = getProduct('AVS_TEST');
    expect(product).toBeDefined();
    expect(product?.productName).toBe('Test Product');
    expect(product?.active).toBe(true);

    unregisterProduct('AVS_TEST');
  });

  it('registers builtin PC Optimizer product', () => {
    registerBuiltinProducts();
    const product = getProduct(AVS_PC_OPTIMIZER);
    expect(product).toBeDefined();
    expect(product?.productName).toBe('AVS PC Optimizer');
    expect(product?.active).toBe(true);
  });

  it('isProductActive returns true for active product', () => {
    registerProduct({
      productCode: 'AVS_ACTIVE',
      productName: 'Active Product',
      features: [],
      featureKeys: [],
      editions: ['free'],
      active: true,
    });
    expect(isProductActive('AVS_ACTIVE')).toBe(true);
    unregisterProduct('AVS_ACTIVE');
  });

  it('isProductActive returns false for inactive product', () => {
    registerProduct({
      productCode: 'AVS_INACTIVE',
      productName: 'Inactive Product',
      features: [],
      featureKeys: [],
      editions: ['free'],
      active: false,
    });
    expect(isProductActive('AVS_INACTIVE')).toBe(false);
    unregisterProduct('AVS_INACTIVE');
  });

  it('getProductFeatures returns features for a product', () => {
    registerProduct({
      productCode: 'AVS_FEATURED',
      productName: 'Featured Product',
      features: ['feature.scan', 'feature.clean'],
      featureKeys: [],
      editions: ['free'],
      active: true,
    });
    const features = getProductFeatures('AVS_FEATURED');
    expect(features).toHaveLength(2);
    expect(features).toContain('feature.scan');
    unregisterProduct('AVS_FEATURED');
  });

  it('getRegisteredProducts returns all registered products', () => {
    registerProduct({
      productCode: 'AVS_A',
      productName: 'Product A',
      features: [],
      featureKeys: [],
      editions: ['free'],
      active: true,
    });
    registerProduct({
      productCode: 'AVS_B',
      productName: 'Product B',
      features: [],
      featureKeys: [],
      editions: ['free'],
      active: true,
    });
    const products = getRegisteredProducts();
    expect(products.length).toBeGreaterThanOrEqual(2);
    unregisterProduct('AVS_A');
    unregisterProduct('AVS_B');
  });

  it('supports future AVS products', () => {
    const futureProducts = [
      { code: 'AVS_DRIVER_UPDATER', name: 'AVS Driver Updater' },
      { code: 'AVS_ANTIVIRUS', name: 'AVS Antivirus' },
      { code: 'AVS_VPN', name: 'AVS VPN' },
      { code: 'AVS_BACKUP', name: 'AVS Backup' },
      { code: 'AVS_FILE_RECOVERY', name: 'AVS File Recovery' },
      { code: 'AVS_DISK_MANAGER', name: 'AVS Disk Manager' },
    ];

    for (const p of futureProducts) {
      registerProduct({
        productCode: p.code,
        productName: p.name,
        features: [],
        featureKeys: [],
        editions: ['professional', 'ultimate', 'trial'],
        active: false,
      });
    }

    for (const p of futureProducts) {
      const product = getProduct(p.code);
      expect(product).toBeDefined();
      expect(product?.productName).toBe(p.name);
      expect(product?.active).toBe(false);
      unregisterProduct(p.code);
    }
  });
});

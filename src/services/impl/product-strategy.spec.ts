import {
	describe, it, expect, beforeEach,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {type INotificationService} from '../notifications.port.js';
import {
	NormalProductStrategy,
	SeasonalProductStrategy,
	ExpirableProductStrategy,
} from './product-strategy.js';
import {type Product} from '@/db/schema.js';

describe('Product Strategy Tests', () => {
	let notificationServiceMock: DeepMockProxy<INotificationService>;

	beforeEach(() => {
		notificationServiceMock = mockDeep<INotificationService>();
	});

	describe('NormalProductStrategy', () => {
		it('should decrease available stock when product is available', async () => {
			// GIVEN
			const strategy = new NormalProductStrategy(notificationServiceMock);
			const product: Product = {
				id: 1,
				leadTime: 15,
				available: 5,
				type: 'NORMAL',
				name: 'USB Cable',
				expiryDate: null,
				seasonStartDate: null,
				seasonEndDate: null,
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(true);
			expect(result.updatedProduct?.available).toBe(4);
			expect(result.notificationAction).toBeUndefined();
		});

		it('should notify delay when product is out of stock with lead time', async () => {
			// GIVEN
			const strategy = new NormalProductStrategy(notificationServiceMock);
			const product: Product = {
				id: 1,
				leadTime: 15,
				available: 0,
				type: 'NORMAL',
				name: 'USB Cable',
				expiryDate: null,
				seasonStartDate: null,
				seasonEndDate: null,
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(true);
			expect(result.updatedProduct?.leadTime).toBe(15);
			expect(result.notificationAction).toBeDefined();

			// Execute notification
			result.notificationAction!();
			expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(15, 'USB Cable');
		});

		it('should do nothing when product is out of stock with no lead time', async () => {
			// GIVEN
			const strategy = new NormalProductStrategy(notificationServiceMock);
			const product: Product = {
				id: 1,
				leadTime: 0,
				available: 0,
				type: 'NORMAL',
				name: 'USB Cable',
				expiryDate: null,
				seasonStartDate: null,
				seasonEndDate: null,
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(false);
			expect(result.notificationAction).toBeUndefined();
		});
	});

	describe('SeasonalProductStrategy', () => {
		it('should decrease stock when product is in season and available', async () => {
			// GIVEN
			const strategy = new SeasonalProductStrategy(notificationServiceMock);
			const currentDate = new Date();
			const product: Product = {
				id: 1,
				leadTime: 15,
				available: 5,
				type: 'SEASONAL',
				name: 'Watermelon',
				expiryDate: null,
				seasonStartDate: new Date(currentDate.getTime() - (10 * 24 * 60 * 60 * 1000)), // 10 days ago
				seasonEndDate: new Date(currentDate.getTime() + (50 * 24 * 60 * 60 * 1000)), // 50 days from now
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(true);
			expect(result.updatedProduct?.available).toBe(4);
			expect(result.notificationAction).toBeUndefined();
		});

		it('should notify out of stock when lead time exceeds season end', async () => {
			// GIVEN
			const strategy = new SeasonalProductStrategy(notificationServiceMock);
			const currentDate = new Date();
			const product: Product = {
				id: 1,
				leadTime: 30, // 30 days lead time
				available: 0,
				type: 'SEASONAL',
				name: 'Watermelon',
				expiryDate: null,
				seasonStartDate: new Date(currentDate.getTime() - (10 * 24 * 60 * 60 * 1000)), // 10 days ago
				seasonEndDate: new Date(currentDate.getTime() + (20 * 24 * 60 * 60 * 1000)), // 20 days from now (< lead time)
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(true);
			expect(result.updatedProduct?.available).toBe(0);
			expect(result.notificationAction).toBeDefined();

			// Execute notification
			result.notificationAction!();
			expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Watermelon');
		});

		it('should notify delay when out of stock but lead time is within season', async () => {
			// GIVEN
			const strategy = new SeasonalProductStrategy(notificationServiceMock);
			const currentDate = new Date();
			const product: Product = {
				id: 1,
				leadTime: 15, // 15 days lead time
				available: 0,
				type: 'SEASONAL',
				name: 'Watermelon',
				expiryDate: null,
				seasonStartDate: new Date(currentDate.getTime() - (10 * 24 * 60 * 60 * 1000)), // 10 days ago
				seasonEndDate: new Date(currentDate.getTime() + (50 * 24 * 60 * 60 * 1000)), // 50 days from now (> lead time)
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(true);
			expect(result.updatedProduct?.leadTime).toBe(15);
			expect(result.notificationAction).toBeDefined();

			// Execute notification
			result.notificationAction!();
			expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(15, 'Watermelon');
		});

		it('should notify out of stock when product is before season start', async () => {
			// GIVEN
			const strategy = new SeasonalProductStrategy(notificationServiceMock);
			const currentDate = new Date();
			const product: Product = {
				id: 1,
				leadTime: 15,
				available: 5,
				type: 'SEASONAL',
				name: 'Grapes',
				expiryDate: null,
				seasonStartDate: new Date(currentDate.getTime() + (30 * 24 * 60 * 60 * 1000)), // 30 days from now
				seasonEndDate: new Date(currentDate.getTime() + (90 * 24 * 60 * 60 * 1000)), // 90 days from now
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(false);
			expect(result.notificationAction).toBeDefined();

			// Execute notification
			result.notificationAction!();
			expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Grapes');
		});
	});

	describe('ExpirableProductStrategy', () => {
		it('should decrease stock when product is available and not expired', async () => {
			// GIVEN
			const strategy = new ExpirableProductStrategy(notificationServiceMock);
			const currentDate = new Date();
			const product: Product = {
				id: 1,
				leadTime: 15,
				available: 5,
				type: 'EXPIRABLE',
				name: 'Milk',
				expiryDate: new Date(currentDate.getTime() + (10 * 24 * 60 * 60 * 1000)), // 10 days from now
				seasonStartDate: null,
				seasonEndDate: null,
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(true);
			expect(result.updatedProduct?.available).toBe(4);
			expect(result.notificationAction).toBeUndefined();
		});

		it('should notify expiration when product is expired', async () => {
			// GIVEN
			const strategy = new ExpirableProductStrategy(notificationServiceMock);
			const currentDate = new Date();
			const expiryDate = new Date(currentDate.getTime() - (5 * 24 * 60 * 60 * 1000)); // 5 days ago
			const product: Product = {
				id: 1,
				leadTime: 15,
				available: 5,
				type: 'EXPIRABLE',
				name: 'Milk',
				expiryDate,
				seasonStartDate: null,
				seasonEndDate: null,
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(true);
			expect(result.updatedProduct?.available).toBe(0);
			expect(result.notificationAction).toBeDefined();

			// Execute notification
			result.notificationAction!();
			expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalledWith('Milk', expiryDate);
		});

		it('should notify expiration when product is out of stock', async () => {
			// GIVEN
			const strategy = new ExpirableProductStrategy(notificationServiceMock);
			const currentDate = new Date();
			const expiryDate = new Date(currentDate.getTime() + (10 * 24 * 60 * 60 * 1000)); // 10 days from now
			const product: Product = {
				id: 1,
				leadTime: 15,
				available: 0,
				type: 'EXPIRABLE',
				name: 'Milk',
				expiryDate,
				seasonStartDate: null,
				seasonEndDate: null,
			};

			// WHEN
			const result = await strategy.processOrder(product);

			// THEN
			expect(result.shouldUpdateStock).toBe(true);
			expect(result.updatedProduct?.available).toBe(0);
			expect(result.notificationAction).toBeDefined();

			// Execute notification
			result.notificationAction!();
			expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalledWith('Milk', expiryDate);
		});
	});
});

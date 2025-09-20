import {
	describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {createDatabaseMock, cleanUp} from '../../utils/test-utils/database-tools.ts.js';
import {type INotificationService} from '../notifications.port.js';
import {OrderProcessingService} from './order-processing.service.js';
import {products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

describe('OrderProcessingService Tests', () => {
	let notificationServiceMock: DeepMockProxy<INotificationService>;
	let orderProcessingService: OrderProcessingService;
	let databaseMock: Database;
	let databaseName: string;

	beforeEach(async () => {
		({databaseMock, databaseName} = await createDatabaseMock());
		notificationServiceMock = mockDeep<INotificationService>();
		orderProcessingService = new OrderProcessingService({
			ns: notificationServiceMock,
			db: databaseMock,
		});
	});

	afterEach(async () => cleanUp(databaseName));

	it('should process normal product with available stock', async () => {
		// GIVEN
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
		await databaseMock.insert(products).values(product);

		// WHEN
		await orderProcessingService.processProductOrder(product);

		// THEN
		const updatedProduct = await databaseMock.query.products.findFirst({
			where: (products, {eq}) => eq(products.id, 1),
		});
		expect(updatedProduct?.available).toBe(4);
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
	});

	it('should process normal product with no stock and notify delay', async () => {
		// GIVEN
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
		await databaseMock.insert(products).values(product);

		// WHEN
		await orderProcessingService.processProductOrder(product);

		// THEN
		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(15, 'USB Cable');
	});

	it('should process seasonal product in season with stock', async () => {
		// GIVEN
		const currentDate = new Date();
		const product: Product = {
			id: 1,
			leadTime: 15,
			available: 5,
			type: 'SEASONAL',
			name: 'Watermelon',
			expiryDate: null,
			seasonStartDate: new Date(currentDate.getTime() - (10 * 24 * 60 * 60 * 1000)),
			seasonEndDate: new Date(currentDate.getTime() + (50 * 24 * 60 * 60 * 1000)),
		};
		await databaseMock.insert(products).values(product);

		// WHEN
		await orderProcessingService.processProductOrder(product);

		// THEN
		const updatedProduct = await databaseMock.query.products.findFirst({
			where: (products, {eq}) => eq(products.id, 1),
		});
		expect(updatedProduct?.available).toBe(4);
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
	});

	it('should process seasonal product out of season and notify out of stock', async () => {
		// GIVEN
		const currentDate = new Date();
		const product: Product = {
			id: 1,
			leadTime: 15,
			available: 5,
			type: 'SEASONAL',
			name: 'Grapes',
			expiryDate: null,
			seasonStartDate: new Date(currentDate.getTime() + (30 * 24 * 60 * 60 * 1000)),
			seasonEndDate: new Date(currentDate.getTime() + (90 * 24 * 60 * 60 * 1000)),
		};
		await databaseMock.insert(products).values(product);

		// WHEN
		await orderProcessingService.processProductOrder(product);

		// THEN
		expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Grapes');
	});

	it('should process expirable product not expired with stock', async () => {
		// GIVEN
		const currentDate = new Date();
		const product: Product = {
			id: 1,
			leadTime: 15,
			available: 5,
			type: 'EXPIRABLE',
			name: 'Milk',
			expiryDate: new Date(currentDate.getTime() + (10 * 24 * 60 * 60 * 1000)),
			seasonStartDate: null,
			seasonEndDate: null,
		};
		await databaseMock.insert(products).values(product);

		// WHEN
		await orderProcessingService.processProductOrder(product);

		// THEN
		const updatedProduct = await databaseMock.query.products.findFirst({
			where: (products, {eq}) => eq(products.id, 1),
		});
		expect(updatedProduct?.available).toBe(4);
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('should process expired product and notify expiration', async () => {
		// GIVEN
		const currentDate = new Date();
		const expiryDate = new Date(currentDate.getTime() - (5 * 24 * 60 * 60 * 1000));
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
		await databaseMock.insert(products).values(product);

		// WHEN
		await orderProcessingService.processProductOrder(product);

		// THEN
		const updatedProduct = await databaseMock.query.products.findFirst({
			where: (products, {eq}) => eq(products.id, 1),
		});
		expect(updatedProduct?.available).toBe(0);
		expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalledWith('Milk', expiryDate);
	});

	it('should process multiple products in order', async () => {
		// GIVEN
		const currentDate = new Date();
		const normalProduct: Product = {
			id: 1,
			leadTime: 15,
			available: 5,
			type: 'NORMAL',
			name: 'USB Cable',
			expiryDate: null,
			seasonStartDate: null,
			seasonEndDate: null,
		};
		const expirableProduct: Product = {
			id: 2,
			leadTime: 15,
			available: 3,
			type: 'EXPIRABLE',
			name: 'Milk',
			expiryDate: new Date(currentDate.getTime() + (10 * 24 * 60 * 60 * 1000)),
			seasonStartDate: null,
			seasonEndDate: null,
		};

		await databaseMock.insert(products).values([normalProduct, expirableProduct]);

		// WHEN
		await orderProcessingService.processOrder([normalProduct, expirableProduct]);

		// THEN
		const updatedNormalProduct = await databaseMock.query.products.findFirst({
			where: (products, {eq}) => eq(products.id, 1),
		});
		const updatedExpirableProduct = await databaseMock.query.products.findFirst({
			where: (products, {eq}) => eq(products.id, 2),
		});

		expect(updatedNormalProduct?.available).toBe(4);
		expect(updatedExpirableProduct?.available).toBe(2);
	});
});

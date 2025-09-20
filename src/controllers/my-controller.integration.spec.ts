import {
	describe, it, expect, beforeEach,
	afterEach,
} from 'vitest';
import {type FastifyInstance} from 'fastify';
import supertest from 'supertest';
import {eq} from 'drizzle-orm';
import {type DeepMockProxy, mockDeep} from 'vitest-mock-extended';
import {asValue} from 'awilix';
import {type INotificationService} from '@/services/notifications.port.js';
import {
	type ProductInsert,
	products,
	orders,
	ordersToProducts,
} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {buildFastify} from '@/fastify.js';

describe('MyController Integration Tests', () => {
	let fastify: FastifyInstance;
	let database: Database;
	let notificationServiceMock: DeepMockProxy<INotificationService>;

	beforeEach(async () => {
		notificationServiceMock = mockDeep<INotificationService>();

		fastify = await buildFastify();
		fastify.diContainer.register({
			ns: asValue(notificationServiceMock as INotificationService),
		});
		await fastify.ready();
		database = fastify.database;
	});
	afterEach(async () => {
		await fastify.close();
	});

	it('should process order with mixed product types successfully', async () => {
		const client = supertest(fastify.server);
		const allProducts = createProducts();
		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(allProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200).expect('Content-Type', /application\/json/);

		const resultOrder = await database.query.orders.findFirst({where: eq(orders.id, orderId)});
		expect(resultOrder!.id).toBe(orderId);

		// Verify that notifications were sent appropriately
		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(10, 'USB Dongle');
		expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalled();
		expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Grapes');
	});

	it('should handle normal product with sufficient stock', async () => {
		const client = supertest(fastify.server);
		const testProducts = [
			{
				leadTime: 15, available: 10, type: 'NORMAL', name: 'USB Cable',
			},
		];

		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(testProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		// Verify stock was decreased
		const updatedProduct = await database.query.products.findFirst({
			where: (products, {eq}) => eq(products.id, 1),
		});
		expect(updatedProduct?.available).toBe(9);
		expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
	});

	it('should handle seasonal product in season', async () => {
		const client = supertest(fastify.server);
		const currentDate = new Date();
		const testProducts = [
			{
				leadTime: 15,
				available: 5,
				type: 'SEASONAL',
				name: 'Summer Fruit',
				seasonStartDate: new Date(currentDate.getTime() - (10 * 24 * 60 * 60 * 1000)),
				seasonEndDate: new Date(currentDate.getTime() + (50 * 24 * 60 * 60 * 1000)),
			},
		];

		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(testProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		// Verify stock was decreased
		const updatedProduct = await database.query.products.findFirst({
			where: (products, {eq}) => eq(products.id, 1),
		});
		expect(updatedProduct?.available).toBe(4);
		expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
	});

	it('should handle expirable product that is not expired', async () => {
		const client = supertest(fastify.server);
		const currentDate = new Date();
		const testProducts = [
			{
				leadTime: 15,
				available: 3,
				type: 'EXPIRABLE',
				name: 'Fresh Milk',
				expiryDate: new Date(currentDate.getTime() + (10 * 24 * 60 * 60 * 1000)),
			},
		];

		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(testProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200);

		// Verify stock was decreased
		const updatedProduct = await database.query.products.findFirst({
			where: (products, {eq}) => eq(products.id, 1),
		});
		expect(updatedProduct?.available).toBe(2);
		expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
	});

	function createProducts(): ProductInsert[] {
		const d = 24 * 60 * 60 * 1000;
		return [
			{
				leadTime: 15, available: 30, type: 'NORMAL', name: 'USB Cable',
			},
			{
				leadTime: 10, available: 0, type: 'NORMAL', name: 'USB Dongle',
			},
			{
				leadTime: 15, available: 30, type: 'EXPIRABLE', name: 'Butter', expiryDate: new Date(Date.now() + (26 * d)),
			},
			{
				leadTime: 90, available: 6, type: 'EXPIRABLE', name: 'Milk', expiryDate: new Date(Date.now() - (2 * d)),
			},
			{
				leadTime: 15, available: 30, type: 'SEASONAL', name: 'Watermelon', seasonStartDate: new Date(Date.now() - (2 * d)), seasonEndDate: new Date(Date.now() + (58 * d)),
			},
			{
				leadTime: 15, available: 30, type: 'SEASONAL', name: 'Grapes', seasonStartDate: new Date(Date.now() + (180 * d)), seasonEndDate: new Date(Date.now() + (240 * d)),
			},
		];
	}
});

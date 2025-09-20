import {type Cradle} from '@fastify/awilix';
import {eq} from 'drizzle-orm';
import {ProductStrategyFactory} from './product-strategy-factory.js';
import {type Database} from '@/db/type.js';
import {products, type Product} from '@/db/schema.js';

export class OrderProcessingService {
	private readonly database: Database;
	private readonly strategyFactory: ProductStrategyFactory;

	constructor({ns, db}: Pick<Cradle, 'ns' | 'db'>) {
		this.database = db;
		this.strategyFactory = new ProductStrategyFactory(ns);
	}

	async processProductOrder(product: Product): Promise<void> {
		const strategy = this.strategyFactory.createStrategy(product.type);
		const result = await strategy.processOrder(product);

		if (result.shouldUpdateStock && result.updatedProduct) {
			await this.database
				.update(products)
				.set(result.updatedProduct)
				.where(eq(products.id, product.id));
		}

		if (result.notificationAction) {
			result.notificationAction();
		}
	}

	async processOrder(orderProducts: Product[]): Promise<void> {
		// Process products sequentially to maintain transaction integrity
		for (const product of orderProducts) {
			// eslint-disable-next-line no-await-in-loop
			await this.processProductOrder(product);
		}
	}
}
